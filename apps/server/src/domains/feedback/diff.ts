import { execFileSync } from "node:child_process";

// TASK-5b: 프로젝트 clone 기준 commit diff 수집. run/worktree diff 와 분리 — ingest 는 clonePath + gitRef.

export const DEFAULT_MAX_DIFF_BYTES = 256 * 1024;

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

export interface CollectCommitDiffResult {
  diffSummary: string;
  truncated: boolean;
}

/** `gitRef^..gitRef` unified diff. 루트 커밋이면 `git show --patch` 로 대체. */
export function collectCommitDiff(
  clonePath: string,
  gitRef: string,
  maxDiffBytes = DEFAULT_MAX_DIFF_BYTES,
): CollectCommitDiffResult {
  git(clonePath, ["rev-parse", "--verify", gitRef]);

  let diff: string;
  try {
    diff = git(clonePath, ["diff", `${gitRef}^`, gitRef]);
  } catch {
    diff = git(clonePath, ["show", gitRef, "--format=", "--patch"]);
  }

  if (diff.length <= maxDiffBytes) {
    return { diffSummary: diff, truncated: false };
  }
  return { diffSummary: diff.slice(0, maxDiffBytes), truncated: true };
}
