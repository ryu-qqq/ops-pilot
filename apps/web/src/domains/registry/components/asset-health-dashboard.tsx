import { useMemo, useState } from "react";
import { RotateCw } from "lucide-react";
import type {
  AssetKind,
  AssetUsage,
  ProjectWorkMetricRow,
} from "@opspilot/shared-types";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { EmptyState, ErrorNotice, InfoMark, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import {
  useAssets,
  useProjectAssetLint,
  useProjectAssetUsage,
  useProjectWorkMetrics,
  useScanWorkMetrics,
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

type StatusFilter = "all" | "unused" | "issues";
type KindFilter = "all" | AssetKind;

const KIND_LABEL: Record<string, string> = {
  agent: "agent",
  skill: "skill",
  command: "command",
  cursor_skill: "cursor·skill",
  cursor_command: "cursor·cmd",
  cursor_rule: "cursor·rule",
};

type Tone = "green" | "slate" | "amber" | "red" | "muted";
const TONE: Record<Tone, string> = {
  green: "bg-emerald-500",
  slate: "bg-slate-400",
  amber: "bg-amber-500",
  red: "bg-red-500",
  muted: "bg-muted-foreground/30",
};
function Dot({ tone }: { tone: Tone }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        TONE[tone],
      )}
    />
  );
}

// 사용: 일관 형식 = [점] 여기 / 전체. 점 색이 상태(쓰임/타프로젝트/미사용)를 인코딩.
function UsageCell({ usage }: { usage?: AssetUsage }) {
  if (!usage || !usage.supported)
    return <span className="text-muted-foreground">—</span>;
  const tone: Tone =
    usage.inProjectCount > 0
      ? "green"
      : usage.totalCount > 0
        ? "slate"
        : "amber";
  const title =
    usage.inProjectCount > 0
      ? `이 프로젝트 ${String(usage.inProjectCount)}회 · 전체 ${String(usage.totalCount)}회`
      : usage.totalCount > 0
        ? `이 프로젝트 0회 · 다른 곳 ${String(usage.totalCount)}회 (공용 crew 자산일 수 있음)`
        : "어디서도 호출된 적 없음 (prune 후보)";
  return (
    <span
      className="inline-flex items-center gap-1.5 tabular-nums"
      title={title}
    >
      <Dot tone={tone} />
      <span className="font-medium">{usage.inProjectCount}</span>
      <span className="text-xs text-muted-foreground">
        / {usage.totalCount}
      </span>
    </span>
  );
}

// 형식(frontmatter lint): 점 + 라벨로 일관.
function FormatCell({ lint }: { lint?: LintRow }) {
  if (!lint) return <span className="text-muted-foreground">—</span>;
  if (lint.errorCount > 0)
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
        title="frontmatter 형식 오류 — 자동 발화가 안 됨"
      >
        <Dot tone="red" /> error {lint.errorCount}
      </span>
    );
  if (lint.warningCount > 0)
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"
        title="형식 경고 (kebab-case·짧은 description 등)"
      >
        <Dot tone="amber" /> warn {lint.warningCount}
      </span>
    );
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title="frontmatter 형식 통과"
    >
      <Dot tone="green" /> 정상
    </span>
  );
}

// 정정왕복(참고 신호) — ⚠️ 품질 점수 아님. 무채색만, Dot·상태색·순위색 금지.
// avg = 발화당 평균 정정왕복(≈ "발화 직후 첫 반응이 정정인 비율"). null/miss → 무음 —.
function CorrectionCell({ work }: { work?: ProjectWorkMetricRow }) {
  if (work == null || work.avgCorrectionRoundtrips == null)
    return <span className="text-muted-foreground">—</span>;
  const pct = Math.round(work.avgCorrectionRoundtrips * 100);
  return (
    <span
      className="text-foreground/80 tabular-nums"
      title={`${String(work.totalCorrectionRoundtrips)} / ${String(work.totalInvocations)}회 · ${String(work.sessionCount)}개 세션`}
    >
      {pct}% 첫반응
    </span>
  );
}

