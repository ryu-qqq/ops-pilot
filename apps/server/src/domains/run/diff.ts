import { execFileSync } from "node:child_process";
import type { RunDiffFileStatus } from "@opspilot/shared-types";

// OPSP-30: worktree 폐기 전 base 커밋↔현재 상태 diff 수집.
// 격리 worktree 라서 에이전트가 어떤 파일·라인을 만졌는지가 정확.
// patch 라인 수·파일 수 잘라내기 + 바이너리 스킵으로 비용 통제.

export interface CollectedDiffFile {
  filePath: string;
  status: RunDiffFileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  truncated: boolean;
  patch: string | null;
}

const MAX_FILES = 200;
const MAX_PATCH_BYTES = 8 * 1024; // 파일당 8KB

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

// "A\tpath" / "M\tpath" / "D\tpath" / "R97\told\tnew" 라인 → 상태 매핑.
function parseNameStatus(out: string): Map<string, RunDiffFileStatus> {
  const map = new Map<string, RunDiffFileStatus>();
  for (const line of out.split("\n")) {
    if (line === "") continue;
    const parts = line.split("\t");
    const code = parts[0];
    if (code === undefined) continue;
    if (code.startsWith("R")) {
      const newPath = parts[2];
      if (newPath !== undefined) map.set(newPath, "renamed");
      continue;
    }
    const path = parts[1];
    if (path === undefined) continue;
    if (code === "A") map.set(path, "added");
    else if (code === "D") map.set(path, "deleted");
    else map.set(path, "modified");
  }
  return map;
}

/**
 * worktree 안에서 baseRef 대비 변경된 파일을 수집한다.
 * - untracked 파일은 `git add -N .` 로 stage(intent-to-add)해서 diff 에 잡히게 함(격리이므로 sideeffect 안전).
 * - 큰 patch / 바이너리 / 많은 파일은 안전한 한도로 자른다.
 * 실패하면 빈 배열 반환(실행 자체에 영향 X).
 */
export function collectDiffFiles(worktreePath: string, baseRef: string): CollectedDiffFile[] {
  try {
    git(worktreePath, ["add", "-N", "."]);
  } catch {
    // worktree가 비었거나 git 상태 이상 — 다음 단계로
  }
  let numstat: string;
  let nameStatus: string;
  try {
    numstat = git(worktreePath, ["diff", "--numstat", baseRef]);
    nameStatus = git(worktreePath, ["diff", "--name-status", baseRef]);
  } catch {
    return [];
  }
  const statusByPath = parseNameStatus(nameStatus);

  const result: CollectedDiffFile[] = [];
  for (const line of numstat.split("\n")) {
    if (line === "" || result.length >= MAX_FILES) break;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const adds = parts[0];
    const dels = parts[1];
    // path 에 탭이 있을 수도 — rest를 join. rename 의 "old => new" 표기는 단순화: 그대로 path 로.
    const filePath = parts.slice(2).join("\t");
    if (adds === undefined || dels === undefined || filePath === "") continue;

    const binary = adds === "-" && dels === "-";
    const status: RunDiffFileStatus = binary
      ? "binary"
      : (statusByPath.get(filePath) ?? "modified");

    let patch: string | null = null;
    let truncated = false;
    if (!binary && status !== "deleted") {
      try {
        const raw = git(worktreePath, ["diff", baseRef, "--", filePath]);
        if (raw.length > MAX_PATCH_BYTES) {
          patch = raw.slice(0, MAX_PATCH_BYTES);
          truncated = true;
        } else {
          patch = raw;
        }
      } catch {
        patch = null;
      }
    } else if (!binary && status === "deleted") {
      // deleted: -단 patch 도 의미 있음(어떤 줄이 사라졌는지). 동일 명령으로.
      try {
        const raw = git(worktreePath, ["diff", baseRef, "--", filePath]);
        if (raw.length > MAX_PATCH_BYTES) {
          patch = raw.slice(0, MAX_PATCH_BYTES);
          truncated = true;
        } else {
          patch = raw;
        }
      } catch {
        patch = null;
      }
    }
    result.push({
      filePath,
      status,
      additions: binary ? 0 : Number(adds),
      deletions: binary ? 0 : Number(dels),
      binary,
      truncated,
      patch,
    });
  }
  return result;
}
