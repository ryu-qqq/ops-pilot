import { useId, useMemo } from "react";
import { cn } from "../../../../lib/utils";

// 14일 일별 호출수(과거→오늘, 빈날 0) → 단일 polyline 스파크라인.
// 추세 판정: 후반7합 vs 전반7합 → >+10% up / <-10% down / else flat.
// 색은 currentColor(토큰 className)로만 — stroke를 text-* 로 인코딩.
interface Props {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
}

type Trend = "up" | "down" | "flat";

function trendOf(points: number[]): Trend {
  if (points.length < 2) return "flat";
  const mid = Math.floor(points.length / 2);
  const first = points.slice(0, mid).reduce((a, b) => a + b, 0);
  const second = points.slice(mid).reduce((a, b) => a + b, 0);
  if (first === 0) return second > 0 ? "up" : "flat";
  const delta = (second - first) / first;
  if (delta > 0.1) return "up";
  if (delta < -0.1) return "down";
  return "flat";
}

const TREND_COLOR: Record<Trend, string> = {
  up: "text-success",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

export function Sparkline({
  points,
  width = 96,
  height = 24,
  className,
}: Props) {
  const id = useId();
  const trend = useMemo(() => trendOf(points), [points]);

  // 데이터 없음(전부 0 또는 빈 배열) → "—" (점진 향상)
  const hasData = points.some((p) => p > 0);
  if (!hasData) {
    return (
      <span
        className="inline-block text-center text-muted-foreground"
        style={{ width, height }}
        title="최근 14일 데이터 없음"
      >
        —
      </span>
    );
  }

  const max = Math.max(...points, 1);
  const n = points.length;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = n > 1 ? innerW / (n - 1) : 0;
  const coords = points
    .map((v, i) => {
      const x = pad + step * i;
      const y = pad + innerH - (v / max) * innerH;
      return `${String(Math.round(x * 100) / 100)},${String(Math.round(y * 100) / 100)}`;
    })
    .join(" ");

  return (
    <svg
      className={cn(TREND_COLOR[trend], className)}
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="img"
      aria-labelledby={id}
      preserveAspectRatio="none"
    >
      <title id={id}>{`최근 14일 추세 (${trend})`}</title>
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
