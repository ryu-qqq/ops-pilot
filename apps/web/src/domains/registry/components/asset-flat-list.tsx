import { useMemo } from "react";
import type { Asset } from "@opspilot/shared-types";
import { InfoMark } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { isOrphanAgent, refKey } from "../graph";
import type { ToolkitContext } from "./asset-toolkit";
import { NameCell, StatusCell, UsageCell } from "./asset-row-ui";

// 목록(flat) 뷰 — 모든 자산을 평면 한 목록으로(그룹·중첩 없음, 훑기용).
// 정렬: 문제 🔴 → 미사용 → 정상, 그 안에서 이름. 관계는 이름 옆 가벼운 힌트만.
// 데이터·필터·상태는 부모(asset-toolkit) 소유 → 여기선 정렬·렌더만.
export function AssetFlatList({ ctx }: { ctx: ToolkitContext }) {
  const {
    assets,
    selectedId,
    select,
    metaFor,
    passesFilter,
    graphMap,
    referencingSkillCount,
    onRowHover,
    hlClass,
  } = ctx;

  const rows = useMemo(() => {
    // 정렬 우선순위: 문제(red)=0 → 미사용(amber+neverUsed)=1 → 정상=2.
    const rank = (asset: Asset): number => {
      const meta = metaFor(asset);
      if (meta.status.tone === "red") return 0;
      if (meta.usage?.neverUsed ?? false) return 1;
      return 2;
    };
    return assets
      .filter(passesFilter)
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [assets, passesFilter, metaFor]);

  // 관계 힌트(가벼움): skill=⛓N 호출 / agent=↩N 스킬 or 독립 / 그 외 없음.
  const hintFor = (
    asset: Asset,
  ): { label: string; title: string } | undefined => {
    const g = graphMap.get(refKey(asset.kind, asset.name));
    if (asset.kind === "skill") {
      const calls = g?.references.length ?? 0;
      if (calls > 0)
        return {
          label: `⛓ ${String(calls)}`,
          title: `이 스킬이 본문에서 참조(호출)하는 자산 ${String(calls)}개 — 휴리스틱`,
        };
      return undefined;
    }
    if (asset.kind === "agent") {
      if (isOrphanAgent(asset, g))
        return { label: "독립", title: "어떤 스킬·커맨드도 이 에이전트를 호출 안 함." };
      const skillCount = referencingSkillCount(asset);
      if (skillCount > 0)
        return {
          label: `↩ ${String(skillCount)}`,
          title: `${String(skillCount)}개 스킬이 이 에이전트를 호출.`,
        };
    }
    return undefined;
  };

  const ROW_GRID = "grid grid-cols-[1fr_92px_64px] items-center gap-x-3";

  return (
    <div className="overflow-hidden rounded-md border">
      {/* 컬럼 헤더 */}
      <div
        className={cn(
          ROW_GRID,
          "border-b bg-muted/50 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground",
        )}
      >
        <span>자산</span>
        <span className="inline-flex items-center gap-1">
          상태
          <InfoMark
            help="무상 구조 신호 롤업 — 형식·사용·연결. 출력 품질(eval)과 별개."
            label="상태(구조 신호)"
          />
        </span>
        <span className="text-right">사용</span>
      </div>

      {rows.length === 0 && (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
          해당 자산 없음.
        </p>
      )}

      {rows.map((asset) => {
        const key = refKey(asset.kind, asset.name);
        const meta = metaFor(asset);
        const hint = hintFor(asset);
        return (
          <div
            key={asset.id}
            className={cn(
              ROW_GRID,
              "h-10 cursor-pointer border-t px-3 transition-colors hover:bg-accent/50",
              asset.id === selectedId && "bg-primary/10",
              hlClass(key),
            )}
            onMouseEnter={() => onRowHover(key)}
            onMouseLeave={() => onRowHover(null)}
            onClick={() => select(asset.id)}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <NameCell meta={meta} />
              {hint != null && (
                <span
                  className="shrink-0 rounded border px-1 text-[9px] text-muted-foreground"
                  title={hint.title}
                >
                  {hint.label}
                </span>
              )}
            </span>
            <StatusCell tone={meta.status.tone} label={meta.status.label} />
            <span className="text-right text-sm">
              <UsageCell usage={meta.usage} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
