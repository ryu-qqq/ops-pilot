import { type ReactNode, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Bot, Check, Expand, FileCode, Info, Layers, RefreshCw, Share2, X } from "lucide-react";
import type {
  AutoIngestConfig,
  ImprovementProposal,
  ImprovementProposalStatus,
  Project,
  ProposalReviewMeta,
  ProposalWithSource,
} from "@opspilot/shared-types";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import { EmptyState, ErrorNotice, InfoMark, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { usePersistedState } from "../../../lib/use-persisted-state";
import { ProjectBar } from "../../project/components/project-bar";
import { useProjects } from "../../project/use-project";
import { useCancelRun } from "../../run/use-run";
import { feedbackKeys } from "../api";
import {
  useApplyProposal,
  useApproveProposal,
  useAutoIngestConfig,
  useIngestDetail,
  useIngests,
  useProjectProposals,
  useRejectProposal,
  useReprocessIngest,
  useReprocessReviewIngest,
  useReviewIngest,
} from "../use-feedback";
import { IngestPipelineSteps } from "./ingest-pipeline-steps";
import { IngestLineage } from "./ingest-lineage";
import { PostApplyBanner } from "./post-apply-banner";
import { TriggerBadge } from "./trigger-badge";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  done: "success",
  reviewed: "success",
  failed: "destructive",
  evaluating: "warning",
  reviewing: "warning",
  pending: "secondary",
};

const proposalVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary",
  approved: "warning",
  applied: "success",
  rejected: "destructive",
};

// 결정 큐 필터 — proposal status → 한국어 라벨. order = 표시 순서.
const decisionFilters: { status: ImprovementProposalStatus; label: string }[] = [
  { status: "draft", label: "결정 대기" },
  { status: "approved", label: "승인됨" },
  { status: "applied", label: "반영됨" },
  { status: "rejected", label: "거절" },
];

// 파이프라인 흐름 띠 — IngestBundleStatus → 단계. pending=대기, evaluating=평가 중,
// reviewing=리뷰 중, done/reviewed=검토됨. failed 는 별도 단계로 따로 센다.
const flowStages: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: "pending", label: "대기", match: (s) => s === "pending" },
  { key: "evaluating", label: "평가 중", match: (s) => s === "evaluating" },
  { key: "reviewing", label: "리뷰 중", match: (s) => s === "reviewing" },
  { key: "reviewed", label: "검토됨", match: (s) => s === "done" || s === "reviewed" },
];

function shortRef(ref: string): string {
  return ref.slice(0, 8);
}

