import type { ReactNode } from "react";
import { GitCommit, Play, ShieldCheck, Sparkles } from "lucide-react";
import type { IngestBundleDetail } from "@opspilot/shared-types";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";

function shortId(id: string, len = 8): string {
  return id.slice(0, len);
}

interface IngestLineageProps {
  data: IngestBundleDetail;
  onOpenRun: (runId: string) => void;
}

/** commit → eval → proposals → review → apply 흐름을 한눈에. */
export function IngestLineage({ data, onOpenRun }: IngestLineageProps) {
  const ctx = data.contextJson;
  const evalRunId = ctx.evalRunId;
  const reviewRunId = ctx.reviewRunId;
  const applied = data.proposals.filter((p) => p.status === "applied");
  const draft = data.proposals.filter((p) => p.status === "draft");
  const approved = data.proposals.filter((p) => p.status === "approved");

  const commitLabel =
    ctx.commitSubject != null && ctx.commitSubject.trim() !== ""
      ? ctx.commitSubject
      : `commit ${shortId(data.gitRef)}`;

  return (
    <Card className="border-border/80">
      <CardHeader className="border-b pb-3">
        <CardTitle className="text-sm font-medium">기원 · 파생 관계</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4 text-sm">
        <LineageRow
          icon={<GitCommit className="h-4 w-4" />}
          title="시작 커밋"
          body={
            <>
              <code className="font-mono text-xs">{shortId(data.gitRef, 12)}</code>
              <span className="text-muted-foreground"> — {commitLabel}</span>
            </>
          }
        />
        {evalRunId !== undefined && (
          <LineageRow
            icon={<Play className="h-4 w-4" />}
            title="eval run (work-evaluator)"
            body={
              <>
                run <code className="font-mono text-xs">{shortId(evalRunId)}</code>
                {" → "}
                개선안 {String(data.proposals.length)}건
                {data.proposals.length > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    (draft {String(draft.length)} · approved {String(approved.length)} · applied{" "}
                    {String(applied.length)})
                  </span>
                )}
              </>
            }
            action={
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => onOpenRun(evalRunId)}>
                트레이스
              </Button>
            }
          />
        )}
        {reviewRunId !== undefined && (
          <LineageRow
            icon={<ShieldCheck className="h-4 w-4" />}
            title="review run (proposal-reviewer)"
            body={
              <>
                run <code className="font-mono text-xs">{shortId(reviewRunId)}</code>
                {ctx.reviewSummary != null && (
                  <span className="text-muted-foreground"> — {ctx.reviewSummary}</span>
                )}
              </>
            }
            action={
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => onOpenRun(reviewRunId)}>
                트레이스
              </Button>
            }
          />
        )}
        {applied.length > 0 && (
          <LineageRow
            icon={<Sparkles className="h-4 w-4" />}
            title="clone 반영"
            body={
              <span className="space-y-1">
                {applied.map((p) => (
                  <span key={p.id} className="block font-mono text-xs">
                    {p.targetPath}
                    {p.appliedCommit != null && ` → ${shortId(p.appliedCommit, 12)}`}
                  </span>
                ))}
              </span>
            }
          />
        )}
        {ctx.retro != null && ctx.retro.trim() !== "" && (
          <p className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            회고: {ctx.retro}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function LineageRow({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <div className="leading-relaxed">{body}</div>
      </div>
      {action !== undefined && <div className="shrink-0 self-start">{action}</div>}
    </div>
  );
}
