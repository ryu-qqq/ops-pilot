import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_REL = ".claude/hooks/inject-cursor-rules.mjs";
// Claude Code 가 훅 실행 시 제공하는 프로젝트 루트 env. 두 이벤트가 동일 커맨드를 쓰고
// 스크립트가 stdin 의 hook_event_name 으로 분기한다.
const HOOK_CMD = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/inject-cursor-rules.mjs"';

interface HookEntry {
  type: string;
  command: string;
}
interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
}
type Settings = Record<string, unknown> & { hooks?: Record<string, HookGroup[]> };
// 병합 후엔 hooks 와 우리가 보장한 두 이벤트 그룹이 항상 존재한다 — 호출부 타입 단순화.
type MergedSettings = Record<string, unknown> & {
  hooks: Record<string, HookGroup[]> & { PostToolUse: HookGroup[]; SessionStart: HookGroup[] };
};

/** PostToolUse·SessionStart 훅을 기존 설정 보존하며 멱등 병합. */
export function mergeRuleBridgeHooks(input: Settings): { settings: MergedSettings; changed: boolean } {
  const settings: Settings = structuredClone(input ?? {});
  const hooks: Record<string, HookGroup[]> = (settings.hooks ??= {});
  let changed = false;

  const ensure = (event: string, matcher?: string): void => {
    const groups: HookGroup[] = (hooks[event] ??= []);
    const already = groups.some((g) => g.hooks.some((h) => h.command === HOOK_CMD));
    if (already) return;
    groups.push(
      matcher
        ? { matcher, hooks: [{ type: "command", command: HOOK_CMD }] }
        : { hooks: [{ type: "command", command: HOOK_CMD }] },
    );
    changed = true;
  };

  ensure("PostToolUse", "Edit|Write|MultiEdit");
  ensure("SessionStart");
  return { settings: settings as MergedSettings, changed };
}

export interface ClaudeRulesBridgeResult {
  written: string[];
}

/** 소비 프로젝트에 훅 스크립트 + settings 멱등 설치. */
export function applyClaudeRulesBridge(clonePath: string): ClaudeRulesBridgeResult {
  const written: string[] = [];

  // 1) 훅 스크립트 복사 (변경 시에만)
  const hookSrc = fileURLToPath(new URL("./hooks/inject-cursor-rules.mjs", import.meta.url));
  const hookContent = readFileSync(hookSrc, "utf8");
  const hookDest = join(clonePath, HOOK_REL);
  if (!existsSync(hookDest) || readFileSync(hookDest, "utf8") !== hookContent) {
    mkdirSync(dirname(hookDest), { recursive: true });
    writeFileSync(hookDest, hookContent, "utf8");
    written.push(HOOK_REL);
  }

  // 2) settings.json 멱등 병합
  const settingsPath = join(clonePath, ".claude/settings.json");
  const current: Settings = existsSync(settingsPath)
    ? (JSON.parse(readFileSync(settingsPath, "utf8")) as Settings)
    : {};
  const { settings, changed } = mergeRuleBridgeHooks(current);
  if (changed) {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
    written.push(".claude/settings.json");
  }

  return { written };
}
