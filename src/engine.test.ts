// 规则引擎测试：node 直接运行（由 esbuild 即时打包）
import { seedState } from "./seed";
import {
  attachColor,
  attachReview,
  bumpBasis,
  mergeCurveOps,
  scheduleDrafts,
  setClock,
  signOrder,
  upgradeLegacyBatches,
  type CurveWriteOp,
} from "./engine";
import type { Batch } from "./types";

let passed = 0;
let failed = 0;
function assert(cond: unknown, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}
function eq<T>(a: T, b: T, msg: string) {
  assert(JSON.stringify(a) === JSON.stringify(b), msg);
}

setClock((() => {
  let t = 1000;
  return () => ++t;
})());

function draft(over: Partial<Batch> & Pick<Batch, "id" | "receivedAt" | "clientSeq">): Batch {
  return {
    kind: "batch",
    fabricWeightKg: 10,
    bathRatio: 10,
    technician: "测",
    status: "draft",
    basis: { recipe: "r", finishing: "f", revision: 1 },
    allocations: [],
    conflicts: [],
    ...over,
  };
}

console.log("1) 开工前按重量×浴比分配母液，FIFO 扣减")
{
  const s = seedState();
  const d = draft({ id: "T1", receivedAt: 50, clientSeq: 50, fabricWeightKg: 25, bathRatio: 10 }); // 需 250L
  const { scheduled, conflicts } = scheduleDrafts(s, [d]);
  assert(scheduled.length === 1, "库存 380L 充足，开工成功");
  const al = scheduled[0].allocations;
  eq(al[0], { lotNo: "ML-01", amountL: 200 }, "先扣 ML-01 全部 200L");
  eq(al[1], { lotNo: "ML-02", amountL: 50 }, "再扣 ML-02 50L");

  const s2 = seedState();
  const huge = draft({ id: "T2", receivedAt: 51, clientSeq: 51, fabricWeightKg: 100, bathRatio: 10 }); // 需 1000L
  const r2 = scheduleDrafts(s2, [huge]);
  assert(r2.scheduled.length === 0, "母液不足：不开工");
  assert(r2.conflicts.length === 1, "母液不足：留待排");
  assert(r2.conflicts[0].conflicts[0].type === "liquor_shortage", "写明 liquor_shortage 冲突");
  eq((r2.conflicts[0].conflicts[0].detail as { shortL: number }).shortL, 620, "缺口写明 620L");
  eq(r2.conflicts[0].allocations, [], "不足时不预占母液");
}

console.log("2) 槽位撞单：先到者占用，后到留冲突草稿")
{
  const s = seedState(); // RC-2601 占用 S1-A 08:00-12:00
  const late = draft({
    id: "T3", receivedAt: 99, clientSeq: 99,
    slotId: "S1-A", startAt: "10:00", endAt: "13:00",
  });
  const early = draft({
    id: "T4", receivedAt: 90, clientSeq: 90,
    slotId: "S2-A", startAt: "10:00", endAt: "13:00",
  });
  const r = scheduleDrafts(s, [late, early]);
  assert(r.conflicts[0].id === "T3", "撞单批次留待排");
  assert(r.conflicts[0].conflicts[0].type === "slot_overlap", "写明 slot_overlap");
  eq(r.conflicts[0].conflicts[0].blockedBy, "RC-2601", "记录先到占用者 RC-2601");
  assert(r.scheduled.find((b) => b.id === "T4") !== undefined, "空闲槽位正常开工");

  // 两个草稿抢同一空槽：先到先得
  const s2 = seedState();
  const a = draft({ id: "A", receivedAt: 100, clientSeq: 1, slotId: "S2-A", startAt: "08:00", endAt: "10:00", fabricWeightKg: 1 });
  const b = draft({ id: "B", receivedAt: 100, clientSeq: 2, slotId: "S2-A", startAt: "09:00", endAt: "11:00", fabricWeightKg: 1 });
  const r2 = scheduleDrafts(s2, [b, a]); // 数组乱序传入
  assert(!!r2.scheduled.find((x) => x.id === "A"), "同刻先到(clientSeq小)占用 A 开工");
  const bDraft = r2.conflicts.find((x) => x.id === "B");
  assert(!!bDraft, "后到 B 留冲突草稿");
  eq(bDraft?.conflicts[0].blockedBy, "A", "B 的占用者为 A");
}

