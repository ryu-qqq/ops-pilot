import { type ReactNode, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Expand, FileCode, Info, RefreshCw, Share2, X } from "lucide-react";
import type { ImprovementProposal, Project, ProposalReviewMeta } from "@opspilot/shared-types";
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
import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { usePersistedState } from "../../../lib/use-persisted-state";
import { ProjectBar } from "../../project/components/project-bar";
import { useProjects } from "../../project/use-project";
import { useCancelRun } from "../../run/use-run";
import { feedbackKeys } from "../api";
import {
  useApplyProposal,
  useApproveProposal,
  useIngestDetail,
  useIngests,
  useRejectProposal,
  useReprocessIngest,
  useReprocessReviewIngest,
  useReviewIngest,
} from "../use-feedback";
import { IngestPipelineSteps } from "./ingest-pipeline-steps";
import { IngestLineage } from "./ingest-lineage";
import { IngestPipelineMiniBadges } from "./ingest-pipeline-mini-badges";
import { PostApplyBanner } from "./post-apply-banner";
import { ingestListSubtitle, ingestListTitle } from "../lib/ingest-label";

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

interface FeedbackViewProps {
  projectId: string | null;
  onProjectIdChange: (projectId: string) => void;
  onOpenEvalRun: (runId: string) => void;
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
  ingestId,
  projectId,
  project,
  reviewMeta,
}: {
  proposal: ImprovementProposal;
  ingestId: string;
  projectId: string;
  project: Project;
  reviewMeta?: ProposalReviewMeta;
}) {
  const approve = useApproveProposal(ingestId, projectId);
  const reject = useRejectProposal(ingestId, projectId);
  const apply = useApplyProposal(ingestId, projectId);
  const busy = approve.isPending || reject.isPending || apply.isPending;

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
          reviewMeta={reviewMeta}
          trigger={
            <Button type="button" variant="outline" size="sm" className="shrink-0">
              <Expand className="h-3.5 w-3.5" />
              자세히
            </Button>
          }
        />
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        <p className="line-clamp-3 text-sm text-muted-foreground">{proposal.rationale}</p>
        {reviewMeta !== undefined && (
          <div className="rounded-md border border-border/80 bg-muted/30 p-2 text-xs space-y-1">
            <p>
              reviewer: <strong>{reviewMeta.decision}</strong> · {reviewMeta.risk} risk ·{" "}
              {reviewMeta.confidence}
              {reviewMeta.applied === true && " · auto-applied"}
            </p>
            <p className="text-muted-foreground">{reviewMeta.rationale}</p>
            {(reviewMeta.conflicts ?? []).length > 0 && (
              <p className="text-warning">conflicts: {(reviewMeta.conflicts ?? []).join(", ")}</p>
            )}
            {reviewMeta.applyError !== undefined && proposal.status === "approved" && (
              <p className="text-xs text-warning">
                reviewer auto-apply 실패 — 「clone에 반영」으로 수동 적용하세요
                <span className="block text-muted-foreground">({reviewMeta.applyError})</span>
              </p>
            )}
            {reviewMeta.applyError !== undefined &&
              proposal.status !== "approved" &&
              proposal.status !== "applied" && (
              <p className="text-destructive">apply: {reviewMeta.applyError}</p>
            )}
          </div>
        )}
        <ProposalDetailDialog
          proposal={proposal}
          reviewMeta={reviewMeta}
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

function IngestDetailPanel({
  ingestId,
  projectId,
  project,
  onOpenEvalRun,
}: {
  ingestId: string;
  projectId: string;
  project: Project;
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

  if (isPending)
    return (
      <Card className="p-6">
        <Loading label="ingest 상세 불러오는 중…" />
      </Card>
    );
  if (isError) return <ErrorNotice error={error} />;
  if (!data) return null;

  const showReprocess =
    data.status === "evaluating" ||
    (data.status === "failed" && data.contextJson.evalError !== undefined && evalRunId !== undefined);

  const showReviewRetry =
    data.contextJson.reviewError !== undefined && reviewRunId !== undefined;

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
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4 text-sm">
          <p>
            git: <code className="font-mono text-xs">{data.gitRef.slice(0, 12)}</code>
          </p>
          {evalRunId !== undefined && (
            <p className="text-xs text-muted-foreground">
              eval run:{" "}
              <code className="font-mono">{evalRunId.slice(0, 8)}</code>
              {data.status === "evaluating" && " (진행 중)"}
            </p>
          )}
          {reviewRunId !== undefined && (
            <p className="text-xs text-muted-foreground">
              review run: <code className="font-mono">{reviewRunId.slice(0, 8)}</code>
              {data.status === "reviewing" && " (진행 중)"}
            </p>
          )}
          {data.notionTaskUrl !== null && (
            <p className="truncate text-muted-foreground">{data.notionTaskUrl}</p>
          )}
          {data.contextJson.retro !== undefined && (
            <p className="text-muted-foreground">회고: {data.contextJson.retro}</p>
          )}
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
                work-evaluator 결과는 아래 개선안 {String(data.proposals.length)}건입니다. 트레이스는
                「eval 트레이스」 버튼으로 확인하세요.
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

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">
          개선안 ({String(data.proposals.length)})
        </h3>
        {data.proposals.length === 0 ? (
          <EmptyState
            title="개선안 없음"
            hint={
              data.status === "evaluating"
                ? "eval run 진행 중이면 「eval 실시간 트레이스」로 흐름 그래프를 보세요."
                : showReprocess
                  ? "eval은 끝났을 수 있습니다 — 「eval 재처리」를 시도하세요."
                  : "eval 완료 후 draft proposal 이 여기 표시됩니다."
            }
          />
        ) : (
          data.proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              ingestId={ingestId}
              projectId={projectId}
              project={project}
              reviewMeta={data.contextJson.proposalReviews?.[p.id]}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function FeedbackView({ projectId, onProjectIdChange, onOpenEvalRun }: FeedbackViewProps) {
  const [selectedIngestId, setSelectedIngestId] = usePersistedState<string | null>(
    "opspilot.feedback.ingestId",
    null,
  );
  const { data: projects } = useProjects();
  const { data: ingests, isPending, isError, error } = useIngests(projectId);

  const selectedProject = (projects ?? []).find((p) => p.id === projectId);

  useEffect(() => {
    if (selectedIngestId === null || ingests === undefined) return;
    if (!ingests.some((item) => item.id === selectedIngestId)) {
      setSelectedIngestId(null);
    }
  }, [selectedIngestId, ingests, setSelectedIngestId]);

  const handleSelectIngest = (id: string) => {
    setSelectedIngestId(id);
  };

  return (
    <div className="space-y-4">
      <ProjectBar
        selectedProjectId={projectId}
        onSelect={(id) => {
          onProjectIdChange(id);
          setSelectedIngestId(null);
        }}
      />

      {projectId === null ? (
        <EmptyState title="프로젝트를 선택하세요" hint="위에서 프로젝트를 등록·선택하면 ingest 목록이 표시됩니다." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          {selectedProject?.workspaceMode === "managed" && (
            <div className="lg:col-span-2">
              <Alert variant="info">
                <Info className="h-4 w-4" />
                <AlertTitle>관리 클론 모드</AlertTitle>
                <AlertDescription>
                  apply는 <code className="font-mono text-xs">{selectedProject.clonePath}</code> 에만
                  반영됩니다. Cursor dev 폴더와 다르면 apply 후 sync 배너의 명령 또는{" "}
                  <code className="font-mono text-xs">/opspilot-sync-managed-clone</code> 을 사용하세요.
                  이중 checkout을 피하려면 프로젝트 등록에서{" "}
                  <strong>로컬 경로 연결</strong>을 권장합니다.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Ingest</h2>
            {isPending && <Loading label="목록 불러오는 중…" />}
            {isError && <ErrorNotice error={error} />}
            {!isPending && !isError && (ingests ?? []).length === 0 && (
              <EmptyState
                title="ingest 없음"
                hint="MCP ingest_cursor_session 또는 POST /api/feedback/ingest 로 번들을 만드세요."
              />
            )}
            <ul className="space-y-1">
              {(ingests ?? []).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectIngest(item.id)}
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left transition-colors",
                      item.id === selectedIngestId
                        ? "border-primary bg-accent"
                        : "border-transparent hover:border-border hover:bg-accent/50",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Badge
                        variant={statusVariant[item.status] ?? "secondary"}
                        className="mt-0.5 shrink-0 px-1.5 py-0 text-[10px]"
                      >
                        {item.status}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium leading-snug">
                          {ingestListTitle(item)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{ingestListSubtitle(item)}</p>
                        <IngestPipelineMiniBadges item={item} />
                        {(item.evalRunId != null || item.reviewRunId != null) && (
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                            {item.evalRunId != null && <>eval {item.evalRunId.slice(0, 8)}</>}
                            {item.evalRunId != null && item.reviewRunId != null && " · "}
                            {item.reviewRunId != null && <>review {item.reviewRunId.slice(0, 8)}</>}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {selectedIngestId !== null &&
          selectedProject &&
          (ingests ?? []).some((item) => item.id === selectedIngestId) ? (
            <IngestDetailPanel
              ingestId={selectedIngestId}
              projectId={projectId}
              project={selectedProject}
              onOpenEvalRun={onOpenEvalRun}
            />
          ) : (
            <Card className="p-6 flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
              왼쪽 ingest 클릭 — eval·review 트레이스는 상세 패널 버튼으로 열 수 있습니다
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
