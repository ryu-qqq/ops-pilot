import { Bot } from "lucide-react";
import type { AutoIngestConfig } from "@opspilot/shared-types";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent } from "../../../components/ui/card";
import { cn } from "../../../lib/utils";
import { InfoMark, Loading } from "../../../lib/ui";

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
  return flowStages.find((s) => s.key === stageKey)?.match(status) ?? false;
}

function fmtInterval(intervalMs: number): string {
  if (intervalMs === 0) return "부팅 1회";
  const min = Math.round(intervalMs / 60000);
  return `${String(min)}분`;
}

/**
 * 자동 ingest 상태 칩(ADR 0004, 읽기 전용). 본문은 "자동 평가 켜짐/꺼짐"으로 평이하게,
 * 주기·건수 등 상세는 ⓘ 툴팁으로 숨긴다(전문용어 표면 노출 제거).
 * env(OPS_AUTO_INGEST) 제어라 토글 버튼은 두지 않는다 — 상태만.
 */
function AutoIngestStatusChip({ config }: { config: AutoIngestConfig }) {
  if (!config.enabled) {
    return (
      <Badge
        variant="secondary"
        className="ml-auto gap-1.5 px-2 py-1 font-medium text-muted-foreground"
      >
        <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />
        자동 평가 꺼짐
        <InfoMark
          label="자동 평가"
          help="새 커밋을 자동으로 평가하는 기능이 꺼져 있습니다. 서버 관리자 설정에서 켜고 끕니다 — 이 화면에선 바꿀 수 없어요."
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
        help={`서버 관리자 설정에서 켜고 끕니다 — 이 화면에선 바꿀 수 없어요. 켜져 있으면 새 커밋을 ${fmtInterval(config.intervalMs)}마다 최대 ${String(config.batch)}건씩 자동 평가합니다.`}
      />
    </Badge>
  );
}

/** 파이프라인 흐름 띠 — ingest status 집계 + 자동 ingest 상태 칩(ADR 0004). */
export function PipelineFlowBand({
  statuses,
  autoIngestConfig,
  isPending,
  activeStatus,
  onToggleStatus,
}: {
  statuses: string[];
  autoIngestConfig: AutoIngestConfig | undefined;
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
          <Badge variant="destructive" className="ml-1">
            실패 {failedCount}
          </Badge>
        )}
        {autoIngestConfig !== undefined && <AutoIngestStatusChip config={autoIngestConfig} />}
      </CardContent>
    </Card>
  );
}
