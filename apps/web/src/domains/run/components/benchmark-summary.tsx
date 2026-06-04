import { TrendingUp, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { EmptyState, InfoMark, InlineError, Loading } from "../../../lib/ui";
import { useAdoptVersion } from "../../authoring/use-authoring";
import type { BenchmarkAggregate } from "../api";
import { useBenchmarkAggregate, useRunsCompare } from "../use-run";
import { sourceToken } from "../lib/source-token";
import type { BenchmarkBySourceEntry, DesignSource } from "@opspilot/shared-types";

// OPSP-31: N개 run 통계 카드 — 통과율 / 평균±σ / assertion 분포.
// 개별 run 드릴다운은 컬럼 클릭 → 트레이스 (compare 결과 활용).

interface Props {
  runIds: string[];
  onSelectRun: (runId: string) => void;
}

function fmtMs(v: number) {
  if (v < 1000) return `${v.toFixed(0)}ms`;
  return `${(v / 1000).toFixed(2)}s`;
}
function fmtTok(v: number) {
  return Math.round(v).toLocaleString();
}
function fmtCost(v: number) {
  return `$${v.toFixed(4)}`;
}
function fmtScore(v: number) {
  return v.toFixed(3);
}

function StatBox({
  label,
  mean,
  stdDev,
  hint,
  fmt,
}: {
  label: string;
  mean: number | null;
  stdDev: number | null;
  hint?: string;
  fmt: (v: number) => string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      {mean === null ? (
        <div className="mt-1 text-sm text-muted-foreground">—</div>
      ) : (
        <>
          <div className="mt-1 font-mono text-sm">{fmt(mean)}</div>
          {stdDev !== null && (
            <div className="text-xs text-muted-foreground">σ {fmt(stdDev)}</div>
          )}
          {hint !== undefined && (
            <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
          )}
        </>
      )}
    </div>
  );
}

// 머신 스코어러 기준 보강 게이트 — criteria_weak/no_criteria 비율이 측정 신뢰를 갉는다.
// 외부(사람) 표본 게이트(§6.4 ConfidenceGate)와 같은 보류 시맨틱: 하나라도 있으면 보류.
function CriteriaGate({ weak, none }: { weak: number; none: number }) {
  if (weak === 0 && none === 0) return null;
  const parts: string[] = [];
  if (none > 0) parts.push(`기준 없음 ${none}`);
  if (weak > 0) parts.push(`신뢰 보류 ${weak}`);
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning">
      기준 보강 필요 — 측정 신뢰 보류 ({parts.join(" · ")})
      <InfoMark
        label="기준 보강 필요"
        help="머신 스코어러가 채점 전 successCriteria 품질을 게이트한다. 기준이 비었거나(no_criteria) 모호하면(criteria_weak) 점수의 신뢰를 보류한다. 각 run 상세에서 머신 채점의 기준 보강·초안 제안을 시나리오 successCriteria 에 반영하면 해소된다."
      />
    </div>
  );
}

// ADR 0003 (D1·C3): source(asset|baked) 한 칸 — 통과율 바 + assertion 평균.
function BySourceRow({
  source,
  entry,
}: {
  source: DesignSource;
  entry: BenchmarkBySourceEntry;
}) {
  const tok = sourceToken(source);
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <Badge variant={tok.variant}>{tok.label}</Badge>
        <span className="text-xs text-muted-foreground">N={entry.count}</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">통과율</span>
        <span className="font-mono">{(entry.passRate * 100).toFixed(1)}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded bg-muted">
        <div
          className="h-full rounded bg-primary/60"
          style={{ width: `${(entry.passRate * 100).toFixed(1)}%` }}
        />
      </div>
      {/* 자가(같은 하네스 산출) 신호 — assertion/judge */}
      <div className="mt-2 flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">단언 평균 (자가)</span>
        <span className="font-mono">
          {entry.assertion === null ? "—" : fmtScore(entry.assertion.mean)}
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">판정 평균 (자가)</span>
        <span className="font-mono">
          {entry.judge === null ? "—" : fmtScore(entry.judge.mean)}
        </span>
      </div>
      {/* ADR 0003 §6.4: 외부(사람) 신호 — 자가와 분리. 자가편향 보정의 근거. */}
      <div className="mt-1 flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">사람 평균 (외부)</span>
        {entry.human === null || entry.humanSampleCount === 0 ? (
          <span className="font-mono text-muted-foreground">
            —(외부 표본 없음)
          </span>
        ) : (
          <span className="font-mono">
            {entry.human.mean.toFixed(2)}{" "}
            <span className="text-muted-foreground">
              (외부 표본 {entry.humanSampleCount})
            </span>
          </span>
        )}
      </div>
      {/* 머신 스코어러 분포 + 기준 보강 게이트 (source 단위) */}
      <div className="mt-1 flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">머신 평균</span>
        <span className="font-mono">
          {entry.machine === null ? "—" : fmtScore(entry.machine.mean)}
        </span>
      </div>
      <div className="mt-2">
        <CriteriaGate weak={entry.machineCriteriaWeak} none={entry.machineNoCriteria} />
      </div>
    </div>
  );
}

