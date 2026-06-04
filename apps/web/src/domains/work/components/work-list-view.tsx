import { useState } from "react";
import { GitCompare, Repeat, X } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { EmptyState, InfoMark, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { ProjectBar } from "../../project/components/project-bar";
import { useProjects } from "../../project/use-project";
import {
  useAutoIngestConfig,
  useIngests,
  useProjectProposals,
} from "../../feedback/use-feedback";
import {
  PipelineFlowBand,
  matchStageKey,
} from "../../feedback/components/pipeline-flow-band";
import { useRuns } from "../../run/use-run";
import { BenchmarkSummary } from "../../run/components/benchmark-summary";
import { ComparisonView } from "../../run/components/comparison-view";
import { mergeWorkItems } from "../lib/merge-work-items";
import {
  ingestStatusVariant,
  runStatusVariant,
  triggerVariant,
} from "../lib/badge-variant";
import type { WorkItem, WorkSelection } from "../types";
import { WorkDetailIngest, WorkDetailRun } from "./work-detail-view";

interface Props {
  projectId: string | null;
  onProjectIdChange: (id: string | null) => void;
  selection: WorkSelection;
  onSelect: (sel: WorkSelection) => void;
  /** 비교 대상 run 묶음(2개 이상이면 목록 상단에 비교 패널). app 일시 상태. */
  compareRunIds: string[];
  /** 벤치마크 N회 run 묶음(1개 이상이면 목록 상단에 벤치마크 패널). app 일시 상태. */
  benchmarkRunIds: string[];
  onClearCompare: () => void;
  onClearBenchmark: () => void;
}

/**
 * 작업 통합 목록 — Cursor 작업(ingest) + 수동 실행(run) 을 한 화면에. selection 이 있으면
 * 같은 자리에 드릴다운 상세(WorkDetailIngest/WorkDetailRun)를 렌더(전체폭 토글).
 */
export function WorkListView({
  projectId,
  onProjectIdChange,
  selection,
  onSelect,
  compareRunIds,
  benchmarkRunIds,
  onClearCompare,
  onClearBenchmark,
}: Props) {
  const { data: projects } = useProjects();
  const { data: ingests, isPending: ingestsPending } = useIngests(projectId);
  const { data: runs } = useRuns(projectId);
  // 전역 카운트 — status 없이. 폴링은 목록 hook 들이 각자 처리하므로 false.
  const { data: proposals } = useProjectProposals(projectId, undefined, false);
  const { data: autoIngestConfig } = useAutoIngestConfig();
  const project = (projects ?? []).find((p) => p.id === projectId);

  // 파이프라인 단계 클릭 필터 — null 이면 전체. PipelineFlowBand stage.key 값(pending/
  // evaluating/reviewing/reviewed)을 담는다.
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // 드릴다운 상세 (목록을 대체해 전체폭으로)
  if (selection !== null && projectId !== null && project) {
    if (selection.kind === "ingest")
      return (
        <WorkDetailIngest
          ingestId={selection.id}
          projectId={projectId}
          project={project}
          onBack={() => onSelect(null)}
          onOpenRun={(id) => onSelect({ kind: "run", id })}
        />
      );
    return (
      <WorkDetailRun
        runId={selection.id}
        onBack={() => onSelect(null)}
        onOpenRun={(id) => onSelect({ kind: "run", id })}
      />
    );
  }

  if (projectId === null)
    return (
      <div className="space-y-4">
        <ProjectBar selectedProjectId={projectId} onSelect={onProjectIdChange} />
        <EmptyState
          title="프로젝트를 선택하세요"
          hint="위에서 프로젝트를 고르면 작업(평가·개선안)이 표시됩니다."
        />
      </div>
    );

  const ingestStatuses = (ingests ?? []).map((i) => i.status);
  const groups = mergeWorkItems(ingests ?? [], runs ?? [], proposals ?? []);
  // 단계 필터 활성 시 cursor(코드 작업)만 해당 status 로 좁히고, manual 그룹은 숨긴다(단순화).
  const filteredCursor =
    statusFilter === null
      ? groups.cursor
      : groups.cursor.filter(
          (item) => item.kind === "ingest" && matchStageKey(statusFilter, item.ingest.status),
        );
  const showManual = statusFilter === null && groups.manual.length > 0;
  const empty =
    statusFilter === null
      ? groups.cursor.length === 0 && groups.manual.length === 0
      : filteredCursor.length === 0;

  // ★결정1 보조 진입점 — 목록 화면일 때만(드릴다운 중엔 숨김). 컬럼/run 클릭으로 드릴다운 진입.
  const compareActive = compareRunIds.length >= 2;
  const benchmarkActive = benchmarkRunIds.length >= 1;

  return (
    <div className="space-y-4">
      <ProjectBar selectedProjectId={projectId} onSelect={onProjectIdChange} />
      {benchmarkActive && (
        <Card className="border-purple/40">
          <CardHeader className="flex flex-row items-baseline justify-between border-b pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat className="h-4 w-4 text-purple" />
              {benchmarkRunIds.length === 1
                ? "단일 실행 (벤치마크 N=1)"
                : `벤치마크 (${String(benchmarkRunIds.length)}회 run)`}
              <InfoMark
                label="벤치마크 N회"
                help="같은 (자산버전 × 시나리오) 를 N회 돌린 결과. N=1은 단일 실행과 동일 (분산 측정 안 됨, σ=0). 개별 run 클릭하면 그 작업 상세로 이동."
              />
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClearBenchmark}>
              <X className="h-3.5 w-3.5" />
              닫기
            </Button>
          </CardHeader>
          <CardContent className="pt-3">
            <BenchmarkSummary
              runIds={benchmarkRunIds}
              onSelectRun={(id) => onSelect({ kind: "run", id })}
            />
          </CardContent>
        </Card>
      )}
      {compareActive && (
        <Card className="border-primary/40">
          <CardHeader className="flex flex-row items-baseline justify-between border-b pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <GitCompare className="h-4 w-4" />
              버전 비교 ({compareRunIds.length}개 run)
              <InfoMark
                label="버전 비교"
                help="같은 시나리오로 N개 버전을 한 번에 돌린 결과. 컬럼 헤더 클릭하면 그 run 의 작업 상세로 이동."
              />
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClearCompare}>
              <X className="h-3.5 w-3.5" />
              닫기
            </Button>
          </CardHeader>
          <CardContent className="pt-3">
            <ComparisonView
              runIds={compareRunIds}
              onSelectRun={(id) => onSelect({ kind: "run", id })}
            />
          </CardContent>
        </Card>
      )}
      <PipelineFlowBand
        statuses={ingestStatuses}
        autoIngestConfig={autoIngestConfig}
        isPending={ingestsPending}
        activeStatus={statusFilter}
        onToggleStatus={(s) => setStatusFilter((prev) => (prev === s ? null : s))}
      />
      {ingestsPending && (
        <Card className="p-6">
          <Loading label="작업 불러오는 중…" />
        </Card>
      )}
      {!ingestsPending && empty && statusFilter !== null && (
        <EmptyState
          title="해당 단계의 작업이 없어요"
          hint="위 파이프라인 단계를 다시 누르면 필터가 해제됩니다."
        />
      )}
      {!ingestsPending && empty && statusFilter === null && (
        <EmptyState
          title="아직 작업이 없어요"
          hint={
            autoIngestConfig?.enabled === true
              ? "코드 작업을 커밋하면 주기 스캔이 자동 평가합니다."
              : "자동 평가가 꺼져 있습니다 — 서버 OPS_AUTO_INGEST 를 켜면 커밋이 자동 평가됩니다."
          }
        />
      )}
      {!empty && (
        <div className="space-y-4" data-tour="work-list">
          {filteredCursor.length > 0 && (
            <WorkSection
              title="코드 작업"
              items={filteredCursor}
              onSelect={onSelect}
              tourFirstCard
            />
          )}
          {showManual && (
            <WorkSection
              title="수동 실행"
              items={groups.manual}
              onSelect={onSelect}
              // 코드 작업 섹션이 비었을 때만 첫 카드 투어 타겟을 이 섹션이 받는다(중복 방지).
              tourFirstCard={filteredCursor.length === 0}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** 작업 그룹 한 섹션 — 카드 클릭으로 드릴다운 진입. */
function WorkSection({
  title,
  items,
  onSelect,
  tourFirstCard = false,
}: {
  title: string;
  items: WorkItem[];
  onSelect: (s: WorkSelection) => void;
  /** true 면 이 섹션의 첫 항목 버튼에만 data-tour="work-card" 를 부여(투어 타겟). */
  tourFirstCard?: boolean;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              data-tour={tourFirstCard && index === 0 ? "work-card" : undefined}
              onClick={() => onSelect({ kind: item.kind, id: item.id })}
              className={cn(
                "w-full rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-accent/50",
              )}
            >
              {item.kind === "ingest" ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge
                      variant={ingestStatusVariant(item.ingest.status)}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {item.ingest.status}
                    </Badge>
                    <span className="min-w-0 truncate">
                      {item.ingest.commitSubject ?? `commit ${item.ingest.gitRef.slice(0, 8)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge
                      variant={triggerVariant(item.ingest.trigger)}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {item.ingest.trigger}
                    </Badge>
                    {item.proposalCount > 0 && <span>개선안 {item.proposalCount}</span>}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge
                      variant={runStatusVariant(item.run.status)}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {item.run.status}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {item.run.assetKind}
                    </span>
                    <span className="min-w-0 truncate">{item.run.assetName}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.run.scenarioName} · {item.run.runner}
                  </div>
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
