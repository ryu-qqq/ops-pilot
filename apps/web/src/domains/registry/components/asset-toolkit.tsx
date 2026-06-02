import { useCallback, useMemo, useState } from "react";
import type { Asset, AssetUsage } from "@opspilot/shared-types";
import { EmptyState, ErrorNotice, InfoMark, Loading } from "../../../lib/ui";
import { usePersistedState } from "../../../lib/use-persisted-state";
import { cn } from "../../../lib/utils";
import { computeAssetHealthSummary } from "../asset-health-summary";
import {
  computeAssetStatus,
  isOrphanAgent,
  refKey,
  type GraphItem,
  type LintRow,
} from "../graph";
import {
  useAssetGraph,
  useAssets,
  useProjectAssetLint,
  useProjectAssetUsage,
} from "../use-registry";
import {
  Dot,
  SUMMARY_DOT,
  type RowMeta,
  type SourceFilter,
  type StatusFilter,
} from "./asset-row-ui";
import { AssetFlatList } from "./asset-flat-list";
import { AssetRelationTree } from "./asset-relation-tree";

interface Props {
  projectId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

// 목록(flat) = 기본 · 관계(tree) = 토글. sessionStorage 로 기억.
type ToolkitView = "list" | "tree";

// 두 뷰가 공유하는 파생 헬퍼·맵 묶음. 데이터 소유는 여기(부모), 뷰는 표현만.
export interface ToolkitContext {
  assets: Asset[];
  selectedId: string | null;
  select: (id: string) => void;
  metaFor: (asset: Asset) => RowMeta;
  passesFilter: (asset: Asset) => boolean;
  graphMap: Map<string, GraphItem>;
  assetByKey: Map<string, Asset>;
  referencingSkillCount: (asset: Asset) => number;
  highlightKey: string | null;
  onRowHover: (key: string | null) => void;
  hlClass: (key: string) => string;
}

// 모듈 최상위 — 렌더 본문 안에서 정의하면 매 렌더마다 새 컴포넌트 타입이 돼 remount된다.
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

export function AssetToolkit({ projectId, selectedId, onSelect }: Props) {
  const { data: assets, isPending, isError, error } = useAssets(projectId);
  const { data: usage } = useProjectAssetUsage(projectId);
  const { data: lint } = useProjectAssetLint(projectId);
  const { data: graph } = useAssetGraph(projectId);

  const [view, setView] = usePersistedState<ToolkitView>(
    "opspilot.toolkit.view",
    "list",
  );
  const [status, setStatus] = useState<StatusFilter>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  // hover/선택된 (kind:name) — 같은 자산 모든 등장 위치 하이라이트.
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  const usageMap = useMemo(() => {
    const m = new Map<string, AssetUsage>();
    for (const u of usage?.assets ?? []) m.set(refKey(u.kind, u.name), u);
    return m;
  }, [usage]);
  const lintMap = useMemo(() => {
    const m = new Map<string, LintRow>();
    for (const l of lint?.items ?? []) m.set(l.assetId, l);
    return m;
  }, [lint]);
  const graphMap = useMemo(() => {
    const m = new Map<string, GraphItem>();
    for (const g of graph?.items ?? []) m.set(refKey(g.kind, g.name), g);
    return m;
  }, [graph]);
  // 자산을 (kind:name) 로 — references 가 가리키는 등록 자산 해석용.
  const assetByKey = useMemo(() => {
    const m = new Map<string, Asset>();
    for (const a of assets ?? []) m.set(refKey(a.kind, a.name), a);
    return m;
  }, [assets]);

  // 첫 형식 에러 메시지 — 에러일 때만 인라인. lint summary 엔 메시지가 없어 카운트로 대체.
  const errorMessageFor = (l: LintRow | undefined): string | undefined =>
    l && l.errorCount > 0
      ? l.errorCount === 1
        ? "오류 1건"
        : `오류 ${String(l.errorCount)}건`
      : undefined;

  const metaFor = useCallback(
    (asset: Asset): RowMeta => {
      const u = usageMap.get(refKey(asset.kind, asset.name));
      const l = lintMap.get(asset.id);
      const g = graphMap.get(refKey(asset.kind, asset.name));
      return {
        asset,
        usage: u,
        status: computeAssetStatus(asset, u, l, g),
        errorMessage: errorMessageFor(l),
      };
    },
    [usageMap, lintMap, graphMap],
  );

  // 자산이 상태/출처 필터를 통과하는가.
  const passesFilter = useCallback(
    (asset: Asset): boolean => {
      if (source !== "all" && asset.source !== source) return false;
      const u = usageMap.get(refKey(asset.kind, asset.name));
      const l = lintMap.get(asset.id);
      const g = graphMap.get(refKey(asset.kind, asset.name));
      if (status === "problems")
        return computeAssetStatus(asset, u, l, g).tone === "red";
      if (status === "unused") return u?.neverUsed ?? false;
      if (status === "orphan") return isOrphanAgent(asset, g);
      return true;
    },
    [source, status, usageMap, lintMap, graphMap],
  );

  // referencedBy 가 가리키는 스킬 수(= ↩ N 스킬, 다대다 신호). skill 참조만 센다.
  const referencingSkillCount = useCallback(
    (asset: Asset): number => {
      const g = graphMap.get(refKey(asset.kind, asset.name));
      return (g?.referencedBy ?? []).filter((r) => r.kind === "skill").length;
    },
    [graphMap],
  );

  const sourceCounts = useMemo(() => {
    const c = { crew: 0, "project-local": 0, unknown: 0 };
    for (const a of assets ?? []) c[a.source] += 1;
    return c;
  }, [assets]);
  const hasSourceInfo = sourceCounts.crew + sourceCounts["project-local"] > 0;

  const summary = useMemo(
    () => computeAssetHealthSummary(assets, usage, lint, graph),
    [assets, usage, lint, graph],
  );
  const orphanCount = useMemo(
    () =>
      (assets ?? []).filter((a) =>
        isOrphanAgent(a, graphMap.get(refKey(a.kind, a.name))),
      ).length,
    [assets, graphMap],
  );

  if (projectId === null)
    return (
      <EmptyState
        title="프로젝트를 먼저 선택하세요"
        hint="위 바에서 프로젝트를 등록·선택하면 툴킷(스킬·에이전트·커맨드)이 표시됩니다."
      />
    );
  if (isPending) return <Loading label="자산 불러오는 중…" />;
  if (isError) return <ErrorNotice error={error} />;
  if (assets.length === 0)
    return (
      <EmptyState
        title="아직 자산이 없어요"
        hint="터미널/creator 로 .claude 에 만들고 커밋하면 자동 등록됩니다. (또는 상단 ‘스캔’)"
      />
    );

  const select = (id: string) => onSelect(id === selectedId ? null : id);

  // 행 하이라이트 (같은 kind:name 모든 등장 강조).
  const hlClass = (key: string) =>
    highlightKey === key
      ? "bg-cyan-500/10 shadow-[inset_2px_0_0] shadow-cyan-500"
      : "";
  const onRowHover = (key: string | null) => setHighlightKey(key);

  const ctx: ToolkitContext = {
    assets,
    selectedId,
    select,
    metaFor,
    passesFilter,
    graphMap,
    assetByKey,
    referencingSkillCount,
    highlightKey,
    onRowHover,
    hlClass,
  };

  return (
    <div className="space-y-3">
      {/* 뷰 토글 + 안내 */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex gap-0.5 rounded-md border p-0.5">
          <Chip active={view === "list"} onClick={() => setView("list")}>
            목록
          </Chip>
          <Chip active={view === "tree"} onClick={() => setView("tree")}>
            관계
          </Chip>
        </div>
        <InfoMark
          help="목록 = 모든 자산 평면(훑기). 관계 = 스킬→에이전트 트리. ‘상태’는 형식·사용·연결 구조 신호일 뿐 품질 점수가 아닙니다."
          label="툴킷 뷰"
        />
      </div>

      {/* 요약 칩 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <span className="font-medium">자산 {summary.total}</span>
        {summary.unused > 0 && (
          <span
            className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
            title="어디서도 호출 안 됨 — 삭제 후보"
          >
            <Dot className={SUMMARY_DOT.amber} /> 미사용 {summary.unused}
          </span>
        )}
        {summary.otherOnly > 0 && (
          <span
            className="inline-flex items-center gap-1 text-muted-foreground"
            title="여기선 0회·다른 프로젝트에서 쓰임 — 공용(crew) 가능, 삭제 주의"
          >
            <Dot className={SUMMARY_DOT.slate} /> 타 프로젝트만 {summary.otherOnly}
          </span>
        )}
        {summary.problems > 0 && (
          <span
            className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"
            title="형식 에러(트리거 불가) 또는 고아+미사용(dead)"
          >
            <Dot className={SUMMARY_DOT.red} /> 문제 {summary.problems}
          </span>
        )}
        {summary.unused === 0 && summary.problems === 0 && (
          <span className="text-emerald-600 dark:text-emerald-400">
            ✓ 미사용·문제 없음
          </span>
        )}
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-md border p-0.5">
          <Chip active={status === "all"} onClick={() => setStatus("all")}>
            전체
          </Chip>
          <Chip
            active={status === "problems"}
            onClick={() => setStatus("problems")}
          >
            문제 {summary.problems}
          </Chip>
          <Chip active={status === "unused"} onClick={() => setStatus("unused")}>
            미사용 {summary.unused}
          </Chip>
          <Chip active={status === "orphan"} onClick={() => setStatus("orphan")}>
            고아 {orphanCount}
          </Chip>
        </div>
        {hasSourceInfo && (
          <div className="inline-flex gap-1 rounded-md border p-0.5">
            <Chip active={source === "all"} onClick={() => setSource("all")}>
              모든 출처
            </Chip>
            <Chip active={source === "crew"} onClick={() => setSource("crew")}>
              crew {sourceCounts.crew}
            </Chip>
            <Chip
              active={source === "project-local"}
              onClick={() => setSource("project-local")}
            >
              전용 {sourceCounts["project-local"]}
            </Chip>
          </div>
        )}
      </div>

      {view === "list" ? (
        <AssetFlatList ctx={ctx} />
      ) : (
        <AssetRelationTree ctx={ctx} />
      )}

      {/* 범례 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Dot className="bg-emerald-500" /> 정상 = 형식OK·쓰임·(엮임 or 단독의도)
        </span>
        <span className="inline-flex items-center gap-1">
          <Dot className="bg-amber-500" /> 주의 = 미사용 or 형식경고
        </span>
        <span className="inline-flex items-center gap-1">
          <Dot className="bg-red-500" /> 문제 = 형식에러 or 고아+미사용
        </span>
      </div>
    </div>
  );
}
