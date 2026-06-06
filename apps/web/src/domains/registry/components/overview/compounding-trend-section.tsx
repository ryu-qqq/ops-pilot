import { Badge } from "../../../../components/ui/badge";
import { Card } from "../../../../components/ui/card";
import { EmptyState, ErrorNotice, Loading } from "../../../../lib/ui";
import { useCompoundingTrend } from "../../use-registry";
import { CompoundingTrendChart } from "./compounding-trend-chart";

interface Props {
  projectId: string | null;
}

// 개요 최상단 — "내 하네스 엔지니어링이 복리가 되고 있나"(이 프로젝트).
// 정정비율(정정왕복÷발화) 주별 추세 + 개선안 적용 마커. ⚠️ reference signal.
export function CompoundingTrendSection({ projectId }: Props) {
  const { data, isPending, isError, error } = useCompoundingTrend(projectId);

  return (
    <Card className="space-y-3 border-l-2 border-primary/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">하네스 복리 추세</h2>
          <Badge variant="outline" className="text-[10px]">
            이 프로젝트
          </Badge>
          <span className="text-xs text-muted-foreground">
            정정비율 · 주별 · 낮을수록 좋음
          </span>
        </div>
        {data && (
          <p className="text-xs text-muted-foreground tabular-nums">
            세션 {data.totalSessions} · 발화 {data.totalInvocations} · 적용 마커{" "}
            {data.applyEvents.length}
          </p>
        )}
      </div>

      {projectId === null && (
        <EmptyState
          title="프로젝트를 고르면 복리 추세가 보여요"
          hint="아래 '자산 헬스'에서도 같은 프로젝트가 선택됩니다."
        />
      )}
      {projectId !== null && isPending && <Loading label="추세 불러오는 중…" />}
      {isError && <ErrorNotice error={error} />}
      {data && data.points.length < 2 && (
        <EmptyState
          title="추세를 그리기엔 데이터가 적어요"
          hint="작업 세션이 여러 주에 걸쳐 쌓이면 정정비율 추세가 그려집니다."
        />
      )}
      {data && data.points.length >= 2 && (
        <CompoundingTrendChart
          points={data.points}
          applyEvents={data.applyEvents}
        />
      )}

      {data && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {data.signalNote}
        </p>
      )}
    </Card>
  );
}
