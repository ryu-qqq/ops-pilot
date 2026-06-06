# Claude 룰 브릿지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code가 `.cursor/rules`(공유 룰 레이어)를 글롭 조건부로 읽도록, OpsPilot이 소비 프로젝트에 PostToolUse·SessionStart 훅을 멱등 설치한다.

**Architecture:** harness-bridge 도메인에 역방향(.cursor→Claude) 설치 함수를 더한다. 핵심 로직은 소비 프로젝트에서 단독 실행되는 자기완결 `.mjs` 훅 스크립트(node 표준만)에 있고, 런타임에 `.cursor/rules`를 읽어 hook_event_name 으로 분기한다 — 그래서 설치는 1회 멱등이면 새 룰이 자동 반영된다. 서버는 그 스크립트를 쓰고 `settings.json`을 멱등 병합한다.

**Tech Stack:** 서버 = TypeScript + vitest + node:fs/path/url. 훅 = 자기완결 ESM `.mjs`(외부 의존 0). 설정 = Claude Code hooks(`.claude/settings.json`, 프로젝트 스코프).

**검증 비대칭:** 서버·훅 로직은 vitest로 TDD. 훅의 *실제 컨텍스트 주입*(additionalContext가 모델에 닿는지)은 Playwright로 못 잡으니 ops-pilot 수동 e2e로 확인. `corepack pnpm` 사용.

---

## File Structure

**생성:**
- `apps/server/src/domains/harness-bridge/hooks/inject-cursor-rules.mjs` — 자기완결 훅. 순수 함수 export + 직접 실행 시 main(). 소비 프로젝트로 복사돼 실행됨.
- `apps/server/src/domains/harness-bridge/hooks/inject-cursor-rules.test.ts` — 훅 순수 함수 vitest.
- `apps/server/src/domains/harness-bridge/claude-rules-bridge.ts` — 설치(스크립트 쓰기 + settings 멱등 병합).
- `apps/server/src/domains/harness-bridge/claude-rules-bridge.test.ts` — settings 병합 vitest.

**수정:**
- `apps/server/package.json` — build에 `.mjs` → dist 복사 단계.
- `apps/server/src/domains/harness-bridge/service.ts` — `syncCursorHarnessForProject`가 역방향 설치도 수행.
- `apps/server/src/domains/feedback/proposal-service.ts` — cursor_rule apply 후 역방향 브릿지 설치 보장.

---

## Task 1: 훅 스크립트 + vitest (TDD, 핵심 로직)

**Files:**
- Create: `apps/server/src/domains/harness-bridge/hooks/inject-cursor-rules.mjs`
- Test: `apps/server/src/domains/harness-bridge/hooks/inject-cursor-rules.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/src/domains/harness-bridge/hooks/inject-cursor-rules.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseGlobs,
  parseFrontmatter,
  globToRegExp,
  ruleMatchesPath,
  renderPostTool,
  renderSessionStart,
} from "./inject-cursor-rules.mjs";

describe("parseGlobs", () => {
  it("배열·콤마·빈 표기를 모두 글롭 배열로", () => {
    expect(parseGlobs('["**/*.md", "**/README*"]')).toEqual(["**/*.md", "**/README*"]);
    expect(parseGlobs("apps/web/**/*.ts,apps/web/**/*.tsx")).toEqual([
      "apps/web/**/*.ts",
      "apps/web/**/*.tsx",
    ]);
    expect(parseGlobs("")).toEqual([]);
  });
});

describe("parseFrontmatter", () => {
  it("globs·alwaysApply·description 를 뽑고 본문을 분리", () => {
    const { data, body } = parseFrontmatter(
      '---\ndescription: 톤 규칙\nalwaysApply: false\nglobs: ["**/*.md"]\n---\n본문줄1\n본문줄2\n',
    );
    expect(data.alwaysApply).toBe(false);
    expect(data.description).toBe("톤 규칙");
    expect(data.globs).toEqual(["**/*.md"]);
    expect(body).toBe("본문줄1\n본문줄2");
  });
});

describe("globToRegExp / ruleMatchesPath", () => {
  it("** 와 {ts,tsx} 를 처리한다", () => {
    expect(globToRegExp("apps/server/src/routes/**/*.ts").test("apps/server/src/routes/api/x.ts")).toBe(true);
    expect(globToRegExp("apps/server/src/routes/**/*.ts").test("apps/web/x.ts")).toBe(false);
    expect(globToRegExp("apps/web/src/**/*.{ts,tsx}").test("apps/web/src/a/b.tsx")).toBe(true);
    expect(ruleMatchesPath(["**/*.md"], "docs/x.md")).toBe(true);
    expect(ruleMatchesPath(["**/*.md"], "src/x.ts")).toBe(false);
  });
});

describe("renderPostTool", () => {
  it("매칭되는 글롭 룰만 본문으로, 없으면 null", () => {
    const rules = [
      { name: "a.mdc", globs: ["apps/server/src/routes/**/*.ts"], alwaysApply: false, description: "", body: "라우트 규칙" },
      { name: "b.mdc", globs: ["**/*.md"], alwaysApply: false, description: "", body: "문서 규칙" },
    ];
    const out = renderPostTool(rules, "apps/server/src/routes/api/x.ts");
    expect(out).toContain("a.mdc");
    expect(out).toContain("라우트 규칙");
    expect(out).not.toContain("문서 규칙");
    expect(renderPostTool(rules, "src/nomatch.json")).toBeNull();
  });
});

describe("renderSessionStart", () => {
  it("상시 룰은 본문, 글롭 룰은 색인", () => {
    const rules = [
      { name: "always.mdc", globs: [], alwaysApply: true, description: "필수", body: "항상 지켜" },
      { name: "g.mdc", globs: ["**/*.ts"], alwaysApply: false, description: "타입 규칙", body: "본문" },
    ];
    const out = renderSessionStart(rules);
    expect(out).toContain("항상 지켜");
    expect(out).toContain("g.mdc");
    expect(out).toContain("타입 규칙");
    expect(out).not.toContain("본문"); // 글롭 룰 본문은 색인엔 안 들어감
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/server && corepack pnpm exec vitest run src/domains/harness-bridge/hooks/inject-cursor-rules.test.ts`
Expected: FAIL (모듈/ export 없음)

