import type { AssetKind } from "@opspilot/shared-types";

// Claude Code 공식 frontmatter 스펙 1차 노출 필드(OPSP-26).
// 공식 키만 폼에 노출 — 잘못된 자유 frontmatter 작성으로 인한 오류 감소가 목적.
// 모든 키가 한 줄 string/quoted. 배열은 inline `[a, b]` 또는 CSV string(허용).
// 전체 스펙은 더 큼 — 1차는 자주 쓰는 필드만, 나머지는 본문 위 raw 편집기로.

export type ModelChoice = "inherit" | "sonnet" | "opus" | "haiku";

export interface AgentFrontmatter {
  name?: string;
  description?: string;
  tools?: string; // CSV — 예: "Read, Grep, Bash"
  model?: ModelChoice;
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  "when_to_use"?: string;
  "allowed-tools"?: string;
  model?: ModelChoice;
}

export interface CommandFrontmatter {
  name?: string;
  description?: string;
  "argument-hint"?: string;
  "allowed-tools"?: string;
  model?: ModelChoice;
}

export type Frontmatter = AgentFrontmatter | SkillFrontmatter | CommandFrontmatter;

// kind 별 1차 노출 키(폼 순서 = 표시 순서).
// 키 타입은 union of all 가능키 — KEY_META 로 라벨/help 조회.
export type AnyKey =
  | keyof AgentFrontmatter
  | keyof SkillFrontmatter
  | keyof CommandFrontmatter;

export const KIND_KEYS: Record<AssetKind, readonly AnyKey[]> = {
  agent: ["name", "description", "model", "tools"],
  skill: ["name", "description", "when_to_use", "model", "allowed-tools"],
  command: ["name", "description", "argument-hint", "model", "allowed-tools"],
};

// 키별 사람말 라벨 + help (InfoMark·placeholder 등 재사용).
export const KEY_META: Record<
  string,
  { label: string; help: string; placeholder?: string; required?: boolean }
> = {
  name: {
    label: "name",
    help: "자산 식별자. kebab-case 권장 (영숫자/._-). 파일명과 일치하는 게 안전합니다.",
    placeholder: "예: code-reviewer",
    required: true,
  },
  description: {
    label: "description",
    help: "이 자산이 무엇을 하는지 한 줄로. Claude가 ‘언제 이걸 부를지’ 판단하는 핵심 신호 — 트리거 자연어를 구체적으로.",
    placeholder: "예: 코드 품질·보안 리뷰. PR 만들기 전 자동 호출 권장",
    required: true,
  },
  tools: {
    label: "tools",
    help: "이 에이전트가 쓸 도구 allowlist(쉼표 구분). 생략하면 부모 세션의 모든 도구를 상속합니다.",
    placeholder: "예: Read, Grep, Glob, Bash",
  },
  "allowed-tools": {
    label: "allowed-tools",
    help: "이 자산이 활성일 때 권한 묻지 않고 쓸 수 있는 도구. 쉼표 구분.",
    placeholder: "예: Read, Bash(git *)",
  },
  model: {
    label: "model",
    help: "모델 override. inherit=부모 세션 모델 그대로. 비싼 작업만 opus, 대부분 sonnet 권장.",
  },
  when_to_use: {
    label: "when_to_use",
    help: "description 뒤에 이어붙일 추가 트리거 컨텍스트. 자연어로 ‘이럴 때 써라’.",
    placeholder: "예: trigger: ‘코드 리뷰해줘’, ‘이 PR 봐줘’",
  },
  "argument-hint": {
    label: "argument-hint",
    help: "CLI에서 /커맨드 뒤에 무엇을 입력해야 하는지 힌트.",
    placeholder: "예: [PR번호] [브랜치]",
  },
};

// kind별 공식 docs URL. 사용자에게 진짜를 안내.
export const DOCS_URL: Record<AssetKind, string> = {
  agent: "https://code.claude.com/docs/en/sub-agents.md",
  skill: "https://code.claude.com/docs/en/skills.md",
  command: "https://code.claude.com/docs/en/skills.md", // commands = skills 통합 문서
};

// 단순 YAML 직렬화 — single-line key: value 만 지원. 배열/멀티라인은 inline string.
// 정밀 YAML 필요해지면 js-yaml 추가 고려(이슈에서 결정).
export function serializeFrontmatter(fm: Record<string, string | undefined>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(fm)) {
    if (v === undefined || v.trim() === "") continue;
    // 콜론/특수문자 들어가면 quote.
    const needsQuote = /[:#{}[\],&*?|<>=!%@`]/.test(v) || v.startsWith(" ") || v.endsWith(" ");
    lines.push(`${k}: ${needsQuote ? JSON.stringify(v) : v}`);
  }
  return lines.length === 0 ? "" : `---\n${lines.join("\n")}\n---\n\n`;
}

// 단순 frontmatter 파서 — `--- ... ---` 사이 라인별 key: value.
// quoted value("..." or '...') 만 unquote. 그 외는 raw trim.
// 본문은 frontmatter 블록 이후 전체.
export interface ParsedFile {
  frontmatter: Record<string, string>;
  body: string;
}

export function parseFile(content: string): ParsedFile {
  // 빈/frontmatter 없음
  if (!content.startsWith("---")) return { frontmatter: {}, body: content };
  const rest = content.slice(3); // skip leading ---
  const endIdx = rest.indexOf("\n---");
  if (endIdx < 0) return { frontmatter: {}, body: content };
  const fmBlock = rest.slice(0, endIdx);
  // body 시작 = endIdx + 4(`\n---`) — 다음 줄바꿈 한 번 더 소비.
  let body = rest.slice(endIdx + 4);
  if (body.startsWith("\n")) body = body.slice(1);
  if (body.startsWith("\n")) body = body.slice(1);

  const fm: Record<string, string> = {};
  for (const rawLine of fmBlock.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      try {
        value = JSON.parse(value.replace(/^'(.*)'$/, '"$1"'));
      } catch {
        value = value.slice(1, -1);
      }
    }
    fm[key] = value;
  }
  return { frontmatter: fm, body };
}

// kind별 기본 템플릿 본문(공식 스펙에 맞춘 최소 동작 예시).
export function bodyTemplate(kind: AssetKind, name: string): string {
  if (kind === "agent") {
    return `# ${name || "Agent"}\n\n당신은 ${name || "에이전트"}입니다. 작업 시:\n1. (해야 할 일 첫 단계)\n2. (다음)\n3. (마지막)\n`;
  }
  if (kind === "skill") {
    return `# ${name || "Skill"}\n\n이 스킬이 발화되면:\n- (지시 1)\n- (지시 2)\n\n참조: \`$ARGUMENTS\`(사용자 입력).\n`;
  }
  return `# /${name || "command"}\n\n이 커맨드는:\n1. (단계 1)\n2. (단계 2)\n`;
}

// 사용자 입력 frontmatter 검증. name 정규식 + 필수 필드.
// 백엔드는 본문 그대로 받으므로 1차 게이트는 프론트.
export function validateFrontmatter(
  kind: AssetKind,
  fm: Record<string, string | undefined>,
): string | null {
  const name = (fm.name ?? "").trim();
  if (name === "") return "name 은 필수입니다.";
  if (!/^[a-zA-Z0-9._-]+$/.test(name))
    return "name 은 영숫자·점·하이픈·언더스코어만 사용 가능합니다.";
  if (kind === "agent") {
    if ((fm.description ?? "").trim() === "")
      return "agent 는 description 이 필수입니다 — 언제 이 에이전트를 부를지 한 줄.";
  }
  return null;
}
