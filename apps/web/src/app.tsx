import { useState } from "react";
import { RegistryView } from "./domains/registry/components/registry-view";
import { RunsView } from "./domains/run/components/runs-view";

type Tab = "registry" | "runs";

export function App() {
  // 탭·선택 run 은 UI 로컬 상태 (CONVENTIONS.md 2). 서버데이터는 Query.
  const [tab, setTab] = useState<Tab>("registry");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // E2E 흐름: 레지스트리에서 실행 → run 생성되면 트레이스 탭으로 자동 이동.
  const handleRunCreated = (runId: string) => {
    setSelectedRunId(runId);
    setTab("runs");
  };

  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      style={{
        padding: "6px 14px",
        border: "none",
        borderBottom: tab === id ? "2px solid #0969da" : "2px solid transparent",
        background: "transparent",
        fontWeight: tab === id ? 700 : 400,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <main style={{ fontFamily: "system-ui", padding: "1.5rem", maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>OpsPilot — Harness Control Plane</h1>
      <nav style={{ display: "flex", gap: 4, borderBottom: "1px solid #eee", marginBottom: 16 }}>
        {tabBtn("registry", "레지스트리")}
        {tabBtn("runs", "실행 / 트레이스")}
      </nav>
      {tab === "registry" ? (
        <RegistryView onRunCreated={handleRunCreated} />
      ) : (
        <RunsView selectedRunId={selectedRunId} onSelectRun={setSelectedRunId} />
      )}
    </main>
  );
}
