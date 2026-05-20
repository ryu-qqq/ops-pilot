import type { CSSProperties } from "react";
import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import type { RunDiffFileView } from "../api";
import { useRun, useRunDiff } from "../use-run";

// OPSP-30: worktree base 커밋↔실행 후 git diff 결과 패널.
// 격리 worktree 구조의 차별점 — 에이전트가 만진 파일·라인이 정확히 잡힘.
// fixture/실행중/no-diff 상태별 카피로 "왜 비었나"를 항상 분명히.

const statusColor: Record<RunDiffFileView["status"], string> = {
  added: "#1a7f37",
  modified: "#9a6700",
  deleted: "#cf222e",
  renamed: "#8250df",
  binary: "#6e7781",
};

const statusLabel: Record<RunDiffFileView["status"], string> = {
  added: "추가",
  modified: "수정",
  deleted: "삭제",
  renamed: "이름변경",
  binary: "바이너리",
};

const summaryStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 6px",
  cursor: "pointer",
  fontSize: 12,
};

const badge = (color: string): CSSProperties => ({
  display: "inline-block",
  padding: "1px 6px",
  borderRadius: 3,
  background: color,
  color: "white",
  fontSize: 10,
  fontWeight: 700,
  minWidth: 40,
  textAlign: "center",
});

// 색 입힌 patch — +/- 행만 가볍게.
function colorPatchLine(line: string): CSSProperties {
  if (line.startsWith("+") && !line.startsWith("+++")) return { background: "#d2f8d7" };
  if (line.startsWith("-") && !line.startsWith("---")) return { background: "#ffd7d5" };
  if (line.startsWith("@@")) return { color: "#0969da" };
  return {};
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
      <p style={{ color: "#57606a" }}>
        <Loading label="변경 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;

  if (files.length === 0) {
    if (running)
      return (
        <p style={{ color: "#9a6700" }}>
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
      <div style={{ fontSize: 12, color: "#57606a", marginBottom: 4 }}>
        파일 {files.length} · <span style={{ color: "#1a7f37" }}>+{totals.add}</span> ·{" "}
        <span style={{ color: "#cf222e" }}>−{totals.del}</span>
        {run?.runner === "fixture" && <span style={{ marginLeft: 6 }}>(fixture)</span>}
      </div>
      {files.map((f) => (
        <details key={f.id} style={{ border: "1px solid #d0d7de", borderRadius: 4, marginBottom: 4 }}>
          <summary style={summaryStyle}>
            <span style={badge(statusColor[f.status])}>{statusLabel[f.status]}</span>
            <code style={{ flex: 1, fontSize: 12 }}>{f.filePath}</code>
            {!f.binary && (
              <>
                <span style={{ color: "#1a7f37" }}>+{f.additions}</span>
                <span style={{ color: "#cf222e" }}>−{f.deletions}</span>
              </>
            )}
            {f.truncated && (
              <span style={{ fontSize: 10, color: "#9a6700" }} title="큰 patch 라 잘렸습니다">
                truncated
              </span>
            )}
          </summary>
          {f.binary ? (
            <p style={{ padding: "4px 8px", fontSize: 12, color: "#57606a", margin: 0 }}>
              바이너리 파일 — patch 생략.
            </p>
          ) : f.patch === null ? (
            <p style={{ padding: "4px 8px", fontSize: 12, color: "#57606a", margin: 0 }}>
              patch 수집 실패(파일 권한·인코딩 등).
            </p>
          ) : (
            <pre
              style={{
                margin: 0,
                padding: "6px 8px",
                fontSize: 11,
                overflowX: "auto",
                background: "#f6f8fa",
                borderTop: "1px solid #eee",
              }}
            >
              {f.patch.split("\n").map((line, i) => (
                <div key={i} style={colorPatchLine(line)}>
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
