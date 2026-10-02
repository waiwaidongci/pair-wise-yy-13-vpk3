// 全局状态：批次、母液、槽位、订单、曲线、冲突草稿、离线队列、迁移
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type {
  Batch,
  Conflict,
  ConflictDraft,
  DraftSnapshot,
  NetworkMode,
  Order,
  PendingCurveEntry,
  VatSlot,
  WorkbenchState,
} from "./types";
import { buildSeedState } from "./seed";
import {
  allocateBatch,
  claimSlot,
  mergeCurves,
  migrateBatches,
  recomputeBatch,
  recalcConclusion,
  recalcReview,
  saveDraft,
  uid,
  invalidateByVersion,
} from "./logic";

const STORAGE_KEY = "dyeing-workbench-v1";

type Action =
  | { type: "ADD_BATCH"; payload: Omit<Batch, "id" | "code" | "status" | "conflicts" | "createdAt" | "recipeVersion" | "finishingVersion" | "repairVersion"> }
  | { type: "START_BATCH"; batchId: string }
  | { type: "CLAIM_SLOT"; batchId: string; slotId: string; technician: string; date?: string }
  | { type: "CONCURRENT_CLAIM"; slotId: string; batchId: string; tech1: string; tech2: string }
  | { type: "CHANGE_RECIPE"; recipeId: string; changes: Partial<{ name: string; motherLiquorRatio: number }> }
  | { type: "CHANGE_FINISHING"; finishingId: string; changes: Partial<{ name: string; softener: number }> }
  | { type: "CHANGE_REPAIR"; repairId: string; changes: Partial<{ label: string }> }
  | { type: "RECALC_BATCH"; batchId: string }
  | { type: "SIGN_ORDER"; orderId: string }
  | { type: "ADD_PENDING_CURVE"; entry: Omit<PendingCurveEntry, "id" | "updatedAt"> & { updatedAt?: number } }
  | { type: "MERGE_PENDING_CURVES" }
  | { type: "SET_NETWORK"; network: NetworkMode }
  | { type: "MIGRATE" }
  | { type: "RESTORE_DRAFT"; snapshotId: string }
  | { type: "RESOLVE_CONFLICT"; conflictId: string }
  | { type: "MERGE_DRAFT"; draftId: string }
  | { type: "REPAIR_BATCH_WEIGHT"; batchId: string; weightKg: number }
  | { type: "RESET" };

function initialState(): WorkbenchState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as WorkbenchState;
  } catch {
    /* ignore */
  }
  return buildSeedState();
}

