import type {
  Asset,
  AssetKind,
  AssetSource,
  AssetUsage,
} from "@opspilot/shared-types";
import { cn } from "../../../lib/utils";
import type { StatusTone } from "../graph";

// 툴킷 목록·관계 두 뷰가 공유하는 행 표현 단위(배지·셀·점).
// 표현(presentation)만 — 데이터 패칭·상태 계산은 graph.ts / use-registry 가 소유.

// 출처 필터: 전체 / crew(공통) / 전용. unknown(re-sync 전 과도기)은 '전체'에만.
export type SourceFilter = "all" | "crew" | "project-local";
// 상태 필터: 전체 / 문제(🔴) / 미사용(neverUsed) / 고아(독립 agent).
export type StatusFilter = "all" | "problems" | "unused" | "orphan";

// 출처 배지 — crew(공통, 삭제 주의) vs 전용. unknown 은 배지 없음(노이즈 0).
const SOURCE_BADGE: Record<string, { label: string; title: string }> = {
  crew: {
    label: "crew",
    title: "agent-crew 공통 자산 — 다른 프로젝트도 사용. prune(삭제) 주의.",
  },
  "project-local": {
    label: "전용",
    title: "이 프로젝트 전용 자산.",
  },
};
export function SourceBadge({ source }: { source: AssetSource }) {
  const meta = SOURCE_BADGE[source];
  if (!meta) return null; // unknown → 표시 없음
  return (
    <span
      className="shrink-0 rounded border px-1 text-[9px] text-muted-foreground"
      title={meta.title}
    >
      {meta.label}
    </span>
  );
}

const KIND_LABEL: Record<string, string> = {
  agent: "agent",
  skill: "skill",
  command: "cmd",
  cursor_skill: "cursor·skill",
  cursor_command: "cursor·cmd",
  cursor_rule: "cursor·rule",
};

// kind 색 배지 — skill=violet / agent=cyan / command·cursor=blue (토큰 className, hex 금지).
const KIND_TONE: Record<string, string> = {
  agent: "text-cyan-600 border-cyan-500/35 dark:text-cyan-400",
  skill: "text-violet-600 border-violet-500/35 dark:text-violet-400",
  command: "text-blue-600 border-blue-500/35 dark:text-blue-400",
  cursor_skill: "text-blue-600 border-blue-500/35 dark:text-blue-400",
  cursor_command: "text-blue-600 border-blue-500/35 dark:text-blue-400",
  cursor_rule: "text-blue-600 border-blue-500/35 dark:text-blue-400",
};
export function KindBadge({ kind }: { kind: AssetKind }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-1 text-[9px] uppercase tracking-wide",
        KIND_TONE[kind] ?? "text-muted-foreground",
      )}
    >
      {KIND_LABEL[kind] ?? kind}
    </span>
  );
}

export const STATUS_DOT: Record<StatusTone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  none: "bg-slate-400",
};
export const SUMMARY_DOT = {
  amber: "bg-amber-500",
  slate: "bg-slate-400",
  red: "bg-red-500",
} as const;

export function Dot({ className }: { className: string }) {
  return (
    <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)} />
  );
}

// 상태 셀 — 무상 구조 신호 롤업(품질 아님). 점 + 라벨.
export function StatusCell({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <Dot className={STATUS_DOT[tone]} />
      <span
        className={cn(
          tone === "red" && "text-red-600 dark:text-red-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "none" && "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </span>
  );
}

// 사용 셀 — 이 프로젝트 호출 수(우측 정렬, tabular). 미추적이면 —.
export function UsageCell({ usage }: { usage?: AssetUsage }) {
  if (!usage || !usage.supported)
    return <span className="text-muted-foreground">—</span>;
  const title =
    usage.inProjectCount > 0
      ? `이 프로젝트 ${String(usage.inProjectCount)}회 · 전체 ${String(usage.totalCount)}회`
      : usage.totalCount > 0
        ? `이 프로젝트 0회 · 다른 곳 ${String(usage.totalCount)}회 (공용 crew 자산일 수 있음)`
        : "어디서도 호출된 적 없음 (prune 후보)";
  return (
    <span className="tabular-nums" title={title}>
      {usage.inProjectCount}
    </span>
  );
}

// 행 본문 한 줄(트리 부모·자식·평면 행 공통) — 이름 truncate + 고정 높이.
export interface RowMeta {
  asset: Asset;
  usage?: AssetUsage;
  status: { tone: StatusTone; label: string };
  errorMessage?: string; // 형식 에러일 때만 인라인 메시지
  shareLabel?: string; // ⛓ N 호출 / ↩ N 스킬 / 독립 · 단독 사용중
  shareTitle?: string;
}

export function NameCell({ meta }: { meta: RowMeta }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      <KindBadge kind={meta.asset.kind} />
      <span className="truncate font-medium" title={meta.asset.name}>
        {meta.asset.name}
      </span>
      <SourceBadge source={meta.asset.source} />
      {meta.shareLabel != null && (
        <span
          className="shrink-0 rounded border px-1 text-[9px] text-muted-foreground"
          title={meta.shareTitle}
        >
          {meta.shareLabel}
        </span>
      )}
      {meta.errorMessage != null && (
        // 컴팩트 — 좁은 행에서 다른 배지/컬럼과 겹치지 않게. 상세(무엇이 틀렸나)는 형식 탭.
        <span
          className="shrink-0 whitespace-nowrap rounded border border-red-500/40 px-1 text-[9px] text-red-600 dark:text-red-400"
          title={`형식 ${meta.errorMessage} — 상세는 형식 탭에서 확인`}
        >
          ⚠ {meta.errorMessage}
        </span>
      )}
    </span>
  );
}
