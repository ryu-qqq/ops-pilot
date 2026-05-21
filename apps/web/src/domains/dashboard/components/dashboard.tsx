import { useEffect, useState } from "react";
import { Activity, BarChart3, Bot, FileText, Loader2, Repeat, TrendingUp, XCircle } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { EmptyState, InlineError, Loading } from "../../../lib/ui";
import { useCancelRun } from "../../run/use-run";
import { useStatsOverview } from "../use-dashboard";
import type { DashboardRun } from "../api";

// OPSP-35 (a): 관측 대시보드. 카운트 카드 + 진행 중 run + 최근 run 타임라인 점.

interface Props {
  onSelectRun: (id: string) => void;
}

function fmtMs(v: number | null) {
  if (v === null) return "—";
  if (v < 1000) return `${v.toFixed(0)}ms`;
  return `${(v / 1000).toFixed(2)}s`;
}
function fmtTok(v: number | null) {
  return v === null ? "—" : Math.round(v).toLocaleString();
}
function fmtCost(v: number | null) {
  return v === null ? "—" : `$${v.toFixed(4)}`;
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "warning" | "destructive" | "info" | "default";
}) {
  const toneClass =
    tone === "success"
      ? "border-success/30 bg-success/5"
      : tone === "warning"
        ? "border-warning/30 bg-warning/5"
        : tone === "destructive"
          ? "border-destructive/30 bg-destructive/5"
          : tone === "info"
            ? "border-info/30 bg-info/5"
            : "";
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-mono text-lg">{value}</div>
      {sub !== undefined && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function elapsedSince(iso: string | null): number | null {
  if (iso === null) return null;
  const start = Date.parse(iso);
  if (Number.isNaN(start)) return null;
  return Date.now() - start;
}

function RunningRunRow({ run, onSelect }: { run: DashboardRun; onSelect: () => void }) {
  // OPSP-35: 진행 중 run 의 경과 시간을 1초마다 tick.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const cancel = useCancelRun();
  const elapsed = elapsedSince(run.startedAt);
  // OPSP-36: 30분 넘게 running 이면 좀비 의심 — 강조.
  const suspectZombie = elapsed !== null && elapsed > 30 * 60 * 1000;
  return (
    <div
      className={`flex w-full items-center justify-between gap-2 rounded-md border p-2 ${
        suspectZombie
          ? "border-destructive/40 bg-destructive/5"
          : "border-warning/30 bg-warning/5"
      }`}
    >
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-warning" />
        <div className="min-w-0">
          <div className="truncate text-sm">
            <span className="font-mono">{run.assetKind}/{run.assetName}</span>
            <span className="mx-1.5 text-muted-foreground">·</span>
            <span className="text-muted-foreground">{run.scenarioName}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {run.startedAt !== null
              ? `시작 ${new Date(run.startedAt).toLocaleTimeString()}`
              : "대기 중"}
            {suspectZombie && (
              <span className="ml-1 text-destructive">· 30분 초과 — 좀비 의심</span>
            )}
          </div>
        </div>
      </button>
      <Badge variant="outline" className="font-mono">
        {elapsed === null ? "—" : `${(elapsed / 1000).toFixed(0)}s`}
      </Badge>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive"
        disabled={cancel.isPending}
        onClick={() => cancel.mutate(run.id)}
        title="이 run 을 강제 종료 (failed 마킹)"
      >
        <XCircle className="h-3.5 w-3.5" />
        강제 종료
      </Button>
    </div>
  );
}

function RecentRunDot({ run, onSelect }: { run: DashboardRun; onSelect: () => void }) {
  const tone =
    run.status === "succeeded"
      ? "bg-success border-success/40"
      : run.status === "failed"
        ? "bg-destructive border-destructive/40"
        : run.status === "running"
          ? "bg-warning border-warning/40 animate-pulse"
          : "bg-muted border-border";
  return (
    <button
      onClick={onSelect}
      className={`relative h-7 w-7 rounded-md border-2 ${tone}`}
      title={`${run.status} · ${run.assetKind}/${run.assetName} · ${run.scenarioName} · ${
        run.durationMs !== null ? fmtMs(run.durationMs) : "—"
      }`}
    />
  );
}

export function Dashboard({ onSelectRun }: Props) {
  const q = useStatsOverview();
  if (q.isPending) return <Loading label="대시보드 로딩 중…" />;
  if (q.isError) return <InlineError error={q.error} />;
  const d = q.data;
  if (d === undefined) return null;

  return (
    <div className="space-y-4">
      {/* 상단 카운트 그리드 */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            전체 현황
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <MetricCard
              icon={<Bot className="h-3 w-3" />}
              label="자산"
              value={String(d.assets.total)}
              sub={`agent ${d.assets.agent} · skill ${d.assets.skill} · command ${d.assets.command}`}
            />
            <MetricCard
              icon={<FileText className="h-3 w-3" />}
              label="시나리오"
              value={String(d.scenarios)}
            />
            <MetricCard
              icon={<Activity className="h-3 w-3" />}
              label="run 총합"
              value={String(d.runs.total)}
              sub={`성공 ${d.runs.succeeded} · 실패 ${d.runs.failed} · 진행 ${d.runs.running}`}
            />
            <MetricCard
              icon={<TrendingUp className="h-3 w-3" />}
              label="통과율"
              value={`${(d.passRate * 100).toFixed(1)}%`}
              sub={`종료된 ${d.runs.succeeded + d.runs.failed}개 기준`}
              tone={d.passRate >= 0.8 ? "success" : d.passRate >= 0.5 ? "warning" : "destructive"}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <MetricCard
              icon={<Repeat className="h-3 w-3" />}
              label="평균 진행 시간"
              value={fmtMs(d.averages.durationMs)}
              sub="성공 run 기준"
            />
            <MetricCard
              icon={<FileText className="h-3 w-3" />}
              label="평균 프롬프트 토큰"
              value={fmtTok(d.averages.promptTokens)}
            />
            <MetricCard
              icon={<FileText className="h-3 w-3" />}
              label="평균 응답 토큰"
              value={fmtTok(d.averages.completionTokens)}
            />
            <MetricCard
              icon={<TrendingUp className="h-3 w-3" />}
              label="평균 비용"
              value={fmtCost(d.averages.costUsd)}
              sub="1회 평균"
            />
          </div>
        </CardContent>
      </Card>

      {/* 진행 중 run */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <Loader2
              className={`h-4 w-4 ${d.runningRuns.length > 0 ? "animate-spin text-warning" : "text-muted-foreground"}`}
            />
            진행 중 ({d.runningRuns.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {d.runningRuns.length === 0 ? (
            <EmptyState
              title="지금 진행 중인 run 없음"
              hint="레지스트리 탭에서 자산·시나리오 골라 실행하세요."
            />
          ) : (
            <div className="space-y-2">
              {d.runningRuns.map((r) => (
                <RunningRunRow key={r.id} run={r} onSelect={() => onSelectRun(r.id)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 최근 run 타임라인 */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-muted-foreground" />
            최근 run ({d.recentRuns.length} / 최대 20)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {d.recentRuns.length === 0 ? (
            <EmptyState title="실행 기록 없음" hint="첫 run 을 만들면 여기 타임라인에 점이 찍힙니다." />
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {[...d.recentRuns].reverse().map((r) => (
                  <RecentRunDot key={r.id} run={r} onSelect={() => onSelectRun(r.id)} />
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-success" /> 성공
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-destructive" /> 실패
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-warning" /> 진행 중
                </span>
                <span className="ml-auto">왼쪽 = 오래된 / 오른쪽 = 최근</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
