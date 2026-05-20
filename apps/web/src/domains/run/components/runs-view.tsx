import { DiffView } from "./diff-view";
import { RunList } from "./run-list";
import { TraceView } from "./trace-view";
import { ScenarioPanel } from "./scenario-panel";
import { HumanScore } from "./human-score";
import { InfoMark } from "../../../lib/ui";

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
        <ScenarioPanel runId={selectedRunId} />
        <HumanScore runId={selectedRunId} />
        <TraceView runId={selectedRunId} />
        {selectedRunId !== null && (
          <section style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 13, color: "#555", display: "flex", alignItems: "center" }}>
              변경 (파일 diff)
              <InfoMark
                label="변경 패널"
                help="실행이 격리 worktree 안에서 돌기 때문에 base 커밋↔실행 후 상태의 git diff = 에이전트가 만진 파일·라인이 정확. fixture 는 가짜 트레이스라 변경 없음."
              />
            </h3>
            <DiffView runId={selectedRunId} />
          </section>
        )}
      </section>
    </div>
  );
}
