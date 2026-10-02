// 版本控制：配方/后整理/复修原因变更 → 依附旧版的色差结论与评审立即失效重算
import { useState } from "react";
import { useStore } from "../store";

export default function Versions() {
  const { state, dispatch } = useStore();
  const [recipeId, setRecipeId] = useState(state.recipes[0]?.id ?? "");
  const [finishingId, setFinishingId] = useState(state.finishings[0]?.id ?? "");
  const [repairId, setRepairId] = useState(state.repairReasons[0]?.id ?? "");

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>版本失效</p>
            <h2>配方 / 后整理 / 复修原因变更</h2>
          </div>
        </div>
        <p className="hint">
          配方、后整理或复修原因一变，依附旧版本的色差结论和评审立即失效并重算；
          已签订单保留签订时依据（见客户订单页）。
        </p>

        <div className="version-group">
          <h3>配方</h3>
          <div className="field-grid">
            <label>
              <span>选择配方</span>
              <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
                {state.recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}（当前 v{r.version}）
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="btn-row">
            <button
              className="primary"
              onClick={() =>
                dispatch({
                  type: "CHANGE_RECIPE",
                  recipeId,
                  changes: { name: state.recipes.find((r) => r.id === recipeId)?.name },
                })
              }
            >
              改配方（升版本 → 色差/评审失效重算）
            </button>
          </div>
        </div>

        <div className="version-group">
          <h3>后整理</h3>
          <div className="field-grid">
            <label>
              <span>选择后整理</span>
              <select
                value={finishingId}
                onChange={(e) => setFinishingId(e.target.value)}
              >
                {state.finishings.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}（当前 v{f.version}）
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="btn-row">
            <button
              className="primary"
              onClick={() =>
                dispatch({
                  type: "CHANGE_FINISHING",
                  finishingId,
                  changes: {
                    name: state.finishings.find((f) => f.id === finishingId)?.name,
                  },
                })
              }
            >
              改后整理（升版本 → 色差/评审失效重算）
            </button>
          </div>
        </div>

        <div className="version-group">
          <h3>复修原因</h3>
          <div className="field-grid">
            <label>
              <span>选择复修原因</span>
              <select value={repairId} onChange={(e) => setRepairId(e.target.value)}>
                {state.repairReasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}（当前 v{r.version}）
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="btn-row">
            <button
              className="primary"
              onClick={() =>
                dispatch({
                  type: "CHANGE_REPAIR",
                  repairId,
                  changes: {
                    label: state.repairReasons.find((r) => r.id === repairId)?.label,
                  },
                })
              }
            >
              改复修原因（升版本 → 色差/评审失效重算）
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>当前版本</p>
            <h2>版本清单</h2>
          </div>
        </div>
        <div className="records">
          {state.recipes.map((r) => (
            <article key={r.id}>
              <b>配</b>
              <div>
                <h3>{r.name}</h3>
                <p>
                  当前版本 v{r.version} · 母液系数 {r.motherLiquorRatio} ·{" "}
                  {r.dyes.map((d) => d.name).join("、")}
                </p>
              </div>
            </article>
          ))}
          {state.finishings.map((f) => (
            <article key={f.id}>
              <b>整</b>
              <div>
                <h3>{f.name}</h3>
                <p>
                  当前版本 v{f.version} · 柔软剂 {f.softener}%
                </p>
              </div>
            </article>
          ))}
          {state.repairReasons.map((r) => (
            <article key={r.id}>
              <b>修</b>
              <div>
                <h3>{r.label}</h3>
                <p>当前版本 v{r.version}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
