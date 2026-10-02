// 核心业务逻辑（纯函数，便于离线/迁移场景复用与测试）
import type {
  Batch,
  ColorConclusion,
  Conflict,
  ConflictDraft,
  DraftSnapshot,
  Finishing,
  MotherLiquor,
  Order,
  PendingCurveEntry,
  ProcessCurve,
  Recipe,
  RepairReason,
  Review,
  SlotBooking,
  VatSlot,
} from "./types";

export const uid = (prefix = "id"): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const today = (): string => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// 分配计算：开工前按 坯布重量 × 浴比 算染液体积，再按配方母液系数算母液用量
// ---------------------------------------------------------------------------

/** 染液总体积（升）= 坯布重量(kg) × 浴比 */
export function requiredLiquorVolumeL(batch: Batch): number {
  return batch.weightKg * batch.bathRatio;
}

/** 母液需求量（升）= 染液体积 × 配方母液系数 */
export function requiredMotherLiquorL(batch: Batch, recipe: Recipe | undefined): number {
  if (!recipe) return 0;
  return requiredLiquorVolumeL(batch) * recipe.motherLiquorRatio;
}

/** 槽位在某日的已占用体积 */
export function slotBookedVolume(slot: VatSlot, date: string): number {
  return slot.bookings
    .filter((b) => b.date === date)
    .reduce((sum, b) => sum + b.volumeL, 0);
}

/** 槽位在某日的余量 */
export function slotRemainingL(slot: VatSlot, date: string): number {
  return slot.capacityL - slotBookedVolume(slot, date);
}

// ---------------------------------------------------------------------------
// 色差 / 评审 重算（模拟按配方、后整理、复修原因计算 ΔE 与结论）
// ---------------------------------------------------------------------------

export function recalcConclusion(
  batch: Batch,
  recipe: Recipe | undefined,
  finishing: Finishing | undefined,
  repair: RepairReason | undefined
): ColorConclusion {
  // 用配方、后整理、复修原因的版本号叠加出一个可复现的模拟 ΔE
  const seed =
    (recipe?.version ?? 0) * 7 +
    (finishing?.version ?? 0) * 3 +
    (repair?.version ?? 0) * 5 +
    batch.weightKg;
  const deltaE = Math.round((0.4 + (seed % 10) * 0.18) * 100) / 100;
  const verdict: ColorConclusion["verdict"] =
    deltaE <= 1.2 ? "通过" : deltaE <= 2.0 ? "待确认" : "复染";
  return {
    id: uid("concl"),
    deltaE,
    lab: {
      l: Math.round((50 + (seed % 20)) * 10) / 10,
      a: Math.round(((seed % 10) - 5) * 10) / 10,
      b: Math.round(((seed % 7) - 3) * 10) / 10,
    },
    verdict,
    attachedTo: {
      recipeVersion: recipe?.version ?? batch.recipeVersion,
      finishingVersion: finishing?.version ?? batch.finishingVersion,
      repairVersion: repair?.version ?? batch.repairVersion ?? 0,
    },
    computedAt: Date.now(),
    invalid: false,
  };
}

export function recalcReview(conclusion: ColorConclusion): Review {
  const result: Review["result"] =
    conclusion.verdict === "通过"
      ? "评审通过"
      : conclusion.verdict === "复染"
        ? "待复染"
        : "客户确认中";
  return {
    id: uid("rev"),
    result,
    attachedTo: { ...conclusion.attachedTo },
    reviewedAt: Date.now(),
    invalid: false,
  };
}

// ---------------------------------------------------------------------------
// 开工前分配：母液不足或槽位撞单/余量不足 → 留待排并写明冲突，仍先开工
// ---------------------------------------------------------------------------

export interface AllocateResult {
  batch: Batch;
  conflicts: Conflict[];
  ok: boolean;
}

/**
 * 开工前分配母液与槽位。
 * - 母液不足：记录「母液不足」冲突
 * - 槽位撞单（同日已有预约）：记录「槽位撞单」
 * - 槽位余量不足：记录「槽位余量不足」
 * 只要有冲突就置为「待排」，但保留开工入口（仍可先开工）。
 */
