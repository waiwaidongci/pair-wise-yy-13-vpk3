import { useStore } from "../store";

export function LiquorPanel() {
  const { state } = useStore();
  return (
    <div>
      <h2 className="col-title">母液台账（FIFO 扣减，开工时按重量×浴比分配）</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>母液编号</th>
              <th>染料</th>
              <th>可用余量 (L)</th>
              <th>占用明细（在缸批次）</th>
            </tr>
          </thead>
          <tbody>
            {state.liquors.map((l) => {
              const used = state.batches
                .filter((b) => b.status !== "draft")
                .flatMap((b) => b.allocations.filter((a) => a.lotNo === l.lotNo).map((a) => ({ b, a })));
              return (
                <tr key={l.lotNo}>
                  <td><b>{l.lotNo}</b></td>
                  <td>{l.dyeName}</td>
                  <td className={l.availableL < 80 ? "low-stock" : ""}>{l.availableL}</td>
                  <td>
                    {used.length === 0
                      ? "—"
                      : used.map(({ b, a }) => (
                          <span key={b.id} className="chip-use">
                            {b.id}: {a.amountL}L
                          </span>
                        ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SlotsPanel() {
  const { state } = useStore();
  return (
    <div>
      <h2 className="col-title">染缸槽位（同一槽位时段重叠即撞单，先到先占）</h2>
      <div className="slots-grid">
        {state.slots.map((s) => {
          const occ = state.batches
            .filter((b) => b.slotId === s.id && b.status !== "draft")
            .sort((a, b) => (a.startAt! < b.startAt! ? -1 : 1));
          const waiting = state.batches.filter(
            (b) => b.slotId === s.id && b.status === "draft"
          );
          return (
            <div key={s.id} className="card slot-card">
              <h3>{s.machineNo} · {s.name}</h3>
              <p className="muted">{s.id}</p>
              <div className="timeline">
                {occ.length === 0 && <span className="muted">空闲</span>}
                {occ.map((b) => (
                  <div key={b.id} className="occ">
                    <b>{b.startAt}–{b.endAt}</b> {b.id}（{b.technician}）
                  </div>
                ))}
              </div>
              {waiting.length > 0 && (
                <div className="waiting">
                  等待中：
                  {waiting.map((b) => (
                    <span key={b.id} className="chip-wait">
                      {b.id} {b.startAt}–{b.endAt}（被{b.conflicts.find((c) => c.type === "slot_overlap")?.blockedBy ?? "?"}占用）
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
