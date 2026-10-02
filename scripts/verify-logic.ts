// 核心业务规则快速验证（不参与构建）
import {
  allocateBatch,
  claimSlot,
  mergeCurves,
  migrateBatches,
  recomputeBatch,
  recalcConclusion,
  recalcReview,
  isStale,
} from "../src/logic";
import type { Batch, Recipe, Finishing, RepairReason, VatSlot, MotherLiquor, ProcessCurve, PendingCurveEntry } from "../src/types";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.log("  ✗", msg); }
}

const recipe: Recipe = { id: "r1", name: "配方A", version: 1, motherLiquorRatio: 0.05, dyes: [], updatedAt: 0 };
const finishing: Finishing = { id: "f1", name: "柔软", version: 1, softener: 2, updatedAt: 0 };
const repair: RepairReason = { id: "rr1", label: "首次", version: 1, updatedAt: 0 };
const ml: MotherLiquor = { id: "ml1", code: "ML-1", name: "母液", stockL: 50, batchNo: "b1" };
const slot: VatSlot = { id: "s1", code: "染缸A", capacityL: 300, bookings: [] };

function mkBatch(over: Partial<Batch> = {}): Batch {
  return {
    id: "b1", code: "LAB-1", technician: "陈", fabric: "棉", weightKg: 10, bathRatio: 10,
    recipeId: "r1", recipeVersion: 1, finishingId: "f1", finishingVersion: 1,
    repairId: "rr1", repairVersion: 1, status: "待排", conflicts: [], createdAt: 0,
    ...over,
  };
}

console.log("== 1. 开工前分配：母液/槽位充足 → 已排 ==");
{
  const b = mkBatch();
  const r = allocateBatch(b, recipe, [ml], [slot]);
  assert(r.ok && r.batch.status === "已排", "充足时分配成功、状态已排");
  assert(r.batch.motherLiquorId === "ml1", "分配了母液编号");
}

console.log("== 2. 母液不足 → 待排并写明冲突 ==");
{
  const poor: MotherLiquor = { ...ml, stockL: 1 };
  const b = mkBatch();
  const r = allocateBatch(b, recipe, [poor], [slot]);
  assert(!r.ok && r.batch.status === "待排", "母液不足时留待排");
  assert(r.conflicts.some((c) => c.type === "母液不足"), "写明母液不足冲突");
}

console.log("== 3. 槽位撞单 → 待排并写明冲突 ==");
{
  const booked: VatSlot = { ...slot, bookings: [{ id: "bk", batchId: "other", batchCode: "LAB-9", volumeL: 100, date: new Date().toISOString().slice(0, 10), technician: "X", createdAt: 0 }] };
  const b = mkBatch();
  const r = allocateBatch(b, recipe, [ml], [booked]);
  assert(!r.ok && r.batch.status === "待排", "槽位撞单时留待排");
  assert(r.conflicts.some((c) => c.type === "槽位撞单"), "写明槽位撞单冲突");
}

console.log("== 4. 两名技术员同时提交同一槽位：先到占用、后到冲突草稿 ==");
{
  const b = mkBatch();
  const first = claimSlot(slot, b, "陈技术员");
  const second = claimSlot(first.slot, b, "李技术员");
  assert(!!first.booking, "先到者占用槽位");
  assert(!second.booking && !!second.conflictDraft, "后到者保留冲突草稿");
  assert(second.conflictDraft?.technician === "李技术员", "冲突草稿记录后到技术员");
}

console.log("== 5. 版本变更：依附旧版结论/评审失效，重算后刷新 ==");
{
  let b = mkBatch();
  b = recomputeBatch(b, [recipe], [finishing], [repair]);
  assert(b.conclusion?.invalid === false && b.review?.invalid === false, "初始结论/评审有效");
  const newRecipe = { ...recipe, version: 2 };
  const stale = isStale(
    { recipeVersion: b.conclusion!.attachedTo.recipeVersion, finishingVersion: b.conclusion!.attachedTo.finishingVersion, repairVersion: b.conclusion!.attachedTo.repairVersion },
    { recipeVersion: newRecipe.version, finishingVersion: 1, repairVersion: 1 }
  );
  assert(stale, "配方升版本后旧结论判定为失效");
  const rec = recomputeBatch(b, [newRecipe], [finishing], [repair]);
  assert(rec.conclusion?.attachedTo.recipeVersion === 2 && rec.conclusion.invalid === false, "重算后依附新版本");
}

console.log("== 6. 断网曲线合并：同号重放只认首次 ==");
{
  const existing: ProcessCurve[] = [{ id: "c1", number: "TC-1", name: "曲线", points: [], synced: true, updatedAt: 0, updatedBy: "A" }];
  const pending: PendingCurveEntry[] = [
    { id: "p1", number: "TC-1", name: "曲线改", points: [], updatedAt: 1, updatedBy: "B", changedFields: ["name"] },
  ];
  const r1 = mergeCurves(existing, pending, []);
  assert(r1.accepted.length === 1 && r1.skippedByReplay.length === 0, "首次合并接受");
  const r2 = mergeCurves(r1.curves, pending, r1.curves.map((c) => c.number));
  assert(r2.skippedByReplay.includes("TC-1"), "同号重放被跳过（只认首次）");
}

console.log("== 7. 字段两边都改过 → 保留双方 ==");
{
  const existing: ProcessCurve[] = [{ id: "c1", number: "TC-1", name: "原名", points: [{ t: 0, temp: 20 }], synced: true, updatedAt: 5, updatedBy: "server" }];
  const pending: PendingCurveEntry[] = [
    { id: "p1", number: "TC-1", name: "新名", points: [{ t: 0, temp: 30 }], updatedAt: 10, updatedBy: "local", changedFields: ["name", "points"], remoteAlsoChanged: ["name"] },
  ];
  const r = mergeCurves(existing, pending, []);
  assert(r.diverged.length === 1, "字段级分歧保留双方");
  assert(r.diverged[0].fieldDivergence?.some((d) => d.field === "name"), "name 字段保留双方值");
}

console.log("== 8. 旧批次迁移：缺母液编号升级；非法批次失败 ==");
{
  const good = mkBatch({ id: "g1", code: "LAB-G", motherLiquorId: undefined, weightKg: 15 });
  const bad = mkBatch({ id: "b2", code: "LAB-B", motherLiquorId: undefined, weightKg: 0 });
  const r = migrateBatches([good, bad], [ml]);
  assert(r.upgraded.includes("LAB-G"), "有效旧批次升级补母液编号");
  assert(r.failed.includes("LAB-B"), "非法批次迁移失败");
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