// ADR 0003 §6.4 (B3): 비교 신뢰 게이트 — asset·baked 양쪽 다 외부(사람) 표본이
// 있어야 자가편향 없이 비교를 신뢰한다. 한쪽이라도 없으면 보류 경고.
function ConfidenceGate({
  asset,
  baked,
}: {
  asset?: BenchmarkBySourceEntry;
  baked?: BenchmarkBySourceEntry;
}) {
  // 양쪽 source 가 존재할 때만 A/B 비교 신뢰 판단이 의미 있다.
  if (asset === undefined || baked === undefined) return null;
  const bothExternal = asset.humanSampleCount > 0 && baked.humanSampleCount > 0;
  if (bothExternal) {
    return (
      <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2 py-1 text-xs text-success">
        외부 검증됨 (§6.4)
        <InfoMark
          label="외부 검증됨"
          help="asset·baked 양쪽 모두 외부(사람) 점수 표본이 있어 자가 신호(단언·판정)의 자가편향을 사람 신호로 교차 검증할 수 있다. A/B 비교를 신뢰할 수 있는 상태(ADR 0003 §6.4)."
        />
      </div>
    );
  }
  return (
    <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning">
      비교 신뢰 보류 — 외부(사람) 표본 부족 (§6.4)
      <InfoMark
        label="비교 신뢰 보류"
        help="자가 신호(단언·판정)만으론 같은 하네스가 만든 평가가 자기 산출을 좋게 볼 자가편향이 있을 수 있다. ADR 0003 §6.4는 자가+외부(사람) 둘 다 있을 때만 비교를 신뢰한다. 각 run 상세에서 사람 점수를 매기면 여기 반영된다."
      />
    </div>
  );
}

