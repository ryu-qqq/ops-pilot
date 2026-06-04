import { type ReactNode } from "react";
import { Check, Expand, FileCode, Layers, Share2, X } from "lucide-react";
import type {
  ImprovementProposal,
  Project,
  ProposalReviewMeta,
  ProposalWithSource,
} from "@opspilot/shared-types";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import { ErrorNotice, Loading } from "../../../lib/ui";
import { useApplyProposal, useApproveProposal, useRejectProposal } from "../use-feedback";
import { PostApplyBanner } from "./post-apply-banner";
import { TriggerBadge } from "./trigger-badge";

export const proposalVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary",
  approved: "warning",
  applied: "success",
  rejected: "destructive",
};

function shortRef(ref: string): string {
  return ref.slice(0, 8);
}

export function ProposalDetailDialog({
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

export function ProposalCard({
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
        {/* 출처 라벨 — commitSubject(없으면 gitRef) + 평가 과정/검토 과정 · ingest 드릴다운. */}
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
              평가 과정
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
              검토 과정
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
