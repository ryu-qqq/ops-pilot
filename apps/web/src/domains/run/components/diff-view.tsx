import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import type { RunDiffFileView } from "../api";
import { useRun, useRunDiff } from "../use-run";
import s from "./diff-view.module.css";

// OPSP-30: worktree base 커밋↔실행 후 git diff 결과 패널.
// 격리 worktree 구조의 차별점 — 에이전트가 만진 파일·라인이 정확히 잡힘.

const statusLabel: Record<RunDiffFileView["status"], string> = {
  added: "추가",
  modified: "수정",
  deleted: "삭제",
  renamed: "이름변경",
  binary: "바이너리",
};

const ss = s as Record<string, string | undefined>;
const badgeClass: Record<RunDiffFileView["status"], string> = {
  added: ss.badgeAdded ?? "",
  modified: ss.badgeModified ?? "",
  deleted: ss.badgeDeleted ?? "",
  renamed: ss.badgeRenamed ?? "",
  binary: ss.badgeBinary ?? "",
};

function patchLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return ss.patchAdd ?? "";
  if (line.startsWith("-") && !line.startsWith("---")) return ss.patchDel ?? "";
  if (line.startsWith("@@")) return ss.patchHunk ?? "";
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
      <p className={s.loading}>
        <Loading label="변경 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;

  if (files.length === 0) {
    if (running)
      return (
        <p className={s.loadingRunning}>
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
        hint="이 실행에서 에이전트가 worktree 안 파일을 만지지 않았습니다(읽기·검색만 한 시나리오일 수 있어요)."
      />
    );
  }

  const totals = files.reduce(
    (a, f) => ({ add: a.add + f.additions, del: a.del + f.deletions }),
    { add: 0, del: 0 },
  );

  return (
    <div>
      <div className={s.summary}>
        파일 {files.length} · <span className={s.summaryAdd}>+{totals.add}</span> ·{" "}
        <span className={s.summaryDel}>−{totals.del}</span>
        {run?.runner === "fixture" && <span className={s.summaryFix}>(fixture)</span>}
      </div>
      {files.map((f) => (
        <details key={f.id} className={s.file}>
          <summary className={s.fileSummary}>
            <span className={`${s.badge} ${badgeClass[f.status]}`}>{statusLabel[f.status]}</span>
            <code className={s.path}>{f.filePath}</code>
            {!f.binary && (
              <>
                <span className={s.addCount}>+{f.additions}</span>
                <span className={s.delCount}>−{f.deletions}</span>
              </>
            )}
            {f.truncated && (
              <span className={s.truncated} title="큰 patch 라 잘렸습니다">
                truncated
              </span>
            )}
          </summary>
          {f.binary ? (
            <p className={s.message}>바이너리 파일 — patch 생략.</p>
          ) : f.patch === null ? (
            <p className={s.message}>patch 수집 실패(파일 권한·인코딩 등).</p>
          ) : (
            <pre className={s.patch}>
              {f.patch.split("\n").map((line, i) => (
                <div key={i} className={patchLineClass(line)}>
                  {line}
                </div>
              ))}
            </pre>
          )}
        </details>
      ))}
    </div>
  );
}
