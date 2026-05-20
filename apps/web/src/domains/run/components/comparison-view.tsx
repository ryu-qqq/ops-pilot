import { EmptyState, ErrorNotice, InfoMark, InlineError, Loading } from "../../../lib/ui";
import type { JudgeVerdict } from "../api";
import { useJudgeRuns, useRunsCompare } from "../use-run";

// OPSP-10 비교 뷰: N개 run 을 컬럼으로, 행에 핵심 메트릭 매트릭스.
// 실행 중인 run 있으면 폴링으로 실시간 갱신. fixture/local-claude 둘 다.

interface Props {
  runIds: string[];
  onSelectRun: (runId: string) => void;
}

const statusEmoji: Record<string, string> = {
  running: "🟡",
  succeeded: "✅",
  failed: "❌",
  pending: "⏳",
};

// AI judge verdict 배지 색상.
const verdictMeta: Record<JudgeVerdict, { label: string; bg: string; fg: string }> = {
  best: { label: "🏆 BEST", bg: "#1a7f37", fg: "white" },
  fine: { label: "OK", bg: "#9a6700", fg: "white" },
  worse: { label: "WORSE", bg: "#cf222e", fg: "white" },
};

const cellStyle = {
  padding: "6px 8px",
  borderTop: "1px solid #eee",
  fontSize: 12,
  verticalAlign: "top" as const,
};

