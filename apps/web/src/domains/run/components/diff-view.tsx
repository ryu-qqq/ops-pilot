import { useState } from "react";

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

/** 경로에서 파일명만. */
function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

/** 경로에서 디렉터리만 (루트 파일이면 ""). */
function dirName(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

interface Props {
  runId: string | null;
}

/**
 * 실행 결과 diff 뷰 — 2-pane 마스터-디테일 (OPSP-40).
 * 왼쪽: 파일 목록(고정 폭·세로 스크롤). 오른쪽: 선택 파일의 patch.
 */
export function DiffView({ runId }: Props) {
  const { data: run } = useRun(runId);
  const running = run?.status === "running";
  const { data: files, isPending, isError, error } = useRunDiff(runId, running);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  // 선택 파일 — 미선택이거나 stale(폴링으로 목록 갱신) 이면 첫 파일.
  const selected = files.find((f) => f.id === selectedId) ?? files[0];
  if (selected === undefined) return null;

  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">
        파일 {files.length} · <span className="text-success">+{totals.add}</span> ·{" "}
        <span className="text-destructive">−{totals.del}</span>
        {run?.runner === "fixture" && <span className="ml-2">(fixture)</span>}
      </div>
      <div className="flex h-[60vh] gap-3">
        {/* 왼쪽 — 파일 목록 */}
        <ul className="w-64 shrink-0 space-y-1 overflow-y-auto pr-1">
          {files.map((f) => {
            const dir = dirName(f.filePath);
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(f.id);
                  }}
                  title={f.filePath}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left hover:bg-accent",
                    f.id === selected.id ? "border-primary bg-accent" : "border-transparent",
                  )}
                >
                  <Badge variant={statusVariant[f.status]} className="shrink-0 text-[10px]">
                    {statusLabel[f.status]}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs font-medium">
                      {baseName(f.filePath)}
                    </span>
                    {dir !== "" && (
                      <span
                        dir="rtl"
                        className="block truncate text-left text-[10px] text-muted-foreground"
                      >
                        {dir}
                      </span>
                    )}
                  </span>
                  {!f.binary && (
                    <span className="shrink-0 text-[10px]">
                      <span className="text-success">+{f.additions}</span>{" "}
                      <span className="text-destructive">−{f.deletions}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {/* 오른쪽 — 선택 파일 patch */}
        <div className="flex min-w-0 flex-1 flex-col rounded-md border">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Badge variant={statusVariant[selected.status]} className="shrink-0 text-[10px]">
              {statusLabel[selected.status]}
            </Badge>
            <code className="flex-1 truncate font-mono text-xs">{selected.filePath}</code>
            {!selected.binary && (
              <span className="shrink-0 text-xs">
                <span className="text-success">+{selected.additions}</span>{" "}
                <span className="text-destructive">−{selected.deletions}</span>
              </span>
            )}
            {selected.truncated && (
              <Badge variant="warning" className="shrink-0 text-[10px]" title="큰 patch 라 잘렸습니다">
                truncated
              </Badge>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {selected.binary ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">바이너리 파일 — patch 생략.</p>
            ) : selected.patch === null ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                patch 수집 실패(파일 권한·인코딩 등).
              </p>
            ) : (
              <pre className="bg-muted/50 px-3 py-2 font-mono text-xs leading-relaxed">
                {selected.patch.split("\n").map((line, i) => (
                  <div key={i} className={cn(patchLineClass(line))}>
                    {line}
                  </div>
                ))}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
