import { useMemo, useState } from "react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Textarea } from "../../../components/ui/textarea";
import { ErrorNotice } from "../../../lib/ui";
import {
  useAssets,
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

// T4: 선택된 스킬/에이전트의 description 이 "켜져야 할 때 켜지나"를 측정하는 패널.
// 자산 사용량(T3)이 "안 쓰인다"를 보여주면, 여기서 그 이유가 트리거 실패인지 진단.
export function TriggerEvalPanel({ projectId, assetId }: Props) {
  const { data: assets } = useAssets(projectId);
  const asset = useMemo(
    () => (assets ?? []).find((a) => a.id === assetId) ?? null,
    [assets, assetId],
  );
  const [queriesText, setQueriesText] = useState("");
  const [runsPerQuery, setRunsPerQuery] = useState(3);
  const suggest = useSuggestTriggerQueries();
  const run = useRunTriggerEval();

  // 트리거 평가는 description 으로 발화되는 agent·skill 만 대상.
  if (asset === null || (asset.kind !== "agent" && asset.kind !== "skill"))
    return null;

  const queries = queriesText
    .split("\n")
    .map((q) => q.trim())
    .filter(Boolean);

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
        이 {asset.kind} 의 description 이 <b>켜져야 할 때 켜지는지</b>{" "}
        측정합니다. should-trigger 쿼리(한 줄에 하나)를 넣고 평가하면 각 쿼리를{" "}
        {runsPerQuery}회 실제 <code>claude</code> 로 던져 발화율을 냅니다.{" "}
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
              { onSuccess: (qs) => setQueriesText(qs.join("\n")) },
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
          disabled={run.isPending || queries.length === 0}
          onClick={() =>
            run.mutate({ assetId: asset.id, queries, runsPerQuery })
          }
          title={queries.length === 0 ? "쿼리를 먼저 넣으세요" : ""}
        >
          {run.isPending
            ? `평가 중… (${String(queries.length * runsPerQuery)}회 호출)`
            : "트리거 평가 실행"}
        </Button>
      </div>

      <Textarea
        value={queriesText}
        onChange={(e) => setQueriesText(e.target.value)}
        placeholder={
          "should-trigger 쿼리를 한 줄에 하나씩…\n예: 결제 모듈 메시지큐 결정 문서로 남겨줘"
        }
        className="min-h-[88px] font-mono text-xs"
      />

      {suggest.isError && <ErrorNotice error={suggest.error} />}
      {run.isError && <ErrorNotice error={run.error} />}

      {run.data && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground">전체 트리거율</span>
            <span
              className={`text-lg font-bold tabular-nums ${rateColor(run.data.overallRate)}`}
            >
              {Math.round(run.data.overallRate * 100)}%
            </span>
            <span className="text-xs text-muted-foreground">
              ({run.data.queries.length}쿼리 × {run.data.runsPerQuery}회)
            </span>
          </div>
          <ul className="space-y-1">
            {run.data.queries.map((q, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-2 text-xs"
              >
                <span className="flex-1 truncate" title={q.query}>
                  {q.query}
                </span>
                <span
                  className={`tabular-nums font-medium ${rateColor(q.triggerRate)}`}
                >
                  {q.triggered}/{q.runs}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground">
            낮으면 description 이 이 의도를 못 잡는 것 — 트리거 문구를 더
            구체적으로 고쳐보세요. (should-NOT·자동개선은 후속)
          </p>
        </div>
      )}
    </Card>
  );
}
