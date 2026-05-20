import { Badge } from "../../../components/ui/badge";
import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import type { RunDiffFileView } from "../api";
import { useRun, useRunDiff } from "../use-run";

const statusLabel: Record<RunDiffFileView["status"], string> = {
  added: "추가",
  modified: "수정",
  deleted: "삭제",
  renamed: "이름변경",
  binary: "바이너리",
};

const statusVariant: Record<RunDiffFileView["status"], "success" | "warning" | "destructive" | "info" | "secondary"> = {
  added: "success",
  modified: "warning",
  deleted: "destructive",
  renamed: "info",
  binary: "secondary",
};

function patchLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "bg-success/15";
  if (line.startsWith("-") && !line.startsWith("---")) return "bg-destructive/15";
  if (line.startsWith("@@")) return "text-primary";
  return "";
}

interface Props {
  runId: string | null;
}

export function DiffView({ runId }: Props) {
  const { data: run } = useRun(runId);
  const running = run?.status === "running";
  const { data: files, isPending, isError, error } = useRunDiff(runId, running);

  if (runId === null) return null;
  if (isPending)
    return (
      <p className="text-sm text-muted-foreground">
        <Loading label="변경 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;

  if (files.length === 0) {
    if (running)
      return (
        <p className="text-sm text-warning">
          <Loading label="변경 수집 대기 (실행 종료 후 worktree에서 diff 추출)…" />
        </p>
      );
    if (run?.runner === "fixture")
      return (
        <EmptyState
          title="fixture 실행 — 변경 없음"
          hint="결정론적 가짜 트레이스(토큰 0). 실제 파일을 만지지 않으므로 diff 가 비어있는 게 정상입니다. local-claude 로 실행하면 worktree 안의 모든 변경이 여기 표시됩니다."
        />
      );
    return (
      <EmptyState
        title="변경된 파일 없음"
        hint="이 실행에서 에이전트가 worktree 안 파일을 만지지 않았습니다."
      />
    );
  }

  const totals = files.reduce(
    (a, f) => ({ add: a.add + f.additions, del: a.del + f.deletions }),
    { add: 0, del: 0 },
  );

  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">
        파일 {files.length} · <span className="text-success">+{totals.add}</span> ·{" "}
        <span className="text-destructive">−{totals.del}</span>
        {run?.runner === "fixture" && <span className="ml-2">(fixture)</span>}
      </div>
      <ul className="space-y-1.5">
        {files.map((f) => (
          <li key={f.id}>
            <details className="rounded-md border">
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
                <Badge variant={statusVariant[f.status]} className="text-[10px]">
                  {statusLabel[f.status]}
                </Badge>
                <code className="flex-1 truncate font-mono text-xs">{f.filePath}</code>
                {!f.binary && (
                  <>
                    <span className="text-success">+{f.additions}</span>
                    <span className="text-destructive">−{f.deletions}</span>
                  </>
                )}
                {f.truncated && (
                  <Badge variant="warning" className="text-[10px]" title="큰 patch 라 잘렸습니다">
                    truncated
                  </Badge>
                )}
              </summary>
              {f.binary ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">바이너리 파일 — patch 생략.</p>
              ) : f.patch === null ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  patch 수집 실패(파일 권한·인코딩 등).
                </p>
              ) : (
                <pre className="overflow-x-auto border-t bg-muted/50 px-3 py-2 font-mono text-xs leading-relaxed">
                  {f.patch.split("\n").map((line, i) => (
                    <div key={i} className={cn(patchLineClass(line))}>
                      {line}
                    </div>
                  ))}
                </pre>
              )}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
