import { useMemo, useState } from "react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Textarea } from "../../../components/ui/textarea";
import { ErrorNotice } from "../../../lib/ui";
import {
  useAssets,
  useImproveTriggerDescription,
  useRunTriggerEval,
  useSuggestTriggerQueries,
} from "../use-registry";

interface Props {
  projectId: string | null;
  assetId: string | null;
}

function rateColor(rate: number): string {
  if (rate >= 0.8) return "text-emerald-600 dark:text-emerald-400";
  if (rate >= 0.5) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((q) => q.trim())
    .filter(Boolean);
}

// T4: 선택된 스킬/에이전트의 description 이 "켜져야 할 때 켜지고 아닐 때 안 켜지나"를 측정.
// 자산 사용량(T3)이 "안 쓰인다"를 보여주면, 여기서 그 이유가 트리거 실패인지 진단.
export function TriggerEvalPanel({ projectId, assetId }: Props) {
  const { data: assets } = useAssets(projectId);
  const asset = useMemo(
    () => (assets ?? []).find((a) => a.id === assetId) ?? null,
    [assets, assetId],
  );
  const [positivesText, setPositivesText] = useState("");
  const [negativesText, setNegativesText] = useState("");
  const [runsPerQuery, setRunsPerQuery] = useState(3);
  const suggest = useSuggestTriggerQueries();
  const run = useRunTriggerEval();
  const improve = useImproveTriggerDescription();

  // 트리거 평가는 description 으로 발화되는 agent·skill 만 대상.
  if (asset === null || (asset.kind !== "agent" && asset.kind !== "skill"))
    return null;

  const positives = lines(positivesText);
  const negatives = lines(negativesText);
  const totalCalls = (positives.length + negatives.length) * runsPerQuery;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          트리거 정확도 평가{" "}
          <Badge variant="secondary" className="text-[10px]">
            실험
          </Badge>
        </h2>
        <span className="text-xs text-muted-foreground">
          {asset.kind} · {asset.name}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        이 {asset.kind} 의 description 이{" "}
        <b>켜져야 할 때 켜지고, 아닐 때 안 켜지는지</b> 측정합니다. 쿼리(한 줄에
        하나)를 넣고 평가하면 각 쿼리를 {runsPerQuery}회 실제{" "}
        <code>claude</code> 로 던집니다.{" "}
        <b className="text-amber-600 dark:text-amber-400">실 토큰을 소모</b>
        합니다.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={suggest.isPending}
          onClick={() =>
            suggest.mutate(
              { assetId: asset.id, n: 5 },
              {
                onSuccess: (qs) => {
                  setPositivesText(qs.positives.join("\n"));
                  setNegativesText(qs.negatives.join("\n"));
                },
              },
            )
          }
        >
          {suggest.isPending ? "쿼리 생성 중…" : "쿼리 자동생성"}
        </Button>
        <label className="text-xs text-muted-foreground">
          반복
          <select
            className="ml-1 rounded border bg-background px-1 py-0.5 text-xs"
            value={runsPerQuery}
            onChange={(e) => setRunsPerQuery(Number(e.target.value))}
          >
            {[1, 2, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n}회
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          disabled={run.isPending || positives.length === 0}
          onClick={() =>
            run.mutate({
              assetId: asset.id,
              positives,
              negatives,
              runsPerQuery,
            })
          }
          title={
            positives.length === 0 ? "should-trigger 쿼리를 먼저 넣으세요" : ""
          }
        >
          {run.isPending
            ? `평가 중… (${String(totalCalls)}회 호출)`
            : "트리거 평가 실행"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={improve.isPending || positives.length === 0}
          onClick={() =>
            improve.mutate({
              assetId: asset.id,
              positives,
              negatives,
              runsPerQuery,
              maxIterations: 3,
            })
          }
          title="실패 케이스로 description 후보를 만들어 재측정, 가장 정확한 안을 제안 (반복 × 쿼리 × 회 — 매우 비쌈)"
        >
          {improve.isPending ? "개선 중… (오래 걸림)" : "description 자동개선"}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            ✓ should-trigger (켜져야 함)
          </span>
          <Textarea
            value={positivesText}
            onChange={(e) => setPositivesText(e.target.value)}
            placeholder={"켜져야 하는 요청 (한 줄에 하나)"}
            className="min-h-[88px] font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
            ✗ should-NOT (안 켜져야 함 · near-miss)
          </span>
          <Textarea
            value={negativesText}
            onChange={(e) => setNegativesText(e.target.value)}
            placeholder={"키워드는 겹치지만 켜지면 안 되는 함정 요청 (선택)"}
            className="min-h-[88px] font-mono text-xs"
          />
        </div>
      </div>

      {suggest.isError && <ErrorNotice error={suggest.error} />}
      {run.isError && <ErrorNotice error={run.error} />}

      {run.data && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-xs">
              <span className="text-muted-foreground">정확도 </span>
              <span
                className={`text-lg font-bold tabular-nums ${rateColor(run.data.accuracy)}`}
              >
                {Math.round(run.data.accuracy * 100)}%
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              발화율 ↑{Math.round(run.data.positiveRate * 100)}%
              {run.data.negativeFireRate !== null && (
                <> · 오발화 ↓{Math.round(run.data.negativeFireRate * 100)}%</>
              )}
            </span>
          </div>
          <ul className="space-y-1">
            {run.data.queries.map((q, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-2 text-xs"
              >
                <span className="flex min-w-0 flex-1 items-start gap-1">
                  <span
                    className={
                      q.shouldTrigger
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }
                    title={q.shouldTrigger ? "should-trigger" : "should-NOT"}
                  >
                    {q.shouldTrigger ? "▲" : "▽"}
                  </span>
                  <span className="truncate" title={q.query}>
                    {q.query}
                  </span>
                </span>
                <span className="flex items-center gap-1 tabular-nums">
                  <span className="text-muted-foreground">
                    {q.triggered}/{q.runs}
                  </span>
                  <span
                    className={
                      q.pass
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }
                  >
                    {q.pass ? "✓" : "✗"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground">
            ✗ 가 많으면 description 이 의도를 못 잡는 것 — 아래 「description
            자동개선」으로 더 나은 안을 제안받으세요.
          </p>
        </div>
      )}

      {improve.isError && <ErrorNotice error={improve.error} />}

      {improve.data && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">description 자동개선</span>
            {improve.data.improved ? (
              <Badge variant="success" className="text-[10px]">
                개선안 발견 · test{" "}
                {Math.round(improve.data.bestTestAccuracy * 100)}%
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                개선 불필요 (이미 충분)
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              {improve.data.iterations.length}회 반복 · train
              {improve.data.trainCount}/test{improve.data.testCount}
            </span>
          </div>
          {improve.data.improved && (
            <div className="space-y-1">
              <div>
                <span className="text-[10px] text-muted-foreground">원본</span>
                <p className="rounded bg-muted/50 p-1.5 text-xs">
                  {improve.data.originalDescription}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                  제안
                </span>
                <Textarea
                  readOnly
                  value={improve.data.bestDescription}
                  className="min-h-[64px] text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                자산은 자동 수정하지 않습니다 — 위 제안을 복사해 자산
                description 에 반영하세요.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
