import { useRun, useScenario } from "../use-run";

// 선택한 run 의 시나리오(목적/입력/기대/성공조건)를 트레이스 옆에 띄워
// "트레이스가 이 성공조건을 만족하나"를 사람이 바로 대조하게 한다 (OPSP-16 → 17 연결).
export function ScenarioPanel({ runId }: { runId: string | null }) {
  const { data: run } = useRun(runId);
  const { data: scenario, isPending } = useScenario(run?.scenarioId);

  if (runId === null) return null;
  if (isPending || !scenario) return null;

  const assertions = scenario.expectation.assertions ?? [];

  return (
    <div
      style={{
        border: "1px solid #d0d7de",
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
        background: "#f6f8fa",
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>시나리오: {scenario.name}</div>
      {scenario.description && (
        <div style={{ marginBottom: 4 }}>
          <b>목적</b> — {scenario.description}
        </div>
      )}
      <div style={{ marginBottom: 4 }}>
        <b>입력</b> — <code>{scenario.input}</code>
      </div>
      {scenario.expectation.judge && (
        <div style={{ marginBottom: 4 }}>
          <b>기대 동작</b> — {scenario.expectation.judge}
        </div>
      )}
      {assertions.length > 0 && (
        <div>
          <b>성공조건</b>
          <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>
            {assertions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