function reducer(state: WorkbenchState, action: Action): WorkbenchState {
  switch (action.type) {
    // ------------------------------------------------------------------
    // 新增批次：开工前按 坯布重量×浴比 分配母液与槽位；不足/重叠 → 待排并写明冲突
    // ------------------------------------------------------------------
    case "ADD_BATCH": {
      const recipe = state.recipes.find((r) => r.id === action.payload.recipeId);
      const now = Date.now();
      const batch: Batch = {
        ...action.payload,
        id: uid("batch"),
        code: `LAB-${Math.floor(600 + Math.random() * 900)}`,
        status: "待排",
        conflicts: [],
        createdAt: now,
        recipeVersion: recipe?.version ?? 1,
        finishingVersion:
          state.finishings.find((f) => f.id === action.payload.finishingId)?.version ?? 1,
        repairVersion: state.repairReasons.find((r) => r.id === action.payload.repairId)?.version ?? 1,
      };
      const { batch: allocated, conflicts, ok } = allocateBatch(
        batch,
        recipe,
        state.motherLiquors,
        state.slots
      );
      let slots = state.slots;
      let conflictDrafts = state.conflictDrafts;
      // 分配成功 → 先到先得占用槽位
      if (ok && allocated.slotId) {
        const slot = slots.find((s) => s.id === allocated.slotId);
        if (slot) {
          const claim = claimSlot(slot, allocated, allocated.technician);
          slots = slots.map((s) => (s.id === slot.id ? claim.slot : s));
          if (claim.conflictDraft) {
            conflictDrafts = [...conflictDrafts, claim.conflictDraft];
          }
        }
      }
      return {
        ...state,
        batches: [allocated, ...state.batches],
        slots,
        conflicts: [...conflicts, ...state.conflicts],
        conflictDrafts,
      };
    }

    case "START_BATCH": {
      // 母液不足或槽位撞单仍先开工：保留冲突，状态置为已开工
      return {
        ...state,
        batches: state.batches.map((b) =>
          b.id === action.batchId ? { ...b, status: "已开工", startedAt: Date.now() } : b
        ),
      };
    }

    // ------------------------------------------------------------------
    // 槽位提交：先到者占用，后到留冲突草稿
    // ------------------------------------------------------------------
    case "CLAIM_SLOT": {
      const batch = state.batches.find((b) => b.id === action.batchId);
      const slot = state.slots.find((s) => s.id === action.slotId);
      if (!batch || !slot) return state;
      const claim = claimSlot(slot, batch, action.technician, action.date);
      const slots = state.slots.map((s) => (s.id === slot.id ? claim.slot : s));
      return {
        ...state,
        slots,
        batches: state.batches.map((b) =>
          b.id === batch.id && claim.booking
            ? { ...b, slotId: slot.id, status: b.status === "待排" ? "已排" : b.status }
            : b
        ),
        conflicts: claim.conflict ? [claim.conflict, ...state.conflicts] : state.conflicts,
        conflictDrafts: claim.conflictDraft
          ? [claim.conflictDraft, ...state.conflictDrafts]
          : state.conflictDrafts,
      };
    }

    case "CONCURRENT_CLAIM": {
      // 模拟两名技术员同时提交同一槽位：同一 reducer 内顺序处理，先到先得
      const batch = state.batches.find((b) => b.id === action.batchId);
      const slot = state.slots.find((s) => s.id === action.slotId);
      if (!batch || !slot) return state;
      const first = claimSlot(slot, batch, action.tech1);
      const slotAfterFirst = first.slot;
      const second = claimSlot(slotAfterFirst, batch, action.tech2);
      const slots = state.slots.map((s) =>
        s.id === slot.id ? second.slot : s
      );
      return {
        ...state,
        slots,
        conflicts: [
          ...(second.conflict ? [second.conflict] : []),
          ...(first.conflict ? [first.conflict] : []),
          ...state.conflicts,
        ],
        conflictDrafts: [
          ...(second.conflictDraft ? [second.conflictDraft] : []),
          ...state.conflictDrafts,
        ],
        batches: state.batches.map((b) =>
          b.id === batch.id && first.booking
            ? { ...b, slotId: slot.id, status: b.status === "待排" ? "已排" : b.status }
            : b
        ),
      };
    }

    // ------------------------------------------------------------------
    // 版本变更：配方/后整理/复修原因一变，依附旧版的色差结论与评审立即失效
    // ------------------------------------------------------------------
    case "CHANGE_RECIPE": {
      const recipes = state.recipes.map((r) =>
        r.id === action.recipeId
          ? { ...r, ...action.changes, version: r.version + 1, updatedAt: Date.now() }
          : r
      );
      const versions = collectVersions(recipes, state.finishings, state.repairReasons);
      const invalidated = invalidateByVersion(state.batches, state.orders, versions);
      // 未签订单随批次重算；已签订单保留快照
      const batches = invalidated.map((b) => {
        const order = state.orders.find((o) => o.id === b.orderId && o.signed);
        if (order) return b;
        return recomputeBatch(b, recipes, state.finishings, state.repairReasons);
      });
      return { ...state, recipes, batches };
    }

    case "CHANGE_FINISHING": {
      const finishings = state.finishings.map((f) =>
        f.id === action.finishingId
          ? { ...f, ...action.changes, version: f.version + 1, updatedAt: Date.now() }
          : f
      );
      const versions = collectVersions(state.recipes, finishings, state.repairReasons);
      const invalidated = invalidateByVersion(state.batches, state.orders, versions);
      const batches = invalidated.map((b) => {
        const order = state.orders.find((o) => o.id === b.orderId && o.signed);
        if (order) return b;
        return recomputeBatch(b, state.recipes, finishings, state.repairReasons);
      });
      return { ...state, finishings, batches };
    }

    case "CHANGE_REPAIR": {
      const repairReasons = state.repairReasons.map((r) =>
        r.id === action.repairId
          ? { ...r, ...action.changes, version: r.version + 1, updatedAt: Date.now() }
          : r
      );
      const versions = collectVersions(state.recipes, state.finishings, repairReasons);
      const invalidated = invalidateByVersion(state.batches, state.orders, versions);
      const batches = invalidated.map((b) => {
        const order = state.orders.find((o) => o.id === b.orderId && o.signed);
        if (order) return b;
        return recomputeBatch(b, state.recipes, state.finishings, repairReasons);
      });
      return { ...state, repairReasons, batches };
    }

    case "RECALC_BATCH": {
      return {
        ...state,
        batches: state.batches.map((b) =>
          b.id === action.batchId
            ? recomputeBatch(b, state.recipes, state.finishings, state.repairReasons)
            : b
        ),
      };
    }

    // ------------------------------------------------------------------
    // 签订单：保留当时依据（快照），之后批次重算不影响订单
    // ------------------------------------------------------------------
    case "SIGN_ORDER": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return state;
      const batch = state.batches.find((b) => b.orderId === order.id);
      if (!batch || !batch.conclusion || !batch.review) return state;
      const snapshot = {
        recipeVersion: batch.conclusion.attachedTo.recipeVersion,
        finishingVersion: batch.conclusion.attachedTo.finishingVersion,
        repairVersion: batch.conclusion.attachedTo.repairVersion,
        conclusion: { ...batch.conclusion },
        review: { ...batch.review },
        signedAt: Date.now(),
      };
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId ? { ...o, signed: true, signedAt: snapshot.signedAt, snapshot } : o
        ),
      };
    }

    // ------------------------------------------------------------------
    // 断网录入工艺曲线
    // ------------------------------------------------------------------
    case "ADD_PENDING_CURVE": {
      if (state.network === "online") return state; // 在线直接走合并，不入离线队列
      const entry: PendingCurveEntry = {
        id: uid("pend"),
        number: action.entry.number,
        name: action.entry.name,
        points: action.entry.points,
        updatedBy: action.entry.updatedBy,
        changedFields: action.entry.changedFields,
        remoteAlsoChanged: action.entry.remoteAlsoChanged ?? [],
        updatedAt: action.entry.updatedAt ?? Date.now(),
      };
      return { ...state, pendingCurves: [...state.pendingCurves, entry] };
    }

    // ------------------------------------------------------------------
    // 联网合并：同号重放只认首次；字段两边都改过保留双方
    // ------------------------------------------------------------------
    case "MERGE_PENDING_CURVES": {
      const { curves, accepted, skippedByReplay, diverged } = mergeCurves(
        state.curves,
        state.pendingCurves,
        state.replayedCurveNumbers
      );
      // 把"远端也改过"的字段注入分歧（演示字段级保留双方）
      const divergedWithRemote = diverged.map((c) => {
        const entry = state.pendingCurves.find((p) => p.number === c.number);
        if (entry?.remoteAlsoChanged?.length) {
          const extra = entry.remoteAlsoChanged
            .filter((f) => !(c.fieldDivergence ?? []).some((d) => d.field === f))
            .map((f) => ({
              field: f,
              local: (entry as unknown as Record<string, unknown>)[f],
              remote: (c as unknown as Record<string, unknown>)[f],
            }));
          return { ...c, fieldDivergence: [...(c.fieldDivergence ?? []), ...extra] };
        }
        return c;
      });
      const replayed = Array.from(
        new Set([...state.replayedCurveNumbers, ...accepted.map((c) => c.number)])
      );
      return {
        ...state,
        curves: curves.map((c) => {
          const d = divergedWithRemote.find((x) => x.number === c.number);
          return d ?? c;
        }),
        pendingCurves: [],
        replayedCurveNumbers: replayed,
        conflicts: [
          ...skippedByReplay.map(
            (n): Conflict => ({
              id: uid("cf"),
              type: "并发占用",
              message: `同号重放只认首次：曲线 ${n} 已重放，本次跳过`,
              createdAt: Date.now(),
              resolved: false,
            })
          ),
          ...state.conflicts,
        ],
      };
    }

    case "SET_NETWORK": {
      return { ...state, network: action.network };
    }

    // ------------------------------------------------------------------
    // 旧批次迁移：缺母液编号则升级；迁移失败恢复最近草稿
    // ------------------------------------------------------------------
    case "MIGRATE": {
      // 迁移前保存最近草稿
      const drafts = saveDraft(state.drafts, "迁移前草稿", state);
      const { batches, upgraded, failed } = migrateBatches(state.batches, state.motherLiquors);
      if (failed.length > 0) {
        // 迁移失败：恢复最近草稿（回滚到迁移前状态）
        const restored = drafts[0].data as WorkbenchState;
        return {
          ...restored,
          drafts,
          conflicts: [
            {
              id: uid("cf"),
              type: "母液不足",
              message: `迁移失败：批次 ${failed.join("、")} 无法升级母液编号，已恢复最近草稿`,
              createdAt: Date.now(),
              resolved: false,
            },
            ...restored.conflicts,
          ],
        };
      }
      return {
        ...state,
        batches,
        drafts,
        migrated: true,
        conflicts: [
          ...upgraded.map(
            (code): Conflict => ({
              id: uid("cf"),
              type: "母液不足",
              message: `旧批次升级：${code} 已补母液编号`,
              createdAt: Date.now(),
              resolved: true,
            })
          ),
          ...state.conflicts,
        ],
      };
    }

    case "RESTORE_DRAFT": {
      const snap = state.drafts.find((d) => d.id === action.snapshotId);
      if (!snap) return state;
      return { ...(snap.data as WorkbenchState), drafts: state.drafts };
    }

    case "RESOLVE_CONFLICT": {
      return {
        ...state,
        conflicts: state.conflicts.map((c) =>
          c.id === action.conflictId ? { ...c, resolved: true } : c
        ),
      };
    }

    case "MERGE_DRAFT": {
      // 冲突草稿重新提交：若槽位已空则补占用，否则保留草稿
      const draft = state.conflictDrafts.find((d) => d.id === action.draftId);
      if (!draft || draft.merged) return state;
      const slot = state.slots.find((s) => s.id === draft.slotId);
      const batch = state.batches.find((b) => b.id === draft.batchId);
      if (!slot || !batch) return state;
      const date = draft.payload.date as string | undefined;
      const claim = claimSlot(slot, batch, draft.technician, date);
      if (claim.conflictDraft) return state; // 仍被占用，保留草稿
      return {
        ...state,
        slots: state.slots.map((s) => (s.id === slot.id ? claim.slot : s)),
        conflictDrafts: state.conflictDrafts.map((d) =>
          d.id === action.draftId ? { ...d, merged: true } : d
        ),
        batches: state.batches.map((b) =>
          b.id === batch.id ? { ...b, slotId: slot.id, status: "已排" } : b
        ),
      };
    }

    case "REPAIR_BATCH_WEIGHT": {
      return {
        ...state,
        batches: state.batches.map((b) =>
          b.id === action.batchId ? { ...b, weightKg: action.weightKg } : b
        ),
      };
    }

    case "RESET": {
      return buildSeedState();
    }

    default:
      return state;
  }
}

