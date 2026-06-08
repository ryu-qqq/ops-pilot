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

export interface CommitMeta {
  /** author date ISO 8601(%aI). 조회 실패 시 빈 문자열. */
  committedAt: string;
  /** author 이름(%an). 조회 실패 시 빈 문자열. */
  author: string;
}

/**
 * 작업 목록 표시용 — gitRef 커밋의 author date(%aI)·author name(%an).
 * resolveCommitSubject 와 동일한 git log -1 패턴. 실패 시 빈 메타.
 */
export function resolveCommitMeta(clonePath: string, gitRef: string): CommitMeta {
  try {
    // %aI(author date ISO) \t %an(author name) — subject 와 충돌 없게 탭 구분.
    const out = git(clonePath, ["log", "-1", "--format=%aI%x09%an", gitRef]).trim();
    const tab = out.indexOf("\t");
    if (tab < 0) return { committedAt: out, author: "" };
    return { committedAt: out.slice(0, tab), author: out.slice(tab + 1) };
  } catch {
    return { committedAt: "", author: "" };
  }
}

export interface RecentCommit {
  sha: string;
  subject: string;
  /** author date ISO 8601(%aI). 자동 ingest 최신순 정렬 키. 조회 실패 시 빈 문자열. */
  committedAt: string;
  /** author 이름(%an). 조회 실패 시 빈 문자열. */
  author: string;
}

/**
 * ADR 0004 (2A·2E): 자동 트리거 후보 탐색용 — 최근 커밋 목록(머지 제외).
 * `--no-merges` 로 merge 커밋 제외. 탭 구분 sha/committedAt/author/subject. 실패 시 [].
 * subject 는 본문에 탭을 포함할 수 있으므로 항상 마지막 필드로 둔다(앞 3개만 split).
 */
export function listRecentCommits(
  clonePath: string,
  limit: number,
  branch?: string,
): RecentCommit[] {
  try {
    // sha \t %aI(author date ISO) \t %an(author name) \t %s(subject)
    const args = ["log", "--no-merges", "--format=%H%x09%aI%x09%an%x09%s", "-n", String(limit)];
    args.push(branch ?? "HEAD");
    const out = git(clonePath, args);
    return out
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line !== "")
      .map((line) => {
        // 앞 3개 필드만 탭으로 분리하고 나머지(subject)는 그대로 둔다.
        const parts = line.split("\t");
        const sha = parts[0] ?? "";
        const committedAt = parts[1] ?? "";
        const author = parts[2] ?? "";
        const subject = parts.slice(3).join("\t");
        return { sha, committedAt, author, subject };
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