export function allocateBatch(
  batch: Batch,
  recipe: Recipe | undefined,
  motherLiquors: MotherLiquor[],
  slots: VatSlot[],
  date: string = today()
): AllocateResult {
  const conflicts: Conflict[] = [];
  const volume = requiredLiquorVolumeL(batch);
  const needMl = requiredMotherLiquorL(batch, recipe);

  // 母液：优先用批次已指定的，否则挑余量足够的
  let ml = motherLiquors.find((m) => m.id === batch.motherLiquorId);
  if ((!ml || ml.stockL < needMl) && needMl > 0) {
    ml = motherLiquors.find((m) => m.stockL >= needMl);
  }
  if (needMl > 0 && (!ml || ml.stockL < needMl)) {
    conflicts.push({
      id: uid("cf"),
      type: "母液不足",
      message: `母液不足：需 ${needMl.toFixed(2)}L，可用 ${ml?.stockL.toFixed(2) ?? 0}L`,
      batchId: batch.id,
      requiredL: needMl,
      availableL: ml?.stockL ?? 0,
      createdAt: Date.now(),
      resolved: false,
    });
  }

  // 槽位
  let slot = slots.find((s) => s.id === batch.slotId);
  if (!slot) slot = slots[0];
  if (slot) {
    const booked = slotBookedVolume(slot, date);
    const remaining = slot.capacityL - booked;
    const overlapped = slot.bookings.some((b) => b.date === date && b.batchId !== batch.id);
    if (overlapped) {
      conflicts.push({
        id: uid("cf"),
        type: "槽位撞单",
        message: `槽位撞单：${slot.code} 今日已被占用`,
        batchId: batch.id,
        slotId: slot.id,
        createdAt: Date.now(),
        resolved: false,
      });
    } else if (volume > remaining) {
      conflicts.push({
        id: uid("cf"),
        type: "槽位余量不足",
        message: `槽位余量不足：${slot.code} 需 ${volume.toFixed(1)}L，余量 ${remaining.toFixed(1)}L`,
        batchId: batch.id,
        slotId: slot.id,
        requiredL: volume,
        availableL: remaining,
        createdAt: Date.now(),
        resolved: false,
      });
    }
  }

  const ok = conflicts.length === 0;
  const next: Batch = {
    ...batch,
    motherLiquorId: ml?.id ?? batch.motherLiquorId,
    slotId: slot?.id ?? batch.slotId,
    status: ok ? "已排" : "待排",
    conflicts: [...batch.conflicts, ...conflicts],
  };
  return { batch: next, conflicts, ok };
}

// ---------------------------------------------------------------------------
// 槽位提交：两名技术员同时提交同一槽位，先到者占用，后到留冲突草稿
// ---------------------------------------------------------------------------

export interface SlotClaimResult {
  slot: VatSlot;
  booking?: SlotBooking;
  conflictDraft?: ConflictDraft;
  conflict?: Conflict;
}

/**
 * 先到者占用：若该槽位当日无预约，则占用；否则后到者保留冲突草稿。
 * 调用方保证在同一个同步 reducer 内顺序调用，先到先得。
 */
export function claimSlot(
  slot: VatSlot,
  batch: Batch,
  technician: string,
  date: string = today()
): SlotClaimResult {
  const overlapped = slot.bookings.some((b) => b.date === date);
  if (overlapped) {
    const conflict: Conflict = {
      id: uid("cf"),
      type: "并发占用",
      message: `并发占用：${technician} 提交 ${slot.code} 时已被先到者占用`,
      batchId: batch.id,
      slotId: slot.id,
      createdAt: Date.now(),
      resolved: false,
    };
    const conflictDraft: ConflictDraft = {
      id: uid("draft"),
      slotId: slot.id,
      slotCode: slot.code,
      batchId: batch.id,
      batchCode: batch.code,
      technician,
      reason: `槽位 ${slot.code} 已于 ${date} 被占用，后到提交保留为冲突草稿`,
      payload: { batchId: batch.id, technician, date, volumeL: requiredLiquorVolumeL(batch) },
      createdAt: Date.now(),
      merged: false,
    };
    return { slot, conflictDraft, conflict };
  }
  const booking: SlotBooking = {
    id: uid("book"),
    batchId: batch.id,
    batchCode: batch.code,
    volumeL: requiredLiquorVolumeL(batch),
    date,
    technician,
    createdAt: Date.now(),
  };
  return {
    slot: { ...slot, bookings: [...slot.bookings, booking] },
    booking,
  };
}

