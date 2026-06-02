import { useMemo } from "react";
import type { Asset } from "@opspilot/shared-types";
import { InfoMark } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { refKey } from "../graph";
import type { ToolkitContext } from "./asset-toolkit";
import { NameCell, RelationCell, StatusCell, UsageCell } from "./asset-row-ui";

// 목록(flat) 뷰 — 모든 자산을 평면 한 목록으로(그룹·중첩 없음, 훑기용).
// 정렬: 문제 🔴 → 미사용 → 정상, 그 안에서 이름. 관계는 별도 컬럼(일관 표기).
// 데이터·필터·상태는 부모(asset-toolkit) 소유 → 여기선 정렬·렌더만.
export function AssetFlatList({ ctx }: { ctx: ToolkitContext }) {
  const {
    assets,
    selectedId,
    select,
    metaFor,
    relationFor,
    passesFilter,
    onRowHover,
    hlClass,
    showRelation,
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

  // compact(분할 모드)면 관계 컬럼 숨김 → 이름 폭 확보.
  const ROW_GRID = showRelation
    ? "grid grid-cols-[1fr_110px_92px_64px] items-center gap-x-3"
    : "grid grid-cols-[1fr_92px_64px] items-center gap-x-3";

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
        {showRelation && <span>관계</span>}
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
            <NameCell meta={meta} />
            {showRelation && <RelationCell relation={relationFor(asset)} />}
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
