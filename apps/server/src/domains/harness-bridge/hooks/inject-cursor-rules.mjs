// opspilot:generated — OpsPilot 역방향 하네스 브릿지 훅. 수동 편집 금지(sync로 갱신).
// hook_event_name 으로 분기: PostToolUse(편집 파일 글롭 매칭 룰 주입) / SessionStart(상시 룰+색인).
// 자기완결 — node 표준만. .cursor/rules/*.mdc 를 런타임에 읽는다.
/* global process */
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
