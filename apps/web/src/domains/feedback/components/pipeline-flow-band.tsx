import { Bot } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent } from "../../../components/ui/card";
import { cn } from "../../../lib/utils";
import { InfoMark, Loading } from "../../../lib/ui";
import { useSettings } from "../../settings/use-settings";

// 파이프라인 흐름 띠 — IngestBundleStatus → 단계. pending=대기, evaluating=평가 중,
// reviewing=리뷰 중, done/reviewed=검토됨. failed 는 별도 단계로 따로 센다.
const flowStages: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: "pending", label: "대기", match: (s) => s === "pending" },
  { key: "evaluating", label: "평가 중", match: (s) => s === "evaluating" },
  { key: "reviewing", label: "리뷰 중", match: (s) => s === "reviewing" },
  { key: "reviewed", label: "검토됨", match: (s) => s === "done" || s === "reviewed" },
];

/**
 * stage.key(pending/evaluating/reviewing/reviewed)가 ingest status 에 매칭되는지.
 * 목록 필터(work-list-view)와 흐름 띠 카운트가 같은 기준을 쓰도록 단계 match 를 재사용한다.
 */
export function matchStageKey(stageKey: string, status: string): boolean {
  // failed 는 흐름 단계가 아니라 별도 terminal — flowStages 밖에서 매칭한다.
  if (stageKey === "failed") return status === "failed";
  return flowStages.find((s) => s.key === stageKey)?.match(status) ?? false;
}

/**
 * 자동 평가 상태 칩(읽기 전용). autoEval setting 을 "켜짐/꺼짐"으로 표시한다 —
 * 커밋 유입(ingest 스캔)은 항상 켜 두고, 그 커밋을 자동으로 평가할지만 토글한다.
 * 토글은 헤더 톱니(설정 다이얼로그)에서 한다 — 안내만 ⓘ 툴팁에 둔다.
 */
function AutoEvalStatusChip() {
  const { data } = useSettings();
  // 설정 로딩 전엔 칩을 숨겨 깜빡임을 막는다.
  if (data === undefined) return null;

  if (!data.autoEval) {
    return (
      <Badge
        variant="secondary"
        className="ml-auto gap-1.5 px-2 py-1 font-medium text-muted-foreground"
      >
        <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />
        자동 평가 꺼짐
        <InfoMark
          label="자동 평가"
          help="새 커밋은 작업 목록에 대기로 쌓입니다 — 평가할 작업을 직접 골라 실행하세요. 자동 평가는 우측 상단 설정(톱니)에서 켜고 끕니다."
        />
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="ml-auto gap-1.5 px-2 py-1 font-medium">
      <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />
      자동 평가 켜짐
      <InfoMark
        label="자동 평가"
        help="새로 들어온 커밋을 자동으로 평가합니다. 우측 상단 설정(톱니)에서 켜고 끕니다."
      />
    </Badge>
  );
}

/** 파이프라인 흐름 띠 — ingest status 집계 + 자동 평가 상태 칩(autoEval setting). */
export function PipelineFlowBand({
  statuses,
  isPending,
  activeStatus,
  onToggleStatus,
}: {
  statuses: string[];
  isPending: boolean;
  /** 선택된 단계 stage.key(목록 필터). null/undefined 면 필터 없음. */
  activeStatus?: string | null;
  /** 단계 클릭 시 호출 — 같은 키 재클릭은 호출부에서 해제로 처리. */
  onToggleStatus?: (stageKey: string) => void;
}) {
  const failedCount = statuses.filter((s) => s === "failed").length;
  // 초기 로딩 중 0/0/0/0 으로 보이면 "진짜 빈 파이프라인"과 구분이 안 됨 → 로딩 표시.
  if (isPending) {
    return (
      <Card className="border-border/80">
        <CardContent className="py-3">
          <Loading label="파이프라인 흐름 불러오는 중…" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-border/80">
      <CardContent className="flex flex-wrap items-center gap-2 py-3">
        {flowStages.map((stage, i) => {
          const count = statuses.filter((s) => stage.match(s)).length;
          const active = activeStatus === stage.key;
          const interactive = onToggleStatus !== undefined;
          return (
            <div key={stage.key} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!interactive}
                onClick={interactive ? () => onToggleStatus(stage.key) : undefined}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-1.5 transition-colors",
                  active
                    ? "border-primary bg-accent"
                    : "border-border/70 bg-muted/30",
                  interactive && "cursor-pointer hover:border-border hover:bg-accent/50",
                  !interactive && "cursor-default",
                )}
                title={interactive ? `${stage.label} 작업만 보기 (재클릭 해제)` : undefined}
              >
                <span
                  className={cn(
                    "text-xs font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {stage.label}
                </span>
                <span className="text-sm font-semibold tabular-nums">{count}</span>
              </button>
              {i < flowStages.length - 1 && (
                <span className="text-muted-foreground/50" aria-hidden>
                  →
                </span>
              )}
            </div>
          );
        })}
        {failedCount > 0 && (
          <button
            type="button"
            disabled={onToggleStatus === undefined}
            onClick={onToggleStatus ? () => onToggleStatus("failed") : undefined}
            aria-pressed={activeStatus === "failed"}
            className={cn(
              "ml-1 flex items-center gap-2 rounded-md border px-3 py-1.5 transition-colors",
              activeStatus === "failed"
                ? "border-destructive bg-destructive/10"
                : "border-destructive/40 bg-destructive/5",
              onToggleStatus !== undefined && "cursor-pointer hover:bg-destructive/10",
            )}
            title={onToggleStatus ? "실패 작업만 보기 (재클릭 해제)" : undefined}
          >
            <span className="text-xs font-medium text-destructive">실패</span>
            <span className="text-sm font-semibold tabular-nums text-destructive">
              {failedCount}
            </span>
          </button>
        )}
        <AutoEvalStatusChip />
      </CardContent>
    </Card>
  );
}
