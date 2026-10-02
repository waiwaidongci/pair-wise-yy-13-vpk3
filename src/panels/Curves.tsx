import { useState } from "react";
import { useStore } from "../store";

export function CurvesPanel() {
  const { state, dispatch } = useStore();
  const [curveId, setCurveId] = useState("CUR-1");
  const [client, setClient] = useState("现场平板");
  const [temp, setTemp] = useState("");
  const [hold, setHold] = useState("");
  const [base, setBase] = useState<Record<string, string>>({});

  const existing = state.curves[curveId];
  const captureBase = () => {
    setBase(existing ? { ...existing.fields } : {});
  };

  const send = () => {
    const fields: Record<string, string> = {};
    if (temp) fields.temp = temp;
    if (hold) fields.hold = hold;
    dispatch({
      type: "CURVE_OP",
      client,
      op: {
        opId: `op-${state.seq + 1}-${Math.random().toString(36).slice(2, 7)}`,
        curveId,
        fields,
        base: Object.keys(base).length ? base : undefined,
      },
    });
    // seq 不会因此动作增加（opId 用随机），简单起见
    setTemp("");
    setHold("");
  };

  const demo = () => {
    // 一键演示：先建基线 temp=130，断网后两侧分别改成 135 / 140，联网合并留双方
    const id = `DEMO-${state.seq + 1}`;
    setCurveId(id);
    const op1 = { opId: `${id}-1`, curveId: id, fields: { temp: "130", hold: "30" }, base: undefined };
    dispatch({ type: "SET_NET", online: true });
    dispatch({ type: "CURVE_OP", client: "基线", op: op1 });
    dispatch({ type: "SET_NET", online: false });
    dispatch({
      type: "CURVE_OP",
      client: "现场平板",
      op: { opId: `${id}-2`, curveId: id, fields: { temp: "140" }, base: { temp: "130", hold: "30" } },
    });
    // 模拟服务器侧（另一台联网终端）
    dispatch({ type: "SET_NET", online: true });
    dispatch({
      type: "CURVE_OP",
      client: "车间A",
      op: { opId: `${id}-3`, curveId: id, fields: { temp: "135" }, base: { temp: "130", hold: "30" } },
    });
    dispatch({ type: "SET_NET", online: false });
  };

  return (
    <div className="curves">
      <div className="card">
        <h3>断网录入工艺曲线</h3>
        <div className="net-bar">
          <span className={`dot ${state.online ? "on" : "off"}`} />
          <b>{state.online ? "联网（写入立即合并）" : "断网（写入本地排队）"}</b>
          <button onClick={() => dispatch({ type: "SET_NET", online: !state.online })}>
            {state.online ? "模拟断网" : "恢复联网"}
          </button>
          <button className="primary" disabled={state.pendingOps.length === 0} onClick={() => dispatch({ type: "FLUSH" })}>
            联网合并排队操作（{state.pendingOps.length}）
          </button>
          <button onClick={demo}>一键演示双改冲突</button>
        </div>

        <div className="form-grid">
          <label>
            <span>曲线号</span>
            <input value={curveId} onChange={(e) => setCurveId(e.target.value)} />
          </label>
          <label>
            <span>录入终端</span>
            <input value={client} onChange={(e) => setClient(e.target.value)} />
          </label>
          <label>
            <span>温度 ℃</span>
            <input value={temp} onChange={(e) => setTemp(e.target.value)} placeholder={existing?.fields.temp ?? "如 130"} />
          </label>
          <label>
            <span>保温 min</span>
            <input value={hold} onChange={(e) => setHold(e.target.value)} placeholder={existing?.fields.hold ?? "如 30"} />
          </label>
        </div>
        <div className="form-foot">
          <span className="hint">
            <button className="link" onClick={captureBase}>记录编辑前基线</button>
            {Object.keys(base).length > 0 && ` 已捕获：${JSON.stringify(base)}`}
            （同号重放只认首次；同字段两边都改则合并时留双方）
          </span>
          <button className="primary" onClick={send}>
            {state.online ? "写入并合并" : "断网暂存"}
          </button>
        </div>
      </div>

      {state.pendingOps.length > 0 && (
        <div className="card pending">
          <h3>待合并队列（{state.pendingOps.length}）</h3>
          {state.pendingOps.map((op) => (
            <div key={op.opId} className="pending-op">
              {op.opId} · {op.client} · {op.curveId} · {JSON.stringify(op.fields)}
            </div>
          ))}
        </div>
      )}

      <h2 className="col-title">已合并工艺曲线（{Object.keys(state.curves).length}）</h2>
      {Object.values(state.curves).map((c) => (
        <article key={c.id} className="card">
          <header>
            <h3>{c.id}</h3>
            <small>操作 {c.appliedOps.length} 笔（同号去重后）</small>
          </header>
          <table className="curve-table">
            <thead>
              <tr><th>字段</th><th>采用值</th><th>最后来源</th><th>双改留存</th></tr>
            </thead>
            <tbody>
              {Object.entries(c.fields).map(([f, v]) => (
                <tr key={f}>
                  <td>{f}</td>
                  <td>{v}</td>
                  <td>{c.fieldRev[f]?.client ?? "—"}</td>
                  <td>
                    {c.conflicts[f] ? (
                      <span className="badge badge-red">
                        双方不同：A={c.conflicts[f].a} / B={c.conflicts[f].b}（待人工裁决）
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </div>
  );
}
