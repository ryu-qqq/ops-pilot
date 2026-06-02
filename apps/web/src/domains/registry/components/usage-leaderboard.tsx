import { useMemo, useState } from "react";
import { Badge } from "../../../components/ui/badge";
import { Card } from "../../../components/ui/card";
import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { useUsageGlobal } from "../use-registry";
import { ProjectDots } from "./overview/project-dots";
import { Sparkline } from "./overview/sparkline";

// 전역 스파크라인 리더보드 — 최근 N일 가장 많이 쓴 스킬·에이전트 Top 5 (프로젝트 무관).
// 행: 순위 · kind배지+이름 · 14일 스파크라인 · 횟수 · 프로젝트 점+곳수.
// 7/30 토글은 리더보드(랭킹 윈도우)에만 — 잔디(전역 고정)와 무관.
// 개요는 보는 화면 → 행 클릭 비활성, hover 피드백만.
const PERIODS = [
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
];

export function UsageLeaderboard() {
  const [days, setDays] = useState(7);
  const { data, isPending, isError, error } = useUsageGlobal(days);

  const top = useMemo(() => {
    const merged = [
      ...(data?.agents ?? []).map((a) => ({ ...a, kind: "agent" as const })),
      ...(data?.skills ?? []).map((s) => ({ ...s, kind: "skill" as const })),
    ];
    return merged.sort((a, b) => b.count - a.count).slice(0, 5);
  }, [data]);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">
              최근 {days}일 가장 많이 쓴 Toolkit
            </h2>
            <Badge variant="secondary" className="text-[10px]">
              전역
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            내 로컬 세션 전체 기준 Top 5 (프로젝트 무관)
            {data ? ` · ${String(data.scannedSessions)} 세션 스캔` : ""}
          </p>
        </div>
        <div className="inline-flex shrink-0 rounded-md border p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setDays(p.days)}
              className={cn(
                "rounded px-2 py-1 text-xs transition-colors",
                days === p.days
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isPending && <Loading label="사용량 불러오는 중…" />}
      {isError && <ErrorNotice error={error} />}
      {data && data.scannedSessions === 0 && (
        <EmptyState
          title="아직 사용 기록이 없어요"
          hint="Cursor·Claude Code 세션이 쌓이면 여기에 Top 5가 채워집니다."
        />
      )}
      {data && data.scannedSessions > 0 && top.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          최근 {days}일 사용 기록이 없습니다.
        </p>
      )}

      {data && top.length > 0 && (
        <ol className="space-y-1">
          {top.map((r, i) => (
            <li
              key={`${r.kind}:${r.name}`}
              className="flex items-center gap-3 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent/50"
            >
              <span className="w-5 shrink-0 text-center text-sm font-bold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="rounded bg-muted px-1 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {r.kind}
                </span>
                <span className="truncate text-sm font-medium">{r.name}</span>
              </span>
              <span className="shrink-0">
                <Sparkline points={r.spark} />
              </span>
              <span className="w-16 shrink-0 text-right text-sm tabular-nums">
                <span className="text-base font-bold">{r.count}</span>
                <span className="text-xs text-muted-foreground">회</span>
              </span>
              <span className="w-24 shrink-0 text-right">
                <ProjectDots cwds={r.cwds} projectCount={r.projectCount} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
