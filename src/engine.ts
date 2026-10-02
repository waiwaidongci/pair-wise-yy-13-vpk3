// 纯函数规则引擎：开工分配、撞单、版本失效、离线合并、升级回滚
// 不依赖 React / DOM，可直接单测。

import type {
  Allocation,
  AppState,
  Batch,
  Conflict,
  CustomerOrder,
  ProcessCurve,
} from "./types";

// ---------- 工具 ----------

let clock = () => Date.now();
/** 测试可注入时钟 */
export function setClock(fn: () => number) {
  clock = fn;
}
export const now = () => clock();

export function needLiquorL(b: Pick<Batch, "fabricWeightKg" | "bathRatio">) {
  return b.fabricWeightKg * b.bathRatio;
}

function overlaps(a: Batch, b: Batch) {
  if (!a.slotId || !b.slotId || !a.startAt || !b.startAt || !a.endAt || !b.endAt)
    return false;
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

// ---------- 开工前调度 ----------
//
// 规则：
// 1) 按坯布重量 × 浴比 算出母液需求，按母液批次 FIFO 扣减；
// 2) 母液不足 -> 留待排（保持 draft），写明 liquor_shortage 冲突，且不预占母液；
// 3) 槽位时间重叠 -> 留待排，写明 slot_overlap，占用者为先到者；
// 4) 两名技术员同槽位：receivedAt 先到者占用（并列时 clientSeq 小者），后到留冲突草稿；
// 5) 仅处理 draft（待排草稿）；已开工批次保持占用。

export interface SchedulePlan {
  scheduled: Batch[]; // 成功开工
  conflicts: Batch[]; // 留待排（带冲突明细）
}

export function scheduleDrafts(state: AppState, drafts: Batch[]): SchedulePlan {
  // 模拟当前库存视图：随成功开工逐项扣减
  const stock = new Map(state.liquors.map((l) => [l.lotNo, l.availableL]));
  const scheduled: Batch[] = [];
  const conflicts: Batch[] = [];

  // 已占用者：已开工/已排产的批次（含本轮新开工），按接单顺序判定先到
  const occupants = state.batches.filter(
    (b) => b.status !== "draft" && b.slotId
  );

  // 待排草稿：先到先得
  const queue = [...drafts].sort((a, b) =>
    a.receivedAt !== b.receivedAt
      ? a.receivedAt - b.receivedAt
      : a.clientSeq - b.clientSeq
  );

  for (const raw of queue) {
    const found: Conflict[] = [];

    // 1) 槽位撞单检查
    let blockedBy: Batch | undefined;
    if (raw.slotId) {
      blockedBy = occupants.find((o) => o.slotId === raw.slotId && overlaps(o, raw));
      if (blockedBy) {
        found.push({
          type: "slot_overlap",
          message: `槽位 ${raw.slotId} ${raw.startAt}-${raw.endAt} 与 ${blockedBy.id} 撞单`,
          blockedBy: blockedBy.id,
          detail: { slot: raw.slotId, start: raw.startAt ?? "", end: raw.endAt ?? "" },
        });
      }
    }

    // 2) 母液分配：先模拟足额扣减，不足则整笔不预占
    const need = needLiquorL(raw);
    const plan: Allocation[] = [];
    let remain = need;
    for (const [lotNo, avail] of stock) {
      if (remain <= 0) break;
      const take = Math.min(avail, remain);
      if (take > 0) {
        plan.push({ lotNo, amountL: take });
        remain -= take;
      }
    }
    if (remain > 0.0001) {
      found.push({
        type: "liquor_shortage",
        message: `母液不足：需求 ${need}L，尚缺 ${round(remain)}L`,
        detail: { needL: need, shortL: round(remain) },
      });
    }

    if (found.length > 0) {
      // 留待排：不扣库存、不占槽位
      conflicts.push({
        ...raw,
        status: "draft",
        conflicts: found,
        allocations: [],
      });
      continue;
    }

    // 成功：扣减库存、占用槽位
    for (const al of plan) {
      stock.set(al.lotNo, (stock.get(al.lotNo) ?? 0) - al.amountL);
    }
    const started: Batch = {
      ...raw,
      status: "running",
      allocations: plan,
      conflicts: [],
      scheduledAt: now(),
    };
    scheduled.push(started);
    occupants.push(started);
  }

  return { scheduled, conflicts };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

// ---------- 依据版本与结论失效 ----------
//
// 配方、后整理或复修原因一变：
// - basis.revision +1；
// - 依附旧版的色差结论、评审立即失效（重算后才能重新放行）；
// - 已签订单保留签订当时依据快照。

export type BasisPatch = {
  recipe?: string;
  finishing?: string;
  repairReason?: string;
};

export function bumpBasis(b: Batch, patch: BasisPatch): Batch {
  const changed =
    (patch.recipe !== undefined && patch.recipe !== b.basis.recipe) ||
    (patch.finishing !== undefined && patch.finishing !== b.basis.finishing) ||
    (patch.repairReason !== undefined && patch.repairReason !== b.repairReason);

  const next: Batch = { ...b, basis: { ...b.basis }, conflicts: [...b.conflicts] };
  if (patch.recipe !== undefined) next.basis.recipe = patch.recipe;
  if (patch.finishing !== undefined) next.basis.finishing = patch.finishing;
  if (patch.repairReason !== undefined) next.repairReason = patch.repairReason;

  if (changed) {
    next.basis.revision = b.basis.revision + 1;
    // 旧版结论立即失效
    if (b.colorResult && b.colorResult.basisRevision !== next.basis.revision) {
      next.colorResult = undefined;
    }
    if (b.review && b.review.basisRevision !== next.basis.revision) {
      next.review = undefined;
    }
  }
  return next;
}

/** 色差/评审提交：只能依附当前版本，旧版本数据不得照旧放行 */
export function attachColor(
  b: Batch,
  result: Omit<import("./types").ColorResult, "id" | "basisRevision" | "recordedAt">
): Batch {
  return {
    ...b,
    colorResult: {
      ...result,
      id: `${b.id}-color@${b.basis.revision}`,
      basisRevision: b.basis.revision,
      recordedAt: now(),
    },
  };
}

export function attachReview(
  b: Batch,
  verdict: "pass" | "reject",
  reviewer: string
): Batch {
  return {
    ...b,
    review: {
      id: `${b.id}-review@${b.basis.revision}`,
      basisRevision: b.basis.revision,
      verdict,
      reviewer,
      recordedAt: now(),
    },
  };
}

/** 签订单：冻结当时依据与结论，后续改版不影响已签订单 */
export function signOrder(state: AppState, orderId: string): AppState {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order || order.signedAt) return state;
  const batch = state.batches.find((b) => b.id === order.batchId);
  const signed: CustomerOrder = {
    ...order,
    unsigned: false,
    signedAt: now(),
    basisSnapshot: batch ? { ...batch.basis } : order.basisSnapshot,
    repairReasonAtSign: batch?.repairReason,
    colorSnapshot: batch?.colorResult ? { ...batch.colorResult } : undefined,
    reviewSnapshot: batch?.review ? { ...batch.review } : undefined,
  };
  return {
    ...state,
    orders: state.orders.map((o) => (o.id === orderId ? signed : o)),
  };
}

// ---------- 离线工艺曲线合并 ----------
//
// 断网录入工艺曲线，联网后合并：
// 1) 同号重放只认首次（opId 去重）；
// 2) 字段两边都改过：
//    - 若一边等于共同祖先（只单侧改）-> 取改的那侧；
//    - 两边各自改成不同值 -> 双方都留（conflicts），不静默覆盖。

export interface CurveWriteOp {
  opId: string;
  curveId: string;
  batchId?: string;
  client: string;
  at: number;
  fields: Record<string, string>;
  /** 共同祖先值（客户端编辑前读到的版本） */
  base?: Record<string, string>;
}

export function mergeCurveOps(
  local: Record<string, ProcessCurve>,
  ops: CurveWriteOp[]
): Record<string, ProcessCurve> {
  const out: Record<string, ProcessCurve> = {};
  for (const [k, v] of Object.entries(local)) out[k] = cloneCurve(v);

  for (const op of ops) {
    const c = out[op.curveId];
    if (!c) {
      // 首次见到的曲线：同号重放只认首次
      const created: ProcessCurve = {
        id: op.curveId,
        batchId: op.batchId,
        fields: { ...op.fields },
        fieldRev: Object.fromEntries(
          Object.keys(op.fields).map((f) => [f, { client: op.client, at: op.at }])
        ),
        conflicts: {},
        createdAt: op.at,
        updatedAt: op.at,
        appliedOps: [op.opId],
      };
      out[op.curveId] = created;
      continue;
    }
    if (c.appliedOps.includes(op.opId)) continue; // 重放：只认首次
    c.appliedOps = [...c.appliedOps, op.opId];

    for (const [field, incoming] of Object.entries(op.fields)) {
      const current = c.fields[field];
      const baseVal = op.base?.[field];
      const lastRev = c.fieldRev[field];

      if (current === incoming) {
        // 值相同：仅登记来源（更早的写入优先保留归属）
        if (!lastRev || op.at < lastRev.at) {
          c.fieldRev[field] = { client: op.client, at: op.at };
        }
        continue;
      }

      const serverChanged = baseVal !== undefined && current !== baseVal;
      const clientChanged = baseVal !== undefined && incoming !== baseVal;

      if (baseVal === undefined) {
        // 无祖先信息且两边不同：按字段保留双方
        c.conflicts[field] = { a: current ?? "", b: incoming };
      } else if (serverChanged && clientChanged) {
        // 字段两边都改过 -> 留双方
        c.conflicts[field] = { a: current ?? "", b: incoming };
      } else {
        // 只有一侧改：取改动侧；同值先后写入则时间新者胜
        c.fields[field] = incoming;
        c.fieldRev[field] = { client: op.client, at: op.at };
        delete c.conflicts[field];
      }
      c.updatedAt = Math.max(c.updatedAt, op.at);
    }
  }
  return out;
}

function cloneCurve(c: ProcessCurve): ProcessCurve {
  return {
    ...c,
    fieldRev: { ...c.fieldRev },
    fields: { ...c.fields },
    conflicts: { ...c.conflicts },
    appliedOps: [...c.appliedOps],
  };
}

// ---------- 旧批次母液编号升级与迁移回滚 ----------
//
// 旧批次缺母液编号则升级：
// - 迁移前保存最近草稿快照；
// - 迁移失败（如指定母液不存在）时恢复最近草稿。

export function needsUpgrade(b: Batch): boolean {
  // 旧批次：已跑过但无任何母液分配/编号
  return b.status !== "draft" && b.allocations.length === 0;
}

export interface UpgradeResult {
  state: AppState;
  ok: boolean;
  error?: string;
  upgraded: string[];
}

export function upgradeLegacyBatches(
  state: AppState,
  assignments: { batchId: string; lotNo: string }[]
): UpgradeResult {
  const snapshot: AppState = JSON.parse(JSON.stringify(state)); // 迁移前快照
  let next: AppState = { ...state, lastDraftSnapshot: snapshot };

  const upgraded: string[] = [];
  for (const { batchId, lotNo } of assignments) {
    const batch = next.batches.find((b) => b.id === batchId);
    if (!batch) {
      return rollback(snapshot, `批次 ${batchId} 不存在`);
    }
    if (!needsUpgrade(batch)) {
      return rollback(snapshot, `批次 ${batchId} 无需升级`);
    }
    const liquor = next.liquors.find((l) => l.lotNo === lotNo);
    if (!liquor) {
      // 迁移失败 -> 恢复最近草稿
      return rollback(snapshot, `母液编号 ${lotNo} 不存在，迁移失败`);
    }
    const amount = needLiquorL(batch);
    next = {
      ...next,
      liquors: next.liquors.map((l) =>
        l.lotNo === lotNo ? { ...l, availableL: l.availableL - amount } : l
      ),
      batches: next.batches.map((b) =>
        b.id === batchId
          ? { ...b, allocations: [{ lotNo, amountL: amount }] }
          : b
      ),
      migrations: [
        ...next.migrations,
        { batchId, assignedLotNo: lotNo, migratedAt: now() },
      ],
    };
    upgraded.push(batchId);
  }
  return { state: next, ok: true, upgraded };
}

function rollback(snapshot: AppState, error: string): UpgradeResult {
  return { state: snapshot, ok: false, error, upgraded: [] };
}
