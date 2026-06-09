import { useState } from "react";

import { Badge } from "../../../components/ui/badge";
import { PatchLines } from "../../../lib/patch-lines";
import { EmptyState } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { parseCommitDiff } from "../lib/parse-commit-diff";

/** 경로에서 파일명만 (run/diff-view 와 동일). rename 표시("a → b")면 마지막 토큰 기준. */
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
  /** `git diff gitRef^..gitRef`(루트커밋이면 `git show`)의 통짜 unified diff. 빈 문자열이면 변경 없음. */
  diffSummary: string;
  /** true면 256KB 초과로 diff가 일부만 수집됨. */
  truncated?: boolean;
}

/**
 * 커밋의 실제 변경 diff 를 run 도메인 DiffView 와 같은 2-pane 으로 렌더 —
 * 왼쪽 파일 목록(고정 폭·세로 스크롤) + 오른쪽 선택 파일 patch. 통짜 unified diff 문자열을
 * parseCommitDiff 로 파일별로 쪼개 보여준다(API 추가 없음 — 이미 ingest 상세로 내려옴).
 */
export function CommitDiffView({ diffSummary, truncated = false }: Props) {
  // 미선택/stale 이면 첫 파일로 폴백하므로 selectedId 만 state 로.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 빈 문자열 = 실제 변경 없음(빈/머지 커밋). 수집 실패가 아니다 —
  // 백엔드 apps/server/src/domains/feedback/service.ts 에서 collectCommitDiff 실패 시
  // throw new FeedbackIngestError("InvalidGitRef") 로 ingest 자체가 실패하므로,
  // 수집 실패는 애초에 빈 diffSummary 로 내려오지 않는다(여기까지 도달하지 못함).
  if (diffSummary === "") {
    return (
      <EmptyState
        title="이 커밋은 변경 없음"
        hint="빈 커밋이거나 머지 커밋이라 diff가 비어 있습니다. (수집 실패가 아니라 실제로 바뀐 파일이 없는 경우입니다.)"
      />
    );
  }

  const files = parseCommitDiff(diffSummary);
  const totals = files.reduce(
    (a, f) => ({ add: a.add + f.additions, del: a.del + f.deletions }),
    { add: 0, del: 0 },
  );
  // 선택 파일 — 미선택이거나 stale 이면 첫 파일.
  const selected = files.find((f) => f.id === selectedId) ?? files[0];
  if (selected === undefined) return null;

  return (
    <div className="space-y-2">
      {truncated && (
        <Badge variant="warning" title="256KB를 초과해 diff의 일부만 표시됩니다">
          256KB 초과 — 일부만 표시
        </Badge>
      )}
      <div className="text-sm text-muted-foreground">
        파일 {files.length} · <span className="text-success">+{totals.add}</span> ·{" "}
        <span className="text-destructive">−{totals.del}</span>
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
                  {f.binary && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      바이너리
                    </Badge>
                  )}
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
            {selected.binary && (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                바이너리
              </Badge>
            )}
            <code className="flex-1 truncate font-mono text-xs">{selected.filePath}</code>
            {!selected.binary && (
              <span className="shrink-0 text-xs">
                <span className="text-success">+{selected.additions}</span>{" "}
                <span className="text-destructive">−{selected.deletions}</span>
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {selected.binary ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                바이너리 파일 — patch 생략.
              </p>
            ) : (
              <PatchLines patch={selected.patch} filePath={selected.filePath} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