// ---------------------------------------------------------------------------
// 版本失效：配方/后整理/复修原因一变，依附旧版的色差结论与评审立即失效
// ---------------------------------------------------------------------------

/** 判断结论/评审是否依附于当前版本（任一版本号落后即失效） */
export function isStale(
  attachedTo: { recipeVersion: number; finishingVersion: number; repairVersion: number },
  versions: { recipeVersion: number; finishingVersion: number; repairVersion: number }
): boolean {
  return (
    attachedTo.recipeVersion !== versions.recipeVersion ||
    attachedTo.finishingVersion !== versions.finishingVersion ||
    attachedTo.repairVersion !== versions.repairVersion
  );
}

/** 重算某批次的色差结论与评审（按当前配方/后整理/复修版本） */
export function recomputeBatch(
  batch: Batch,
  recipes: Recipe[],
  finishings: Finishing[],
  repairs: RepairReason[]
): Batch {
  const recipe = recipes.find((r) => r.id === batch.recipeId);
  const finishing = finishings.find((f) => f.id === batch.finishingId);
  const repair = repairs.find((r) => r.id === batch.repairId);
  const conclusion = recalcConclusion(batch, recipe, finishing, repair);
  const review = recalcReview(conclusion);
  return {
    ...batch,
    recipeVersion: recipe?.version ?? batch.recipeVersion,
    finishingVersion: finishing?.version ?? batch.finishingVersion,
    repairVersion: repair?.version ?? batch.repairVersion,
    conclusion,
    review,
  };
}

/**
 * 版本变更后，把所有依附旧版的结论/评审标记失效；
 * 已签订单保留签订时快照（不动），未签订单随批次重算。
 */
export function invalidateByVersion(
  batches: Batch[],
  orders: Order[],
  versions: { recipeVersion: number; finishingVersion: number; repairVersion: number }
): Batch[] {
  return batches.map((b) => {
    const attached = {
      recipeVersion: b.conclusion?.attachedTo.recipeVersion ?? b.recipeVersion,
      finishingVersion: b.conclusion?.attachedTo.finishingVersion ?? b.finishingVersion,
      repairVersion: b.conclusion?.attachedTo.repairVersion ?? b.repairVersion ?? 0,
    };
    if (!isStale(attached, versions)) return b;
    // 已签订单：保留当时依据，不重算
    const order = orders.find((o) => o.id === b.orderId && o.signed);
    if (order) {
      return {
        ...b,
        conclusion: b.conclusion ? { ...b.conclusion, invalid: true } : b.conclusion,
        review: b.review ? { ...b.review, invalid: true } : b.review,
      };
    }
    return {
      ...b,
      conclusion: b.conclusion ? { ...b.conclusion, invalid: true } : b.conclusion,
      review: b.review ? { ...b.review, invalid: true } : b.review,
    };
  });
}

// ---------------------------------------------------------------------------
// 断网工艺曲线合并：同号重放只认首次；字段两边都改过则保留双方
// ---------------------------------------------------------------------------

export interface CurveMergeResult {
  curves: ProcessCurve[];
  accepted: ProcessCurve[];
  skippedByReplay: string[]; // 因同号重放被跳过的编号
  diverged: ProcessCurve[]; // 字段级分歧、保留双方的曲线
}

/**
 * 把断网期间录入的曲线条目合并进已同步曲线。
 * - 同号重放只认首次：number 已在 replayed 集合中 → 跳过
 * - 字段两边都改过 → 保留双方值（写入 fieldDivergence）
 * - 否则接受本地改动
 */
