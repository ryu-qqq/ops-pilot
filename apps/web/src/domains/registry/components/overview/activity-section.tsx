import { useMemo } from "react";
import { Badge } from "../../../../components/ui/badge";
import { Card } from "../../../../components/ui/card";
import { EmptyState, ErrorNotice, Loading } from "../../../../lib/ui";
import { useUsageGlobal } from "../../use-registry";
import { ActivityHeatmap } from "./activity-heatmap";

// 개요 (2) 전역 활동 잔디. activity는 days 토글과 무관한 고정 84일 윈도우 →
// days=7 캐시를 그대로 공유(리더보드 기본과 동일 키 → 추가 요청 없음).
export function ActivitySection() {
  const { data, isPending, isError, error } = useUsageGlobal(7);

  const callout = useMemo(() => {
    const activity = data?.activity ?? [];
    const first = activity[0];
    if (first === undefined) return null;
    const total = activity.reduce((a, d) => a + d.count, 0);
    const peak = activity.reduce(
      (best, d) => (d.count > best.count ? d : best),
      first,
    );
    return { total, peak };
  }, [data]);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">활동 잔디</h2>
          <Badge variant="secondary" className="text-[10px]">
            전역
          </Badge>
          <span className="text-xs text-muted-foreground">최근 84일</span>
        </div>
        {callout && callout.total > 0 && (
          <p className="text-xs text-muted-foreground tabular-nums">
            총 {callout.total}회 · 최다 {callout.peak.date.slice(5)}{" "}
            {callout.peak.count}회
          </p>
        )}
      </div>

      {isPending && <Loading label="활동 불러오는 중…" />}
      {isError && <ErrorNotice error={error} />}
      {data && data.scannedSessions === 0 && (
        <EmptyState
          title="아직 활동 기록이 없어요"
          hint="세션이 쌓이면 일별 활동이 잔디로 표시됩니다."
        />
      )}
      {data && data.scannedSessions > 0 && (
        <ActivityHeatmap data={data.activity} />
      )}
    </Card>
  );
}
