import React, { useState } from "react";
import { useStore, type NewDraftInput } from "../store";
import type { Batch } from "../types";
import { needLiquorL } from "../engine";

const COLOR_LIMIT = 1.5;

type FormState = Omit<NewDraftInput, "repairReason" | "orderCustomer"> & {
  repairReason: string;
  orderCustomer: string;
};

function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function statusTone(b: Batch) {
  if (b.status === "running") return "green";
  if (b.status === "draft") return "amber";
  return "gray";
}
const statusText: Record<string, string> = {
  draft: "待排草稿",
  running: "已开工",
  done: "已完成",
  scheduled: "已排产",
};

// ---------- 接单表单 ----------
function SubmitForm() {
  const { state, dispatch } = useStore();
  const blank: FormState = {
    kind: "batch",
    fabricWeightKg: 10,
    bathRatio: 10,
    slotId: state.slots[0]?.id ?? "",
    startAt: "08:00",
    endAt: "12:00",
    technician: "",
    recipe: "",
    finishing: "",
    repairReason: "",
    orderCustomer: "",
  };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank, v: string | number) => setF((p) => ({ ...p, [k]: v }));
  const need = f.fabricWeightKg * f.bathRatio;

  const submit = () => {
    const input: NewDraftInput = {
      ...f,
      repairReason: f.kind === "redye" ? f.repairReason || undefined : undefined,
      orderCustomer: f.orderCustomer || undefined,
    };
    dispatch({ type: "SUBMIT", input });
    setF({ ...blank, kind: f.kind });
  };

  return (
    <div className="card form-card">
      <h3>开工接单（复染批次 / 普通批次 各记一份）</h3>
      <div className="form-grid">
        <label>
          <span>批次类型</span>
          <select value={f.kind} onChange={(e) => set("kind", e.target.value)}>
            <option value="batch">染色批次 RC</option>
            <option value="redye">复染批次 RR</option>
          </select>
        </label>
        <label>
          <span>技术员</span>
          <input value={f.technician} onChange={(e) => set("technician", e.target.value)} placeholder="如：王工" />
        </label>
        <label>
          <span>坯布重量 kg</span>
          <input type="number" value={f.fabricWeightKg} onChange={(e) => set("fabricWeightKg", +e.target.value)} />
        </label>
        <label>
          <span>浴比 1:?</span>
          <input type="number" value={f.bathRatio} onChange={(e) => set("bathRatio", +e.target.value)} />
        </label>
        <label>
          <span>槽位</span>
          <select value={f.slotId} onChange={(e) => set("slotId", e.target.value)}>
            {state.slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.machineNo} · {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>占用时段</span>
          <div className="time-range">
            <input type="time" value={f.startAt} onChange={(e) => set("startAt", e.target.value)} />
            <b>–</b>
            <input type="time" value={f.endAt} onChange={(e) => set("endAt", e.target.value)} />
          </div>
        </label>
        <label className="wide">
          <span>配方</span>
          <input value={f.recipe} onChange={(e) => set("recipe", e.target.value)} placeholder="如：红3BS 2.1% / 黄3RS 0.6%" />
        </label>
        <label className="wide">
          <span>后整理</span>
          <input value={f.finishing} onChange={(e) => set("finishing", e.target.value)} placeholder="如：柔软 2%" />
        </label>
        {f.kind === "redye" && (
          <label className="wide">
            <span>复修原因（变更将使旧结论失效）</span>
            <input value={f.repairReason} onChange={(e) => set("repairReason", e.target.value)} placeholder="如：首缸色花，复修匀染" />
          </label>
        )}
        <label className="wide">
          <span>同时登记客户订单（可选）</span>
          <input value={f.orderCustomer} onChange={(e) => set("orderCustomer", e.target.value)} placeholder="客户名称" />
        </label>
      </div>
      <div className="form-foot">
        <span className="hint">
          母液需求 <b>{need}L</b> · 提交即按先到顺序排产；不足或撞单自动留待排并写冲突
        </span>
        <button className="primary" onClick={submit} disabled={!f.technician || !f.recipe}>
          提交排产
        </button>
      </div>
    </div>
  );
}

// ---------- 批次卡 ----------
function BasisEditor({ b }: { b: Batch }) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [recipe, setRecipe] = useState(b.basis.recipe);
  const [finishing, setFinishing] = useState(b.basis.finishing);
  const [reason, setReason] = useState(b.repairReason ?? "");

  const stale =
    (b.colorResult && b.colorResult.basisRevision < b.basis.revision) ||
    (b.review && b.review.basisRevision < b.basis.revision);

  return (
    <div className="basis">
      <div className="basis-line">
        <Badge tone="indigo">依据 rev.{b.basis.revision}</Badge>
        {stale && <Badge tone="red">旧结论已失效，需重算</Badge>}
        <button className="link" onClick={() => setOpen((v) => !v)}>
          {open ? "收起" : "改配方/后整理/复修原因"}
        </button>
      </div>
      {open && (
        <div className="basis-edit">
          <input value={recipe} onChange={(e) => setRecipe(e.target.value)} placeholder="配方" />
          <input value={finishing} onChange={(e) => setFinishing(e.target.value)} placeholder="后整理" />
          {b.kind === "redye" && (
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="复修原因" />
          )}
          <button
            className="primary"
            onClick={() =>
              dispatch({
                type: "SET_BASIS",
                batchId: b.id,
                patch: { recipe, finishing, ...(b.kind === "redye" ? { repairReason: reason } : {}) },
              })
            }
          >
            保存并升版
          </button>
        </div>
      )}
    </div>
  );
}

