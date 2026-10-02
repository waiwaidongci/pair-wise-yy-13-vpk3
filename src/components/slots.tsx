// 染缸槽位：容量/余量、预约占用、先到先得提交、两名技术员并发提交演示
import { useState } from "react";
import { useStore } from "../store";
import { slotBookedVolume, slotRemainingL, requiredLiquorVolumeL } from "../logic";
import { today } from "../logic";

export default function Slots() {
  const { state, dispatch } = useStore();
  const [batchId, setBatchId] = useState(state.batches[0]?.id ?? "");
  const [slotId, setSlotId] = useState(state.slots[0]?.id ?? "");
  const [tech1, setTech1] = useState("陈技术员");
  const [tech2, setTech2] = useState("李技术员");

  const date = today();

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>先到先得</p>
            <h2>提交槽位</h2>
          </div>
        </div>
        <p className="hint">
          两名技术员同时提交同一槽位时，先到者占用，后到者保留冲突草稿（不丢弃）。
        </p>
        <div className="field-grid">
          <label>
            <span>批次</span>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              {state.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.fabric}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>槽位</span>
            <select value={slotId} onChange={(e) => setSlotId(e.target.value)}>
              {state.slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code}（余量 {slotRemainingL(s, date).toFixed(0)}L）
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>技术员 A（先到）</span>
            <input value={tech1} onChange={(e) => setTech1(e.target.value)} />
          </label>
          <label>
            <span>技术员 B（后到）</span>
            <input value={tech2} onChange={(e) => setTech2(e.target.value)} />
          </label>
        </div>
        <div className="btn-row">
          <button
            className="primary"
            onClick={() =>
              dispatch({ type: "CLAIM_SLOT", batchId, slotId, technician: tech1 })
            }
          >
            单人提交（{tech1}）
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "CONCURRENT_CLAIM",
                slotId,
                batchId,
                tech1,
                tech2,
              })
            }
          >
            模拟两名技术员同时提交同一槽位
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>槽位余量</p>
            <h2>染缸槽位（{date}）</h2>
          </div>
        </div>
        <div className="slot-grid">
          {state.slots.map((s) => {
            const booked = slotBookedVolume(s, date);
            const remaining = slotRemainingL(s, date);
            const pct = Math.min(100, (booked / s.capacityL) * 100);
            return (
              <div key={s.id} className="slot-card">
                <div className="slot-head">
                  <h3>{s.code}</h3>
                  <span className={remaining > 0 ? "ok" : "full"}>
                    {remaining > 0 ? `余量 ${remaining.toFixed(0)}L` : "已满"}
                  </span>
                </div>
                <div className="slot-bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <p className="slot-cap">
                  容量 {s.capacityL}L · 已占 {booked.toFixed(0)}L
                </p>
                <div className="slot-bookings">
                  {s.bookings
                    .filter((bk) => bk.date === date)
                    .map((bk) => (
                      <div key={bk.id} className="booking">
                        <span>
                          {bk.batchCode} · {bk.technician}
                        </span>
                        <em>{bk.volumeL.toFixed(1)}L</em>
                      </div>
                    ))}
                  {s.bookings.filter((bk) => bk.date === date).length === 0 && (
                    <p className="empty">今日无预约</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>冲突草稿</p>
            <h2>后到提交（{state.conflictDrafts.filter((d) => !d.merged).length}）</h2>
          </div>
        </div>
        <div className="records">
          {state.conflictDrafts.length === 0 && (
            <p className="empty">暂无冲突草稿</p>
          )}
          {state.conflictDrafts.map((d) => (
            <article key={d.id}>
              <b>{d.merged ? "已合" : "草稿"}</b>
              <div>
                <h3>
                  {d.slotCode} · {d.technician}
                </h3>
                <p>
                  {d.batchCode ? `${d.batchCode} · ` : ""}
                  {d.reason}
                </p>
                {!d.merged && (
                  <div className="btn-row">
                    <button
                      onClick={() =>
                        dispatch({ type: "MERGE_DRAFT", draftId: d.id })
                      }
                    >
                      槽位空出后补占用
                    </button>
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
