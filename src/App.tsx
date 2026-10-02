import { useState } from "react";
import "./styles.css";
import { StoreProvider, useStore } from "./store";
import { BatchesPanel, SubmitForm } from "./panels/Batches";
import { LiquorPanel, SlotsPanel } from "./panels/Inventory";
import { OrdersPanel } from "./panels/Orders";
import { CurvesPanel } from "./panels/Curves";
import { MigrationPanel } from "./panels/Migration";

const TABS = [
  { id: "batches", label: "批次开工" },
  { id: "liquor", label: "母液台账" },
  { id: "slots", label: "染缸槽位" },
  { id: "orders", label: "客户订单" },
  { id: "curves", label: "离线曲线" },
  { id: "migration", label: "旧批升级" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Shell() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<TabId>("batches");
  const draftCount = state.batches.filter((b) => b.status === "draft").length;
  const conflictCount = state.batches.reduce((n, b) => n + b.conflicts.length, 0);

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <h1>染整离线作业台</h1>
          <p>复染批次 · 染缸槽位 · 客户订单 三本账 ｜ 先排产后开工 ｜ 依据改版结论即失效 ｜ 断网可录联网合并</p>
        </div>
        <div className="net">
          <span className={`dot ${state.online ? "on" : "off"}`} />
          {state.online ? "联网" : `断网 · 待并 ${state.pendingOps.length}`}
          <button
            onClick={() => {
              dispatch({ type: "SET_NET", online: !state.online });
              if (!state.online) dispatch({ type: "FLUSH" });
            }}
          >
            {state.online ? "断网" : "联网并合并"}
          </button>
          <button
            className="reset"
            onClick={() => {
              if (confirm("恢复到演示初始数据？")) {
                localStorage.removeItem("dye-bench-state-v1");
                dispatch({ type: "RESET" });
              }
            }}
          >
            重置
          </button>
        </div>
      </header>

      <section className="metrics">
        <div className="metric"><small>在缸批次</small><strong>{state.batches.filter((b) => b.status !== "draft").length}</strong></div>
        <div className="metric"><small>待排草稿</small><strong className={draftCount ? "warn" : ""}>{draftCount}</strong></div>
        <div className="metric"><small>未决冲突</small><strong className={conflictCount ? "warn" : ""}>{conflictCount}</strong></div>
        <div className="metric"><small>客户订单</small><strong>{state.orders.length}</strong></div>
        <div className="metric"><small>已签订单</small><strong>{state.orders.filter((o) => o.signedAt).length}</strong></div>
      </section>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "batches" && draftCount > 0 && <span className="tab-dot">{draftCount}</span>}
          </button>
        ))}
      </nav>

      <section className="content">
        {tab === "batches" && (
          <>
            <SubmitForm />
            <BatchesPanel />
          </>
        )}
        {tab === "liquor" && <LiquorPanel />}
        {tab === "slots" && <SlotsPanel />}
        {tab === "orders" && <OrdersPanel />}
        {tab === "curves" && <CurvesPanel />}
        {tab === "migration" && <MigrationPanel />}
      </section>

      <footer className="foot">
        规则引擎为纯函数（src/engine.ts），36 项断言覆盖：母液分配/不足留冲突、槽位先到先占、
        依据改版结论失效与订单冻结、同号重放去重/双改留双方、母液编号升级失败回滚。
      </footer>
    </main>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
