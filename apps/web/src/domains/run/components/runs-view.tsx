import { ComparisonView } from "./comparison-view";
import { DiffView } from "./diff-view";
import { RunList } from "./run-list";
import { TraceView } from "./trace-view";
import { ScenarioPanel } from "./scenario-panel";
import { HumanScore } from "./human-score";
import { InfoMark } from "../../../lib/ui";

interface Props {
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  compareRunIds: string[];
  onClearCompare: () => void;
}

export function RunsView({ selectedRunId, onSelectRun, compareRunIds, onClearCompare }: Props) {
  const compareActive = compareRunIds.length >= 2;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24 }}>
      <section>
        <h2 style={{ fontSize: 14, color: "#555" }}>실행 (run)</h2>
        <RunList selectedId={selectedRunId} onSelect={onSelectRun} />
      </section>
      <section>
        {compareActive && (
          <div
            style={{
              border: "1px solid #0969da",
              background: "#ddf4ff",
              borderRadius: 6,
              padding: 10,
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <h2 style={{ fontSize: 14, color: "#0a3069", margin: 0 }}>
                📊 버전 비교 ({compareRunIds.length}개 run)
                <InfoMark
                  label="버전 비교"
                  help="같은 시나리오로 N개 버전을 한 번에 돌린 결과. 컬럼이 버전, 행이 메트릭. 컬럼 헤더 클릭하면 그 run 의 트레이스로 이동."
                />
              </h2>
              <button
                type="button"
                onClick={onClearCompare}
                style={{
                  marginLeft: "auto",
                  background: "transparent",
                  border: "none",
                  color: "#0969da",
                  cursor: "pointer",
                  fontSize: 12,
                }}
                title="비교 패널 닫고 단일 트레이스만 보기"
              >
                닫기
              </button>
            </div>
            <ComparisonView runIds={compareRunIds} onSelectRun={onSelectRun} />
          </div>
        )}
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
