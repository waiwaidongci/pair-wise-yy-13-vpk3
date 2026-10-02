// 客户订单：已签订单保留签订时的色差结论与评审依据（快照），之后批次重算不影响订单
import { useStore } from "../store";

export default function Orders() {
  const { state, dispatch } = useStore();

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>签订留痕</p>
            <h2>客户订单（{state.orders.length}）</h2>
          </div>
        </div>
        <p className="hint">
          订单签订时保留当时的配方/后整理/复修版本与色差、评审依据；
          此后配方一改、批次重算，已签订单仍保留签订时依据。
        </p>
        <div className="records">
          {state.orders.map((o) => {
            const batch = state.batches.find((b) => b.orderId === o.id);
            return (
              <article key={o.id} className="order-row">
                <b>{o.signed ? "已签" : "待签"}</b>
                <div className="order-body">
                  <div className="batch-head">
                    <h3>
                      {o.code} · {o.customer}
                    </h3>
                    <span className={`status ${o.signed ? "已完成" : "待排"}`}>
                      {o.signed ? "已签订" : "待签订"}
                    </span>
                  </div>
                  {batch && (
                    <p>
                      批次 {batch.code} · {batch.fabric}
                    </p>
                  )}
                  {o.signed && o.snapshot ? (
                    <div className="snapshot">
                      <span className="chip retained">签订时依据（保留）</span>
                      <p>
                        版本：配方 v{o.snapshot.recipeVersion} · 后整理 v
                        {o.snapshot.finishingVersion} · 复修 v
                        {o.snapshot.repairVersion ?? 0}
                      </p>
                      <p>
                        色差 ΔE <strong>{o.snapshot.conclusion.deltaE}</strong>（
                        {o.snapshot.conclusion.verdict}） · 评审：
                        {o.snapshot.review.result}
                      </p>
                      <p className="signed-at">
                        签订于 {new Date(o.snapshot.signedAt).toLocaleString("zh-CN")}
                      </p>
                    </div>
                  ) : (
                    <div className="btn-row">
                      <button
                        className="primary"
                        onClick={() =>
                          dispatch({ type: "SIGN_ORDER", orderId: o.id })
                        }
                      >
                        签订订单（保留当前依据）
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
