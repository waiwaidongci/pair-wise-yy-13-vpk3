// 批次管理：新增批次（开工前分配母液/槽位）、版本徽章、色差失效重算、先开工
import { useState } from "react";
import { useStore } from "../store";
import type { Batch } from "../types";

const empty = {
  fabric: "",
  weightKg: 10,
  bathRatio: 10,
  recipeId: "r1",
  finishingId: "f1",
  repairId: "rr1",
  orderId: "",
  slotId: "s1",
};

export default function Batches() {
  const { state, dispatch } = useStore();
  const [form, setForm] = useState(empty);

  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.fabric.trim()) return;
    dispatch({
      type: "ADD_BATCH",
      payload: {
        fabric: form.fabric.trim(),
        weightKg: Number(form.weightKg) || 0,
        bathRatio: Number(form.bathRatio) || 10,
        recipeId: form.recipeId,
        finishingId: form.finishingId,
        repairId: form.repairId || undefined,
        orderId: form.orderId || undefined,
        slotId: form.slotId,
        technician: state.technician,
      },
    });
    setForm(empty);
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>开工前分配</p>
            <h2>新增批次</h2>
          </div>
          <button className="primary" onClick={submit}>
            分配并开工
          </button>
        </div>
        <p className="hint">
          按坯布重量 × 浴比 测算染液体积，再按配方母液系数分配母液、核对槽位余量；
          母液不足或槽位撞单/余量不足 → 留待排并写明冲突，仍可先开工。
        </p>
        <div className="field-grid">
          <label>
            <span>面料成分</span>
            <input
              value={form.fabric}
              placeholder="如 棉府绸 120g"
              onChange={(e) => set("fabric", e.target.value)}
            />
          </label>
          <label>
            <span>坯布重量 (kg)</span>
            <input
              type="number"
              value={form.weightKg}
              onChange={(e) => set("weightKg", Number(e.target.value))}
            />
          </label>
          <label>
            <span>浴比 (1:x)</span>
            <input
              type="number"
              value={form.bathRatio}
              onChange={(e) => set("bathRatio", Number(e.target.value))}
            />
          </label>
          <label>
            <span>配方</span>
            <select
              value={form.recipeId}
              onChange={(e) => set("recipeId", e.target.value)}
            >
              {state.recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (v{r.version})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>后整理</span>
            <select
              value={form.finishingId}
              onChange={(e) => set("finishingId", e.target.value)}
            >
              {state.finishings.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} (v{f.version})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>复修原因</span>
            <select
              value={form.repairId}
              onChange={(e) => set("repairId", e.target.value)}
            >
              <option value="">首次染色</option>
              {state.repairReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} (v{r.version})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>客户订单（可选）</span>
            <select
              value={form.orderId}
              onChange={(e) => set("orderId", e.target.value)}
            >
              <option value="">不关联订单</option>
              {state.orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} · {o.customer}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>染缸槽位</span>
            <select
              value={form.slotId}
              onChange={(e) => set("slotId", e.target.value)}
            >
              {state.slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code}（容量 {s.capacityL}L）
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>批次列表</p>
            <h2>小样批次（{state.batches.length}）</h2>
          </div>
        </div>
        <div className="records">
          {state.batches.map((b) => (
            <BatchRow key={b.id} batch={b} />
          ))}
        </div>
      </section>
    </div>
  );
}

function BatchRow({ batch: b }: { batch: Batch }) {
  const { state, dispatch } = useStore();
  const recipe = state.recipes.find((r) => r.id === b.recipeId);
  const finishing = state.finishings.find((f) => f.id === b.finishingId);
  const repair = state.repairReasons.find((r) => r.id === b.repairId);
  const ml = state.motherLiquors.find((m) => m.id === b.motherLiquorId);
  const slot = state.slots.find((s) => s.id === b.slotId);
  const order = state.orders.find((o) => o.id === b.orderId);
  const conflicts = b.conflicts.filter((c) => !c.resolved);

  return (
    <article className="batch-row">
      <b>{b.code.slice(-3)}</b>
      <div className="batch-body">
        <div className="batch-head">
          <h3>
            {b.code} · {b.fabric}
          </h3>
          <span className={`status ${b.status}`}>{b.status}</span>
        </div>
        <p>
          {b.technician} · 坯布 {b.weightKg}kg · 浴比 1:{b.bathRatio}
          {ml ? ` · 母液 ${ml.code}` : " · 缺母液编号"}
          {slot ? ` · ${slot.code}` : ""}
          {order ? ` · 订单 ${order.code}` : ""}
        </p>
        <div className="chips">
          <span className="chip version">配方 v{b.recipeVersion}</span>
          <span className="chip version">后整理 v{b.finishingVersion}</span>
          <span className="chip version">
            复修 v{b.repairVersion ?? 0}
          </span>
          {recipe && <span className="chip">{recipe.name}</span>}
          {finishing && <span className="chip">{finishing.name}</span>}
          {repair && <span className="chip">{repair.label}</span>}
        </div>

        {b.conclusion && (
          <div className="conclusion">
            <span>
              色差 ΔE <strong>{b.conclusion.deltaE}</strong>
              （{b.conclusion.verdict}）
            </span>
            <span className="lab">
              L {b.conclusion.lab.l} · a {b.conclusion.lab.a} · b{" "}
              {b.conclusion.lab.b}
            </span>
            {b.conclusion.invalid && (
              <span className="chip invalid">依附版本已失效，待重算</span>
            )}
          </div>
        )}
        {b.review && (
          <div className="conclusion">
            <span>评审：{b.review.result}</span>
            {b.review.invalid && (
              <span className="chip invalid">评审依附版本已失效</span>
            )}
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="conflict-list">
            {conflicts.map((c) => (
              <span key={c.id} className="chip conflict">
                {c.type}：{c.message}
              </span>
            ))}
          </div>
        )}

        <div className="btn-row">
          {b.status === "待排" && (
            <button
              className="primary"
              onClick={() => dispatch({ type: "START_BATCH", batchId: b.id })}
            >
              仍先开工
            </button>
          )}
          <button
            onClick={() => dispatch({ type: "RECALC_BATCH", batchId: b.id })}
          >
            重算色差/评审
          </button>
        </div>
      </div>
    </article>
  );
}
