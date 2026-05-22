import { Check, Sparkles, Target, Trophy } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { EmptyState, ErrorNotice, InfoMark, InlineError, Loading } from "../../../lib/ui";
import { useAdoptVersion } from "../../authoring/use-authoring";
import type { JudgeVerdict } from "../api";
import { useJudgeRuns, useRunsCompare } from "../use-run";

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

const verdictMeta: Record<JudgeVerdict, { label: string; variant: "success" | "warning" | "destructive" }> = {
  best: { label: "🏆 BEST", variant: "success" },
  fine: { label: "OK", variant: "warning" },
  worse: { label: "WORSE", variant: "destructive" },
};

export function ComparisonView({ runIds, onSelectRun }: Props) {
  const { data: items, isPending, isError, error } = useRunsCompare(runIds, false);
  const judge = useJudgeRuns();
  const adopt = useAdoptVersion();
  const verdictByRunId = new Map(judge.data?.perRun.map((p) => [p.runId, p]) ?? []);

  if (runIds.length === 0) return null;
  if (isPending)
    return (
      <p className="text-sm text-muted-foreground">
        <Loading label="비교 데이터 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;
  if (items.length === 0)
    return <EmptyState title="비교할 run 이 없어요" hint="버전 비교 모드로 다시 실행해 보세요." />;

  const allDone = items.every((it) => it.run.status === "succeeded" || it.run.status === "failed");
  const scenarioNames = [...new Set(items.map((it) => it.scenarioName))];
  const isRegression = scenarioNames.length > 1;
  const passedFull = items.filter((it) => it.assertionScore?.passed === true).length;

  return (
    <div className="space-y-3">
      {isRegression && (
        <Alert variant="success">
          <Target className="h-4 w-4" />
          <AlertDescription>
            회귀 — {items.length}개 시나리오 중 <strong>{passedFull}</strong>개 assertion 전원 통과
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={judge.isPending || !allDone}
          onClick={() => judge.mutate(runIds)}
          title={allDone ? "로컬 Claude 로 N개 run 결과 비교 판정" : "모든 run 이 끝난 뒤에 가능"}
        >
          {judge.isPending ? (
            <Loading label="Claude 판정 중…" />
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              AI 판정 (어느 게 나았나)
            </>
          )}
        </Button>
        <InfoMark
          label="AI 판정"
          help="시나리오 + 자산 본문 + 각 run 요약을 Claude 에 보내 ‘어느 버전이 더 나았나·왜’ 를 JSON 으로 받습니다."
        />
        {judge.isError && <InlineError error={judge.error} />}
      </div>

      {judge.isSuccess && (
        <Alert variant="info">
          <Trophy className="h-4 w-4" />
          <AlertTitle>
            판정 결과:{" "}
            {judge.data.winnerRunId !== null ? (
              <code className="font-mono">{judge.data.winnerRunId.slice(0, 8)}</code>
            ) : (
              "우열 판단 불가"
            )}
          </AlertTitle>
          <AlertDescription>
            <p className="whitespace-pre-wrap text-sm">{judge.data.summary}</p>
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="border-b p-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                지표
              </th>
              {items.map((it) => {
                const verdict = verdictByRunId.get(it.run.id);
                return (
                  <th
                    key={it.run.id}
                    className="cursor-pointer border-b p-2 text-left hover:bg-accent"
                    onClick={() => onSelectRun(it.run.id)}
                    title="이 run 의 트레이스 보기"
                  >
                    <code className="font-mono text-xs">{it.run.id.slice(0, 8)}</code>
                    {isRegression && (
                      <div className="mt-1 max-w-40 truncate text-xs font-semibold text-success">
                        🎯 {it.scenarioName}
                      </div>
                    )}
                    {verdict && (
                      <Badge variant={verdictMeta[verdict.verdict].variant} className="ml-1 text-[10px]">
                        {verdictMeta[verdict.verdict].label}
                      </Badge>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <Row label="상태">
              {items.map((it) => (
                <td key={it.run.id} className="border-b p-2 align-top">
                  {statusEmoji[it.run.status] ?? "?"} {it.run.status}
                  {it.run.error !== null && (
                    <div className="text-xs text-destructive">{it.run.error.slice(0, 80)}</div>
                  )}
                </td>
              ))}
            </Row>
            <Row label="실행 소스">
              {items.map((it) => (
                <td key={it.run.id} className="border-b p-2 align-top">
                  {it.run.runner}
                </td>
              ))}
            </Row>
            <Row label="토큰 (입/출)">
              {items.map((it) => (
                <td key={it.run.id} className="border-b p-2 align-top">
                  {it.run.promptTokens === null && it.run.completionTokens === null
                    ? "—"
                    : `${String(it.run.promptTokens ?? "—")} / ${String(it.run.completionTokens ?? "—")}`}
                </td>
              ))}
            </Row>
            <Row label="비용 (USD)">
              {items.map((it) => (
                <td key={it.run.id} className="border-b p-2 align-top">
                  {it.run.costUsd === null ? "—" : it.run.costUsd.toFixed(4)}
                </td>
              ))}
            </Row>
            <Row label="변경 파일">
              {items.map((it) => (
                <td key={it.run.id} className="border-b p-2 align-top">
                  {it.diffFileCount}
                </td>
              ))}
            </Row>
            <Row
              label="성공조건 통과"
              help="시나리오 assertions 각 줄을 트레이스 텍스트에 substring 매칭."
            >
              {items.map((it) => {
                const sc = it.assertionScore;
                if (sc === null) {
                  return (
                    <td key={it.run.id} className="border-b p-2 align-top text-muted-foreground">
                      —
                    </td>
                  );
                }
                const total = Array.isArray(sc.detail?.expected) ? sc.detail.expected.length : 0;
                const passCount = Math.round((sc.score ?? 0) * total);
                return (
                  <td key={it.run.id} className="border-b p-2 align-top">
                    <span className={sc.passed ? "font-semibold text-success" : "font-semibold text-warning"}>
                      {`${String(passCount)}/${String(total)}`}
                    </span>
                  </td>
                );
              })}
            </Row>
            <Row label="judge 점수" help="🤖 AI 판정 후 저장된 score(scorer='llm_judge').">
              {items.map((it) => {
                const sc = it.judgeScore;
                if (sc === null) {
                  return (
                    <td key={it.run.id} className="border-b p-2 align-top text-muted-foreground">
                      —
                    </td>
                  );
                }
                return (
                  <td
                    key={it.run.id}
                    className="border-b p-2 align-top"
                    title={sc.detail?.reason ?? ""}
                  >
                    <span className="font-semibold">{(sc.score ?? 0).toFixed(2)}</span>
                  </td>
                );
              })}
            </Row>
            <Row label="사람 점수" help="트레이스 뷰에서 사용자가 매긴 점수(OPSP-17).">
              {items.map((it) => {
                const sc = it.humanScore;
                if (sc === null) {
                  return (
                    <td key={it.run.id} className="border-b p-2 align-top text-muted-foreground">
                      —
                    </td>
                  );
                }
                return (
                  <td
                    key={it.run.id}
                    className="border-b p-2 align-top"
                    title={sc.detail?.reason ?? ""}
                  >
                    <span className="font-semibold">{(sc.score ?? 0).toFixed(2)}</span>
                  </td>
                );
              })}
            </Row>
            <Row label="마지막 응답">
              {items.map((it) => (
                <td key={it.run.id} className="max-w-60 p-2 align-top text-xs">
                  {it.lastAssistantText === null ? (
                    <span className="text-muted-foreground">(없음)</span>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{it.lastAssistantText}</span>
                  )}
                </td>
              ))}
            </Row>
            {/* OPSP-45: 비교 모드에서 우승(또는 임의) 버전 채택 — 회귀 모드는 전부 같은 버전이라 제외 */}
            {!isRegression && (
              <Row
                label="버전 채택"
                help="이 run 이 쓴 자산 버전을 클론 .claude 에 다시 써서 새 최신 버전으로 만듭니다(git 앞으로 감기)."
              >
                {items.map((it) => {
                  const adopted =
                    adopt.isSuccess && adopt.variables?.assetVersionId === it.run.assetVersionId;
                  return (
                    <td key={it.run.id} className="border-b p-2 align-top">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={adopt.isPending}
                        onClick={() =>
                          adopt.mutate({
                            assetVersionId: it.run.assetVersionId,
                            note: `비교 run ${it.run.id.slice(0, 8)} 결과 채택`,
                          })
                        }
                      >
                        {adopted ? "✓ 채택됨" : "이 버전 채택"}
                      </Button>
                    </td>
                  );
                })}
              </Row>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        컬럼 헤더(run id) 를 클릭하면 그 run 의 트레이스로 이동. 셀에 hover 하면 자세한 이유가 뜹니다.
      </p>
      {adopt.isError && <InlineError error={adopt.error} />}
      {adopt.isSuccess && (
        <Alert variant="success">
          <Check className="h-4 w-4" />
          <AlertDescription>
            버전 채택 완료 — 새 커밋{" "}
            <code className="font-mono">{adopt.data.committed.slice(0, 8)}</code> 가 자산의 현재
            최신이 되었습니다. 레지스트리의 버전 타임라인에서 확인하세요.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function Row({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="border-b p-2 align-top text-xs font-medium text-muted-foreground">
        {label}
        {help && <InfoMark label={label} help={help} />}
      </td>
      {children}
    </tr>
  );
}
