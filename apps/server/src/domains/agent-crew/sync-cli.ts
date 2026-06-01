import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Project } from "@opspilot/shared-types";
import { syncAgentCrewToProject } from "./sync.js";

// 서버·DB·등록 없이 agent-crew 공통 자산을 소비 프로젝트 clone 에 sync 하는 CLI.
// 부트스트랩(scripts/bootstrap.sh --with-agent-crew=PATH)·수동 둘 다 사용.
//   tsx src/domains/agent-crew/sync-cli.ts <clonePath> [tag]
// sync 는 agent-crew repo 를 tag 로 checkout 하므로, 끝나면 원래 HEAD 로 복원한다.

function crewRepoPath(): string {
  return (
    process.env.OPS_AGENT_CREW_PATH ??
    join(homedir(), "Documents/ryu-qqq/agent-crew")
  );
}

function currentRef(repo: string): string | null {
  try {
    const branch = execFileSync(
      "git",
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      {
        cwd: repo,
        encoding: "utf8",
      },
    ).trim();
    return branch || null;
  } catch {
    // detached — commit SHA 로 복원
    try {
      return execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repo,
        encoding: "utf8",
      }).trim();
    } catch {
      return null;
    }
  }
}

function main(): void {
  const clonePath = process.argv[2];
  const tag = process.argv[3];
  if (!clonePath) {
    console.error("usage: sync-cli <clonePath> [tag]");
    process.exit(1);
  }

  const repo = crewRepoPath();
  const restoreRef = existsSync(join(repo, ".git")) ? currentRef(repo) : null;

  try {
    const result = syncAgentCrewToProject({ clonePath } as Project, tag);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (restoreRef) {
      try {
        execFileSync("git", ["checkout", "--force", restoreRef], {
          cwd: repo,
          stdio: "ignore",
        });
      } catch {
        /* 복원 실패는 무시 — 사용자가 직접 정리 */
      }
    }
  }
}

main();
