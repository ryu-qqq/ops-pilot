import { Card } from "../../../../components/ui/card";
import { cn } from "../../../../lib/utils";

// 헬스 요약 stat 카드 — 큰 숫자 + 라벨. tone 색은 기존 헬스(amber/red)와 일치.
// 값 0이면 톤과 무관하게 muted(시선 분산 방지).
type StatTone = "default" | "warn" | "danger" | "muted";

interface Props {
  label: string;
  value: number;
  tone?: StatTone;
  title?: string;
}

const TONE_CLASS: Record<StatTone, string> = {
  default: "text-foreground",
  warn: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  muted: "text-muted-foreground",
};

export function StatCard({ label, value, tone = "default", title }: Props) {
  const effectiveTone: StatTone = value === 0 ? "muted" : tone;
  return (
    <Card className="space-y-1 p-3" title={title}>
      <div
        className={cn(
          "text-2xl font-bold tabular-nums",
          TONE_CLASS[effectiveTone],
        )}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}
