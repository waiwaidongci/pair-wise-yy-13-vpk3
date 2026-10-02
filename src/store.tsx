import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { AppState, Batch, CustomerOrder } from "./types";
import {
  attachColor,
  attachReview,
  bumpBasis,
  mergeCurveOps,
  now,
  scheduleDrafts,
  signOrder,
  upgradeLegacyBatches,
  type CurveWriteOp,
} from "./engine";
import { seedState } from "./seed";

const STORAGE_KEY = "dye-bench-state-v1";

export interface NewDraftInput {
  kind: "batch" | "redye";
  fabricWeightKg: number;
  bathRatio: number;
  slotId: string;
  startAt: string;
  endAt: string;
  technician: string;
  recipe: string;
  finishing: string;
  repairReason?: string;
  orderCustomer?: string; // 同时登记客户订单
}

type Action =
  | { type: "SUBMIT"; input: NewDraftInput }
  | { type: "SET_BASIS"; batchId: string; patch: { recipe?: string; finishing?: string; repairReason?: string } }
  | {
      type: "SET_COLOR";
      batchId: string;
      deltaE: number;
      limit: number;
    }
  | { type: "SET_REVIEW"; batchId: string; verdict: "pass" | "reject"; reviewer: string }
  | { type: "CREATE_ORDER"; customer: string; batchId: string }
  | { type: "SIGN_ORDER"; orderId: string }
  | { type: "SET_NET"; online: boolean }
  | { type: "CURVE_OP"; op: Omit<CurveWriteOp, "at" | "client">; client: string }
  | { type: "FLUSH" }
  | { type: "UPGRADE"; assignments: { batchId: string; lotNo: string }[] }
  | { type: "RESET" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SUBMIT": {
      const seq = state.seq + 1;
      const i = action.input;
      const id = `${i.kind === "redye" ? "RR" : "RC"}-${2600 + seq}`;
      const draft: Batch = {
        id,
        kind: i.kind,
        fabricWeightKg: i.fabricWeightKg,
        bathRatio: i.bathRatio,
        slotId: i.slotId,
        startAt: i.startAt,
        endAt: i.endAt,
        technician: i.technician,
        receivedAt: now(),
        clientSeq: seq,
        status: "draft",
        basis: { recipe: i.recipe, finishing: i.finishing, revision: 1 },
        repairReason: i.repairReason,
        allocations: [],
        conflicts: [],
      };
      const withDraft: AppState = {
        ...state,
        seq,
        batches: [...state.batches, draft],
        orders: i.orderCustomer
          ? [
              ...state.orders,
              {
                id: `CO-${state.orders.length + 100}`,
                customer: i.orderCustomer,
                batchId: id,
                unsigned: true,
              } satisfies CustomerOrder,
            ]
          : state.orders,
      };
      // 开工前统一排产：先到先占，不足/重叠留待排
      const { scheduled, conflicts } = scheduleDrafts(
        withDraft,
        withDraft.batches.filter((b) => b.status === "draft")
      );
      return {
        ...withDraft,
        batches: [
          ...withDraft.batches.filter((b) => b.status !== "draft"),
          ...scheduled,
          ...conflicts,
        ],
      };
    }

    case "SET_BASIS": {
      return {
        ...state,
        batches: state.batches.map((b) =>
          b.id === action.batchId
            ? bumpBasis(b, action.patch)
            : b
        ),
      };
    }

    case "SET_COLOR": {
      return {
        ...state,
        batches: state.batches.map((b) =>
          b.id === action.batchId
            ? attachColor(b, {
                deltaE: action.deltaE,
                pass: action.deltaE <= action.limit,
              })
            : b
        ),
      };
    }

    case "SET_REVIEW": {
      return {
        ...state,
        batches: state.batches.map((b) =>
          b.id === action.batchId
            ? attachReview(b, action.verdict, action.reviewer)
            : b
        ),
      };
    }

    case "CREATE_ORDER":
      return {
        ...state,
        orders: [
          ...state.orders,
          {
            id: `CO-${state.orders.length + 100}`,
            customer: action.customer,
            batchId: action.batchId,
            unsigned: true,
          },
        ],
      };

    case "SIGN_ORDER":
      return signOrder(state, action.orderId);

    case "SET_NET":
      return { ...state, online: action.online };

    case "CURVE_OP": {
      const full: CurveWriteOp = {
        ...action.op,
        at: now(),
        client: action.client,
      };
      // 在线：立即合并；离线：排队等联网
      if (state.online) {
        return { ...state, curves: mergeCurveOps(state.curves, [full]) };
      }
      return { ...state, pendingOps: [...state.pendingOps, full] };
    }

    case "FLUSH": {
      if (!state.online || state.pendingOps.length === 0) return state;
      return {
        ...state,
        curves: mergeCurveOps(state.curves, state.pendingOps),
        pendingOps: [],
      };
    }

    case "UPGRADE": {
      const result = upgradeLegacyBatches(state, action.assignments);
      return {
        ...result.state,
        lastUpgrade: {
          ok: result.ok,
          message: result.ok
            ? `成功升级 ${result.upgraded.join("、") || "无"}`
            : result.error ?? "迁移失败",
          upgraded: result.upgraded,
          at: now(),
        },
      };
    }

    case "RESET":
      return seedState();

    default:
      return state;
  }
}

function init(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* ignore */
  }
  return seedState();
}

interface StoreCtx {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
