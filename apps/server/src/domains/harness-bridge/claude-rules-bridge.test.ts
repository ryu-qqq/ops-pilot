import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { applyClaudeRulesBridge, mergeRuleBridgeHooks } from "./claude-rules-bridge.js";

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

describe("applyClaudeRulesBridge — settings 손상 안전(B2)", () => {
  let dir: string;
  beforeEach(() => {
    dir = join(tmpdir(), `c-rule-bridge-${randomUUID()}`);
    mkdirSync(join(dir, ".claude"), { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("settings.json 이 비객체(JSON 배열)면 클로버하지 않고 훅만 설치한다", () => {
    const settingsPath = join(dir, ".claude/settings.json");
    writeFileSync(settingsPath, '["do","not","touch"]', "utf8");
    const res = applyClaudeRulesBridge(dir);
    // 훅 스크립트는 설치됨, settings 는 건드리지 않음
    expect(res.written).toContain(".claude/hooks/inject-cursor-rules.mjs");
    expect(res.written).not.toContain(".claude/settings.json");
    expect(readFileSync(settingsPath, "utf8")).toBe('["do","not","touch"]');
  });

  it("settings.json 이 깨진 JSON 이면 throw 없이 훅만 설치한다", () => {
    const settingsPath = join(dir, ".claude/settings.json");
    writeFileSync(settingsPath, "{ not valid json ", "utf8");
    expect(() => applyClaudeRulesBridge(dir)).not.toThrow();
    expect(readFileSync(settingsPath, "utf8")).toBe("{ not valid json ");
    expect(existsSync(join(dir, ".claude/hooks/inject-cursor-rules.mjs"))).toBe(true);
  });

  it("settings.json 이 없으면 새로 만들어 훅을 단다", () => {
    const res = applyClaudeRulesBridge(dir);
    expect(res.written).toContain(".claude/settings.json");
    const parsed = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8"));
    expect(parsed.hooks.PostToolUse).toHaveLength(1);
    expect(parsed.hooks.SessionStart).toHaveLength(1);
  });
});
