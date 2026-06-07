import { describe, expect, it } from "vitest";
import type { AgentCrewLockFile } from "../agent-crew/sync.js";
import { classifyProposalTarget } from "./classify-target.js";

const lockWith = (files: string[]): AgentCrewLockFile => ({
  version: "v0.12.0",
  syncedFiles: files,
});

describe("classifyProposalTarget", () => {
  it("cursor_rule 은 manifest 와 무관하게 항상 project", () => {
    expect(classifyProposalTarget(lockWith([".cursor/rules/x.mdc"]), "cursor_rule", ".cursor/rules/x.mdc")).toBe("project");
  });

  it("agent 가 manifest 에 있으면 crew", () => {
    expect(classifyProposalTarget(lockWith([".claude/agents/foo.md"]), "agent", ".claude/agents/foo.md")).toBe("crew");
  });

  it("agent 가 manifest 에 없으면 project-local", () => {
    expect(classifyProposalTarget(lockWith([".claude/agents/other.md"]), "agent", ".claude/agents/foo.md")).toBe("project");
  });

  it("lock 이 null 이면 project (agent-crew 미사용)", () => {
    expect(classifyProposalTarget(null, "agent", ".claude/agents/foo.md")).toBe("project");
  });

  it("syncedFiles 가 비면 project (legacy lock, 추측 금지)", () => {
    expect(classifyProposalTarget(lockWith([]), "skill", ".claude/skills/foo/SKILL.md")).toBe("project");
  });
});
