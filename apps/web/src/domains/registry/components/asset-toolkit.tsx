import { useCallback, useMemo, useState } from "react";
import type { Asset, AssetUsage } from "@opspilot/shared-types";
import { EmptyState, ErrorNotice, InfoMark, Loading } from "../../../lib/ui";
import { usePersistedState } from "../../../lib/use-persisted-state";
import { cn } from "../../../lib/utils";
import {
  computeAssetStatus,
  computeRelation,
  refKey,
  type GraphItem,
  type LintRow,
  type RelationDescriptor,
} from "../graph";
import {
  useAssetGraph,
  useAssets,
  useProjectAssetLint,
  useProjectAssetUsage,
} from "../use-registry";
import {
  kindBucket,
  type KindFilter,
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
  // 분할 모드(자산 선택 시 좌측 좁음) — 관계 컬럼 숨겨 이름 폭 확보.
  compact?: boolean;
}

// 목록(flat) = 기본 · 관계(tree) = 토글. sessionStorage 로 기억.
type ToolkitView = "list" | "tree";

// 두 뷰가 공유하는 파생 헬퍼·맵 묶음. 데이터 소유는 여기(부모), 뷰는 표현만.
export interface ToolkitContext {
  projectId: string | null;
  assets: Asset[];
  selectedId: string | null;
  select: (id: string) => void;
  metaFor: (asset: Asset) => RowMeta;
  relationFor: (asset: Asset) => RelationDescriptor;
  passesFilter: (asset: Asset) => boolean;
  // 상태/종류/출처 중 하나라도 'all' 이 아니면 true — 관계 뷰가 매치 강조·자동 펼침 판단에 사용.
  filterActive: boolean;
  graphMap: Map<string, GraphItem>;
  assetByKey: Map<string, Asset>;
  referencingSkillCount: (asset: Asset) => number;
  highlightKey: string | null;
  onRowHover: (key: string | null) => void;
  hlClass: (key: string) => string;
  // compact(분할 모드)면 관계 컬럼 숨김 — 양 뷰 동일하게 적용.
  showRelation: boolean;
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

// 필터 facet 한 덩어리 — 작은 라벨 + 칩 그룹. shrink-0 으로 내부 칩이 절대 쪼개지지
// 않고, 공간 부족 시 facet 통째로 다음 줄로 내려간다.
function Facet({
  label,
  children,
  dataTour,
}: {
  label: string;
  children: React.ReactNode;
  dataTour?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5" data-tour={dataTour}>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="inline-flex gap-0.5 rounded-md border p-0.5">
        {children}
      </div>
    </div>
  );
}

export function AssetToolkit({
  projectId,
  selectedId,
  onSelect,
  compact = false,
}: Props) {
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
  const [kind, setKind] = usePersistedState<KindFilter>(
    "opspilot.toolkit.kind",
    "all",
  );
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

  // referencedBy 가 가리키는 스킬 수(= ↩ N 스킬, 다대다 신호). skill 참조만 센다.
  const referencingSkillCount = useCallback(
    (asset: Asset): number => {
      const g = graphMap.get(refKey(asset.kind, asset.name));
      return (g?.referencedBy ?? []).filter((r) => r.kind === "skill").length;
    },
    [graphMap],
  );

  // 자산이 상태/출처/종류 필터를 통과하는가.
  const passesFilter = useCallback(
    (asset: Asset): boolean => {
      if (source !== "all" && asset.source !== source) return false;
      if (kind !== "all" && kindBucket(asset.kind) !== kind) return false;
      const u = usageMap.get(refKey(asset.kind, asset.name));
      const l = lintMap.get(asset.id);
      const g = graphMap.get(refKey(asset.kind, asset.name));
      if (status === "problems")
        return computeAssetStatus(asset, u, l, g).tone === "red";
      if (status === "unused") return u?.neverUsed ?? false;
      return true;
    },
    [source, status, kind, usageMap, lintMap, graphMap],
  );

  // 관계 컬럼 표기(트리·플랫 단일 원천 graph.ts 위임).
  const relationFor = useCallback(
    (asset: Asset): RelationDescriptor => {
      const g = graphMap.get(refKey(asset.kind, asset.name));
      const u = usageMap.get(refKey(asset.kind, asset.name));
      return computeRelation(asset, g, referencingSkillCount(asset), u);
    },
    [graphMap, usageMap, referencingSkillCount],
  );

  const sourceCounts = useMemo(() => {
    const c = { crew: 0, "project-local": 0, unknown: 0 };
    for (const a of assets ?? []) c[a.source] += 1;
    return c;
  }, [assets]);
  const hasSourceInfo = sourceCounts.crew + sourceCounts["project-local"] > 0;

  // 상태 카운트 = 요약(필터칩에 직접 표시 → 별도 요약 배너 불필요).
  const statusCounts = useMemo(() => {
    let problems = 0;
    let unused = 0;
    for (const a of assets ?? []) {
      const u = usageMap.get(refKey(a.kind, a.name));
      const l = lintMap.get(a.id);
      const g = graphMap.get(refKey(a.kind, a.name));
      if (computeAssetStatus(a, u, l, g).tone === "red") problems += 1;
      if (u?.neverUsed ?? false) unused += 1;
    }
    return { total: assets?.length ?? 0, problems, unused };
  }, [assets, usageMap, lintMap, graphMap]);

  // 종류 카운트(skill/agent/cmd) — cmd = command + cursor_*.
  const kindCounts = useMemo(() => {
    const c = { skill: 0, agent: 0, cmd: 0 };
    for (const a of assets ?? []) c[kindBucket(a.kind)] += 1;
    return c;
  }, [assets]);

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
    projectId,
    assets,
    selectedId,
    select,
    metaFor,
    relationFor,
    passesFilter,
    filterActive: status !== "all" || source !== "all" || kind !== "all",
    graphMap,
    assetByKey,
    referencingSkillCount,
    highlightKey,
    onRowHover,
    hlClass,
    showRelation: !compact,
  };

