import { useState } from "react";
import { useStore } from "../store";
import { needLiquorL, needsUpgrade } from "../engine";

export function MigrationPanel() {
  const { state, dispatch } = useStore();
  const legacy = state.batches.filter(needsUpgrade);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [fakeNo, setFakeNo] = useState("");

  const lotFor = (bId: string) => pick[bId] ?? state.liquors[0]?.lotNo ?? "";

  return (
    <div>
      <h2 className="col-title">旧批次母液编号升级</h2>
      <p className="muted">
        旧批次缺母液编号则升级：迁移前自动保存最近草稿快照；若指定编号不存在导致迁移失败，整批恢复到草稿。
      </p>

      {state.lastUpgrade && (
        <div className={`card upgrade-result ${state.lastUpgrade.ok ? "ok" : "fail"}`}>
          {state.lastUpgrade.ok ? "✅" : "⛔"} {state.lastUpgrade.message}
          {!state.lastUpgrade.ok && <span> —— 已恢复最近草稿，数据回滚</span>}
        </div>
      )}

      {legacy.length === 0 && <p className="empty">所有旧批次均已有母液编号，无需升级。</p>}
      {legacy.map((b) => (
        <article key={b.id} className="card legacy-card">
          <header>
            <div>
              <h3>{b.id} <span className="badge badge-amber">缺母液编号</span></h3>
              <small>
                {b.fabricWeightKg}kg × 浴比 1:{b.bathRatio} = 需补登 {needLiquorL(b)}L
              </small>
            </div>
          </header>
          <div className="upgrade-row">
            <select value={lotFor(b.id)} onChange={(e) => setPick((p) => ({ ...p, [b.id]: e.target.value }))}>
              {state.liquors.map((l) => (
                <option key={l.lotNo} value={l.lotNo}>
                  {l.lotNo} · {l.dyeName}（余 {l.availableL}L）
                </option>
              ))}
            </select>
            <button
              className="primary"
              onClick={() => dispatch({ type: "UPGRADE", assignments: [{ batchId: b.id, lotNo: lotFor(b.id) }] })}
            >
              升级该批次
            </button>
          </div>
        </article>
      ))}

      <div className="card fail-demo">
        <h3>迁移失败回滚演练</h3>
        <p className="muted">输入一个不存在的母液编号对首个待升级批次执行迁移，观察失败后数据恢复最近草稿。</p>
        <div className="upgrade-row">
          <input placeholder="不存在的编号，如 ML-404" value={fakeNo} onChange={(e) => setFakeNo(e.target.value)} />
          <button
            disabled={!fakeNo || legacy.length === 0}
            onClick={() =>
              dispatch({ type: "UPGRADE", assignments: [{ batchId: legacy[0].id, lotNo: fakeNo }] })
            }
          >
            执行失败演练
          </button>
        </div>
      </div>

      {state.migrations.length > 0 && (
        <div className="card">
          <h3>升级历史</h3>
          <ul className="migration-list">
            {state.migrations.map((m) => (
              <li key={m.batchId}>
                {m.batchId} → {m.assignedLotNo} · {new Date(m.migratedAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
