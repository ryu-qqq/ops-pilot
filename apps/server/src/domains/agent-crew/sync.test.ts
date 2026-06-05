import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAgentCrewLock } from "./sync.js";

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
