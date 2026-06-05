import { useEffect, useMemo, useState } from "react";
import type { Asset } from "@opspilot/shared-types";
import { InfoMark } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { refKey } from "../graph";
import type { ToolkitContext } from "./asset-toolkit";
import { NameCell, RelationCell, StatusCell, UsageCell } from "./asset-row-ui";

// 한 페이지(=한 번에 늘리는) 행 수. 자산이 많아도 목록이 무한히 길어지지 않게
// 점진 "더 보기" 방식으로 끊는다(가상 스크롤 의존성 없이 단순 slice).
const PAGE = 30;

// 목록(flat) 뷰 — 모든 자산을 평면 한 목록으로(그룹·중첩 없음, 훑기용).
// 정렬: 문제 🔴 → 미사용 → 정상, 그 안에서 이름. 관계는 별도 컬럼(일관 표기).
// 데이터·필터·상태는 부모(asset-toolkit) 소유 → 여기선 정렬·렌더만.
export function AssetFlatList({ ctx }: { ctx: ToolkitContext }) {
  const {
    projectId,
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

  // 점진 렌더: 처음엔 PAGE 개만, "더 보기"로 +PAGE.
  const [visibleCount, setVisibleCount] = useState(PAGE);
  // 필터/정렬(passesFilter·metaFor 참조 변화)·프로젝트 변경 시 처음으로 리셋.
  // (passesFilter 는 source/status/kind 필터에 따라, metaFor 는 정렬 입력에 따라
  //  참조가 바뀐다 → rows 가 새로 계산되면 처음 페이지부터 다시 본다.)
  useEffect(() => {
    setVisibleCount(PAGE);
  }, [projectId, passesFilter, metaFor]);

  const visibleRows = rows.slice(0, visibleCount);
  const remaining = rows.length - visibleRows.length;

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

      {visibleRows.map((asset) => {
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
            <StatusCell
              tone={meta.status.tone}
              label={meta.status.label}
              reason={meta.status.reason}
            />
            <span className="text-right text-sm">
              <UsageCell usage={meta.usage} />
            </span>
          </div>
        );
      })}

      {/* 점진 더 보기 — 남은 게 있을 때만. "표시 / 전체" 와 +PAGE 버튼. */}
      {remaining > 0 && (
        <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {visibleRows.length} / {rows.length}
          </span>
          <button
            type="button"
            onClick={() =>
              setVisibleCount((c) => Math.min(c + PAGE, rows.length))
            }
            className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
            aria-label={`자산 ${Math.min(PAGE, remaining)}개 더 보기 (남은 ${remaining}개)`}
          >
            남은 {remaining}개 더 보기
          </button>
        </div>
      )}
    </div>
  );
}