function ProposalDetailDialog({
  proposal,
  reviewMeta,
  trigger,
}: {
  proposal: ImprovementProposal;
  reviewMeta?: ProposalReviewMeta;
  trigger: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[min(90vh,900px)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-2 border-b px-6 py-4 pr-12 text-left">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <Badge variant={proposalVariant[proposal.status] ?? "secondary"}>{proposal.status}</Badge>
            <span className="font-mono text-sm font-normal text-muted-foreground">
              {proposal.targetKind}
            </span>
          </DialogTitle>
          <p className="break-all font-mono text-xs text-muted-foreground">{proposal.targetPath}</p>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <section className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              rationale
            </h4>
            <p className="text-sm leading-relaxed">{proposal.rationale}</p>
          </section>
          {reviewMeta !== undefined && (
            <section className="space-y-1.5 rounded-lg border border-border/80 bg-muted/30 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                reviewer
              </h4>
              <p className="text-sm">
                <strong>{reviewMeta.decision}</strong> · {reviewMeta.risk} risk · {reviewMeta.confidence}
                {reviewMeta.applied === true && " · auto-applied"}
              </p>
              <p className="text-sm text-muted-foreground">{reviewMeta.rationale}</p>
              {(reviewMeta.conflicts ?? []).length > 0 && (
                <p className="text-sm text-warning">conflicts: {(reviewMeta.conflicts ?? []).join(", ")}</p>
              )}
              {reviewMeta.applyError !== undefined && proposal.status === "approved" && (
                <p className="text-sm text-warning">
                  reviewer auto-apply 실패 — 「clone에 반영」으로 수동 적용 가능
                </p>
              )}
              {reviewMeta.applyError !== undefined &&
                proposal.status !== "approved" &&
                proposal.status !== "applied" && (
                <p className="text-sm text-destructive">apply: {reviewMeta.applyError}</p>
              )}
            </section>
          )}
          <section className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              content (apply 시 clone에 쓰임)
            </h4>
            <pre className="max-h-[min(50vh,420px)] overflow-auto rounded-lg border border-border/80 bg-muted/40 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {proposal.content}
            </pre>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProposalCard({
  proposal,
  projectId,
  project,
  onOpenEvalRun,
  onOpenIngest,
}: {
  proposal: ProposalWithSource;
  projectId: string;
  project: Project;
  onOpenEvalRun: (runId: string) => void;
  onOpenIngest: (ingestId: string) => void;
}) {
  const approve = useApproveProposal(proposal.ingestId, projectId);
  const reject = useRejectProposal(proposal.ingestId, projectId);
  const apply = useApplyProposal(proposal.ingestId, projectId);
  const busy = approve.isPending || reject.isPending || apply.isPending;

  const sourceLabel =
    proposal.commitSubject != null && proposal.commitSubject.trim() !== ""
      ? proposal.commitSubject
      : `commit ${shortRef(proposal.gitRef)}`;

  return (
    <Card className="border-border/80">
      <CardHeader className="flex flex-row items-start justify-between gap-2 border-b pb-3">
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Badge variant={proposalVariant[proposal.status] ?? "secondary"}>{proposal.status}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{proposal.targetKind}</span>
          </CardTitle>
          <p className="truncate font-mono text-xs">{proposal.targetPath}</p>
        </div>
        <ProposalDetailDialog
          proposal={proposal}
          trigger={
            <Button type="button" variant="outline" size="sm" className="shrink-0">
              <Expand className="h-3.5 w-3.5" />
              자세히
            </Button>
          }
        />
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        {/* 출처 라벨 — commitSubject(없으면 gitRef) + eval/review 트레이스 · ingest 드릴다운. */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-xs">
          <button
            type="button"
            onClick={() => onOpenIngest(proposal.ingestId)}
            className="min-w-0 flex items-center gap-1.5 text-left text-muted-foreground transition-colors hover:text-foreground"
            title="이 개선안의 출처 ingest 상세(reprocess·review 등)"
          >
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-medium text-foreground/90">{sourceLabel}</span>
          </button>
          <TriggerBadge trigger={proposal.trigger} />
          {proposal.evalRunId !== null && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-xs"
              onClick={() => onOpenEvalRun(proposal.evalRunId as string)}
            >
              <Share2 className="h-3 w-3" />
              eval 트레이스
            </Button>
          )}
          {proposal.reviewRunId !== null && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-xs"
              onClick={() => onOpenEvalRun(proposal.reviewRunId as string)}
            >
              <Share2 className="h-3 w-3" />
              review 트레이스
            </Button>
          )}
        </div>
        <p className="line-clamp-3 text-sm text-muted-foreground">{proposal.rationale}</p>
        <ProposalDetailDialog
          proposal={proposal}
          trigger={
            <button
              type="button"
              className="w-full rounded-md border border-dashed border-border/80 bg-muted/30 p-2 text-left transition-colors hover:border-primary/30 hover:bg-muted/50"
            >
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                content 미리보기 · 클릭하면 전체
              </p>
              <pre className="max-h-24 overflow-hidden font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
                {proposal.content}
              </pre>
            </button>
          }
        />
        {proposal.appliedCommit !== null && (
          <>
            <p className="font-mono text-xs text-muted-foreground">
              applied: {proposal.appliedCommit.slice(0, 8)}
            </p>
            {proposal.status === "applied" && (
              <PostApplyBanner
                project={project}
                projectId={projectId}
                appliedCommit={proposal.appliedCommit}
              />
            )}
          </>
        )}
        {proposal.status === "draft" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => approve.mutate(proposal.id)}>
              <Check className="h-3.5 w-3.5" />
              승인
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => reject.mutate(proposal.id)}>
              <X className="h-3.5 w-3.5" />
              거절
            </Button>
          </div>
        )}
        {proposal.status === "approved" && (
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" disabled={busy}>
                <FileCode className="h-3.5 w-3.5" />
                clone에 반영
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>개선안 적용 (HITL)</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                <code className="font-mono text-xs">{proposal.targetPath}</code> 를{" "}
                {project.workspaceMode === "linked"
                  ? "등록된 로컬 경로"
                  : "OpsPilot 관리 클론"}
                에 쓰고 구조화 커밋합니다. 되돌리려면 git으로 revert하세요.
              </p>
              <div className="flex justify-end pt-2">
                <Button disabled={busy} onClick={() => apply.mutate(proposal.id)}>
                  {apply.isPending ? <Loading label="적용 중…" /> : "확인 후 적용"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {(approve.isError || reject.isError || apply.isError) && (
          <ErrorNotice error={approve.error ?? reject.error ?? apply.error} />
        )}
      </CardContent>
    </Card>
  );
}

function fmtInterval(intervalMs: number): string {
  if (intervalMs === 0) return "부팅 1회";
  const min = Math.round(intervalMs / 60000);
  return `${String(min)}분`;
}

/**
 * 자동 ingest 상태 칩(ADR 0004, 읽기 전용). enabled=ON 이면 주기·batch 를 success 톤으로,
 * OFF 면 muted + 켜는 법 안내. env(OPS_AUTO_INGEST) 제어라 토글 버튼은 두지 않는다 — 상태만.
 */
function AutoIngestStatusChip({ config }: { config: AutoIngestConfig }) {
  if (!config.enabled) {
    return (
      <Badge
        variant="secondary"
        className="ml-auto gap-1.5 px-2 py-1 font-medium text-muted-foreground"
      >
        <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />
        자동 ingest OFF
        <InfoMark
          label="자동 ingest"
          help="OPS_AUTO_INGEST=1 로 켜집니다(서버 env). 켜면 주기 스캔이 새 커밋을 자동 ingest 합니다."
        />
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="ml-auto gap-1.5 px-2 py-1 font-medium">
      <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />
      자동 ingest ON · {fmtInterval(config.intervalMs)} · batch {config.batch}
    </Badge>
  );
}

/** 파이프라인 흐름 띠 — ingest status 집계 + 자동 ingest 상태 칩(ADR 0004). */
function PipelineFlowBand({
  statuses,
  autoIngestConfig,
  isPending,
}: {
  statuses: string[];
  autoIngestConfig: AutoIngestConfig | undefined;
  isPending: boolean;
}) {
  const failedCount = statuses.filter((s) => s === "failed").length;
  // 초기 로딩 중 0/0/0/0 으로 보이면 "진짜 빈 파이프라인"과 구분이 안 됨 → 로딩 표시.
  if (isPending) {
    return (
      <Card className="border-border/80">
        <CardContent className="py-3">
          <Loading label="파이프라인 흐름 불러오는 중…" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-border/80">
      <CardContent className="flex flex-wrap items-center gap-2 py-3">
        {flowStages.map((stage, i) => {
          const count = statuses.filter((s) => stage.match(s)).length;
          return (
            <div key={stage.key} className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">{stage.label}</span>
                <span className="text-sm font-semibold tabular-nums">{count}</span>
              </div>
              {i < flowStages.length - 1 && (
                <span className="text-muted-foreground/50" aria-hidden>
                  →
                </span>
              )}
            </div>
          );
        })}
        {failedCount > 0 && (
          <Badge variant="destructive" className="ml-1">
            실패 {failedCount}
          </Badge>
        )}
        {autoIngestConfig !== undefined && <AutoIngestStatusChip config={autoIngestConfig} />}
      </CardContent>
    </Card>
  );
}

/** ingest 상세 드릴다운 본문 — 기존 IngestDetailPanel 의 lineage·steps·액션을 격하 보존. */
function IngestDrilldownContent({
  ingestId,
  projectId,
  onOpenEvalRun,
}: {
  ingestId: string;
  projectId: string;
  onOpenEvalRun: (runId: string) => void;
}) {
  const { data, isPending, isError, error } = useIngestDetail(ingestId);
  const reprocess = useReprocessIngest(ingestId, projectId);
  const review = useReviewIngest(ingestId, projectId);
  const reprocessReview = useReprocessReviewIngest(ingestId, projectId);
  const cancelEval = useCancelRun();
  const qc = useQueryClient();
  const evalRunId = data?.contextJson.evalRunId;
  const reviewRunId = data?.contextJson.reviewRunId;

  if (isPending) return <Loading label="ingest 상세 불러오는 중…" />;
  if (isError) return <ErrorNotice error={error} />;
  if (!data) return null;

  const showReprocess =
    data.status === "evaluating" ||
    (data.status === "failed" && data.contextJson.evalError !== undefined && evalRunId !== undefined);

  const showReviewRetry = data.contextJson.reviewError !== undefined && reviewRunId !== undefined;

  const showManualReview =
    data.status === "done" && data.proposals.some((p) => p.status === "draft");

  return (
    <div className="space-y-4">
      <IngestLineage data={data} onOpenRun={onOpenEvalRun} />
      <IngestPipelineSteps data={data} />
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {data.contextJson.commitSubject != null && data.contextJson.commitSubject.trim() !== ""
              ? data.contextJson.commitSubject
              : "Ingest"}
            <Badge variant={statusVariant[data.status] ?? "secondary"}>{data.status}</Badge>
            <TriggerBadge trigger={data.trigger} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4 text-sm">
          <p>
            git: <code className="font-mono text-xs">{data.gitRef.slice(0, 12)}</code>
          </p>
          {data.contextJson.evalError !== undefined && (
            <p className="text-destructive text-xs">{data.contextJson.evalError}</p>
          )}
          {data.contextJson.reviewSummary !== undefined && (
            <p className="text-muted-foreground text-xs">review: {data.contextJson.reviewSummary}</p>
          )}
          {data.contextJson.reviewError !== undefined && (
            <p className="text-destructive text-xs">{data.contextJson.reviewError}</p>
          )}
          {data.contextJson.skipReviewReason !== undefined &&
            data.contextJson.reviewError === undefined &&
            data.status !== "reviewing" &&
            data.status !== "reviewed" && (
            <p className="text-xs text-warning">{data.contextJson.skipReviewReason}</p>
          )}
          {data.proposals.length > 0 && evalRunId !== undefined && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>
                eval 완료 — run <code className="font-mono text-xs">{evalRunId.slice(0, 8)}</code>
              </AlertTitle>
              <AlertDescription>
                개선안 {String(data.proposals.length)}건은 결정 큐에서 처리하세요. 트레이스는 아래
                버튼으로 확인합니다.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {evalRunId !== undefined && (
              <Button size="sm" variant="default" onClick={() => onOpenEvalRun(evalRunId)}>
                <Share2 className="h-3.5 w-3.5" />
                {data.status === "evaluating" ? "eval 실시간 트레이스" : "eval 트레이스"}
              </Button>
            )}
            {reviewRunId !== undefined && (
              <Button size="sm" variant="outline" onClick={() => onOpenEvalRun(reviewRunId)}>
                <Share2 className="h-3.5 w-3.5" />
                {data.status === "reviewing" ? "review 실시간 트레이스" : "review 트레이스"}
              </Button>
            )}
            {data.status === "evaluating" && evalRunId !== undefined && (
              <Button
                size="sm"
                variant="destructive"
                disabled={cancelEval.isPending}
                onClick={() =>
                  cancelEval.mutate(evalRunId, {
                    onSuccess: () => {
                      void qc.invalidateQueries({ queryKey: feedbackKeys.detail(ingestId) });
                      void qc.invalidateQueries({ queryKey: feedbackKeys.list(projectId) });
                    },
                  })
                }
                title="멈춘 eval run을 failed로 마킹 — 이후 eval 재처리 또는 ingest 재생성"
              >
                <Ban className={`h-3.5 w-3.5 ${cancelEval.isPending ? "animate-pulse" : ""}`} />
                eval 강제 종료
              </Button>
            )}
            {showReprocess && (
              <Button
                size="sm"
                variant="outline"
                disabled={reprocess.isPending}
                onClick={() => reprocess.mutate()}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${reprocess.isPending ? "animate-spin" : ""}`} />
                eval 재처리
              </Button>
            )}
            {showManualReview && (
              <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate()}>
                <RefreshCw className={`h-3.5 w-3.5 ${review.isPending ? "animate-spin" : ""}`} />
                review 시작
              </Button>
            )}
            {showReviewRetry && (
              <Button
                size="sm"
                variant="outline"
                disabled={reprocessReview.isPending}
                onClick={() => reprocessReview.mutate()}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${reprocessReview.isPending ? "animate-spin" : ""}`} />
                review 재처리
              </Button>
            )}
          </div>
          {(reprocess.isError || review.isError || reprocessReview.isError) && (
            <ErrorNotice error={reprocess.error ?? review.error ?? reprocessReview.error} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function FeedbackView({ projectId, onProjectIdChange, onOpenEvalRun }: FeedbackViewProps) {
  const [filterStatus, setFilterStatus] = usePersistedState<ImprovementProposalStatus>(
    "opspilot.feedback.proposalStatus",
    "draft",
  );
  const [drilldownIngestId, setDrilldownIngestId] = useState<string | null>(null);
  const { data: projects } = useProjects();
  const { data: ingests, isPending: ingestsPending } = useIngests(projectId);
  const { data: autoIngestConfig } = useAutoIngestConfig();
  const selectedProject = (projects ?? []).find((p) => p.id === projectId);

  const ingestStatuses = (ingests ?? []).map((i) => i.status);
  const hasActiveIngest = ingestStatuses.some(
    (s) => s === "pending" || s === "evaluating" || s === "reviewing",
  );

  // 결정 큐 — 선택 상태의 proposal 만. 카운트 버튼용 전체 카운트는 status 없이 한 번 더.
  const {
    data: proposals,
    isPending,
    isError,
    error,
  } = useProjectProposals(projectId, filterStatus, hasActiveIngest);
  const { data: allProposals } = useProjectProposals(projectId, undefined, hasActiveIngest);

  const countByStatus = (status: ImprovementProposalStatus): number =>
    (allProposals ?? []).filter((p) => p.status === status).length;

  return (
    <div className="space-y-4">
      <ProjectBar
        selectedProjectId={projectId}
        onSelect={(id) => {
          onProjectIdChange(id);
        }}
      />

      {projectId === null ? (
        <EmptyState
          title="프로젝트를 선택하세요"
          hint="위에서 프로젝트를 등록·선택하면 파이프라인 흐름과 개선안 결정 큐가 표시됩니다."
        />
      ) : (
        <div className="space-y-4">
          {selectedProject?.workspaceMode === "managed" && (
            <Alert variant="info">
              <Info className="h-4 w-4" />
              <AlertTitle>관리 클론 모드</AlertTitle>
              <AlertDescription>
                apply는 <code className="font-mono text-xs">{selectedProject.clonePath}</code> 에만
                반영됩니다. Cursor dev 폴더와 다르면 apply 후 sync 배너의 명령 또는{" "}
                <code className="font-mono text-xs">/opspilot-sync-managed-clone</code> 을 사용하세요.
                이중 checkout을 피하려면 프로젝트 등록에서 <strong>로컬 경로 연결</strong>을 권장합니다.
              </AlertDescription>
            </Alert>
          )}

          {/* 상단: 파이프라인 흐름 띠 + 자동 ingest 상태 칩 */}
          <PipelineFlowBand
            statuses={ingestStatuses}
            autoIngestConfig={autoIngestConfig}
            isPending={ingestsPending}
          />

          {/* 메인: 결정 큐 (좌 필터 + 우 카드 목록) */}
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <Card className="h-fit p-4 space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">결정 큐</h2>
              <div className="space-y-1.5">
                {decisionFilters.map((f) => {
                  const count = countByStatus(f.status);
                  const active = filterStatus === f.status;
                  return (
                    <button
                      key={f.status}
                      type="button"
                      onClick={() => setFilterStatus(f.status)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        active
                          ? "border-primary bg-accent"
                          : "border-transparent hover:border-border hover:bg-accent/50",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Badge variant={proposalVariant[f.status] ?? "secondary"} className="px-1.5 py-0 text-[10px]">
                          {f.status}
                        </Badge>
                        {f.label}
                      </span>
                      <span className="font-semibold tabular-nums text-muted-foreground">{count}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <div className="space-y-3">
              {isPending && (
                <Card className="p-6">
                  <Loading label="개선안 불러오는 중…" />
                </Card>
              )}
              {isError && <ErrorNotice error={error} />}
              {!isPending && !isError && (proposals ?? []).length === 0 && (
                <EmptyState
                  title={`${decisionFilters.find((f) => f.status === filterStatus)?.label ?? filterStatus} 개선안 없음`}
                  hint={
                    filterStatus === "draft"
                      ? "Cursor 작업을 ingest 하고 eval 이 끝나면 결정 대기 개선안이 여기 쌓입니다."
                      : "다른 상태 탭을 확인하세요."
                  }
                />
              )}
              {!isPending &&
                !isError &&
                selectedProject &&
                (proposals ?? []).map((p) => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    projectId={projectId}
                    project={selectedProject}
                    onOpenEvalRun={onOpenEvalRun}
                    onOpenIngest={setDrilldownIngestId}
                  />
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ingest 상세 드릴다운 (reprocess·review·트레이스 보존) */}
      <Dialog
        open={drilldownIngestId !== null}
        onOpenChange={(open) => {
          if (!open) setDrilldownIngestId(null);
        }}
      >
        <DialogContent className="flex max-h-[min(90vh,900px)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4 pr-12 text-left">
            <DialogTitle className="text-base">ingest 상세 · 파이프라인</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {drilldownIngestId !== null && selectedProject && projectId !== null && (
              <IngestDrilldownContent
                ingestId={drilldownIngestId}
                projectId={projectId}
                onOpenEvalRun={(runId) => {
                  setDrilldownIngestId(null);
                  onOpenEvalRun(runId);
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FeedbackViewProps {
  projectId: string | null;
  onProjectIdChange: (projectId: string) => void;
  onOpenEvalRun: (runId: string) => void;
}