- [ ] **Step 3: 훅 스크립트 구현**

`apps/server/src/domains/harness-bridge/hooks/inject-cursor-rules.mjs`:

```javascript
// opspilot:generated — OpsPilot 역방향 하네스 브릿지 훅. 수동 편집 금지(sync로 갱신).
// hook_event_name 으로 분기: PostToolUse(편집 파일 글롭 매칭 룰 주입) / SessionStart(상시 룰+색인).
// 자기완결 — node 표준만. .cursor/rules/*.mdc 를 런타임에 읽는다.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const GENERATED_PREFIX = "opspilot-agent-"; // 브릿지 생성물 — 역주입 제외(루프 차단)

export function parseGlobs(val) {
  if (!val) return [];
  let s = val.trim();
  if (s.startsWith("[")) s = s.slice(1, -1);
  return s
    .split(",")
    .map((g) => g.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

export function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  const data = { globs: [], alwaysApply: false, description: "" };
  if (!m) return { data, body: text.trim() };
  const [, fm, body] = m;
  for (const line of fm.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key === "alwaysApply") data.alwaysApply = val === "true";
    else if (key === "description") data.description = val.replace(/^["']|["']$/g, "");
    else if (key === "globs") data.globs = parseGlobs(val);
  }
  return { data, body: body.trim() };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      const alts = glob
        .slice(i + 1, end)
        .split(",")
        .map((a) => escapeRe(a.trim()))
        .join("|");
      re += `(?:${alts})`;
      i = end;
    } else if (".+^$()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

export function ruleMatchesPath(globs, relPath) {
  return globs.some((g) => globToRegExp(g).test(relPath));
}

export function loadRules(projectRoot) {
  const dir = join(projectRoot, ".cursor", "rules");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".mdc") && !n.startsWith(GENERATED_PREFIX))
    .map((name) => {
      const { data, body } = parseFrontmatter(readFileSync(join(dir, name), "utf8"));
      return { name, globs: data.globs, alwaysApply: data.alwaysApply, description: data.description, body };
    });
}

export function renderPostTool(rules, relPath) {
  const hit = rules.filter((r) => r.globs.length > 0 && ruleMatchesPath(r.globs, relPath));
  if (hit.length === 0) return null;
  const txt = hit.map((r) => `## .cursor/rules/${r.name}\n${r.body}`).join("\n\n");
  return `이 프로젝트의 규칙(.cursor/rules) 중 방금 편집한 \`${relPath}\` 에 해당하는 것:\n\n${txt}`;
}

