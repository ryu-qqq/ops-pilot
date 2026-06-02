import { cn } from "../../../../lib/utils";

// 자산이 쓰인 프로젝트(cwd) 분포 점. cwd 해시 → 고정 팔레트(asset-health TONE 재사용,
// 신색 금지). 최대 5점 + "N곳". 점 hover = native title(basename · count).
interface Cwd {
  cwd: string;
  count: number;
}
interface Props {
  cwds: Cwd[];
  // 실제 프로젝트 수. 점은 top-5 캡이지만 "N곳"은 전체 수를 보여준다(분포 폭 왜곡 방지).
  projectCount: number;
}

// asset-health-dashboard TONE 과 같은 색군(emerald/slate/amber/red) — 신색 추가 금지.
const PALETTE = [
  "bg-emerald-500",
  "bg-slate-400",
  "bg-amber-500",
  "bg-red-500",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function basename(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

export function ProjectDots({ cwds, projectCount }: Props) {
  if (cwds.length === 0)
    return <span className="text-xs text-muted-foreground">—</span>;
  const shown = cwds.slice(0, 5);

  return (
    <span className="inline-flex items-center gap-1">
      {shown.map((c) => (
        <span
          key={c.cwd}
          className={cn(
            "inline-block h-2 w-2 shrink-0 rounded-full",
            PALETTE[hash(c.cwd) % PALETTE.length],
          )}
          title={`${basename(c.cwd)} · ${String(c.count)}회`}
        />
      ))}
      <span className="ml-0.5 text-xs tabular-nums text-muted-foreground">
        {projectCount}곳
      </span>
    </span>
  );
}
