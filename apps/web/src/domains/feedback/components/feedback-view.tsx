import { useState } from "react";
import { Check, FileCode, X } from "lucide-react";
import type { ImprovementProposal } from "@opspilot/shared-types";
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
import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { ProjectBar } from "../../project/components/project-bar";
import {
  useApplyProposal,
  useApproveProposal,
  useIngestDetail,
  useIngests,
  useRejectProposal,
} from "../use-feedback";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  done: "success",
  failed: "destructive",
  evaluating: "warning",
  pending: "secondary",
};

const proposalVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary",
  approved: "warning",
  applied: "success",
  rejected: "destructive",
};

function ProposalCard({
  proposal,
  ingestId,
  projectId,
}: {
  proposal: ImprovementProposal;
  ingestId: string;
  projectId: string;
}) {
  const approve = useApproveProposal(ingestId, projectId);
  const reject = useRejectProposal(ingestId, projectId);
  const apply = useApplyProposal(ingestId, projectId);
  const busy = approve.isPending || reject.isPending || apply.isPending;

  return (
    <Card className="border-border/80">
      <CardHeader className="flex flex-row items-start justify-between gap-2 border-b pb-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Badge variant={proposalVariant[proposal.status] ?? "secondary"}>{proposal.status}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{proposal.targetKind}</span>
          </CardTitle>
          <p className="truncate font-mono text-xs">{proposal.targetPath}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        <p className="text-sm text-muted-foreground">{proposal.rationale}</p>
        <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-xs whitespace-pre-wrap">
          {proposal.content}
        </pre>
        {proposal.appliedCommit !== null && (
          <p className="font-mono text-xs text-muted-foreground">
            applied: {proposal.appliedCommit.slice(0, 8)}
          </p>
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
                <code className="font-mono text-xs">{proposal.targetPath}</code> 를 프로젝트 clone에
                쓰고 구조화 커밋합니다. 되돌리려면 git으로 revert하세요.
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
}: {
  ingestId: string;
  projectId: string;
}) {
  const { data, isPending, isError, error } = useIngestDetail(ingestId);

  if (isPending)
    return (
      <Card className="p-6">
        <Loading label="ingest 상세 불러오는 중…" />
      </Card>
    );
  if (isError) return <ErrorNotice error={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Ingest
            <Badge variant={statusVariant[data.status] ?? "secondary"}>{data.status}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-4 text-sm">
          <p>
            git: <code className="font-mono text-xs">{data.gitRef.slice(0, 12)}</code>
          </p>
          {data.notionTaskUrl !== null && (
            <p className="truncate text-muted-foreground">{data.notionTaskUrl}</p>
          )}
          {data.contextJson.retro !== undefined && (
            <p className="text-muted-foreground">회고: {data.contextJson.retro}</p>
          )}
          {data.contextJson.evalError !== undefined && (
            <p className="text-destructive text-xs">{data.contextJson.evalError}</p>
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
                ? "eval run 진행 중…"
                : "eval 완료 후 draft proposal 이 여기 표시됩니다."
            }
          />
        ) : (
          data.proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} ingestId={ingestId} projectId={projectId} />
          ))
        )}
      </div>
    </div>
  );
}

export function FeedbackView() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedIngestId, setSelectedIngestId] = useState<string | null>(null);
  const { data: ingests, isPending, isError, error } = useIngests(projectId);

  return (
    <div className="space-y-4">
      <ProjectBar
        selectedProjectId={projectId}
        onSelect={(id) => {
          setProjectId(id);
          setSelectedIngestId(null);
        }}
      />

      {projectId === null ? (
        <EmptyState title="프로젝트를 선택하세요" hint="위에서 프로젝트를 등록·선택하면 ingest 목록이 표시됩니다." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
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
                    onClick={() => setSelectedIngestId(item.id)}
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left transition-colors",
                      item.id === selectedIngestId
                        ? "border-primary bg-accent"
                        : "border-transparent hover:border-border hover:bg-accent/50",
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant={statusVariant[item.status] ?? "secondary"} className="px-1.5 py-0 text-[10px]">
                        {item.status}
                      </Badge>
                      <code className="font-mono text-xs text-muted-foreground">
                        {item.gitRef.slice(0, 8)}
                      </code>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      draft {String(item.draftProposalCount)} · {new Date(item.createdAt).toLocaleString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {selectedIngestId !== null ? (
            <IngestDetailPanel ingestId={selectedIngestId} projectId={projectId} />
          ) : (
            <Card className="flex min-h-[240px] items-center justify-center p-6 text-sm text-muted-foreground">
              왼쪽에서 ingest 를 선택하세요
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