export function renderSessionStart(rules) {
  const always = rules.filter((r) => r.alwaysApply);
  const indexed = rules.filter((r) => !r.alwaysApply);
  const parts = [];
  if (always.length > 0) {
    parts.push("## 상시 규칙\n\n" + always.map((r) => `### ${r.name}\n${r.body}`).join("\n\n"));
  }
  if (indexed.length > 0) {
    parts.push(
      "## 파일별 규칙 색인 (.cursor/rules — 해당 파일 편집 시 적용)\n" +
        indexed
          .map(
            (r) =>
              `- \`${r.name}\` — ${r.description || "(설명 없음)"}` +
              (r.globs.length > 0 ? ` [${r.globs.join(", ")}]` : ""),
          )
          .join("\n"),
    );
  }
  if (parts.length === 0) return null;
  return "OpsPilot 하네스 규칙 (Cursor 룰 레이어 · Claude 동기화):\n\n" + parts.join("\n\n");
}

export function main() {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0);
  }
  const event = input.hook_event_name || "";
  const projectRoot = input.cwd || process.cwd();
  const rules = loadRules(projectRoot);
  if (event === "PostToolUse") {
    const fp = input.tool_input && input.tool_input.file_path;
    if (!fp) process.exit(0);
    const rel = isAbsolute(fp) ? relative(projectRoot, fp) : fp;
    const ctx = renderPostTool(rules, rel);
    if (ctx) {
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: ctx } }),
      );
    }
  } else if (event === "SessionStart") {
    const ctx = renderSessionStart(rules);
    if (ctx) process.stdout.write(ctx); // SessionStart: stdout 이 컨텍스트에 더해짐
  }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/server && corepack pnpm exec vitest run src/domains/harness-bridge/hooks/inject-cursor-rules.test.ts`
Expected: PASS (5 passed)

- [ ] **Step 5: 커밋**

```bash
git add apps/server/src/domains/harness-bridge/hooks/
git commit -m "feat(server): Claude 룰 브릿지 훅 스크립트 — 글롭 매칭·frontmatter·렌더

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 설치 함수 + settings 멱등 병합 (TDD)

**Files:**
- Create: `apps/server/src/domains/harness-bridge/claude-rules-bridge.ts`
- Test: `apps/server/src/domains/harness-bridge/claude-rules-bridge.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/src/domains/harness-bridge/claude-rules-bridge.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mergeRuleBridgeHooks } from "./claude-rules-bridge.js";

describe("mergeRuleBridgeHooks", () => {
  it("빈 설정에 두 훅을 추가한다", () => {
    const { settings, changed } = mergeRuleBridgeHooks({});
    expect(changed).toBe(true);
    const post = settings.hooks.PostToolUse[0];
    expect(post.matcher).toBe("Edit|Write|MultiEdit");
    expect(post.hooks[0].command).toContain("inject-cursor-rules.mjs");
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain("inject-cursor-rules.mjs");
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
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe("echo hi");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/server && corepack pnpm exec vitest run src/domains/harness-bridge/claude-rules-bridge.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**

`apps/server/src/domains/harness-bridge/claude-rules-bridge.ts`:

```typescript
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

