import { useState } from "react";
import { RunList } from "./run-list";
import { TraceView } from "./trace-view";

export function RunsView() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24 }}>
      <section>
        <h2 style={{ fontSize: 14, color: "#555" }}>실행 (run)</h2>
        <RunList selectedId={selectedRunId} onSelect={setSelectedRunId} />
      </section>
      <section>
        <h2 style={{ fontSize: 14, color: "#555" }}>트레이스 — 왜 그렇게 행동했나</h2>
        <TraceView runId={selectedRunId} />
      </section>
    </div>
  );
}
