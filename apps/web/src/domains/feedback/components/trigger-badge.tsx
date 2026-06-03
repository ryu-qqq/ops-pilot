import { Bot, Hand } from "lucide-react";
import type { IngestTrigger } from "@opspilot/shared-types";
import { Badge } from "../../../components/ui/badge";
import { cn } from "../../../lib/utils";

// ADR 0004: ingest 진입 provenance(auto=주기 스캔 / manual=수동 라우트) 단일 표기.
// 카드·드릴다운·목록이 같은 색·라벨·아이콘을 쓰도록 여기 한 곳에서만 정의한다.
// 핵심은 "auto 를 눈에 띄게" — auto=info 톤 강조, manual=muted outline.
const triggerConfig: Record<IngestTrigger, { variant: "info" | "outline"; label: string; Icon: typeof Bot }> = {
  auto: { variant: "info", label: "자동", Icon: Bot },
  manual: { variant: "outline", label: "수동", Icon: Hand },
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
          ? "자동 ingest — 주기 스캔이 만든 번들 (ADR 0004)"
          : "수동 ingest — 사람이 직접 만든 번들"
      }
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </Badge>
  );
}
