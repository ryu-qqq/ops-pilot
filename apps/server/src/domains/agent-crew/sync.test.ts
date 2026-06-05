import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAgentCrewLock, scaffoldProjectYaml } from "./sync.js";

// project.yaml 의 인라인 주석(` # ...`)을 파서가 떼는지 — 안 떼면 git checkout 이
// "v0.11.0 # 주석" 으로 실패한다(실제 발생 버그).
describe("readAgentCrewLock — project.yaml 인라인 주석", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ops-sync-"));
    mkdirSync(join(dir, ".claude"));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("version 값의 인라인 주석을 떼고 읽는다", () => {
    writeFileSync(
      join(dir, ".claude/project.yaml"),
      [
        "project:",
        "  ide: claude-code # claude-code | cursor | both",
        "agentCrew:",
        "  version: v0.11.0 # 가져올 agent-crew tag",
        "  mustReference:",
        "    - work-evaluator-4-principles # 핵심 원칙",
        "",
      ].join("\n"),
    );

    const lock = readAgentCrewLock(dir);
    expect(lock?.version).toBe("v0.11.0");
    expect(lock?.tag).toBe("v0.11.0");
  });

  it("주석이 없어도 그대로 읽는다", () => {
    writeFileSync(
      join(dir, ".claude/project.yaml"),
      "agentCrew:\n  version: v0.9.1\n",
    );
    expect(readAgentCrewLock(dir)?.version).toBe("v0.9.1");
  });
});

// 등록 직후 project.yaml 자동 생성 — 손으로 yaml 안 써도 sync 진입 가능하게.
describe("scaffoldProjectYaml", () => {
  let dir: string;
  const prevCrewPath = process.env.OPS_AGENT_CREW_PATH;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ops-scaffold-"));
    // crew repo 없는 경로로 고정 → latestCrewTag null → 결정적 테스트.
    process.env.OPS_AGENT_CREW_PATH = join(dir, "no-such-crew");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (prevCrewPath === undefined) delete process.env.OPS_AGENT_CREW_PATH;
    else process.env.OPS_AGENT_CREW_PATH = prevCrewPath;
  });

  it("project.yaml 이 없으면 기본값으로 생성한다", () => {
    const result = scaffoldProjectYaml(dir);
    expect(result.created).toBe(true);
    expect(existsSync(join(dir, ".claude/project.yaml"))).toBe(true);
    const text = readFileSync(join(dir, ".claude/project.yaml"), "utf8");
    expect(text).toContain("ide: claude-code");
    expect(text).toContain("work-evaluator-4-principles");
    // crew repo 부재 → version 은 주석 힌트로 남는다.
    expect(text).toContain("# version: vX.Y.Z");
  });

  it("이미 project.yaml 이 있으면 덮어쓰지 않는다", () => {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude/project.yaml"), "project:\n  ide: cursor\n");
    const result = scaffoldProjectYaml(dir);
    expect(result.created).toBe(false);
    expect(readFileSync(join(dir, ".claude/project.yaml"), "utf8")).toContain(
      "ide: cursor",
    );
  });
});