export function mergeCurves(
  existing: ProcessCurve[],
  pending: PendingCurveEntry[],
  replayed: string[]
): CurveMergeResult {
  const byNumber = new Map(existing.map((c) => [c.number, c]));
  const accepted: ProcessCurve[] = [];
  const skippedByReplay: string[] = [];
  const diverged: ProcessCurve[] = [];
  const replayedSet = new Set(replayed);

  for (const entry of pending) {
    // 同号重放只认首次
    if (replayedSet.has(entry.number)) {
      skippedByReplay.push(entry.number);
      continue;
    }
    const prev = byNumber.get(entry.number);
    if (!prev) {
      // 全新曲线：直接接受
      const curve: ProcessCurve = {
        id: uid("curve"),
        number: entry.number,
        name: entry.name,
        points: entry.points,
        synced: true,
        updatedAt: entry.updatedAt,
        updatedBy: entry.updatedBy,
      };
      byNumber.set(entry.number, curve);
      accepted.push(curve);
      replayedSet.add(entry.number);
      continue;
    }
    // 已存在：逐字段比对，两边都改过 → 保留双方
    const divergence: ProcessCurve["fieldDivergence"] = [];
    const merged: ProcessCurve = { ...prev, synced: true };
    for (const field of entry.changedFields) {
      const localVal = (entry as unknown as Record<string, unknown>)[field];
      const remoteVal = (prev as unknown as Record<string, unknown>)[field];
      const localChanged = JSON.stringify(localVal) !== JSON.stringify(remoteVal);
      // 远端是否也改过：以 prev.synced 且 updatedAt 早于 entry 判定远端有独立版本
      const remoteChanged = prev.updatedAt > 0 && field in prev;
      if (localChanged && remoteChanged) {
        divergence.push({ field, local: localVal, remote: remoteVal });
      } else if (localChanged) {
        (merged as unknown as Record<string, unknown>)[field] = localVal;
      }
    }
    if (divergence.length > 0) {
      merged.fieldDivergence = divergence;
      diverged.push(merged);
    } else {
      accepted.push(merged);
    }
    byNumber.set(entry.number, merged);
    replayedSet.add(entry.number);
  }

  return {
    curves: Array.from(byNumber.values()),
    accepted,
    skippedByReplay,
    diverged,
  };
}

// ---------------------------------------------------------------------------
// 旧批次迁移：缺母液编号则升级；迁移失败恢复最近草稿
// ---------------------------------------------------------------------------

export interface MigrationResult {
  batches: Batch[];
  upgraded: string[]; // 被升级（补母液编号）的批次号
  failed: string[];
}

/** 旧批次迁移：为缺母液编号的批次补一个母液编号 */
export function migrateBatches(
  batches: Batch[],
  motherLiquors: MotherLiquor[]
): MigrationResult {
  const upgraded: string[] = [];
  const failed: string[] = [];
  const next = batches.map((b) => {
    if (b.motherLiquorId) return b;
    try {
      // 升级：挑一个母液补上编号；坯布重量非法视为迁移失败
      if (!b.weightKg || b.weightKg <= 0) throw new Error("坯布重量缺失，无法升级母液编号");
      const ml = motherLiquors.find((m) => m.stockL > 0) ?? motherLiquors[0];
      if (!ml) throw new Error("无可用母液");
      upgraded.push(b.code);
      return { ...b, motherLiquorId: ml.id };
    } catch {
      failed.push(b.code);
      return b;
    }
  });
  return { batches: next, upgraded, failed };
}

/** 保存草稿快照（迁移前调用，失败后恢复最近草稿） */
export function saveDraft(drafts: DraftSnapshot[], reason: string, data: unknown): DraftSnapshot[] {
  const snapshot: DraftSnapshot = {
    id: uid("draft-snap"),
    reason,
    savedAt: Date.now(),
    data,
  };
  return [snapshot, ...drafts].slice(0, 20);
}

/** 恢复最近草稿 */
export function restoreLatestDraft<T>(drafts: DraftSnapshot[]): T | null {
  const latest = drafts[0];
  if (!latest) return null;
  return latest.data as T;
}
