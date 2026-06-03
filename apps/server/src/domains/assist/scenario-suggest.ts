import { z } from "zod";
import { ClaudeAssistError, extractJsonObject, runClaudeOnce } from "./claude.js";
import { crewAgentPath, loadCrewAgentBody } from "./crew-asset.js";
import { getAsset, latestContent } from "../registry/repository.js";

// OPSP-27 B: 시나리오 어시스트.
// 자산 본문(최신 버전 content)을 보고 시나리오 폼 5개 필드 초안을 JSON 으로 생성.
// 사용자 hint(자연어 "이런 상황 테스트하고 싶다") 가 있으면 함께 전달.
//
// ADR 0002 (1B·4B·5C): 프롬프트의 단일 진실은 더이상 아래 baked SYSTEM 상수가 아니라
// agent-crew 자산 `scenario-designer` 본문이다. sync된 `.claude/agents/scenario-designer.md`
// 본문(frontmatter 제거)을 프롬프트로 주입(1B)해 호출한다. 자산이 없거나(미sync) 읽기 실패
// 또는 자산 경로 산출이 스키마 검증에 실패하면 baked SYSTEM 으로 fallback(4B)한다.

export const scenarioSuggestionSchema = z.object({
  name: z.string().min(1),
  purpose: z.string(),
  input: z.string().min(1),
  expectedBehavior: z.string(),
  successCriteria: z.array(z.string()),
});
export type ScenarioSuggestion = z.infer<typeof scenarioSuggestionSchema>;

// 4B fallback: agent-crew `scenario-designer` 자산을 못 읽거나 자산 경로 산출이 실패할 때만 사용.
// 1B(자산 본문 주입)가 정상 동작하면 이 baked 프롬프트는 타지 않는다. 졸업조건(무fallback 안정
// 산출 확인) 충족 시 ADR 0002에 따라 제거 예정 — 그 전까지는 평가 설계 마비 방지용으로 유지.
const SYSTEM = `당신은 Claude Code 에이전트/스킬을 평가할 시나리오를 설계한다.
사용자가 만든 자산을 보고, 그 자산을 *의미 있게 검증할* 시나리오 한 건의 초안을 만든다.

반드시 다음 JSON 한 객체만 출력하라. 다른 텍스트(설명·코드펜스 라벨)는 금지.

{
  "name": "<짧은 시나리오 이름. 한국어. 예: '큰 코드베이스에서 X 찾기'>",
  "purpose": "<이 시나리오로 무엇을 검증하는가. 1-2문장 한국어>",
  "input": "<에이전트에 줄 실제 지시. 구체적 한국어. 자산의 트리거 조건과 일치하게.>",
  "expectedBehavior": "<옳다고 볼 행동. 1-2문장 한국어. judge 기준이 됨>",
  "successCriteria": ["<결정론 단언 1>", "<결정론 단언 2>"]
}

규칙:
- successCriteria 는 결정론적 단언(예: "응답에 함수명 X 포함", "Grep 호출 3회 이하"). 추상 문구 금지.
- 자산 본문의 description / 본문에서 의도를 정확히 읽고, 추측·과장 금지.
- 자산이 위험한 도구(예: 파일 삭제)를 다룰 경우 안전한 read-only 시나리오로.`;

// crewAgentsDir / stripFrontmatter / 자산 본문 로드는 trigger-eval 과 공유하는 공통
// 헬퍼(crew-asset.ts)로 추출했다. 여기선 scenario-designer 자산만 로드하면 된다.
function loadScenarioDesignerBody(): string | null {
  return loadCrewAgentBody("scenario-designer");
}

// 입력부 조립 — 자산 본문(1B 주입분) 뒤에 붙는다. 자산 본문이 "입력으로 kind/name/content/
// hint/티켓 맥락을 받는다"고 명시하므로 라벨을 그 계약과 정합하게 맞춘다.
function buildInputSection(args: {
  kind: string;
  name: string;
  content: string;
  hint?: string;
  ticketText?: string;
}): string {
  const lines = [
    "## 입력",
    "",
    `--- 평가 대상 자산 (kind=${args.kind}, name=${args.name}) ---`,
    args.content,
    "--- 자산 끝 ---",
  ];
  if (args.hint && args.hint.trim() !== "") {
    lines.push("", `hint (자연어 시나리오 의도): ${args.hint.trim()}`);
  }
  if (args.ticketText && args.ticketText.trim() !== "") {
    // 5C: ops-pilot 어댑터가 정규화해 넘긴 티켓 텍스트. 자산은 MCP 비종속 — 텍스트만 받는다.
    lines.push("", `티켓 맥락 (정규화된 텍스트): ${args.ticketText.trim()}`);
  }
  return lines.join("\n");
}

function parseSuggestion(raw: string): ScenarioSuggestion {
  const obj = extractJsonObject(raw);
  const parsed = scenarioSuggestionSchema.safeParse(obj);
  if (!parsed.success) {
    throw new ClaudeAssistError(
      `시나리오 JSON 스키마 불일치: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`,
    );
  }
  return parsed.data;
}

export interface SuggestScenarioMeta {
  /** 어느 프롬프트 경로를 탔는가 — "asset"=scenario-designer 본문 주입(1B), "baked"=fallback(4B). */
  source: "asset" | "baked";
  /**
   * baked fallback 을 탄 사유. source="baked" 일 때만 채워진다.
   * - 자산 미발견(미sync) 또는 자산 경로의 runClaudeOnce 실행 실패(타임아웃·CLI 오류·종료코드).
   * 로깅은 도메인이 아니라 route(fastify.log)에서 이 meta 기반으로 한다.
   */
  fallbackReason?: string;
}

