import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "@opspilot/shared-types";

// OPSP-19 잔여 조각: .claude 변경 = 자동 버전, "까먹어도" 강제.
// (1) .claude/opspilot/version-on-change.sh — 커밋 안 된 .claude 있으면 구조화 커밋
// (2) .claude/settings.json PostToolUse 훅 → Claude 세션이 .claude 편집 시 (1) 실행
// (3) .git/hooks/post-commit — 어떤 에디터로든 .claude 커밋되면 OpsPilot 재스캔 알림

const HOOK_MARK = "opspilot/version-on-change.sh";

const VERSION_SCRIPT = `#!/bin/sh
# OpsPilot: .claude 변경 자동 버전 강제 (Claude Code PostToolUse).
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0
dirty=0
git diff --quiet -- .claude || dirty=1
git diff --cached --quiet -- .claude || dirty=1
[ -n "$(git ls-files --others --exclude-standard -- .claude)" ] && dirty=1
if [ "$dirty" = "1" ]; then
  git add -- .claude
  git -c user.email=opspilot@local -c user.name=OpsPilot \\
    commit -m "ops(.claude): auto-version on change

[opspilot hook]" -- .claude >/dev/null 2>&1 || true
fi
exit 0
`;

function postCommitScript(projectId: string): string {
  return `#!/bin/sh
# OpsPilot: .claude 건드린 커밋이면 서버에 재스캔 알림 (best-effort).
if git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null | grep -q '^\\.claude/'; then
  curl -s -m 3 -X POST "\${OPS_PUBLIC_URL:-http://localhost:3001}/api/projects/${projectId}/scan" >/dev/null 2>&1 || true
fi
exit 0
`;
}

interface SettingsShape {
  hooks?: {
    PostToolUse?: { matcher?: string; hooks: { type: string; command: string }[] }[];
  } & Record<string, unknown>;
  [k: string]: unknown;
}

function mergeSettings(clonePath: string): boolean {
  const path = join(clonePath, ".claude", "settings.json");
  let settings: SettingsShape = {};
  if (existsSync(path)) {
    try {
      settings = JSON.parse(readFileSync(path, "utf8")) as SettingsShape;
    } catch {
      settings = {};
    }
  }
  settings.hooks ??= {};
  settings.hooks.PostToolUse ??= [];
  const cmd = "sh .claude/opspilot/version-on-change.sh";
  const already = settings.hooks.PostToolUse.some((g) =>
    g.hooks.some((h) => h.command.includes(HOOK_MARK)),
  );
  if (!already) {
    settings.hooks.PostToolUse.push({
      matcher: "Edit|Write|MultiEdit",
      hooks: [{ type: "command", command: cmd }],
    });
  }
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return !already;
}

function git(clonePath: string, args: string[]): string {
  return execFileSync("git", args, { cwd: clonePath, encoding: "utf8" }).trim();
}

export interface InstallResult {
  settingsMerged: boolean;
  scriptPath: string;
  gitHookPath: string;
  committed: string | null;
}

export function installHooks(project: Project): InstallResult {
  const clone = project.clonePath;
  const opspilotDir = join(clone, ".claude", "opspilot");
  mkdirSync(opspilotDir, { recursive: true });

  const scriptRel = ".claude/opspilot/version-on-change.sh";
  const scriptAbs = join(clone, scriptRel);
  writeFileSync(scriptAbs, VERSION_SCRIPT, "utf8");
  chmodSync(scriptAbs, 0o755);

  const merged = mergeSettings(clone);

  // (3) git post-commit — 커밋 안 됨(.git/hooks 로컬). 어떤 에디터든 커밋 시 발화.
  const gitHookAbs = join(clone, ".git", "hooks", "post-commit");
  writeFileSync(gitHookAbs, postCommitScript(project.id), "utf8");
  chmodSync(gitHookAbs, 0o755);

  // (1)+(2)는 레포에 커밋 → 풀하면 팀 전체가 강제 적용 (조직 저점 상향)
  let committed: string | null = null;
  try {
    git(clone, ["add", "--", ".claude/opspilot", ".claude/settings.json"]);
    git(clone, [
      "-c",
      "user.email=opspilot@local",
      "-c",
      "user.name=OpsPilot",
      "commit",
      "-m",
      "ops(.claude): 버전 강제 훅 설치\n\n[opspilot hook]",
      "--",
      ".claude/opspilot",
      ".claude/settings.json",
    ]);
    committed = git(clone, ["rev-parse", "HEAD"]);
  } catch {
    committed = null; // 변경 없음(이미 설치됨) → 멱등
  }

  return {
    settingsMerged: merged,
    scriptPath: scriptRel,
    gitHookPath: ".git/hooks/post-commit",
    committed,
  };
}
