import { EmptyState, ErrorNotice, InfoMark, InlineError, Loading } from "../../../lib/ui";
import type { JudgeVerdict } from "../api";
import { useJudgeRuns, useRunsCompare } from "../use-run";
import s from "./comparison-view.module.css";

// OPSP-10 비교 뷰 / OPSP-9 회귀 점수판: N개 run 을 컬럼으로, 행에 핵심 메트릭 매트릭스.

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

const ss = s as Record<string, string | undefined>;
const verdictMeta: Record<JudgeVerdict, { label: string; cls: string }> = {
  best: { label: "🏆 BEST", cls: ss.verdictBest ?? "" },
  fine: { label: "OK", cls: ss.verdictFine ?? "" },
  worse: { label: "WORSE", cls: ss.verdictWorse ?? "" },
};

export function ComparisonView({ runIds, onSelectRun }: Props) {
  const anyRunning = false;
  const { data: items, isPending, isError, error } = useRunsCompare(runIds, anyRunning);
  const judge = useJudgeRuns();
  const verdictByRunId = new Map(judge.data?.perRun.map((p) => [p.runId, p]) ?? []);

  if (runIds.length === 0) return null;
  if (isPending)
    return (
      <p className={s.loading}>
        <Loading label="비교 데이터 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;
  if (items.length === 0)
    return <EmptyState title="비교할 run 이 없어요" hint="버전 비교 모드로 다시 실행해 보세요." />;

  const allDone = items.every((it) => it.run.status === "succeeded" || it.run.status === "failed");

  // OPSP-9: 서로 다른 시나리오면 회귀 모드.
  const scenarioNames = [...new Set(items.map((it) => it.scenarioName))];
  const isRegression = scenarioNames.length > 1;
  const passedFull = items.filter((it) => it.assertionScore?.passed === true).length;

  return (
    <div className={s.wrapper}>
      {isRegression && (
        <div className={s.regressionSummary}>
          🎯 회귀 — {items.length}개 시나리오 중 <strong>{passedFull}</strong>개 assertion 전원 통과
        </div>
      )}

      <div className={s.judgeRow}>
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
        <div className={s.judgePanel}>
          <strong>🏆 판정 결과: </strong>
          {judge.data.winnerRunId !== null ? (
            <code>{judge.data.winnerRunId.slice(0, 8)}</code>
          ) : (
            <span>우열 판단 불가</span>
          )}
          <div className={s.judgeSummary}>{judge.data.summary}</div>
        </div>
      )}

      <table className={s.table}>
        <thead>
          <tr>
            <th className={`${s.cell} ${s.headerCell}`}>지표</th>
            {items.map((it) => {
              const verdict = verdictByRunId.get(it.run.id);
              return (
                <th
                  key={it.run.id}
                  className={`${s.cell} ${s.runHeader}`}
                  onClick={() => onSelectRun(it.run.id)}
                  title="이 run 의 트레이스 보기"
                >
                  <code>{it.run.id.slice(0, 8)}</code>
                  {isRegression && (
                    <div className={s.scenarioName} title={it.scenarioName}>
                      🎯 {it.scenarioName}
                    </div>
                  )}
                  {verdict !== undefined && (
                    <span
                      className={`${s.verdictBadge} ${verdictMeta[verdict.verdict].cls}`}
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
            <td className={`${s.cell} ${s.rowLabel}`}>상태</td>
            {items.map((it) => (
              <td key={it.run.id} className={s.cell}>
                {statusEmoji[it.run.status] ?? "?"} {it.run.status}
                {it.run.error !== null && <div className={s.errorText}>{it.run.error.slice(0, 80)}</div>}
              </td>
            ))}
          </tr>
          <tr>
            <td className={`${s.cell} ${s.rowLabel}`}>실행 소스</td>
            {items.map((it) => (
              <td key={it.run.id} className={s.cell}>
                {it.run.runner}
              </td>
            ))}
          </tr>
          <tr>
            <td className={`${s.cell} ${s.rowLabel}`}>토큰 (입력/출력)</td>
            {items.map((it) => (
              <td key={it.run.id} className={s.cell}>
                {it.run.promptTokens === null && it.run.completionTokens === null
                  ? "—"
                  : `${String(it.run.promptTokens ?? "—")} / ${String(it.run.completionTokens ?? "—")}`}
              </td>
            ))}
          </tr>
          <tr>
            <td className={`${s.cell} ${s.rowLabel}`}>비용 (USD)</td>
            {items.map((it) => (
              <td key={it.run.id} className={s.cell}>
                {it.run.costUsd === null ? "—" : it.run.costUsd.toFixed(4)}
              </td>
            ))}
          </tr>
          <tr>
            <td className={`${s.cell} ${s.rowLabel}`}>변경 파일 수</td>
            {items.map((it) => (
              <td key={it.run.id} className={s.cell}>
                {it.diffFileCount}
              </td>
            ))}
          </tr>
          {/* OPSP-20: 객관 신호 3행 */}
          <tr>
            <td className={`${s.cell} ${s.rowLabel}`}>
              성공조건 통과
              <InfoMark
                label="성공조건 자동 측정"
                help="시나리오 expectation.assertions 각 줄을 트레이스 텍스트에 substring 매칭. 약한 규칙(자유 자연어) — 정밀 규칙 엔진은 후속."
              />
            </td>
            {items.map((it) => {
              const sc = it.assertionScore;
              if (sc === null) return <td key={it.run.id} className={`${s.cell} ${s.dashCell}`}>—</td>;
              const detail = sc.detail;
              const expected = detail?.expected;
              const total = Array.isArray(expected) ? expected.length : 0;
              const passCount = Math.round((sc.score ?? 0) * total);
              return (
                <td key={it.run.id} className={s.cell}>
                  <span className={sc.passed ? s.passColor : s.partialColor}>
                    {`${String(passCount)}/${String(total)}`}
                  </span>
                </td>
              );
            })}
          </tr>
          <tr>
            <td className={`${s.cell} ${s.rowLabel}`}>
              judge 점수
              <InfoMark
                label="LLM judge 점수"
                help="🤖 AI 판정 후 저장된 score(scorer='llm_judge'). best=1.0 / fine=0.5 / worse=0.0."
              />
            </td>
            {items.map((it) => {
              const sc = it.judgeScore;
              if (sc === null) return <td key={it.run.id} className={`${s.cell} ${s.dashCell}`}>—</td>;
              return (
                <td key={it.run.id} className={s.cell} title={sc.detail?.reason ?? ""}>
                  <span className={s.numCell}>{(sc.score ?? 0).toFixed(2)}</span>
                </td>
              );
            })}
          </tr>
          <tr>
            <td className={`${s.cell} ${s.rowLabel}`}>
              사람 점수
              <InfoMark
                label="사람 점수"
                help="트레이스 뷰에서 사용자가 직접 매긴 점수(OPSP-17). 데이터 없으면 — 표시."
              />
            </td>
            {items.map((it) => {
              const sc = it.humanScore;
              if (sc === null) return <td key={it.run.id} className={`${s.cell} ${s.dashCell}`}>—</td>;
              return (
                <td key={it.run.id} className={s.cell} title={sc.detail?.reason ?? ""}>
                  <span className={s.numCell}>{(sc.score ?? 0).toFixed(2)}</span>
                </td>
              );
            })}
          </tr>
          <tr>
            <td className={`${s.cell} ${s.rowLabel}`}>마지막 응답 미리보기</td>
            {items.map((it) => (
              <td key={it.run.id} className={`${s.cell} ${s.previewCell}`}>
                {it.lastAssistantText === null ? (
                  <span className={s.dashCell}>(없음)</span>
                ) : (
                  <span className={s.previewText}>{it.lastAssistantText}</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className={s.footnote}>
        컬럼 헤더(run id) 를 클릭하면 그 run 의 트레이스로 이동. 셀에 hover 하면 자세한 이유가 뜹니다.
      </p>
    </div>
  );
}