function collectVersions(
  recipes: WorkbenchState["recipes"],
  finishings: WorkbenchState["finishings"],
  repairs: WorkbenchState["repairReasons"]
) {
  return {
    recipeVersion: Math.max(0, ...recipes.map((r) => r.version)),
    finishingVersion: Math.max(0, ...finishings.map((f) => f.version)),
    repairVersion: Math.max(0, ...repairs.map((r) => r.version)),
  };
}

interface StoreContextValue {
  state: WorkbenchState;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  // 监听真实网络状态
  useEffect(() => {
    const goOnline = () => dispatch({ type: "SET_NETWORK", network: "online" });
    const goOffline = () => dispatch({ type: "SET_NETWORK", network: "offline" });
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

// 供组件使用的小工具
export function useRecipe(id?: string) {
  const { state } = useStore();
  return state.recipes.find((r) => r.id === id);
}

export function useFinishing(id?: string) {
  const { state } = useStore();
  return state.finishings.find((f) => f.id === id);
}

export function useRepair(id?: string) {
  const { state } = useStore();
  return state.repairReasons.find((r) => r.id === id);
}

export function useMotherLiquor(id?: string) {
  const { state } = useStore();
  return state.motherLiquors.find((m) => m.id === id);
}

export function useSlot(id?: string): VatSlot | undefined {
  const { state } = useStore();
  return state.slots.find((s) => s.id === id);
}

export { recalcConclusion, recalcReview };
export type { Conflict, ConflictDraft, DraftSnapshot, Order };
