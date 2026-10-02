// 总览：网络状态、关键指标、待办（冲突/离线队列/冲突草稿）、迁移与草稿恢复
import { useStore } from "../store";
import { requiredLiquorVolumeL, requiredMotherLiquorL } from "../logic";

export default function Overview() {
  const { state, dispatch } = useStore();

  const total = state.batches.length;
  const pending = state.batches.filter((b) => b.status === "待排").length;
  const deltaOver = state.batches.filter(
    (b) => b.conclusion && b.conclusion.deltaE > 1.2
  ).length;
  const orders = state.orders.length;
  const pass = state.batches.filter(
    (b) => b.review?.result === "评审通过"
  ).length;
  const passRate = total ? Math.round((pass / total) * 100) : 0;

  const unresolvedConflicts = state.conflicts.filter((c) => !c.resolved).length;
  const pendingDrafts = state.conflictDrafts.filter((d) => !d.merged).length;
  const pendingOffline = state.pendingCurves.length;
  const invalidCount = state.batches.filter(
    (b) => b.conclusion?.invalid || b.review?.invalid
  ).length;

  return (
    <div className="stack">
      <div className={`network-banner ${state.network}`}>
        <span className="dot" />
        <div>
          <strong>
            {state.network === "online" ? "已联网" : "已断网（离线作业中）"}
          </strong>
          <p>
            {state.network === "online"
              ? "工艺曲线将实时同步；断网时录入的曲线会在联网后合并。"
              : "断网期间仍可录入工艺曲线、开工与保存草稿；联网后自动合并。"}
          </p>
        </div>
        <button
          className="primary"
          onClick={() =>
            dispatch({
              type: "SET_NETWORK",
              network: state.network === "online" ? "offline" : "online",
            })
          }
        >
          {state.network === "online" ? "模拟断网" : "模拟联网"}
        </button>
      </div>

      <section className="metrics">
        <article>
          <small>小样批次</small>
          <strong>{total}</strong>
        </article>
        <article>
          <small>待排</small>
          <strong>{pending}</strong>
        </article>
        <article>
          <small>色差超限</small>
          <strong>{deltaOver}</strong>
        </article>
        <article>
          <small>客户订单</small>
          <strong>{orders}</strong>
        </article>
        <article>
          <small>通过率</small>
          <strong>{passRate}%</strong>
        </article>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>待办</p>
            <h2>冲突 · 离线队列 · 草稿</h2>
          </div>
        </div>
        <div className="todo-grid">
          <div className="todo-card">
            <b>{unresolvedConflicts}</b>
            <span>未解决冲突</span>
          </div>
          <div className="todo-card">
            <b>{pendingDrafts}</b>
            <span>冲突草稿（后到提交）</span>
          </div>
          <div className="todo-card">
            <b>{pendingOffline}</b>
            <span>待合并离线曲线</span>
          </div>
          <div className="todo-card">
            <b>{invalidCount}</b>
            <span>失效待重算结论</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>迁移与恢复</p>
            <h2>旧批次升级 / 草稿恢复</h2>
          </div>
        </div>
        <p className="hint">
          旧批次缺母液编号时自动升级补号；迁移前保存最近草稿，迁移失败则恢复最近草稿。
        </p>
        <div className="btn-row">
          <button
            className="primary"
            onClick={() => dispatch({ type: "MIGRATE" })}
          >
            迁移升级旧批次
          </button>
          <button onClick={() => dispatch({ type: "RESET" })}>重置演示数据</button>
        </div>
        {state.batches.some((b) => !b.motherLiquorId && b.weightKg <= 0) && (
          <div className="conflict-list" style={{ marginTop: 12 }}>
            {state.batches
              .filter((b) => !b.motherLiquorId && b.weightKg <= 0)
              .map((b) => (
                <span key={b.id} className="chip conflict">
                  损坏批次 {b.code}：缺母液编号且坯布重量缺失，迁移会失败
                  <button
                    className="ghost"
                    style={{ minHeight: 28, marginLeft: 8 }}
                    onClick={() =>
                      dispatch({
                        type: "REPAIR_BATCH_WEIGHT",
                        batchId: b.id,
                        weightKg: 12,
                      })
                    }
                  >
                    修复重量后重试
                  </button>
                </span>
              ))}
          </div>
        )}
        {state.drafts.length > 0 && (
          <div className="draft-list">
            {state.drafts.slice(0, 3).map((d) => (
              <div key={d.id} className="draft-row">
                <span>
                  {d.reason} · {new Date(d.savedAt).toLocaleString("zh-CN")}
                </span>
                <button
                  onClick={() =>
                    dispatch({ type: "RESTORE_DRAFT", snapshotId: d.id })
                  }
                >
                  恢复此草稿
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>分配速览</p>
            <h2>开工前母液/槽位测算</h2>
          </div>
        </div>
        <div className="records">
          {state.batches.slice(0, 5).map((b) => {
            const recipe = state.recipes.find((r) => r.id === b.recipeId);
            const vol = requiredLiquorVolumeL(b);
            const ml = requiredMotherLiquorL(b, recipe);
            return (
              <article key={b.id}>
                <b>{b.code.slice(-3)}</b>
                <div>
                  <h3>
                    {b.code} · {b.fabric}
                  </h3>
                  <p>
                    坯布 {b.weightKg}kg · 浴比 1:{b.bathRatio} → 染液 {vol.toFixed(1)}L
                    {recipe ? ` · 母液 ${ml.toFixed(2)}L` : ""}
                    {b.motherLiquorId ? "" : " · 缺母液编号"}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
