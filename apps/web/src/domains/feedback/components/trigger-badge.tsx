import { Bot, GitPullRequest, Hand } from "lucide-react";
import type { IngestTrigger } from "@opspilot/shared-types";
import { Badge } from "../../../components/ui/badge";
import { cn } from "../../../lib/utils";

// ingest 진입 provenance(auto=주기 스캔 / manual=수동 라우트) 단일 표기.
// 카드·드릴다운·목록이 같은 색·라벨·아이콘을 쓰도록 여기 한 곳에서만 정의한다.
// auto=차분한 회색 톤(secondary) — badge-variant.ts 의 triggerVariant 와 톤 통일(흰색 탈피).
const triggerConfig: Record<IngestTrigger, { variant: "secondary" | "outline"; label: string; Icon: typeof Bot }> = {
  auto: { variant: "secondary", label: "자동", Icon: Bot },
  manual: { variant: "outline", label: "수동", Icon: Hand },
  pr_review: { variant: "outline", label: "PR리뷰", Icon: GitPullRequest },
};

export function TriggerBadge({
  trigger,
  className,
}: {
  trigger: IngestTrigger;
  className?: string;
}) {
  const { variant, label, Icon } = triggerConfig[trigger];
  return (
    <Badge
      variant={variant}
      className={cn(
        "gap-1 px-1.5 py-0 text-[10px] font-medium",
        trigger === "manual" && "text-muted-foreground",
        className,
      )}
      title={
        trigger === "auto"
          ? "사람 개입 없이 30분 주기 스캔이 자동으로 만든 작업"
          : "사람이 직접 만든 작업"
      }
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </Badge>
  );
}
