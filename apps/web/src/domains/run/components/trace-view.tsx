import { Badge } from "../../../components/ui/badge";
import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { useRun, useRunTrace } from "../use-run";
import type { TraceEventView } from "../api";

// 타입별 색·라벨.
const typeMeta: Record<string, { label: string; tone: string }> = {
  system: { label: "SYSTEM", tone: "text-muted-foreground border-muted" },
  user_message: { label: "USER", tone: "text-primary border-primary/50" },
  assistant_message: { label: "ASSISTANT", tone: "text-foreground border-foreground/40" },
  thinking: { label: "THINKING", tone: "text-info border-info/50" },
  tool_call: { label: "TOOL →", tone: "text-warning border-warning/50" },
  tool_result: { label: "← RESULT", tone: "text-success border-success/50" },
  result: { label: "DONE", tone: "text-primary border-primary/50" },
};

function preview(v: unknown): string {
  if (v === null || v === undefined) return "";
  const str = typeof v === "string" ? v : JSON.stringify(v);
  return str.length > 120 ? `${str.slice(0, 120)}…` : str;
}

function pretty(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

function TraceRow({ e }: { e: TraceEventView }) {
  const meta = typeMeta[e.type] ?? { label: e.type.toUpperCase(), tone: "border-border" };
  const body = e.input ?? e.output;
  return (
    <li className={cn("relative border-l-2 pl-4 pb-3", meta.tone)}>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">#{e.seq}</span>
        <span className={cn("font-semibold", meta.tone.split(" ")[0])}>{meta.label}</span>
        {e.name && <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{e.name}</code>}
      </div>
      {body !== null && body !== undefined && (
        <details className="mt-1">
          <summary className="cursor-pointer text-sm hover:text-primary">{preview(body)}</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md border bg-muted/50 p-2 font-mono text-xs">
            {e.input != null && `input:\n${pretty(e.input)}\n\n`}
            {e.output != null && `output:\n${pretty(e.output)}`}
          </pre>
        </details>
      )}
    </li>
  );
}

export function TraceView({ runId }: { runId: string | null }) {
  const { data: run } = useRun(runId);
  const running = run?.status === "running";
  const { data: trace, isPending, isError, error } = useRunTrace(runId, running);

  if (runId === null)
    return (
      <EmptyState
        title="실행을 선택하세요"
        hint="왼쪽 목록에서 실행(run)을 고르면 단계별 트레이스가 여기 표시됩니다."
      />
    );
  if (isPending)
    return (
      <p className="text-sm text-muted-foreground">
        <Loading label="트레이스 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;

  const statusBadge =
    run && (
      <Badge
        variant={
          running ? "warning" : run.status === "succeeded" ? "success" : "destructive"
        }
      >
        {running ? "실행 중… (실시간 갱신)" : run.status}
      </Badge>
    );

  return (
    <div className="space-y-3">
      {statusBadge}
      {trace.length === 0 ? (
        running ? (
          <p className="text-sm text-warning">
            <Loading label="트레이스 생성 중…" />
          </p>
        ) : (
          <EmptyState title="트레이스가 없어요" hint="이 실행에서 기록된 단계가 없습니다." />
        )
      ) : (
        <ol className="ml-2 space-y-2">
          {trace.map((e) => (
            <TraceRow key={e.seq} e={e} />
          ))}
        </ol>
      )}
    </div>
  );
}
