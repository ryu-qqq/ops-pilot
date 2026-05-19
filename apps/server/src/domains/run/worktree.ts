import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// 실행 격리: 프로젝트 클론에서 worktree를 *레포 밖*에 떠서 거기서 돌린다.
// 에이전트가 코드를 Write 해도 worktree 안에서만 → 끝나면 통째 폐기로 원복.
export function worktreesBaseDir(): string {
  return process.env.OPS_WORKTREES_DIR ?? join(homedir(), ".opspilot", "worktrees");
}

export class WorktreeError extends Error {}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}

/** clonePath 에서 ref(커밋/브랜치) 기준 detached worktree 생성. 경로 반환. */
export function createWorktree(clonePath: string, ref: string, runId: string): string {
  const base = worktreesBaseDir();
  mkdirSync(base, { recursive: true });
  const wtPath = join(base, runId);
  try {
    git(clonePath, ["worktree", "add", "--detach", "--force", wtPath, ref]);
  } catch (e) {
    throw new WorktreeError(`worktree 생성 실패(ref=${ref}): ${(e as Error).message.slice(0, 300)}`);
  }
  return wtPath;
}

/** 실행 후 정리 (에이전트가 더럽혀도 --force). 실패해도 throw 안 함. */
export function removeWorktree(clonePath: string, wtPath: string): void {
  try {
    git(clonePath, ["worktree", "remove", "--force", wtPath]);
  } catch {
    /* 이미 없음/잠김 — prune 로 정리 시도 */
  }
  try {
    git(clonePath, ["worktree", "prune"]);
  } catch {
    /* best-effort */
  }
}
