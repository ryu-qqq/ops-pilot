import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanRepo } from "./scanner.js";

// scanner 슬라이스 테스트. 핵심 관심사: 자산 본문(content) 출처.
// 설계 불변식은 "git 커밋 = 버전"이지만, linked 프로젝트가 .claude/ 를 .gitignore 로
// 막아두면(개인 하네스) 자산이 커밋되지 않아 git 이력이 비고 content 가 빈값이 된다.
// 그 경우 working-tree 파일로 폴백해 lint·표시가 살아야 한다(uncommitted 버전).

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "scanner-"));
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "test@opspilot.local"]);
  git(repo, ["config", "user.name", "OpsPilot Test"]);
  git(repo, ["config", "commit.gpgsign", "false"]);
  mkdirSync(join(repo, ".claude", "agents"), { recursive: true });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("scanRepo", () => {
  it("커밋된 .claude 자산은 실제 git 커밋 버전을 가진다", () => {
    writeFileSync(
      join(repo, ".claude", "agents", "tracked.md"),
      "---\nname: tracked\ndescription: 추적되는 자산\n---\n\n# 본문\n",
    );
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "feat: 자산 추가"]);

    const asset = scanRepo(repo).find((a) => a.name === "tracked");
    expect(asset).toBeDefined();
    expect(asset?.versions.length).toBeGreaterThanOrEqual(1);
    expect(asset?.versions[0]?.gitCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it(".gitignore 로 막힌 자산도 working-tree 폴백으로 content 를 채운다", () => {
    // .claude/ 를 통째로 ignore — 사용자 connectly 레포와 동일한 상황.
    writeFileSync(join(repo, ".gitignore"), ".claude/\n");
    git(repo, ["add", ".gitignore"]);
    git(repo, ["commit", "-m", "chore: .claude ignore"]);

    const body = "---\nname: ignored\ndescription: 무시되지만 디스크엔 있음\n---\n\n# 본문\n";
    writeFileSync(join(repo, ".claude", "agents", "ignored.md"), body);

    const asset = scanRepo(repo).find((a) => a.name === "ignored");
    expect(asset).toBeDefined();
    // git 이력이 없어도 정확히 1개의 working-tree 버전이 있어야 한다.
    expect(asset?.versions).toHaveLength(1);
    expect(asset?.versions[0]?.content).toBe(body);
    expect(asset?.versions[0]?.gitCommit).toMatch(/^working-tree:/);
    // frontmatter 가 디스크 파일에서 파싱돼 description 도 채워진다(lint 통과의 근거).
    expect(asset?.description).toBe("무시되지만 디스크엔 있음");
  });
});