console.log("3) 配方/后整理/复修原因变更：旧色差与评审失效，已签订单保留依据")
{
  const s = seedState();
  let b = s.batches.find((x) => x.id === "RC-2601")!;
  b = attachColor(b, { deltaE: 0.5, pass: true });
  b = attachReview(b, "pass", "主管");
  const withReview: typeof s = {
    ...s,
    batches: s.batches.map((x) => (x.id === b.id ? b : x)),
    orders: [
      ...s.orders,
      { id: "CO-NEW", customer: "新客", batchId: "RC-2601", unsigned: true },
    ],
  };
  const signed = signOrder(withReview, "CO-NEW");

  const changed = bumpBasis(b, { recipe: "红3BS 2.4% / 黄3RS 0.9%" });
  eq(changed.basis.revision, 2, "配方一改版本 +1");
  assert(changed.colorResult === undefined, "依附旧版的色差结论立即失效");
  assert(changed.review === undefined, "依附旧版的评审立即失效");

  const order = signed.orders.find((o) => o.id === "CO-NEW")!;
  eq(order.basisSnapshot?.revision, 1, "已签订单保留当时依据版本");
  eq(order.colorSnapshot?.deltaE, 0.5, "已签订单保留当时色差结论");

  const repaired = bumpBasis(s.batches.find((x) => x.id === "RR-2602")!, { repairReason: "二缸色差偏大再修" });
  eq(repaired.basis.revision, 3, "复修原因变更同样升级版本并失效结论");

  const same = bumpBasis(b, { recipe: b.basis.recipe });
  eq(same.basis.revision, 1, "值未变不升版本");
}

console.log("4) 离线工艺曲线：同号重放只认首次，字段两边都改过留双方")
{
  const ops: CurveWriteOp[] = [
    { opId: "op-1", curveId: "C1", client: "现场平板", at: 10, fields: { temp: "130", hold: "30" } },
  ];
  let curves = mergeCurveOps({}, ops);
  // 重放同号：只认首次
  curves = mergeCurveOps(curves, [
    { opId: "op-1", curveId: "C1", client: "攻击重放", at: 99, fields: { temp: "999", hold: "30" } },
  ]);
  eq(curves.C1.fields.temp, "130", "同号重放被忽略");
  eq(curves.C1.appliedOps.length, 1, "同号操作只登记一次");

  // 服务端已从 130 -> 135（op-2，基于 base 130）
  curves = mergeCurveOps(curves, [
    { opId: "op-2", curveId: "C1", client: "车间A", at: 20, fields: { temp: "135" }, base: { temp: "130" } },
  ]);
  eq(curves.C1.fields.temp, "135", "单边修改正常合入");
  // 现场平板离线也基于 130 改成 140：两边都改过 -> 留双方
  curves = mergeCurveOps(curves, [
    { opId: "op-3", curveId: "C1", client: "现场平板", at: 30, fields: { temp: "140" }, base: { temp: "130" } },
  ]);
  eq(curves.C1.conflicts.temp, { a: "135", b: "140" }, "同字段两边都改：双方保留");
  eq(curves.C1.fields.hold, "30", "未冲突字段不受影响");

  // 只客户端改、服务端未动 -> 直接取客户端
  curves = mergeCurveOps(curves, [
    { opId: "op-4", curveId: "C1", client: "现场平板", at: 40, fields: { hold: "45" }, base: { hold: "30" } },
  ]);
  eq(curves.C1.fields.hold, "45", "仅单侧改动直接采用");
}

console.log("5) 旧批次缺母液编号则升级，失败恢复最近草稿")
{
  // 造一个缺母液编号的旧批次
  const s = seedState();
  const legacy: Batch = {
    ...draft({ id: "OLD-1", receivedAt: 3, clientSeq: 3, fabricWeightKg: 5 }),
    status: "done",
    allocations: [],
  };
  const before = { ...s, batches: [...s.batches, legacy] };
  const stockBefore = before.liquors.map((l) => l.availableL);

  const bad = upgradeLegacyBatches(before, [{ batchId: "OLD-1", lotNo: "ML-NOPE" }]);
  assert(!bad.ok, "母液编号不存在：迁移失败");
  eq(bad.state.migrations, [], "失败不写迁移记录");
  eq(bad.state.liquors.map((l) => l.availableL), stockBefore, "失败后库存恢复");
  assert(bad.state.batches.find((b) => b.id === "OLD-1")?.allocations.length === 0, "旧批次恢复为无编号状态");

  const good = upgradeLegacyBatches(before, [{ batchId: "OLD-1", lotNo: "ML-01" }]);
  assert(good.ok, "合法编号：升级成功");
  eq(good.state.batches.find((b) => b.id === "OLD-1")?.allocations, [{ lotNo: "ML-01", amountL: 50 }], "补登母液分配 50L");
  eq(good.state.liquors.find((l) => l.lotNo === "ML-01")!.availableL, 150, "库存对应扣减");
  assert(good.state.lastDraftSnapshot !== undefined, "迁移前保存了最近草稿快照");
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) throw new Error("规则测试存在失败用例");