function ColorReview({ b }: { b: Batch }) {
  const { dispatch } = useStore();
  const [delta, setDelta] = useState(b.colorResult?.deltaE ?? 0);
  return (
    <div className="qc">
      <div className="qc-row">
        <span>Lab 色差 ΔE（限值 {COLOR_LIMIT}）</span>
        {b.colorResult ? (
          <Badge tone={b.colorResult.pass ? "green" : "red"}>
            {b.colorResult.deltaE} · {b.colorResult.pass ? "合格" : "超限"} @rev{b.colorResult.basisRevision}
          </Badge>
        ) : (
          <Badge tone="red">无色差结论（待重算）</Badge>
        )}
        <span className="qc-input">
          <input type="number" step="0.01" value={delta} onChange={(e) => setDelta(+e.target.value)} />
          <button onClick={() => dispatch({ type: "SET_COLOR", batchId: b.id, deltaE: delta, limit: COLOR_LIMIT })}>
            重测
          </button>
        </span>
      </div>
      <div className="qc-row">
        <span>评审</span>
        {b.review ? (
          <Badge tone={b.review.verdict === "pass" ? "green" : "red"}>
            {b.review.verdict === "pass" ? "通过" : "驳回"} · {b.review.reviewer} @rev{b.review.basisRevision}
          </Badge>
        ) : (
          <Badge tone="amber">无评审（依据改版后须重评）</Badge>
        )}
        <span className="qc-input">
          <button
            className="primary"
            disabled={!b.colorResult || b.colorResult.basisRevision !== b.basis.revision || !b.colorResult.pass}
            title={!b.colorResult || !b.colorResult.pass ? "色差合格后方可放行" : ""}
            onClick={() => dispatch({ type: "SET_REVIEW", batchId: b.id, verdict: "pass", reviewer: "当班主管" })}
          >
            评审放行
          </button>
          <button onClick={() => dispatch({ type: "SET_REVIEW", batchId: b.id, verdict: "reject", reviewer: "当班主管" })}>
            驳回
          </button>
        </span>
      </div>
    </div>
  );
}

function BatchCard({ b }: { b: Batch }) {
  const slot = useStore().state.slots.find((s) => s.id === b.slotId);
  return (
    <article className={`card batch ${b.status === "draft" ? "draft" : ""}`}>
      <header>
        <div>
          <h3>
            {b.id} {b.kind === "redye" && <Badge tone="rose">复染</Badge>}
          </h3>
          <small>
            {b.technician} · {b.fabricWeightKg}kg · 浴比 1:{b.bathRatio} · 母液 {needLiquorL(b)}L
            {slot ? ` · ${slot.machineNo} ${slot.name} ${b.startAt}-${b.endAt}` : ""}
          </small>
        </div>
        <Badge tone={statusTone(b)}>{statusText[b.status]}</Badge>
      </header>

      {b.conflicts.length > 0 && (
        <div className="conflicts">
          {b.conflicts.map((c, i) => (
            <div key={i} className={`conflict conflict-${c.type}`}>
              ⛔ {c.message}
            </div>
          ))}
        </div>
      )}

      {b.allocations.length > 0 && (
        <div className="alloc">
          母液分配：
          {b.allocations.map((a) => (
            <Badge key={a.lotNo} tone="indigo">
              {a.lotNo} {a.amountL}L
            </Badge>
          ))}
        </div>
      )}

      <p className="recipe">配方：{b.basis.recipe}</p>
      <p className="recipe">后整理：{b.basis.finishing}</p>
      {b.repairReason && <p className="recipe">复修原因：{b.repairReason}</p>}

      <BasisEditor b={b} />
      <ColorReview b={b} />
    </article>
  );
}

export function BatchesPanel() {
  const { state } = useStore();
  const drafts = state.batches.filter((b) => b.status === "draft");
  const running = state.batches.filter((b) => b.status !== "draft");
  return (
    <div className="panel-grid">
      <div className="col">
        <h2 className="col-title">待排冲突草稿（{drafts.length}）</h2>
        {drafts.length === 0 && <p className="empty">暂无留待排草稿</p>}
        {drafts.map((b) => (
          <BatchCard key={b.id} b={b} />
        ))}
      </div>
      <div className="col">
        <h2 className="col-title">已开工 / 在缸批次（{running.length}）</h2>
        {running.map((b) => (
          <BatchCard key={b.id} b={b} />
        ))}
      </div>
    </div>
  );
}

export { SubmitForm };
