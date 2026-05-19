import { RunList } from "./run-list";
import { TraceView } from "./trace-view";

interface Props {
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
}

export function RunsView({ selectedRunId, onSelectRun }: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24 }}>
      <section>
        <h2 style={{ fontSize: 14, color: "#555" }}>실행 (run)</h2>
        <RunList selectedId={selectedRunId} onSelect={onSelectRun} />
      </section>
      <section>
        <h2 style={{ fontSize: 14, color: "#555" }}>트레이스 — 왜 그렇게 행동했나</h2>
        <TraceView runId={selectedRunId} />
      </section>
    </div>
  );
}