export function ComparisonView({ runIds, onSelectRun }: Props) {
  const anyRunning = false; // 폴링 트리거: 첫 응답 이후 결정.
  const { data: items, isPending, isError, error } = useRunsCompare(runIds, anyRunning);
  const judge = useJudgeRuns();
  const verdictByRunId = new Map(judge.data?.perRun.map((p) => [p.runId, p]) ?? []);

  if (runIds.length === 0) return null;
  if (isPending)
    return (
      <p style={{ color: "#57606a" }}>
        <Loading label="비교 데이터 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;
  if (items.length === 0)
    return <EmptyState title="비교할 run 이 없어요" hint="버전 비교 모드로 다시 실행해 보세요." />;

  // 응답 받은 뒤 실행 중 run 이 있으면 다음 폴링 의미 — 단순히 위 hook 의 anyRunning 을 동적으로
  // 하면 좋지만, 1차는 컴포넌트 키를 runIds 로 잡아 새로 마운트되게 함. 추후 useRun + interval 로 분리.

  const allDone = items.every((it) => it.run.status === "succeeded" || it.run.status === "failed");

  return (
    <div style={{ overflowX: "auto" }}>
      {/* AI 판정 트리거 + 결과 요약 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <button
          type="button"
          disabled={judge.isPending || !allDone}
          onClick={() => judge.mutate(runIds)}
          title={allDone ? "로컬 Claude 로 N개 run 결과를 비교해 판정" : "모든 run 이 끝난 뒤에 가능"}
        >
          {judge.isPending ? <Loading label="🤖 Claude 판정 중…" /> : "🤖 AI 판정 (어느 게 나았나)"}
        </button>
        <InfoMark
          label="AI 판정"
          help="시나리오 + 자산 본문 + 각 run 요약(마지막 응답·단계·토큰·diff)을 로컬 Claude 에 보내 ‘어느 버전이 더 나았나·왜’ 를 JSON 으로 받습니다. 자동 적용 없음, 사용자 판단의 보조. 실 토큰 ~20-60초."
        />
        {judge.isError && <InlineError error={judge.error} />}
      </div>
      {judge.isSuccess && (
        <div
          style={{
            border: "1px solid #8250df",
            background: "#faf5ff",
            color: "#3b1f70",
            borderRadius: 6,
            padding: "8px 10px",
            marginBottom: 8,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <strong>🏆 판정 결과: </strong>
          {judge.data.winnerRunId !== null ? (
            <code>{judge.data.winnerRunId.slice(0, 8)}</code>
          ) : (
            <span>우열 판단 불가</span>
          )}
          <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{judge.data.summary}</div>
        </div>
      )}

      <table style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...cellStyle, textAlign: "left", color: "#57606a" }}>지표</th>
            {items.map((it) => {
              const verdict = verdictByRunId.get(it.run.id);
              return (
                <th
                  key={it.run.id}
                  style={{ ...cellStyle, textAlign: "left", cursor: "pointer", color: "#0969da" }}
                  onClick={() => onSelectRun(it.run.id)}
                  title="이 run 의 트레이스 보기"
                >
                  <code style={{ fontSize: 11 }}>{it.run.id.slice(0, 8)}</code>
                  {verdict !== undefined && (
                    <span
                      style={{
                        display: "inline-block",
                        marginLeft: 6,
                        padding: "1px 6px",
                        borderRadius: 3,
                        background: verdictMeta[verdict.verdict].bg,
                        color: verdictMeta[verdict.verdict].fg,
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                      title={verdict.note}
                    >
                      {verdictMeta[verdict.verdict].label}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600 }}>상태</td>
            {items.map((it) => (
              <td key={it.run.id} style={cellStyle}>
                {statusEmoji[it.run.status] ?? "?"} {it.run.status}
                {it.run.error !== null && (
                  <div style={{ color: "#cf222e", fontSize: 11 }}>{it.run.error.slice(0, 80)}</div>
                )}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600 }}>실행 소스</td>
            {items.map((it) => (
              <td key={it.run.id} style={cellStyle}>
                {it.run.runner}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600 }}>토큰 (입력/출력)</td>
            {items.map((it) => (
              <td key={it.run.id} style={cellStyle}>
                {it.run.promptTokens === null && it.run.completionTokens === null
                  ? "—"
                  : `${String(it.run.promptTokens ?? "—")} / ${String(it.run.completionTokens ?? "—")}`}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600 }}>비용 (USD)</td>
            {items.map((it) => (
              <td key={it.run.id} style={cellStyle}>
                {it.run.costUsd === null ? "—" : it.run.costUsd.toFixed(4)}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600 }}>변경 파일 수</td>
            {items.map((it) => (
              <td key={it.run.id} style={cellStyle}>
                {it.diffFileCount}
              </td>
            ))}
          </tr>
          {/* OPSP-20: 객관 신호 3행 — assertion 자동 측정 / judge 점수 / 사람 점수 */}
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600 }}>
              성공조건 통과
              <InfoMark
                label="성공조건 자동 측정"
                help="시나리오 expectation.assertions 각 줄을 트레이스 텍스트에 substring 매칭. 약한 규칙(자유 자연어) — 정밀 규칙 엔진은 후속."
              />
            </td>
            {items.map((it) => {
              const s = it.assertionScore;
              if (s === null) return <td key={it.run.id} style={{ ...cellStyle, color: "#888" }}>—</td>;
              const detail = s.detail;
              const expected = detail?.expected;
              const total = Array.isArray(expected) ? expected.length : 0;
              const passCount = Math.round((s.score ?? 0) * total);
              return (
                <td key={it.run.id} style={cellStyle}>
                  <span style={{ color: s.passed ? "#1a7f37" : "#9a6700", fontWeight: 600 }}>
                    {`${String(passCount)}/${String(total)}`}
                  </span>
                </td>
              );
            })}
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600 }}>
              judge 점수
              <InfoMark
                label="LLM judge 점수"
                help="🤖 AI 판정 후 저장된 score(scorer='llm_judge'). best=1.0 / fine=0.5 / worse=0.0."
              />
            </td>
            {items.map((it) => {
              const s = it.judgeScore;
              if (s === null) return <td key={it.run.id} style={{ ...cellStyle, color: "#888" }}>—</td>;
              return (
                <td key={it.run.id} style={cellStyle} title={s.detail?.reason ?? ""}>
                  <span style={{ fontWeight: 600 }}>{(s.score ?? 0).toFixed(2)}</span>
                </td>
              );
            })}
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600 }}>
              사람 점수
              <InfoMark
                label="사람 점수"
                help="트레이스 뷰에서 사용자가 직접 매긴 점수(OPSP-17). 데이터 없으면 — 표시."
              />
            </td>
            {items.map((it) => {
              const s = it.humanScore;
              if (s === null) return <td key={it.run.id} style={{ ...cellStyle, color: "#888" }}>—</td>;
              return (
                <td key={it.run.id} style={cellStyle} title={s.detail?.reason ?? ""}>
                  <span style={{ fontWeight: 600 }}>{(s.score ?? 0).toFixed(2)}</span>
                </td>
              );
            })}
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontWeight: 600, verticalAlign: "top" }}>마지막 응답 미리보기</td>
            {items.map((it) => (
              <td key={it.run.id} style={{ ...cellStyle, maxWidth: 240 }}>
                {it.lastAssistantText === null ? (
                  <span style={{ color: "#888" }}>(없음)</span>
                ) : (
                  <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {it.lastAssistantText}
                  </span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: "#57606a", marginTop: 6 }}>
        컬럼 헤더(run id) 를 클릭하면 그 run 의 트레이스로 이동. 셀에 hover 하면 자세한 이유가 뜹니다.
      </p>
    </div>
  );
}