export function AssetHealthDashboard({
  projectId,
  selectedId,
  onSelect,
}: Props) {
  const { data: assets, isPending, isError, error } = useAssets(projectId);
  const { data: usage } = useProjectAssetUsage(projectId);
  const { data: lint } = useProjectAssetLint(projectId);
  // 작업 신호(참고용). report 에러는 테이블을 막지 않고 컬럼만 무음 — 처리.
  const { data: workReport } = useProjectWorkMetrics(projectId);
  const scanWork = useScanWorkMetrics();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");

  const usageMap = useMemo(() => {
    const m = new Map<string, AssetUsage>();
    for (const u of usage?.assets ?? []) m.set(`${u.kind}:${u.name}`, u);
    return m;
  }, [usage]);
  // usageMap 과 동일 키(`${kind}:${name}`). command/cursor 자산은 miss → CorrectionCell 이 —.
  const workMap = useMemo(() => {
    const m = new Map<string, ProjectWorkMetricRow>();
    for (const w of workReport?.assets ?? []) m.set(`${w.kind}:${w.name}`, w);
    return m;
  }, [workReport]);
  const lintMap = useMemo(() => {
    const m = new Map<string, LintRow>();
    for (const l of lint?.items ?? []) m.set(l.assetId, l);
    return m;
  }, [lint]);

  const kinds = useMemo(
    () => [...new Set((assets ?? []).map((a) => a.kind))],
    [assets],
  );

  const rows = useMemo(() => {
    const enriched = (assets ?? []).map((a) => ({
      asset: a,
      usage: usageMap.get(`${a.kind}:${a.name}`),
      lint: lintMap.get(a.id),
    }));
    const rank = (r: (typeof enriched)[number]) =>
      (r.lint?.errorCount ?? 0) > 0 ? 0 : r.usage?.neverUsed ? 1 : 2;
    return enriched
      .filter((r) => (kind === "all" ? true : r.asset.kind === kind))
      .filter((r) => {
        if (status === "unused") return r.usage?.neverUsed ?? false;
        if (status === "issues")
          return (
            (r.lint?.errorCount ?? 0) > 0 || (r.lint?.warningCount ?? 0) > 0
          );
        return true;
      })
      .sort(
        (x, y) => rank(x) - rank(y) || x.asset.name.localeCompare(y.asset.name),
      );
  }, [assets, usageMap, lintMap, status, kind]);

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
      formatErrors: (lint?.items ?? []).filter((l) => l.errorCount > 0).length,
    };
  }, [assets, usage, lint]);

  if (projectId === null)
    return (
      <EmptyState
        title="프로젝트를 먼저 선택하세요"
        hint="위 바에서 프로젝트를 등록·선택하면 Toolkit(쓰임·형식·prune)이 여기 표시됩니다."
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

  const Chip = ({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
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

  const hasMetrics = (workReport?.metricCount ?? 0) > 0;

  return (
    <div className="space-y-3">
      {/* 작업 신호 고지 + 스캔 (응집: 정정왕복 컬럼 출처를 한 곳에서 안내) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {hasMetrics
            ? "작업 신호는 참고용입니다 — 품질 점수가 아닙니다."
            : "아직 작업 신호가 없어요 — 스캔하기로 한 번 훑어보세요."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={scanWork.isPending}
          onClick={() => {
            scanWork.mutate({ projectId });
          }}
        >
          <RotateCw
            className={cn("h-3.5 w-3.5", scanWork.isPending && "animate-spin")}
          />
          {scanWork.isPending ? "스캔 중…" : "작업 신호 스캔"}
        </Button>
      </div>

      {/* 요약 배너 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <span className="font-medium">자산 {summary.total}</span>
        {summary.unused > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Dot tone="amber" /> 미사용 {summary.unused}
          </span>
        )}
        {summary.otherOnly > 0 && (
          <span
            className="inline-flex items-center gap-1 text-muted-foreground"
            title="이 프로젝트에선 안 쓰지만 다른 곳에서 쓰임 (공용 crew 자산)"
          >
            <Dot tone="slate" /> 다른 곳만 {summary.otherOnly}
          </span>
        )}
        {summary.formatErrors > 0 && (
          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
            <Dot tone="red" /> 형식 error {summary.formatErrors}
          </span>
        )}
        {summary.unused === 0 && summary.formatErrors === 0 && (
          <span className="text-emerald-600 dark:text-emerald-400">
            ✓ 미사용·형식오류 없음
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
            active={status === "unused"}
            onClick={() => setStatus("unused")}
          >
            미사용 {summary.unused}
          </Chip>
          <Chip
            active={status === "issues"}
            onClick={() => setStatus("issues")}
          >
            형식이슈
          </Chip>
        </div>
        {kinds.length > 1 && (
          <div className="inline-flex gap-1 rounded-md border p-0.5">
            <Chip active={kind === "all"} onClick={() => setKind("all")}>
              모든 종류
            </Chip>
            {kinds.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {KIND_LABEL[k] ?? k}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* 헬스 테이블 */}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">자산</th>
              <th
                className="w-24 px-2 py-1.5 text-left font-medium"
                title="이 프로젝트 / 전체 호출 수"
              >
                사용
              </th>
              <th
                className="w-24 px-2 py-1.5 text-left font-medium"
                title="frontmatter 형식 검사"
              >
                형식
              </th>
              <th className="w-40 px-2 py-1.5 text-left font-medium">
                <span className="inline-flex items-center gap-1.5">
                  정정왕복
                  <Badge variant="outline">참고</Badge>
                  <InfoMark
                    help={
                      workReport?.signalNote ??
                      "작업 신호(참고용) — 품질 점수가 아닙니다."
                    }
                    label="정정왕복(참고 신호)"
                  />
                </span>
              </th>
              <th className="w-20 px-2 py-1.5 text-left font-medium">최근</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
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
                >
                  <td className="px-3 py-1.5">
                    <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {KIND_LABEL[asset.kind] ?? asset.kind}
                    </span>
                    <span className="font-medium">{asset.name}</span>
                  </td>
                  <td className="px-2 py-1.5 text-sm">
                    <UsageCell usage={u} />
                  </td>
                  <td className="px-2 py-1.5">
                    <FormatCell lint={l} />
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    <CorrectionCell
                      work={workMap.get(`${asset.kind}:${asset.name}`)}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-xs tabular-nums text-muted-foreground">
                    {last ? last.slice(5, 10) : "—"}
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
