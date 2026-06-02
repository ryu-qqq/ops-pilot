import { useMemo } from "react";
import { cn } from "../../../../lib/utils";

// 전역 활동 잔디 — 최근 84일(12주×7일) 일별 총 호출수.
// data: {date,count}[] 과거→오늘, 빈날 0, 길이 84 가정(짧으면 그대로 채움).
// 강도 5단계 = 분위수 기반. 0회=bg-muted, 이후 --success 알파(/20·/40·/65·solid).
interface DayCell {
  date: string;
  count: number;
}
interface Props {
  data: DayCell[];
}

// 0회 셀은 항상 단계 0. >0 셀들의 양수 분포 분위수로 1~4 배정 → 적은 데이터도 대비 확보.
function buildIntensity(data: DayCell[]): (count: number) => number {
  const positives = data
    .map((d) => d.count)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  if (positives.length === 0) return () => 0;
  // 분위수 경계 (25/50/75%) — positives.length >= 1 보장(위 가드).
  const max = positives[positives.length - 1] ?? 0;
  const q = (p: number) =>
    positives[
      Math.min(positives.length - 1, Math.floor(p * positives.length))
    ] ?? max;
  const q1 = q(0.25);
  const q2 = q(0.5);
  const q3 = q(0.75);
  return (count: number) => {
    if (count <= 0) return 0;
    if (count <= q1) return 1;
    if (count <= q2) return 2;
    if (count <= q3) return 3;
    return 4;
  };
}

const LEVEL_CLASS = [
  "bg-muted",
  "bg-success/20",
  "bg-success/40",
  "bg-success/65",
  "bg-success",
];

export function ActivityHeatmap({ data }: Props) {
  const intensity = useMemo(() => buildIntensity(data), [data]);

  return (
    <div
      className="grid grid-flow-col grid-rows-7 gap-1"
      style={{ gridAutoColumns: "minmax(0, 1fr)" }}
      role="img"
      aria-label="최근 84일 활동 잔디"
    >
      {data.map((d) => (
        <div
          key={d.date}
          className={cn(
            "aspect-square rounded-[2px]",
            LEVEL_CLASS[intensity(d.count)],
          )}
          title={`${d.date} · ${String(d.count)}회`}
        />
      ))}
    </div>
  );
}
