import { useStore } from "../store";

export function OrdersPanel() {
  const { state, dispatch } = useStore();
  return (
    <div>
      <h2 className="col-title">客户订单（签订后冻结当时依据，后续改版不影响）</h2>
      <div className="orders">
        {state.orders.map((o) => {
          const b = state.batches.find((x) => x.id === o.batchId);
          const frozen = !!o.signedAt;
          const revNow = b?.basis.revision;
          const revSigned = o.basisSnapshot?.revision;
          const drifted = frozen && revNow !== undefined && revSigned !== undefined && revNow > revSigned;
          return (
            <article key={o.id} className="card order-card">
              <header>
                <div>
                  <h3>{o.id} · {o.customer}</h3>
                  <small>对应批次 {o.batchId}</small>
                </div>
                {frozen ? (
                  <span className="badge badge-green">已签订</span>
                ) : (
                  <span className="badge badge-amber">未签</span>
                )}
              </header>

              {frozen ? (
                <div className="frozen">
                  <p className="muted">签订时间 {new Date(o.signedAt!).toLocaleString()} —— 保留当时依据</p>
                  <p>依据 rev.{revSigned}：{o.basisSnapshot?.recipe} / {o.basisSnapshot?.finishing}</p>
                  {o.repairReasonAtSign && <p>复修原因：{o.repairReasonAtSign}</p>}
                  {o.colorSnapshot && (
                    <p>
                      色差 ΔE {o.colorSnapshot.deltaE}（{o.colorSnapshot.pass ? "合格" : "超限"}）
                    </p>
                  )}
                  {o.reviewSnapshot && <p>评审：{o.reviewSnapshot.verdict === "pass" ? "通过" : "驳回"}</p>}
                  {drifted && <div className="drift">ℹ️ 批次配方现已升至 rev.{revNow}，本订单仍按 rev.{revSigned} 放行，不受影响</div>}
                </div>
              ) : (
                <div className="unsigned">
                  <p className="muted">
                    当前批次 rev.{revNow}
                    {b?.colorResult
                      ? ` · ΔE ${b.colorResult.deltaE}（${b.colorResult.pass ? "合格" : "超限"}）`
                      : " · 无色差结论"}
                    {b?.review ? ` · 评审${b.review.verdict === "pass" ? "通过" : "驳回"}` : " · 无评审"}
                  </p>
                  <button
                    className="primary"
                    disabled={!b?.colorResult?.pass || b?.review?.verdict !== "pass"}
                    title={!b?.colorResult?.pass || b?.review?.verdict !== "pass" ? "色差合格且评审通过后方可签订" : ""}
                    onClick={() => dispatch({ type: "SIGN_ORDER", orderId: o.id })}
                  >
                    签订并冻结依据
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
