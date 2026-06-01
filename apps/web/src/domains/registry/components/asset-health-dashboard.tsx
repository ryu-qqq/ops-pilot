import { useMemo, useState } from "react";
import type { AssetUsage } from "@opspilot/shared-types";
import { Badge } from "../../../components/ui/badge";
import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import {
  useAssets,
  useProjectAssetLint,
  useProjectAssetUsage,
} from "../use-registry";

interface Props {
  projectId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

interface LintRow {
  ok: boolean;
  errorCount: number;
  warningCount: number;
}

type Filter = "all" | "unused" | "issues";

const KIND_LABEL: Record<string, string> = {
  agent: "agent",
  skill: "skill",
  command: "command",
  cursor_skill: "cursor·skill",
  cursor_command: "cursor·cmd",
  cursor_rule: "cursor·rule",
};

// T5: 자산 헬스 대시보드 — 쓰임(T3)·검증(T4-c)·prune 신호를 한 표에. 평가 중심 UI 의 허브.
function UsageCell({ usage }: { usage?: AssetUsage }) {
  if (!usage || !usage.supported)
    return <span className="text-muted-foreground">—</span>;
  if (usage.neverUsed)
    return (
      <Badge variant="warning" className="text-[10px]">
        미사용
      </Badge>
    );
  if (usage.inProjectCount > 0)
    return (
      <span
        className="tabular-nums"
        title={`이 프로젝트 ${String(usage.inProjectCount)}회 · 전체 ${String(usage.totalCount)}회`}
      >
        {usage.inProjectCount}회
      </span>
    );
  return (
    <Badge
      variant="info"
      className="text-[10px]"
      title="다른 프로젝트에서만 사용됨"
    >
      타프로젝트 {usage.totalCount}
    </Badge>
  );
}

function LintCell({ lint }: { lint?: LintRow }) {
  if (!lint) return <span className="text-muted-foreground">—</span>;
  if (lint.errorCount > 0)
    return (
      <Badge variant="destructive" className="text-[10px]">
        error {lint.errorCount}
      </Badge>
    );
  if (lint.warningCount > 0)
    return (
      <Badge variant="warning" className="text-[10px]">
        warn {lint.warningCount}
      </Badge>
    );
  return <span className="text-emerald-600 dark:text-emerald-400">✓</span>;
}

export function AssetHealthDashboard({
  projectId,
  selectedId,
  onSelect,
}: Props) {
  const { data: assets, isPending, isError, error } = useAssets(projectId);
  const { data: usage } = useProjectAssetUsage(projectId);
  const { data: lint } = useProjectAssetLint(projectId);
  const [filter, setFilter] = useState<Filter>("all");

  const usageMap = useMemo(() => {
    const m = new Map<string, AssetUsage>();
    for (const u of usage?.assets ?? []) m.set(`${u.kind}:${u.name}`, u);
    return m;
  }, [usage]);
  const lintMap = useMemo(() => {
    const m = new Map<string, LintRow>();
    for (const l of lint?.items ?? []) m.set(l.assetId, l);
    return m;
  }, [lint]);

  const rows = useMemo(() => {
    const enriched = (assets ?? []).map((a) => ({
      asset: a,
      usage: usageMap.get(`${a.kind}:${a.name}`),
      lint: lintMap.get(a.id),
    }));
    // 문제 먼저: 검증 error → 미사용 → 그 외. 같은 등급 내 이름순.
    const rank = (r: (typeof enriched)[number]) =>
      (r.lint?.errorCount ?? 0) > 0 ? 0 : r.usage?.neverUsed ? 1 : 2;
    return enriched
      .filter((r) => {
        if (filter === "unused") return r.usage?.neverUsed ?? false;
        if (filter === "issues")
          return (
            (r.lint?.errorCount ?? 0) > 0 || (r.lint?.warningCount ?? 0) > 0
          );
        return true;
      })
      .sort(
        (x, y) => rank(x) - rank(y) || x.asset.name.localeCompare(y.asset.name),
      );
  }, [assets, usageMap, lintMap, filter]);

  const summary = useMemo(() => {
    const us = usage?.assets ?? [];
    return {
      total: assets?.length ?? 0,
      unused: us.filter((u) => u.neverUsed).length,
      otherOnly: us.filter(
        (u) =>
          u.supported &&
          !u.neverUsed &&
          u.inProjectCount === 0 &&
          u.totalCount > 0,
      ).length,
      lintErrors: (lint?.items ?? []).filter((l) => l.errorCount > 0).length,
    };
  }, [assets, usage, lint]);

  if (projectId === null)
    return (
      <EmptyState
        title="프로젝트를 먼저 선택하세요"
        hint="위 바에서 프로젝트를 등록·선택하면 자산 헬스(쓰임·검증·prune)가 여기 표시됩니다."
      />
    );
  if (isPending) return <Loading label="자산 불러오는 중…" />;
  if (isError) return <ErrorNotice error={error} />;
  if (assets.length === 0)
    return (
      <EmptyState
        title="아직 자산이 없어요"
        hint="터미널/creator 로 .claude 에 자산을 만들고 커밋하거나, 상단 ‘스캔’으로 적재하세요."
      />
    );

  const FilterTab = ({ value, label }: { value: Filter; label: string }) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={cn(
        "rounded-md px-2 py-1 text-xs transition-colors",
        filter === value
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      {/* 요약 배너 — prune 유도 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <span className="font-medium">자산 {summary.total}</span>
        {summary.unused > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            ⚠ 미사용 {summary.unused}
          </span>
        )}
        {summary.otherOnly > 0 && (
          <span className="text-muted-foreground">
            타프로젝트만 {summary.otherOnly}
          </span>
        )}
        {summary.lintErrors > 0 && (
          <span className="text-red-600 dark:text-red-400">
            ✗ 검증 error {summary.lintErrors}
          </span>
        )}
        {summary.unused === 0 && summary.lintErrors === 0 && (
          <span className="text-emerald-600 dark:text-emerald-400">
            ✓ 미사용·검증오류 없음
          </span>
        )}
        <span className="ml-auto inline-flex gap-1">
          <FilterTab value="all" label="전체" />
          <FilterTab
            value="unused"
            label={`미사용 ${String(summary.unused)}`}
          />
          <FilterTab value="issues" label="검증이슈" />
        </span>
      </div>

      {/* 헬스 테이블 */}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">자산</th>
              <th className="w-20 px-2 py-1.5 text-left font-medium">사용</th>
              <th className="w-24 px-2 py-1.5 text-left font-medium">검증</th>
              <th className="w-24 px-2 py-1.5 text-left font-medium">최근</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-4 text-center text-xs text-muted-foreground"
                >
                  해당 자산 없음.
                </td>
              </tr>
            )}
            {rows.map(({ asset, usage: u, lint: l }) => {
              const last = u?.inProjectLastUsed ?? u?.totalLastUsed ?? null;
              return (
                <tr
                  key={asset.id}
                  onClick={() =>
                    onSelect(asset.id === selectedId ? null : asset.id)
                  }
                  className={cn(
                    "cursor-pointer border-t transition-colors",
                    asset.id === selectedId
                      ? "bg-primary/10"
                      : "hover:bg-accent/50",
                  )}
                  title="클릭하면 아래에서 상세(버전·평가·시나리오) 표시"
                >
                  <td className="px-3 py-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {KIND_LABEL[asset.kind] ?? asset.kind}
                    </span>{" "}
                    <span className="font-medium">{asset.name}</span>
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    <UsageCell usage={u} />
                  </td>
                  <td className="px-2 py-1.5">
                    <LintCell lint={l} />
                  </td>
                  <td className="px-2 py-1.5 text-xs tabular-nums text-muted-foreground">
                    {last ? last.slice(0, 10) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
