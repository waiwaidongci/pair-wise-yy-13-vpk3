import type { AppState } from "./types";

// 初始数据：复染批次、染缸槽位、客户订单各记一份
export function seedState(): AppState {
  return {
    liquors: [
      { lotNo: "ML-01", dyeName: "活性红 3BS", availableL: 200 },
      { lotNo: "ML-02", dyeName: "活性黄 3RS", availableL: 120 },
      { lotNo: "ML-03", dyeName: "分散蓝 2BLN", availableL: 60 },
    ],
    slots: [
      { id: "S1-A", machineNo: "染缸1号", name: "A槽" },
      { id: "S1-B", machineNo: "染缸1号", name: "B槽" },
      { id: "S2-A", machineNo: "染缸2号", name: "A槽" },
    ],
    batches: [
      {
        id: "RC-2601",
        kind: "batch",
        fabricWeightKg: 12,
        bathRatio: 10,
        slotId: "S1-A",
        startAt: "08:00",
        endAt: "12:00",
        technician: "王工",
        receivedAt: 1,
        clientSeq: 0,
        status: "running",
        basis: { recipe: "红3BS 2.1% / 黄3RS 0.6%", finishing: "柔软 2%", revision: 1 },
        allocations: [{ lotNo: "ML-01", amountL: 90 }, { lotNo: "ML-02", amountL: 30 }],
        conflicts: [],
        colorResult: {
          id: "RC-2601-color@1",
          basisRevision: 1,
          deltaE: 0.84,
          pass: true,
          recordedAt: 1,
        },
      },
      {
        // 复染批次（复修原因一份记录）
        id: "RR-2602",
        kind: "redye",
        fabricWeightKg: 8,
        bathRatio: 8,
        slotId: "S1-B",
        startAt: "09:00",
        endAt: "11:30",
        technician: "李工",
        receivedAt: 2,
        clientSeq: 1,
        status: "running",
        basis: { recipe: "蓝2BLN 1.4%", finishing: "定型 160℃", revision: 2 },
        repairReason: "首缸色花，复修匀染",
        allocations: [{ lotNo: "ML-03", amountL: 64 }],
        conflicts: [],
      },
      {
        // 旧批次：缺母液编号，等待升级
        id: "OLD-2599",
        kind: "batch",
        fabricWeightKg: 6,
        bathRatio: 10,
        technician: "旧系统导入",
        receivedAt: 0,
        clientSeq: 0,
        status: "done",
        basis: { recipe: "（旧配方）活性红 1.8%", finishing: "常规", revision: 1 },
        allocations: [],
        conflicts: [],
      },
    ],
    orders: [
      {
        id: "CO-77",
        customer: "华盛纺织",
        batchId: "RC-2601",
        signedAt: 100,
        basisSnapshot: { recipe: "红3BS 2.1% / 黄3RS 0.6%", finishing: "柔软 2%", revision: 1 },
        colorSnapshot: {
          id: "RC-2601-color@1",
          basisRevision: 1,
          deltaE: 0.84,
          pass: true,
          recordedAt: 1,
        },
      },
    ],
    curves: {},
    migrations: [],
    seq: 10,
    pendingOps: [],
    online: true,
  };
}