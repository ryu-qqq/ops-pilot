import matter from "gray-matter";
import type { AssetKind } from "@opspilot/shared-types";

// frontmatter 검증 게이트 (skill-creator quick_validate 판 + 트리거 관점).
// Claude Code 공식 frontmatter 규칙 + "트리거 안 될 description" 조기 경고.
// error = 저작 차단 / warning = 통과하되 알림.

export interface LintIssue {
  severity: "error" | "warning";
  field: string;
  message: string;
}

export interface LintResult {
  ok: boolean; // error 0 건
  issues: LintIssue[];
}

const DESC_MAX = 1024;
const DESC_MIN_WARN = 20;

// kind 별 허용 frontmatter 키 (그 외 키는 warning).
const ALLOWED_KEYS: Partial<Record<AssetKind, string[]>> = {
  agent: ["name", "description", "model", "tools"],
  skill: [
    "name",
    "description",
    "when_to_use",
    "model",
    "allowed-tools",
    "license",
    "metadata",
    "compatibility",
    "argument-hint",
  ],
  command: ["name", "description", "argument-hint", "model", "allowed-tools"],
};
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MODELS = ["inherit", "sonnet", "opus", "haiku"];

/** frontmatter 의 description 한 줄만 뽑는다(없거나 파싱 실패 시 null). 자산이 "뭘 하는지" 표시용. */
export function parseFrontmatterDescription(content: string): string | null {
  try {
    const data = matter(content).data as Record<string, unknown>;
    const desc = data.description;
    return typeof desc === "string" && desc.trim() !== "" ? desc.trim() : null;
  } catch {
    return null;
  }
}

export function validateFrontmatter(
  kind: AssetKind,
  content: string,
): LintResult {
  const issues: LintIssue[] = [];
  const allowed = ALLOWED_KEYS[kind];
  // agent/skill/command 만 검증 (cursor_* 는 별도 frontmatter 규약 — 통과).
  if (!allowed) return { ok: true, issues };

  // frontmatter(--- ---) 블록이 실제로 있는지 — "없음" vs "있으나 파싱 실패" 를 정확히 가른다.
  // (예: description 에 콜론+공백 "키: 값" 이 들어가면 YAML 이 깨져 data 가 비거나 throw 된다.
  //  블록은 분명히 있는데 "없음" 이라 표시하면 거짓 — 사용자 신뢰를 깬다.)
  const hasFrontmatterBlock = /^\s*---\r?\n[\s\S]*?\r?\n---/.test(content);

  let data: Record<string, unknown>;
  try {
    data = matter(content).data as Record<string, unknown>;
  } catch (e) {
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          field: "frontmatter",
          message: hasFrontmatterBlock
            ? `frontmatter YAML 파싱 실패: ${(e as Error).message}`
            : `frontmatter 파싱 실패: ${(e as Error).message}`,
        },
      ],
    };
  }
  if (Object.keys(data).length === 0) {
    issues.push({
      severity: "error",
      field: "frontmatter",
      message: hasFrontmatterBlock
        ? "frontmatter(--- ---) 블록은 있으나 YAML 로 읽히지 않음 — 값에 콜론+공백('키: 값') 또는 따옴표 누락 확인 (예: description)"
        : "frontmatter(--- ---) 가 없음 — name·description 필수",
    });
    return { ok: false, issues };
  }

  // name
  const name = data.name;
  if (typeof name !== "string" || name.trim() === "") {
    issues.push({ severity: "error", field: "name", message: "name 누락" });
  } else if (!KEBAB.test(name)) {
    issues.push({
      severity: "warning",
      field: "name",
      message: `name 은 kebab-case 권장 (현재: ${name})`,
    });
  }

  // description — 트리거의 핵심.
  const desc = data.description;
  if (typeof desc !== "string" || desc.trim() === "") {
    issues.push({
      severity: "error",
      field: "description",
      message: "description 누락 — 자동 발화가 안 됨",
    });
  } else {
    if (desc.length > DESC_MAX) {
      issues.push({
        severity: "error",
        field: "description",
        message: `description 이 ${String(desc.length)}자 — ${String(DESC_MAX)}자 초과`,
      });
    }
    if (/[<>]/.test(desc)) {
      issues.push({
        severity: "error",
        field: "description",
        message: "description 에 꺾쇠(<>) 금지 — 파싱 깨짐",
      });
    }
    if (desc.trim().length < DESC_MIN_WARN) {
      issues.push({
        severity: "warning",
        field: "description",
        message: "description 이 너무 짧음 — 트리거가 약함 (트리거 평가 권장)",
      });
    }
  }

  // model
  if (typeof data.model === "string" && !MODELS.includes(data.model)) {
    issues.push({
      severity: "warning",
      field: "model",
      message: `model 은 ${MODELS.join("|")} 중 하나 권장 (현재: ${data.model})`,
    });
  }

  // 알 수 없는 키
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) {
      issues.push({
        severity: "warning",
        field: key,
        message: `알 수 없는 frontmatter 키 '${key}' (${kind} 허용: ${allowed.join(", ")})`,
      });
    }
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues };
}
