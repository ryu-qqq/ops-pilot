import { useMemo, useState } from "react";
import { Card } from "../../../components/ui/card";
import { cn } from "../../../lib/utils";
import { useUsageGlobal } from "../use-registry";

// T5: 전역 사용량 리더보드 — 최근 N일 가장 많이 쓴 스킬·에이전트 Top 5 (프로젝트 무관).
// 그라파나 느낌의 "한눈에" 상단 패널.
const PERIODS = [
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
];

export function UsageLeaderboard() {
  const [days, setDays] = useState(7);
  const { data, isPending, isError } = useUsageGlobal(days);

  const top = useMemo(() => {
    const merged = [
      ...(data?.agents ?? []).map((a) => ({ ...a, kind: "agent" as const })),
      ...(data?.skills ?? []).map((s) => ({ ...s, kind: "skill" as const })),
    ];
    return merged.sort((a, b) => b.count - a.count).slice(0, 5);
  }, [data]);
  const max = top[0]?.count ?? 1;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">
            최근 {days}일 가장 많이 쓴 Toolkit
          </h2>
          <p className="text-xs text-muted-foreground">
            내 로컬 세션 전체 기준 Top 5 (프로젝트 무관)
            {data ? ` · ${String(data.scannedSessions)} 세션 스캔` : ""}
          </p>
        </div>
        <div className="inline-flex rounded-md border p-0.5">
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

      {isPending && (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      )}
      {isError && (
        <p className="text-sm text-muted-foreground">
          사용량을 불러오지 못했습니다.
        </p>
      )}
      {data && top.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          최근 {days}일 사용 기록이 없습니다.
        </p>
      )}

      <ol className="space-y-2">
        {top.map((r, i) => (
          <li key={`${r.kind}:${r.name}`} className="flex items-center gap-3">
            <span className="w-5 text-center text-sm font-bold tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm">
                  <span className="mr-1 rounded bg-muted px-1 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {r.kind}
                  </span>
                  <span className="font-medium">{r.name}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  <span className="text-lg font-bold">{r.count}</span>
                  <span className="text-xs text-muted-foreground">
                    회 · {r.projectCount}곳
                  </span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${String(Math.round((r.count / max) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
