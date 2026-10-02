// 母液余量 + 冲突中心（未解决冲突、冲突草稿、草稿快照恢复）
import { useStore } from "../store";

export default function Conflicts() {
  const { state, dispatch } = useStore();

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>母液余量</p>
            <h2>母液库存</h2>
          </div>
        </div>
        <div className="records">
          {state.motherLiquors.map((m) => (
            <article key={m.id}>
              <b>{m.stockL > 10 ? "足" : "紧"}</b>
              <div>
                <h3>
                  {m.code} · {m.name}
                </h3>
                <p>
                  母液批次 {m.batchNo} · 余量{" "}
                  <strong className={m.stockL > 10 ? "ok" : "low"}>
                    {m.stockL}L
                  </strong>
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>冲突中心</p>
            <h2>全部冲突（{state.conflicts.filter((c) => !c.resolved).length} 未解决）</h2>
          </div>
        </div>
        <div className="records">
          {state.conflicts.length === 0 && <p className="empty">暂无冲突</p>}
          {state.conflicts.map((c) => (
            <article key={c.id}>
              <b>{c.resolved ? "已决" : "未决"}</b>
              <div>
                <h3>
                  <span className={`chip conflict`}>{c.type}</span>
                </h3>
                <p>{c.message}</p>
                {!c.resolved && (
                  <div className="btn-row">
                    <button
                      onClick={() =>
                        dispatch({ type: "RESOLVE_CONFLICT", conflictId: c.id })
                      }
                    >
                      标记已处理
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>草稿恢复</p>
            <h2>草稿快照（{state.drafts.length}）</h2>
          </div>
        </div>
        <p className="hint">
          迁移前自动保存最近草稿；迁移失败时自动回滚到最近草稿，也可在此手动恢复。
        </p>
        <div className="records">
          {state.drafts.length === 0 && <p className="empty">暂无草稿快照</p>}
          {state.drafts.map((d) => (
            <article key={d.id}>
              <b>草稿</b>
              <div>
                <h3>{d.reason}</h3>
                <p>{new Date(d.savedAt).toLocaleString("zh-CN")}</p>
                <div className="btn-row">
                  <button
                    className="primary"
                    onClick={() =>
                      dispatch({ type: "RESTORE_DRAFT", snapshotId: d.id })
                    }
                  >
                    恢复此草稿
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
