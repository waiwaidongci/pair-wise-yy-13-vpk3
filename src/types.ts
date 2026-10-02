// 领域模型：染整离线作业台
// 对应需求：复染批次、染缸槽位、客户订单各记一份；母液/槽位分配；
// 版本失效重算；断网曲线合并；旧批次迁移升级与草稿恢复。

export type ID = string;

/** 配方（带版本号，改配方即升版本） */
export interface Recipe {
  id: ID;
  name: string;
  version: number; // 每次修改 +1，色差结论与评审依附于此版本
  motherLiquorRatio: number; // 母液系数：染液中母液占比（L 母液 / L 染液）
  dyes: { name: string; concentration: number }[];
  updatedAt: number;
}

/** 后整理方式（带版本号） */
export interface Finishing {
  id: ID;
  name: string;
  version: number;
  softener: number; // 柔软剂用量 %
  updatedAt: number;
}

/** 复修原因（带版本号） */
export interface RepairReason {
  id: ID;
  label: string;
  version: number;
  updatedAt: number;
}

/** 母液（有编号与余量） */
export interface MotherLiquor {
  id: ID;
  code: string; // 母液编号
  name: string;
  stockL: number; // 余量（升）
  batchNo: string; // 母液批次号
}

/** 槽位预约（某槽位某日被某批次占用） */
export interface SlotBooking {
  id: ID;
  batchId: ID;
  batchCode: string;
  volumeL: number; // 占用体积（升）
  date: string; // YYYY-MM-DD
  technician: string;
  createdAt: number;
}

/** 染缸槽位（有容量与余量） */
export interface VatSlot {
  id: ID;
  code: string; // 槽位编号
  capacityL: number; // 容量（升）
  bookings: SlotBooking[];
}

export type Verdict = "通过" | "复染" | "待确认";

/** 色差结论：依附于某个 配方/后整理/复修 版本组合 */
export interface ColorConclusion {
  id: ID;
  deltaE: number;
  lab: { l: number; a: number; b: number };
  verdict: Verdict;
  attachedTo: {
    recipeVersion: number;
    finishingVersion: number;
    repairVersion: number;
  };
  computedAt: number;
  invalid: boolean; // 依附版本过期 → true，需重算
}

export type ReviewResult = "评审通过" | "待复染" | "客户确认中";

/** 评审：同样依附版本组合 */
export interface Review {
  id: ID;
  result: ReviewResult;
  attachedTo: {
    recipeVersion: number;
    finishingVersion: number;
    repairVersion: number;
  };
  reviewedAt: number;
  invalid: boolean;
}

export type BatchStatus = "待排" | "已排" | "已开工" | "已完成";

export type ConflictType =
  | "母液不足"
  | "槽位撞单"
  | "槽位余量不足"
  | "并发占用";

export interface Conflict {
  id: ID;
  type: ConflictType;
  message: string;
  batchId?: ID;
  slotId?: ID;
  requiredL?: number;
  availableL?: number;
  createdAt: number;
  resolved: boolean;
}

/** 冲突草稿：后到技术员提交同一槽位时保留，不丢弃 */
export interface ConflictDraft {
  id: ID;
  slotId: ID;
  slotCode: string;
  batchId?: ID;
  batchCode?: string;
  technician: string;
  reason: string;
  payload: Record<string, unknown>;
  createdAt: number;
  merged: boolean;
}

/** 已签订单快照：签订时保留当时的色差结论与评审依据，之后批次重算不影响订单 */
export interface OrderSnapshot {
  recipeVersion: number;
  finishingVersion: number;
  repairVersion: number;
  conclusion: ColorConclusion;
  review: Review;
  signedAt: number;
}

export interface Order {
  id: ID;
  code: string; // 订单号
  customer: string;
  batchIds: ID[];
  signed: boolean;
  signedAt?: number;
  snapshot?: OrderSnapshot;
}

export interface CurvePoint {
  t: number; // 时间 min
  temp: number; // 温度 ℃
}

/** 工艺曲线：断网录入，联网合并；number 为幂等键（同号重放只认首次） */
export interface ProcessCurve {
  id: ID;
  number: string; // 工艺曲线编号（幂等键）
  name: string;
  points: CurvePoint[];
  synced: boolean; // 是否已联网同步
  updatedAt: number;
  updatedBy: string;
  /** 字段级分歧：断网两边都改了同一字段，保留双方值 */
  fieldDivergence?: { field: string; local: unknown; remote: unknown }[];
}

/** 断网期间录入、待联网合并的曲线条目 */
export interface PendingCurveEntry {
  id: ID;
  number: string;
  name: string;
  points: CurvePoint[];
  updatedAt: number;
  updatedBy: string;
  changedFields: string[]; // 本地改动的字段（用于字段级合并）
  remoteAlsoChanged?: string[]; // 远端也改过的字段（演示"字段两边都改过"）
}

/** 草稿快照：迁移前保存，迁移失败后恢复最近草稿 */
export interface DraftSnapshot {
  id: ID;
  reason: string;
  savedAt: number;
  data: unknown;
}

export type NetworkMode = "online" | "offline";

export interface WorkbenchState {
  batches: Batch[];
  recipes: Recipe[];
  finishings: Finishing[];
  repairReasons: RepairReason[];
  motherLiquors: MotherLiquor[];
  slots: VatSlot[];
  orders: Order[];
  curves: ProcessCurve[];
  pendingCurves: PendingCurveEntry[];
  conflicts: Conflict[];
  conflictDrafts: ConflictDraft[];
  drafts: DraftSnapshot[];
  replayedCurveNumbers: string[]; // 已重放过的曲线编号（同号只认首次）
  migrated: boolean;
  network: NetworkMode;
  technician: string;
}

export interface Batch {
  id: ID;
  code: string; // 批次号 LAB-xxx
  orderId?: ID;
  technician: string;
  fabric: string; // 面料成分
  weightKg: number; // 坯布重量 kg
  bathRatio: number; // 浴比（1:x）
  recipeId: ID;
  recipeVersion: number; // 依附的配方版本
  finishingId: ID;
  finishingVersion: number;
  repairId?: ID;
  repairVersion?: number;
  motherLiquorId?: ID; // 母液编号（旧批次可能缺失 → 升级）
  slotId?: ID;
  status: BatchStatus;
  conclusion?: ColorConclusion;
  review?: Review;
  conflicts: Conflict[];
  createdAt: number;
  startedAt?: number;
}
