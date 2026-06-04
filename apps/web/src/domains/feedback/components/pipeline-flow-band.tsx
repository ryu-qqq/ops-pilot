import { Bot } from "lucide-react";
import type { AutoIngestConfig } from "@opspilot/shared-types";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent } from "../../../components/ui/card";
import { InfoMark, Loading } from "../../../lib/ui";

// 파이프라인 흐름 띠 — IngestBundleStatus → 단계. pending=대기, evaluating=평가 중,
// reviewing=리뷰 중, done/reviewed=검토됨. failed 는 별도 단계로 따로 센다.
const flowStages: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: "pending", label: "대기", match: (s) => s === "pending" },
  { key: "evaluating", label: "평가 중", match: (s) => s === "evaluating" },
  { key: "reviewing", label: "리뷰 중", match: (s) => s === "reviewing" },
  { key: "reviewed", label: "검토됨", match: (s) => s === "done" || s === "reviewed" },
];

function fmtInterval(intervalMs: number): string {
  if (intervalMs === 0) return "부팅 1회";
  const min = Math.round(intervalMs / 60000);
  return `${String(min)}분`;
}

/**
 * 자동 ingest 상태 칩(ADR 0004, 읽기 전용). enabled=ON 이면 주기·batch 를 success 톤으로,
 * OFF 면 muted + 켜는 법 안내. env(OPS_AUTO_INGEST) 제어라 토글 버튼은 두지 않는다 — 상태만.
 */
function AutoIngestStatusChip({ config }: { config: AutoIngestConfig }) {
  if (!config.enabled) {
    return (
      <Badge
        variant="secondary"
        className="ml-auto gap-1.5 px-2 py-1 font-medium text-muted-foreground"
      >
        <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />
        자동 ingest OFF
        <InfoMark
          label="자동 ingest"
          help="OPS_AUTO_INGEST=1 로 켜집니다(서버 env). 켜면 주기 스캔이 새 커밋을 자동 ingest 합니다."
        />
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="ml-auto gap-1.5 px-2 py-1 font-medium">
      <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />
      자동 ingest ON · {fmtInterval(config.intervalMs)} · batch {config.batch}
    </Badge>
  );
}

/** 파이프라인 흐름 띠 — ingest status 집계 + 자동 ingest 상태 칩(ADR 0004). */
export function PipelineFlowBand({
  statuses,
  autoIngestConfig,
  isPending,
}: {
  statuses: string[];
  autoIngestConfig: AutoIngestConfig | undefined;
  isPending: boolean;
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
          return (
            <div key={stage.key} className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">{stage.label}</span>
                <span className="text-sm font-semibold tabular-nums">{count}</span>
              </div>
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