  return (
    <div className="space-y-3">
      {/* 헤더 1줄: 좌 = 제목 + 뷰 토글 / 우 = 새 자산 + ⓘ */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Toolkit</span>
          <div className="inline-flex gap-0.5 rounded-md border p-0.5">
            <Chip active={view === "list"} onClick={() => setView("list")}>
              목록
            </Chip>
            <Chip active={view === "tree"} onClick={() => setView("tree")}>
              관계
            </Chip>
          </div>
        </div>
        <InfoMark
          help="목록 = 모든 자산 평면(훑기). 관계 = 스킬→에이전트 트리. ‘상태’는 형식·사용·연결 구조 신호일 뿐 품질 점수가 아닙니다. 정상 = 형식OK·쓰임·(엮임 or 단독의도) / 주의 = 미사용 or 형식경고 / 문제 = 형식에러 or 고아+미사용. (자산 저작은 터미널/agent-crew harness-creator 로 합니다.)"
          label="툴킷 뷰·상태 안내"
        />
      </div>

      {/* 필터 1줄 — facet(상태/종류/출처)마다 한 덩어리, 공간 부족 시 facet 통째로 줄바꿈. */}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Facet label="상태" dataTour="asset-status">
          <Chip active={status === "all"} onClick={() => setStatus("all")}>
            전체 {statusCounts.total}
          </Chip>
          <Chip
            active={status === "problems"}
            onClick={() => setStatus("problems")}
          >
            문제 {statusCounts.problems}
          </Chip>
          <Chip active={status === "unused"} onClick={() => setStatus("unused")}>
            미사용 {statusCounts.unused}
          </Chip>
        </Facet>

        <Facet label="종류">
          <Chip active={kind === "all"} onClick={() => setKind("all")}>
            전체
          </Chip>
          <Chip active={kind === "skill"} onClick={() => setKind("skill")}>
            skill {kindCounts.skill}
          </Chip>
          <Chip active={kind === "agent"} onClick={() => setKind("agent")}>
            agent {kindCounts.agent}
          </Chip>
          <Chip active={kind === "cmd"} onClick={() => setKind("cmd")}>
            cmd {kindCounts.cmd}
          </Chip>
        </Facet>

        {hasSourceInfo && (
          <Facet label="출처">
            <Chip active={source === "all"} onClick={() => setSource("all")}>
              전체
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
          </Facet>
        )}
      </div>

      <div data-tour="asset-list">
        {view === "list" ? (
          <AssetFlatList ctx={ctx} />
        ) : (
          <AssetRelationTree ctx={ctx} />
        )}
      </div>
    </div>
  );
}
