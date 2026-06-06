import { useId } from "react";
import type {
  CompoundingApplyEvent,
  CompoundingTrendPoint,
} from "@opspilot/shared-types";
import { cn } from "../../../../lib/utils";

interface Props {
  points: CompoundingTrendPoint[];
  applyEvents: CompoundingApplyEvent[];
  // 이 세션 수 미만 버킷은 "표본 적음"으로 흐리게.
  lowSampleBelow?: number;
  width?: number;
  height?: number;
}

const WEEK_MS = 7 * 86_400_000;

export function CompoundingTrendChart({
  points,
  applyEvents,
  lowSampleBelow = 2,
  width = 720,
  height = 200,
}: Props) {
  const id = useId();
  const padL = 32; // y 라벨 공간
  const padR = 12;
  const padT = 10;
  const padB = 20; // x 라벨 공간
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const tMin = Date.parse(points[0]?.periodStart ?? "");
  const tMaxRaw = Date.parse(points[points.length - 1]?.periodStart ?? "");
  // 마지막 버킷도 한 주 폭을 갖게 +1주. 단일 점이면 폭 0 방지.
  const tMax = Number.isNaN(tMaxRaw) ? tMin : tMaxRaw + WEEK_MS;
  const span = tMax - tMin || 1;

  const x = (iso: string) => {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return padL;
    const clamped = Math.min(Math.max(t, tMin), tMax);
    return padL + ((clamped - tMin) / span) * innerW;
  };
  // rate 1 → 위(나쁨), rate 0 → 아래(좋음): 비율이 내려가면 선이 내려간다.
  const y = (rate: number) => padT + (1 - rate) * innerH;

  const drawn = points.filter(
    (p): p is CompoundingTrendPoint & { correctionRate: number } =>
      p.correctionRate !== null,
  );
  const linePts = drawn
    .map((p) => `${String(Math.round(x(p.periodStart)))},${String(Math.round(y(p.correctionRate)))}`)
    .join(" ");

  const gridRates = [0, 0.5, 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="img"
      aria-labelledby={id}
      className="max-w-full"
    >
      <title id={id}>프로젝트 정정비율 추세 (낮을수록 좋음)</title>

      {/* y 그리드 + 라벨 */}
      {gridRates.map((r) => (
        <g key={r} className="text-muted-foreground">
          <line
            x1={padL}
            x2={width - padR}
            y1={y(r)}
            y2={y(r)}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.3}
          />
          <text
            x={padL - 6}
            y={y(r) + 3}
            textAnchor="end"
            fontSize={9}
            fill="currentColor"
          >
            {`${String(Math.round(r * 100))}%`}
          </text>
        </g>
      ))}

      {/* apply 마커(세로선) */}
      {applyEvents.map((e, i) => (
        <line
          key={`${e.at}-${String(i)}`}
          x1={x(e.at)}
          x2={x(e.at)}
          y1={padT}
          y2={padT + innerH}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="3 2"
          className="text-info"
          opacity={0.7}
        >
          <title>{`개선 적용 · ${e.targetKind} ${e.targetPath} (${e.at.slice(0, 10)})`}</title>
        </line>
      ))}

      {/* 추세선 */}
      {drawn.length >= 2 && (
        <polyline
          points={linePts}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-foreground"
        />
      )}

      {/* 점(표본 적으면 흐리게) */}
      {drawn.map((p) => {
        const low = p.sessions < lowSampleBelow;
        return (
          <circle
            key={p.periodStart}
            cx={x(p.periodStart)}
            cy={y(p.correctionRate)}
            r={low ? 2 : 3}
            className={cn(low ? "text-muted-foreground" : "text-foreground")}
            fill="currentColor"
            opacity={low ? 0.45 : 1}
          >
            <title>{`${p.periodStart} · 정정 ${String(p.corrections)}/${String(p.invocations)} (${String(Math.round(p.correctionRate * 100))}%) · 세션 ${String(p.sessions)}${low ? " · 표본 적음" : ""}`}</title>
          </circle>
        );
      })}

      {/* x 라벨(처음·끝) */}
      {drawn.length > 0 && (
        <g className="text-muted-foreground">
          <text x={padL} y={height - 6} textAnchor="start" fontSize={9} fill="currentColor">
            {drawn[0]?.periodStart.slice(5)}
          </text>
          <text x={width - padR} y={height - 6} textAnchor="end" fontSize={9} fill="currentColor">
            {drawn[drawn.length - 1]?.periodStart.slice(5)}
          </text>
        </g>
      )}
    </svg>
  );
}
