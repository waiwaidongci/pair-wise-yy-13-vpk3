import { useState } from "react";
import { StoreProvider } from "./store";
import Overview from "./components/overview";
import Batches from "./components/batches";
import Slots from "./components/slots";
import Orders from "./components/orders";
import Curves from "./components/curves";
import Conflicts from "./components/conflicts";
import Versions from "./components/versions";

const tabs = [
  { key: "overview", label: "总览" },
  { key: "batches", label: "批次" },
  { key: "slots", label: "染缸槽位" },
  { key: "orders", label: "客户订单" },
  { key: "curves", label: "工艺曲线" },
  { key: "versions", label: "版本变更" },
  { key: "conflicts", label: "母液/冲突" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

function Shell() {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62012 · 离线作业台</p>
        <h1>染整离线作业台</h1>
        <span>
          开工前按坯布重量、浴比与槽位余量分配母液，不足或重叠留待排并写明冲突；
          两名技术员同时提交同一槽位先到者占用、后到留冲突草稿；配方/后整理/复修原因一变，
          依附旧版的色差结论与评审立即失效重算，已签订单保留当时依据；断网录入工艺曲线、
          联网合并，同号重放只认首次，字段两边都改过保留双方；旧批次缺母液编号升级，
          迁移失败恢复最近草稿。
        </span>
      </section>

      <nav className="tabbar">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview />}
      {tab === "batches" && <Batches />}
      {tab === "slots" && <Slots />}
      {tab === "orders" && <Orders />}
      {tab === "curves" && <Curves />}
      {tab === "versions" && <Versions />}
      {tab === "conflicts" && <Conflicts />}
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