export function BenchmarkSummary({ runIds, onSelectRun }: Props) {
  const compare = useRunsCompare(
    runIds,
    /* anyRunning */ true /* 단순화: aggregate가 폴링 멈출 때까지 같이 폴링 */,
  );
  const items = compare.data ?? [];
  const anyRunning = items.some((it) => it.run.status === "running");
  const agg = useBenchmarkAggregate(runIds, anyRunning);
  const data: BenchmarkAggregate | undefined = agg.data;
  // OPSP-45: 벤치마크는 한 버전을 N회 — 그 버전을 채택. (모든 run 이 같은 버전)
  const adopt = useAdoptVersion();
  const benchVersionId = items[0]?.run.assetVersionId;

  if (runIds.length < 1) {
    return (
      <Card>
        <CardContent className="p-4">
          <EmptyState
            title="벤치마크 결과 없음"
            hint="좌측 ‘벤치마크 (N회)’ 카드로 시나리오를 골라 실행하세요."
          />
        </CardContent>
      </Card>
    );
  }

  if (agg.isPending) {
    return (
      <Card>
        <CardContent className="p-4">
          <Loading label="통계 집계 중…" />
        </CardContent>
      </Card>
    );
  }
  if (agg.isError) return <InlineError error={agg.error} />;
  if (data === undefined) return null;

  return (
    <Card className="border-purple/40">
      <CardHeader className="border-b border-purple/20">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-purple" />
          벤치마크 통계 (N={data.count})
          {anyRunning && (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              실행 중
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* 상태 + 통과율 */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" className="bg-success/20 text-success-foreground">
            성공 {data.statusCounts.succeeded}
          </Badge>
          <Badge variant="default" className="bg-destructive/20 text-destructive-foreground">
            실패 {data.statusCounts.failed}
          </Badge>
          {data.statusCounts.running > 0 && (
            <Badge variant="outline">진행 중 {data.statusCounts.running}</Badge>
          )}
          {data.statusCounts.pending > 0 && (
            <Badge variant="outline">대기 {data.statusCounts.pending}</Badge>
          )}
          <Badge className="ml-2 bg-purple/20 text-purple-foreground">
            통과율 {(data.passRate * 100).toFixed(1)}%
          </Badge>
        </div>

        {/* 측정치 그리드 */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <StatBox
            label="실행 시간"
            mean={data.durationMs?.mean ?? null}
            stdDev={data.durationMs?.stdDev ?? null}
            hint={
              data.durationMs === null
                ? undefined
                : `${fmtMs(data.durationMs.min)} ~ ${fmtMs(data.durationMs.max)}`
            }
            fmt={fmtMs}
          />
          <StatBox
            label="프롬프트 토큰"
            mean={data.promptTokens?.mean ?? null}
            stdDev={data.promptTokens?.stdDev ?? null}
            fmt={fmtTok}
          />
          <StatBox
            label="응답 토큰"
            mean={data.completionTokens?.mean ?? null}
            stdDev={data.completionTokens?.stdDev ?? null}
            fmt={fmtTok}
          />
          <StatBox
            label="비용 (1회 평균)"
            mean={data.costUsd?.mean ?? null}
            stdDev={data.costUsd?.stdDev ?? null}
            fmt={fmtCost}
          />
          <StatBox
            label="단언 점수 (자동)"
            mean={data.assertion?.mean ?? null}
            stdDev={data.assertion?.stdDev ?? null}
            hint={
              data.assertion === null
                ? undefined
                : `통과 ${data.assertion.passN}/${data.count}`
            }
            fmt={fmtScore}
          />
          <StatBox
            label="LLM 판정 점수"
            mean={data.judge?.mean ?? null}
            stdDev={data.judge?.stdDev ?? null}
            fmt={fmtScore}
          />
          <StatBox
            label="머신 점수"
            mean={data.machine?.mean ?? null}
            stdDev={data.machine?.stdDev ?? null}
            hint={
              data.machineCriteriaWeak > 0 || data.machineNoCriteria > 0
                ? `보류 ${data.machineCriteriaWeak} · 기준없음 ${data.machineNoCriteria}`
                : undefined
            }
            fmt={fmtScore}
          />
        </div>

        {/* 머신 스코어러 기준 보강 게이트 — criteria_weak/no_criteria 가 하나라도 있으면
            측정 신뢰 보류. 외부(사람) 표본 게이트(§6.4)와 같은 보류 패턴. */}
        <CriteriaGate weak={data.machineCriteriaWeak} none={data.machineNoCriteria} />

        {/* ADR 0003 (D1·C3): source 차원 분포 — asset vs baked. legacy(null)면 숨김. */}
        {data.bySource !== null &&
          (data.bySource.asset !== undefined || data.bySource.baked !== undefined) && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                source 차원 (설계 산출 경로)
                <InfoMark
                  label="source 차원"
                  help="평가 설계가 어느 경로로 만들어졌나(asset=agent-crew 자산 주입 / baked=fallback)별 통과율·점수 분포. 같은 시나리오라도 설계 경로가 결과에 미치는 영향을 본다(ADR 0003)."
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {data.bySource.asset !== undefined && (
                  <BySourceRow source="asset" entry={data.bySource.asset} />
                )}
                {data.bySource.baked !== undefined && (
                  <BySourceRow source="baked" entry={data.bySource.baked} />
                )}
              </div>
              {/* ADR 0003 §6.4 (B3): 자가+외부 둘 다일 때만 비교 신뢰 게이트 */}
              <ConfidenceGate
                asset={data.bySource.asset}
                baked={data.bySource.baked}
              />
            </div>
          )}

        {/* 개별 run 드릴다운 */}
        <div>
          <div className="mb-1 text-xs text-muted-foreground">개별 run 드릴다운</div>
          <div className="flex flex-wrap gap-1">
            {items.map((it, idx) => {
              const ok = it.run.status === "succeeded";
              const failed = it.run.status === "failed";
              return (
                <button
                  key={it.run.id}
                  onClick={() => onSelectRun(it.run.id)}
                  className={`rounded-md border px-2 py-1 text-xs font-mono hover:bg-accent ${
                    ok
                      ? "border-success/40 bg-success/10"
                      : failed
                        ? "border-destructive/40 bg-destructive/10"
                        : "border-border"
                  }`}
                  title={`${it.run.status} · ${it.scenarioName}`}
                >
                  #{idx + 1} {it.run.status === "running" ? "…" : ok ? "✓" : failed ? "✗" : "·"}
                </button>
              );
            })}
          </div>
        </div>

        {/* OPSP-45: 벤치마크한 버전을 자산의 현재 최신으로 채택 */}
        {benchVersionId !== undefined && (
          <div className="flex flex-wrap items-center gap-2 border-t border-purple/20 pt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={adopt.isPending}
              onClick={() =>
                adopt.mutate({
                  assetVersionId: benchVersionId,
                  note: `벤치마크 N=${String(data.count)} 결과 채택`,
                })
              }
            >
              {adopt.isSuccess ? "✓ 채택됨" : "이 버전 채택"}
            </Button>
            <span className="text-xs text-muted-foreground">
              벤치마크한 버전을 자산의 현재 최신 버전으로 만듭니다(git 앞으로 감기).
            </span>
            {adopt.isError && <InlineError error={adopt.error} />}
            {adopt.isSuccess && (
              <span className="text-xs text-success">
                새 커밋 {adopt.data.committed.slice(0, 8)} 가 현재 최신
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
