// 染整离线作业台 —— 领域模型

export type ID = string;

/** 母液批次 */
export interface MasterLiquor {
  lotNo: ID;            // 母液编号
  dyeName: string;      // 染料名称
  /** 可用余量（升）；已开工批次的分配量在调度时扣减 */
  availableL: number;
}

/** 染缸槽位（一台染缸可有多个槽位） */
export interface Slot {
  id: ID;
  machineNo: string;
  name: string;
}

/** 排产冲突 */
export interface Conflict {
  type: "liquor_shortage" | "slot_overlap";
  message: string;
  /** 槽位撞单时，先到占用者 */
  blockedBy?: ID;
  detail?: Record<string, number | string>;
}

/** 母液分配明细（FIFO 按母液批次扣减） */
export interface Allocation {
  lotNo: ID;
  amountL: number;
}

/** 配方 / 工艺依据 */
export interface Basis {
  recipe: string;
  finishing: string;
  /** 配方、后整理或复修原因每变更一次，版本号 +1 */
  revision: number;
}

/** 色差结论（依附某一依据版本） */
export interface ColorResult {
  id: ID;
  basisRevision: number;
  deltaE: number;
  pass: boolean;
  recordedAt: number;
}

/** 评审结论（依附某一依据版本） */
export interface Review {
  id: ID;
  basisRevision: number;
  verdict: "pass" | "reject";
  reviewer: string;
  recordedAt: number;
}

type BatchStatus = "draft" | "scheduled" | "running" | "done";

/** 复染批次 / 染缸槽位 / 客户订单 各记一份：这是“批次”本 */
export interface Batch {
  id: ID;
  kind: "batch" | "redye";
  fabricWeightKg: number;
  /** 浴比，例如 1:10 => 每公斤布 10 升染液 */
  bathRatio: number;
  slotId?: ID;
  startAt?: string; // HH:MM
  endAt?: string;
  technician: string;
  /** 离线接单顺序（毫秒），同槽位先到者占用 */
  receivedAt: number;
  /** 同一时刻的逻辑序号，打破 receivedAt 并列 */
  clientSeq: number;
  status: BatchStatus;
  basis: Basis;
  /** 复修原因（仅复染批次），变更同样导致依据失效 */
  repairReason?: string;
  colorResult?: ColorResult;
  review?: Review;
  allocations: Allocation[];
  conflicts: Conflict[];
  scheduledAt?: number;
}

/** 客户订单 */
export interface CustomerOrder {
  id: ID;
  customer: string;
  batchId: ID;
  unsigned?: boolean;
  signedAt?: number;
  /** 签订时的依据版本；已签订单保留当时依据，不因后续改版而变动 */
  basisSnapshot?: Basis;
  repairReasonAtSign?: string;
  colorSnapshot?: ColorResult;
  reviewSnapshot?: Review;
}

/** 断网录入的工艺曲线 */
export interface ProcessCurve {
  id: ID;
  batchId?: ID;
  /** 字段级版本：最后写入的客户端与时间 */
  fieldRev: Record<string, { client: string; at: number }>;
  fields: Record<string, string>;
  /** 两边改过同一字段，无法判定先后时，双方数值都保留 */
  conflicts: Record<string, { a: string; b: string }>;
  createdAt: number;
  updatedAt: number;
  /** 同号重放只认首次：已应用过的同号写操作 */
  appliedOps: string[];
}

/** 母液升级（旧批次缺母液编号）记录 */
export interface MigrationRecord {
  batchId: ID;
  assignedLotNo: ID;
  migratedAt: number;
}

export interface AppState {
  liquors: MasterLiquor[];
  slots: Slot[];
  batches: Batch[];
  orders: CustomerOrder[];
  curves: Record<ID, ProcessCurve>;
  migrations: MigrationRecord[];
  seq: number;
  /** 迁移失败/回滚用：最近一次草稿快照 */
  lastDraftSnapshot?: AppState;
  /** 断网期间待合并的工艺曲线写操作 */
  pendingOps: import("./engine").CurveWriteOp[];
  online: boolean;
  /** 最近一次母液升级结果（失败时展示并已回滚到草稿） */
  lastUpgrade?: { ok: boolean; message: string; upgraded: string[]; at: number };
}
