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

/** ingest 목록·상세 라벨용 — git log subject 한 줄. */
export function resolveCommitSubject(clonePath: string, gitRef: string): string {
  try {
    return git(clonePath, ["log", "-1", "--format=%s", gitRef]).trim();
  } catch {
    return "";
  }
}

export interface RecentCommit {
  sha: string;
  subject: string;
}

/**
 * ADR 0004 (2A·2E): 자동 트리거 후보 탐색용 — 최근 커밋 목록(머지 제외).
 * `--no-merges` 로 merge 커밋 제외, 탭 구분 sha/subject. 실패 시 [].
 */
export function listRecentCommits(
  clonePath: string,
  limit: number,
  branch?: string,
): RecentCommit[] {
  try {
    const args = ["log", "--no-merges", "--format=%H%x09%s", "-n", String(limit)];
    args.push(branch ?? "HEAD");
    const out = git(clonePath, args);
    return out
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line !== "")
      .map((line) => {
        const tab = line.indexOf("\t");
        if (tab < 0) return { sha: line, subject: "" };
        return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
      });
  } catch {
    return [];
  }
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