// ADR 0003 Follow-up #2 (A/B 강제 산출): 두 프롬프트 경로를 *각각 강제로* 산출하는 헬퍼로 분리한다.
// suggestScenarioWithMeta 는 "asset 시도 → 실패 시 baked" 정책으로 이 둘을 조합하고,
// generateScenarioAbPair 는 "둘 다 강제 산출"로 조합한다. 정책과 산출을 분리해 둘 다 같은 코드를 쓴다.

// 1B: scenario-designer 자산 본문 주입 경로. 자산 미sync 면 명확한 에러 throw(=A/B 불성립 신호).
// 실행 실패·스키마 실패도 throw — fallback 은 정책(suggestScenarioWithMeta)의 책임이지 이 함수가 아니다.
export async function generateViaAsset(inputSection: string): Promise<ScenarioSuggestion> {
  const designerBody = loadScenarioDesignerBody();
  if (designerBody === null) {
    throw new ClaudeAssistError(
      `scenario-designer 자산 미발견(미sync): ${crewAgentPath("scenario-designer")}`,
    );
  }
  const prompt = [designerBody, "", inputSection].join("\n");
  const raw = await runClaudeOnce(prompt, { timeoutMs: 90_000 });
  return parseSuggestion(raw);
}

// 4B: baked SYSTEM 프롬프트 경로. 자산과 무관하게 항상 산출 가능.
export async function generateViaBaked(inputSection: string): Promise<ScenarioSuggestion> {
  const prompt = [SYSTEM, "", inputSection].join("\n");
  const raw = await runClaudeOnce(prompt, { timeoutMs: 90_000 });
  return parseSuggestion(raw);
}

// 자산+최신 본문 로드 후 buildInputSection 까지 — asset/baked 양쪽이 공유하는 입력부 조립.
async function loadInputSection(input: {
  assetId: string;
  hint?: string;
  ticketText?: string;
}): Promise<string> {
  const asset = getAsset(input.assetId);
  if (!asset) throw new ClaudeAssistError("자산을 찾을 수 없음");
  const content = latestContent(input.assetId) ?? "(자산 본문 없음)";
  return buildInputSection({
    kind: asset.kind,
    name: asset.name,
    content,
    hint: input.hint,
    ticketText: input.ticketText,
  });
}

// 본문 주입(1B) 우선, 실패 시 baked fallback(4B). 어느 경로를 탔는지 meta.source 로 식별.
// 주의: 자산 경로 fallback 은 runClaudeOnce 실행 실패에만 한정한다.
// parseSuggestion(스키마/JSON 파싱 실패)은 자산 프롬프트 품질 문제이므로 fallback 없이 throw —
// baked 로 재호출하면 토큰이 조용히 2배가 되고 자산 품질 문제도 가려진다.
export async function suggestScenarioWithMeta(input: {
  assetId: string;
  hint?: string;
  /** 5C: 정규화된 티켓 자유텍스트 슬롯. 실제 MCP(Jira/Notion) 조회 배선은 이번 범위 밖 — 골격만. */
  ticketText?: string;
}): Promise<{ suggestion: ScenarioSuggestion; meta: SuggestScenarioMeta }> {
  const inputSection = await loadInputSection(input);

  const designerBody = loadScenarioDesignerBody();

  let fallbackReason = "사유 미상";
  // 1B: 자산 본문 주입 경로. runClaudeOnce(실행) 실패만 baked fallback 대상이다.
  // parseSuggestion(스키마/JSON) 실패는 자산 프롬프트 품질 문제이므로 try 밖에서 throw — fallback 금지.
  if (designerBody !== null) {
    const prompt = [designerBody, "", inputSection].join("\n");
    let raw: string | null = null;
    try {
      raw = await runClaudeOnce(prompt, { timeoutMs: 90_000 });
    } catch (e) {
      fallbackReason = `자산 경로 실행 실패: ${(e as Error).message}`;
    }
    if (raw !== null) {
      return { suggestion: parseSuggestion(raw), meta: { source: "asset" } };
    }
  } else {
    fallbackReason = `scenario-designer 자산 미발견(미sync): ${crewAgentPath("scenario-designer")}`;
  }

  // 4B: baked SYSTEM fallback.
  const suggestion = await generateViaBaked(inputSection);
  return { suggestion, meta: { source: "baked", fallbackReason } };
}

// ADR 0003 Follow-up #2: A/B 품질 측정의 빠진 조각 = "같은 입력을 양쪽으로 강제 산출".
// 같은 inputSection 으로 generateViaAsset + generateViaBaked 둘 다 호출한다.
// asset 경로 불가(미sync)면 ClaudeAssistError 가 throw 되어 A/B 불성립이 명확해진다(조용한 단일화 금지).
// 둘 다 실토큰(각 ~10-40s) — 자동 실행·채점은 범위 밖, 여기선 두 source-tagged 산출만 만든다.
export async function generateScenarioAbPair(input: {
  assetId: string;
  hint?: string;
  ticketText?: string;
}): Promise<{ asset: ScenarioSuggestion; baked: ScenarioSuggestion }> {
  const inputSection = await loadInputSection(input);
  const asset = await generateViaAsset(inputSection);
  const baked = await generateViaBaked(inputSection);
  return { asset, baked };
}
