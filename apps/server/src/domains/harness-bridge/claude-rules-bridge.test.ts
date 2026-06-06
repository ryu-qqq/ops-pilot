import { describe, it, expect } from "vitest";
import { mergeRuleBridgeHooks } from "./claude-rules-bridge.js";

describe("mergeRuleBridgeHooks", () => {
  it("빈 설정에 두 훅을 추가한다", () => {
    const { settings, changed } = mergeRuleBridgeHooks({});
    expect(changed).toBe(true);
    const post = settings.hooks.PostToolUse[0];
    expect(post?.matcher).toBe("Edit|Write|MultiEdit");
    expect(post?.hooks[0]?.command).toContain("inject-cursor-rules.mjs");
    expect(settings.hooks.SessionStart[0]?.hooks[0]?.command).toContain("inject-cursor-rules.mjs");
  });

  it("이미 설치돼 있으면 changed=false, 중복 없음", () => {
    const once = mergeRuleBridgeHooks({}).settings;
    const { settings, changed } = mergeRuleBridgeHooks(once);
    expect(changed).toBe(false);
    expect(settings.hooks.PostToolUse).toHaveLength(1);
  });

  it("기존 사용자 훅·설정을 보존한다", () => {
    const user = {
      model: "opus",
      hooks: { PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }] },
    };
    const { settings } = mergeRuleBridgeHooks(user);
    expect(settings.model).toBe("opus");
    expect(settings.hooks.PostToolUse).toHaveLength(2); // 기존 + 우리 것
    expect(settings.hooks.PostToolUse[0]?.hooks[0]?.command).toBe("echo hi");
  });
});