/** PostToolUse·SessionStart 훅을 기존 설정 보존하며 멱등 병합. */
export function mergeRuleBridgeHooks(input: Settings): { settings: Settings; changed: boolean } {
  const settings: Settings = structuredClone(input ?? {});
  settings.hooks ??= {};
  let changed = false;

  const ensure = (event: string, matcher?: string): void => {
    const groups: HookGroup[] = (settings.hooks![event] ??= []);
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
  return { settings, changed };
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/server && corepack pnpm exec vitest run src/domains/harness-bridge/claude-rules-bridge.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 5: 커밋**

```bash
git add apps/server/src/domains/harness-bridge/claude-rules-bridge.ts apps/server/src/domains/harness-bridge/claude-rules-bridge.test.ts
git commit -m "feat(server): Claude 룰 브릿지 설치 — 훅 복사 + settings 멱등 병합

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 빌드에 `.mjs` dist 복사

`.mjs`는 tsc가 emit하지 않으므로 `pnpm start`(dist 실행) 시 `applyClaudeRulesBridge`가 스크립트를 못 읽는다. build에 복사 단계를 더한다. (dev=tsx는 src에서 읽어 무관하지만, dist 정합을 맞춘다.)

**Files:**
- Modify: `apps/server/package.json` (scripts.build)

- [ ] **Step 1: build 스크립트 수정**

`apps/server/package.json`을 읽어 현재 `"build"` 값을 확인하고, 다음으로 바꾼다:

```json
"build": "tsc -p tsconfig.json && mkdir -p dist/domains/harness-bridge/hooks && cp src/domains/harness-bridge/hooks/*.mjs dist/domains/harness-bridge/hooks/",
```

- [ ] **Step 2: 빌드 확인**

Run: `cd apps/server && corepack pnpm build && ls dist/domains/harness-bridge/hooks/`
Expected: 빌드 성공 + `inject-cursor-rules.mjs` 가 dist에 존재.

- [ ] **Step 3: 커밋**

```bash
git add apps/server/package.json
git commit -m "build(server): 하네스 브릿지 훅 .mjs 를 dist 로 복사

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 동기화 경로에 역방향 설치 연결

설치를 (a) 메인 sync, (b) cursor_rule apply 후에 멱등 호출한다. 스크립트가 런타임 동적이라 설치만 한 번 보장되면 새 룰은 자동 반영된다.

**Files:**
- Modify: `apps/server/src/domains/harness-bridge/service.ts`
- Modify: `apps/server/src/domains/feedback/proposal-service.ts`

- [ ] **Step 1: service.ts — 메인 sync에 역방향 설치 추가**

`apps/server/src/domains/harness-bridge/service.ts` 의 import 블록(8-10행 `./sync.js` import 아래)에 추가:

```typescript
import { applyClaudeRulesBridge } from "./claude-rules-bridge.js";
```

`syncCursorHarnessForProject`(74행)의 비-dryRun 경로에서, `const written = applyCursorHarnessSync(project.clonePath);`(93행) 바로 다음 줄에 추가:

```typescript
  const claudeBridge = applyClaudeRulesBridge(project.clonePath);
  written.push(...claudeBridge.written);
```

(dryRun 경로는 그대로 — 설치는 적용 시에만.)

- [ ] **Step 2: proposal-service.ts — cursor_rule apply 후 설치 보장**

`apps/server/src/domains/feedback/proposal-service.ts` 의 import에 추가(기존 harness-bridge import 근처):

```typescript
import { applyClaudeRulesBridge } from "../harness-bridge/claude-rules-bridge.js";
```

`markProposalApplied`(105행) 다음, `const bridgeResult =` (107행) 위에 추가:

```typescript
  // 역방향: cursor_rule 이 적용됐으면 Claude 가 그 룰을 읽도록 브릿지 설치 보장(멱등).
  if (proposal.targetKind === "cursor_rule") {
    try {
      applyClaudeRulesBridge(project.clonePath);
    } catch {
      // best-effort — 설치 실패가 apply 자체를 깨지 않게 한다.
    }
  }
```

- [ ] **Step 3: 타입 통과 확인**

Run: `cd apps/server && corepack pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/server/src/domains/harness-bridge/service.ts apps/server/src/domains/feedback/proposal-service.ts
git commit -m "feat(server): 역방향 브릿지를 sync·cursor_rule apply 경로에 연결

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 전체 검증 + ops-pilot 수동 e2e

**Files:** (코드 변경 없음 — 회귀·실설치 확인)

- [ ] **Step 1: 정적 검증 + 서버 테스트**

Run:
```bash
corepack pnpm -r typecheck && corepack pnpm lint && cd apps/server && corepack pnpm test
```
Expected: 전부 PASS (신규 Task1·2 테스트 포함). 실패 시 해당 Task로 복귀.

- [ ] **Step 2: ops-pilot 에 실설치 (격리 아님 — 실제 설치 확인)**

> ops-pilot 자체가 도그푸드 대상. 설치는 `.claude/hooks/` + `.claude/settings.json` 에 멱등 기록된다.

격리 서버로 설치 함수만 단발 실행해 결과를 본다(서버 기동 없이 node 스크립트로):
```bash
cd apps/server && corepack pnpm exec tsx -e "import('./src/domains/harness-bridge/claude-rules-bridge.js').then(m=>console.log(m.applyClaudeRulesBridge('/Users/ryu-qqq/Documents/ryu-qqq/ops-pilot')))"
```
Expected: `{ written: [ '.claude/hooks/inject-cursor-rules.mjs', '.claude/settings.json' ] }` (또는 이미 있으면 빈/부분). 그 후 `.claude/settings.json` 에 PostToolUse·SessionStart 엔트리가 추가되고 기존 설정이 보존됐는지 육안 확인.

- [ ] **Step 3: 훅 스크립트 직접 구동 (주입 동작 확인)**

governed 파일 경로로 PostToolUse 입력을 흘려 매칭 룰이 나오는지:
```bash
cd /Users/ryu-qqq/Documents/ryu-qqq/ops-pilot
echo '{"hook_event_name":"PostToolUse","cwd":"'"$PWD"'","tool_input":{"file_path":"'"$PWD"'/apps/server/src/routes/api/x.ts"}}' | node .claude/hooks/inject-cursor-rules.mjs
```
Expected: `nested-route-param-ownership` 룰 본문이 담긴 `hookSpecificOutput.additionalContext` JSON. (매칭 없는 경로면 빈 출력.)
SessionStart도:
```bash
echo '{"hook_event_name":"SessionStart","cwd":"'"$PWD"'"}' | node .claude/hooks/inject-cursor-rules.mjs
```
Expected: 글롭 룰 색인이 담긴 텍스트.

- [ ] **Step 4: 실세션 컨텍스트 주입 확인 (additionalContext 도달)**

새 Claude Code 세션에서 ops-pilot의 governed 파일(예: `apps/server/src/routes/api/usage.ts`)을 한 줄 편집해보고, 직후 모델이 해당 룰(nested-route-param-ownership)을 인지하는지 확인. (PostToolUse additionalContext가 실제로 모델에 닿는지의 체감 검증 — 문서상 지원이나 실측 필요. 안 닿으면 spec 리스크대로 SessionStart 색인 강화/대안 재고.)

- [ ] **Step 5: 설치물 커밋 (ops-pilot 도그푸드)**

```bash
cd /Users/ryu-qqq/Documents/ryu-qqq/ops-pilot
git add .claude/hooks/inject-cursor-rules.mjs .claude/settings.json
git commit -m "chore: ops-pilot 자체에 Claude 룰 브릿지 훅 설치(도그푸드)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**스펙 커버리지(2026-06-06 claude-rule-bridge 설계 대조):**
- 역방향 브릿지(.cursor/rules→Claude) → Task 1·2(훅+설치). ✓
- 글롭 조건부(PostToolUse) → Task 1 `renderPostTool`+`main` PostToolUse 분기, Task 2 matcher `Edit|Write|MultiEdit`. ✓
- 상시 룰·색인(SessionStart) → Task 1 `renderSessionStart`+SessionStart 분기, Task 2 SessionStart 엔트리. ✓
- 런타임 동적(설치 1회 멱등) → 훅이 `loadRules`로 런타임 읽기, Task 4가 설치만 보장. ✓
- `opspilot-agent-*` 제외(루프 차단) → Task 1 `loadRules` 필터. ✓
- settings 멱등 병합·기존 보존 → Task 2 `mergeRuleBridgeHooks` + 테스트 3종. ✓
- evaluator·targetKind 불변 → 그 경로 안 건드림. ✓
- node 전용(jq X) → 훅·서버 모두 node 표준만. ✓
- 검증(vitest + 수동 e2e) → Task 1·2 vitest, Task 5 수동. ✓

**플레이스홀더 스캔:** TBD/TODO 없음. 모든 코드 단계에 실제 코드. Task 3의 build 값은 "현재 값 확인 후 교체"로 명시(현재 문자열은 환경마다 다를 수 있어 실제 확인 지시).

**타입 일관성:** `parseGlobs`/`parseFrontmatter`/`globToRegExp`/`ruleMatchesPath`/`loadRules`/`renderPostTool`/`renderSessionStart`(Task1) ↔ 테스트(Task1) 일치. `mergeRuleBridgeHooks`/`applyClaudeRulesBridge`(Task2) ↔ Task4 import·호출 일치. `HOOK_CMD` 문자열이 훅 경로(`inject-cursor-rules.mjs`)와 일치. rule 객체 형태 `{name, globs, alwaysApply, description, body}`가 loadRules·render·테스트에서 동일.

**알려진 리스크(설계 문서와 동일):** PostToolUse additionalContext의 실제 모델 도달은 Task5 Step4에서만 확정 가능(문서상 지원). settings.json 병합은 JSON 파싱 실패 시 throw(클로버 방지) — 손상된 기존 settings면 설치가 멈추고 보고된다(best-effort try/catch가 apply는 보호).
