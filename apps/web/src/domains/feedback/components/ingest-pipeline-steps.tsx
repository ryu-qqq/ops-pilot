import { AlertCircle, ArrowRight, Check, Circle, Loader2, Minus } from "lucide-react";
import type { IngestBundleDetail } from "@opspilot/shared-types";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { cn } from "../../../lib/utils";
import { deriveIngestPipeline, type PipelineStep, type PipelineStepState } from "../lib/ingest-pipeline";

const stateStyles: Record<
  PipelineStepState,
  { ring: string; bg: string; text: string; connector: string }
> = {
  done: {
    ring: "border-success/40",
    bg: "bg-success/15 text-success",
    text: "text-foreground",
    connector: "bg-success/40",
  },
  active: {
    ring: "border-primary/50",
    bg: "bg-primary/15 text-primary",
    text: "text-foreground",
    connector: "bg-primary/30",
  },
  error: {
    ring: "border-destructive/40",
    bg: "bg-destructive/15 text-destructive",
    text: "text-destructive",
    connector: "bg-destructive/30",
  },
  skipped: {
    ring: "border-border",
    bg: "bg-muted text-muted-foreground",
    text: "text-muted-foreground",
    connector: "bg-border",
  },
  upcoming: {
    ring: "border-border/80",
    bg: "bg-muted/40 text-muted-foreground",
    text: "text-muted-foreground",
    connector: "bg-border/80",
  },
};

function StepIcon({ state }: { state: PipelineStepState }) {
  const className = "h-3.5 w-3.5";
  switch (state) {
    case "done":
      return <Check className={className} strokeWidth={2.5} />;
    case "active":
      return <Loader2 className={cn(className, "animate-spin")} />;
    case "error":
      return <AlertCircle className={className} />;
    case "skipped":
      return <Minus className={className} />;
    default:
      return <Circle className="h-3 w-3" />;
  }
}

function PipelineStepNode({ step }: { step: PipelineStep }) {
  const styles = stateStyles[step.state];
  return (
    <div className="flex min-w-[4.5rem] flex-col items-center gap-1.5 text-center">
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border-2",
          styles.ring,
          styles.bg,
        )}
      >
        <StepIcon state={step.state} />
      </div>
      <span className={cn("text-xs font-medium leading-none", styles.text)}>{step.label}</span>
      {step.detail !== undefined && (
        <span className="max-w-[5.5rem] text-[10px] leading-tight text-muted-foreground">
          {step.detail}
        </span>
      )}
    </div>
  );
}

export function IngestPipelineSteps({ data }: { data: IngestBundleDetail }) {
  const { steps, nextAction } = deriveIngestPipeline(data);

  return (
    <Card className="border-border/80">
      <CardHeader className="border-b pb-3">
        <CardTitle className="text-sm font-medium">처리 단계</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max items-start justify-center gap-0 px-2">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-start">
                <PipelineStepNode step={step} />
                {index < steps.length - 1 && (
                  <div className="flex h-8 w-6 shrink-0 items-center justify-center sm:w-8">
                    <div
                      className={cn(
                        "h-0.5 w-full max-w-[1.25rem] rounded-full sm:max-w-[1.75rem]",
                        stateStyles[step.state].connector,
                      )}
                    />
                    <ArrowRight className="mx-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {nextAction !== null && (
          <div className="rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2.5 text-sm">
            <span className="font-medium text-foreground">다음 할 일 — </span>
            <span className="text-muted-foreground">{nextAction}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
