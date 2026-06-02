import { readFileSync } from "node:fs";
import { join } from "node:path";

// ADR 0002 (1B): 평가 "설계" 프롬프트의 단일 진실은 ops-pilot baked 상수가 아니라
// agent-crew 자산 본문이다. sync된 `.claude/agents/<name>.md` 본문(frontmatter 제거)을
// 프롬프트로 주입(1B)해 호출한다. 자산이 없거나(미sync) 읽기 실패면 호출부가 baked
// fallback(4B)을 탄다. scenario-suggest·trigger-eval 양쪽이 쓰는 공통 헬퍼.

// sync된 agent-crew 자산 디렉터리. 기본은 ops-pilot 레포 루트의 `.claude/agents`,
// OPS_CREW_AGENTS_DIR 로 변경(테스트·격리 검증용). domains/project·run의 env-override 패턴과 동일.
// repo root = 이 소스 위치(apps/server/{src|dist}/domains/assist)에서 5단계 상위.
// tsx(src)·build(dist) 둘 다 같은 깊이라 import.meta.dirname 기준이 cwd 의존 없이 안전하다.
export function crewAgentsDir(): string {
  return (
    process.env.OPS_CREW_AGENTS_DIR ??
    join(import.meta.dirname, "../../../../..", ".claude/agents")
  );
}

// 맨 앞 `---\n...\n---` 블록만 제거. frontmatter 없으면 원문 그대로.
export function stripFrontmatter(text: string): string {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return text;
  const after = text.indexOf("\n", end + 1);
  return after < 0 ? "" : text.slice(after + 1);
}

/** 자산 `.md` 파일의 절대 경로 — fallbackReason 메시지에서 어떤 파일을 못 찾았는지 표기용. */
export function crewAgentPath(name: string): string {
  return join(crewAgentsDir(), `${name}.md`);
}

/**
 * agent-crew 자산 본문(frontmatter 제거)을 로드. 파일이 없거나 읽기 실패면 null →
 * 호출부가 baked fallback(4B)을 탄다.
 */
export function loadCrewAgentBody(name: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(crewAgentPath(name), "utf8");
  } catch {
    return null; // 미sync 또는 읽기 실패 → fallback 정상 경로
  }
  return stripFrontmatter(raw).trim() || null;
}
