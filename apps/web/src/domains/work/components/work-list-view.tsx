import { Badge } from "../../../components/ui/badge";
import { Card } from "../../../components/ui/card";
import { EmptyState, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { ProjectBar } from "../../project/components/project-bar";
import { useProjects } from "../../project/use-project";
import {
  useAutoIngestConfig,
  useIngests,
  useProjectProposals,
} from "../../feedback/use-feedback";
import { PipelineFlowBand } from "../../feedback/components/pipeline-flow-band";
import { useRuns } from "../../run/use-run";
import { mergeWorkItems } from "../lib/merge-work-items";
import type { WorkItem, WorkSelection } from "../types";
import { WorkDetailIngest, WorkDetailRun } from "./work-detail-view";

interface Props {
  projectId: string | null;
  onProjectIdChange: (id: string | null) => void;
  selection: WorkSelection;
  onSelect: (sel: WorkSelection) => void;
}

/**
 * 작업 통합 목록 — Cursor 작업(ingest) + 수동 실행(run) 을 한 화면에. selection 이 있으면
 * 같은 자리에 드릴다운 상세(WorkDetailIngest/WorkDetailRun)를 렌더(전체폭 토글).
 */
export function WorkListView({ projectId, onProjectIdChange, selection, onSelect }: Props) {
  const { data: projects } = useProjects();
  const { data: ingests, isPending: ingestsPending } = useIngests(projectId);
  const { data: runs } = useRuns(projectId);
  // 전역 카운트 — status 없이. 폴링은 목록 hook 들이 각자 처리하므로 false.
  const { data: proposals } = useProjectProposals(projectId, undefined, false);
  const { data: autoIngestConfig } = useAutoIngestConfig();
  const project = (projects ?? []).find((p) => p.id === projectId);

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
  const empty = groups.cursor.length === 0 && groups.manual.length === 0;

  return (
    <div className="space-y-4">
      <ProjectBar selectedProjectId={projectId} onSelect={onProjectIdChange} />
      <PipelineFlowBand
        statuses={ingestStatuses}
        autoIngestConfig={autoIngestConfig}
        isPending={ingestsPending}
      />
      {ingestsPending && (
        <Card className="p-6">
          <Loading label="작업 불러오는 중…" />
        </Card>
      )}
      {!ingestsPending && empty && (
        <EmptyState
          title="아직 작업이 없어요"
          hint={
            autoIngestConfig?.enabled === true
              ? "Cursor 작업을 커밋하면 주기 스캔이 자동 평가합니다."
              : "자동 ingest 가 꺼져 있습니다 — 서버 env OPS_AUTO_INGEST=1 로 켜면 커밋이 자동 평가됩니다."
          }
        />
      )}
      {!empty && (
        <div className="space-y-4">
          {groups.cursor.length > 0 && (
            <WorkSection title="Cursor 작업" items={groups.cursor} onSelect={onSelect} />
          )}
          {groups.manual.length > 0 && (
            <WorkSection title="수동 실행" items={groups.manual} onSelect={onSelect} />
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
}: {
  title: string;
  items: WorkItem[];
  onSelect: (s: WorkSelection) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect({ kind: item.kind, id: item.id })}
              className={cn(
                "w-full rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-accent/50",
              )}
            >
              {item.kind === "ingest" ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      {item.ingest.status}
                    </Badge>
                    <span className="min-w-0 truncate">
                      {item.ingest.commitSubject ?? `commit ${item.ingest.gitRef.slice(0, 8)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      {item.ingest.trigger}
                    </Badge>
                    {item.proposalCount > 0 && <span>개선안 {item.proposalCount}</span>}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
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
