// 工艺曲线：断网录入、联网合并；同号重放只认首次；字段两边都改过保留双方
import { useState } from "react";
import { useStore } from "../store";
import type { CurvePoint } from "../types";

const emptyPoints: CurvePoint[] = [
  { t: 0, temp: 25 },
  { t: 10, temp: 60 },
  { t: 25, temp: 95 },
  { t: 55, temp: 95 },
];

export default function Curves() {
  const { state, dispatch } = useStore();
  const [number, setNumber] = useState("TC-002");
  const [name, setName] = useState("涤纶升温曲线");
  const [points, setPoints] = useState<CurvePoint[]>(emptyPoints);
  const [changedFields, setChangedFields] = useState<string[]>(["name", "points"]);
  const [remoteAlso, setRemoteAlso] = useState<string[]>([]);

  const offline = state.network === "offline";

  const toggle = (list: string[], set: (v: string[]) => void, field: string) => {
    set(list.includes(field) ? list.filter((f) => f !== field) : [...list, field]);
  };

  const submit = () => {
    if (!number.trim()) return;
    dispatch({
      type: "ADD_PENDING_CURVE",
      entry: {
        number: number.trim(),
        name: name.trim() || number.trim(),
        points,
        updatedBy: state.technician,
        changedFields,
        remoteAlsoChanged: remoteAlso,
      },
    });
    setNumber(`TC-${Math.floor(100 + Math.random() * 900)}`);
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>{offline ? "断网录入" : "联网合并"}</p>
            <h2>工艺曲线</h2>
          </div>
          {offline ? (
            <span className="chip offline-badge">断网中 · 录入进入待合并队列</span>
          ) : (
            <button
              className="primary"
              onClick={() => dispatch({ type: "MERGE_PENDING_CURVES" })}
              disabled={state.pendingCurves.length === 0}
            >
              联网合并（{state.pendingCurves.length}）
            </button>
          )}
        </div>
        <p className="hint">
          断网时录入工艺曲线进入待合并队列；联网后合并，同号重放只认首次（跳过重复），
          字段两边都改过则保留双方值。
        </p>

        <div className="field-grid">
          <label>
            <span>曲线编号（幂等键，同号重放只认首次）</span>
            <input value={number} onChange={(e) => setNumber(e.target.value)} />
          </label>
          <label>
            <span>曲线名称</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>

        <div className="points-editor">
          <span className="field-label">温度曲线（时间 min / 温度 ℃）</span>
          <div className="points-grid">
            {points.map((p, i) => (
              <div key={i} className="point-row">
                <input
                  type="number"
                  value={p.t}
                  onChange={(e) =>
                    setPoints((pts) =>
                      pts.map((x, xi) =>
                        xi === i ? { ...x, t: Number(e.target.value) } : x
                      )
                    )
                  }
                />
                <input
                  type="number"
                  value={p.temp}
                  onChange={(e) =>
                    setPoints((pts) =>
                      pts.map((x, xi) =>
                        xi === i ? { ...x, temp: Number(e.target.value) } : x
                      )
                    )
                  }
                />
                {points.length > 1 && (
                  <button
                    className="ghost"
                    onClick={() =>
                      setPoints((pts) => pts.filter((_, xi) => xi !== i))
                    }
                  >
                    删
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            className="ghost"
            onClick={() =>
              setPoints((pts) => [
                ...pts,
                { t: pts[pts.length - 1].t + 10, temp: 80 },
              ])
            }
          >
            + 增加点位
          </button>
        </div>

        <div className="field-toggles">
          <span className="field-label">本地改动字段：</span>
          {["name", "points"].map((f) => (
            <label key={f} className="check">
              <input
                type="checkbox"
                checked={changedFields.includes(f)}
                onChange={() => toggle(changedFields, setChangedFields, f)}
              />
              {f}
            </label>
          ))}
          <span className="field-label">远端也改过（演示字段级分歧）：</span>
          {["name", "points"].map((f) => (
            <label key={f} className="check">
              <input
                type="checkbox"
                checked={remoteAlso.includes(f)}
                onChange={() => toggle(remoteAlso, setRemoteAlso, f)}
              />
              {f}
            </label>
          ))}
        </div>

        <div className="btn-row">
          <button className="primary" onClick={submit} disabled={!offline}>
            {offline ? "断网录入（入待合并队列）" : "联网状态下请先模拟断网"}
          </button>
        </div>
      </section>

      {offline && (
        <section className="panel">
          <div className="heading">
            <div>
              <p>待合并</p>
              <h2>离线队列（{state.pendingCurves.length}）</h2>
            </div>
          </div>
          <div className="records">
            {state.pendingCurves.length === 0 && <p className="empty">暂无离线录入</p>}
            {state.pendingCurves.map((p) => (
              <article key={p.id}>
                <b>待</b>
                <div>
                  <h3>
                    {p.number} · {p.name}
                  </h3>
                  <p>
                    {p.points.length} 个点位 · 改动字段 [{p.changedFields.join(", ")}]
                    {p.remoteAlsoChanged && p.remoteAlsoChanged.length > 0
                      ? ` · 远端也改了 [${p.remoteAlsoChanged.join(", ")}]`
                      : ""}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="heading">
          <div>
            <p>已同步</p>
            <h2>工艺曲线库（{state.curves.length}）</h2>
          </div>
        </div>
        <div className="records">
          {state.curves.map((c) => (
            <article key={c.id}>
              <b>{c.synced ? "已同" : "未同"}</b>
              <div>
                <h3>
                  {c.number} · {c.name}
                </h3>
                <p>
                  {c.points.length} 个点位 · 录入 {c.updatedBy} ·{" "}
                  {new Date(c.updatedAt).toLocaleString("zh-CN")}
                </p>
                <div className="curve-mini">
                  {c.points.map((p, i) => (
                    <span key={i}>
                      {p.t}′/{p.temp}℃
                    </span>
                  ))}
                </div>
                {c.fieldDivergence && c.fieldDivergence.length > 0 && (
                  <div className="divergence">
                    <span className="chip conflict">字段两边都改过，保留双方</span>
                    {c.fieldDivergence.map((d) => (
                      <p key={d.field}>
                        字段 {d.field}：本地 {JSON.stringify(d.local)} ／ 远端{" "}
                        {JSON.stringify(d.remote)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
