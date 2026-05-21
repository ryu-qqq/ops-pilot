import { z } from "zod";
import { ClaudeAssistError, extractJsonObject, runClaudeOnce } from "./claude.js";
import { getRun, listTrace } from "../run/repository.js";
import { getScenario } from "../scenario/repository.js";

// OPSP-37 (3): 한 run 의 trace 를 AI 가 분석 — 긴 trace 를 사람이 다 못 보니
// "무엇을 눈여겨봐야 하는가" 를 짚어준다. summary / 주목 지점 / 분포 해석 / 평가 포인트.

export const traceHighlightSchema = z.object({
  seq: z.number().int().nullable(), // 관련 trace event seq. 특정 못 하면 null
  severity: z.enum(["info", "warn", "critical"]),
  note: z.string().min(1),
});

export const traceAnalysisSchema = z.object({
  summary: z.string().min(1), // 이 run 이 한 일 — 3줄 이내
  highlights: z.array(traceHighlightSchema), // 주목 지점
  distributionInsight: z.string().min(1), // type/tool 분포가 작업에 주는 의미
  evalPoints: z.array(z.string()), // 평가 시 봐야 할 포인트
});
export type TraceAnalysis = z.infer<typeof traceAnalysisSchema>;

const SYSTEM = `당신은 Claude Code 에이전트 실행 트레이스 분석가다.
한 run 의 trace event 목록을 보고, 사람이 긴 트레이스를 다 읽지 않아도
*무엇을 눈여겨봐야 하는지* 를 짚어준다.

JSON 한 객체만 출력하라. 코드펜스/설명 텍스트 금지.

{
  "summary": "<이 run 이 한 일을 3줄 이내 한국어로. 어떤 skill/도구를 거쳐 무엇을 했나>",
  "highlights": [
    {
      "seq": <관련 trace event 의 seq 번호. 특정 못 하면 null>,
      "severity": "<info | warn | critical>",
      "note": "<여기서 무엇이 중요/이상한지 한국어로 한 줄. 실패·재시도·같은 도구 반복(루프 의심)·비정상 긴 단계·skill 발화 지점 등>"
    }
  ],
  "distributionInsight": "<type/tool 분포가 이 작업에 주는 의미를 한국어로. 예: 'Read 위주 = 탐색 중심', 'Task 다수 = sub-agent 위임 활발', 'thinking 0 = 사고 과정 미노출'>",
  "evalPoints": ["<이 run 을 평가할 때 사람이 확인해야 할 포인트 한국어로>", ...]
}

규칙:
- highlights 는 정말 주목할 것만 (3~7개). 모든 event 를 나열하지 마라.
- severity: critical=실패·오류·위험, warn=재시도·루프 의심·비효율, info=정상이지만 짚을 만한 지점.
- 추측 금지. trace 에 없는 내용 지어내지 마라.
- 한국어로.`;

function summarizeTrace(trace: ReturnType<typeof listTrace>): string {
  return trace
    .map((e) => {
      const inp =
        e.input === null ? "" : ` input=${JSON.stringify(e.input).slice(0, 300)}`;
      const out =
        e.output === null
          ? ""
          : ` output=${(typeof e.output === "string" ? e.output : JSON.stringify(e.output)).slice(0, 300)}`;
      return `#${String(e.seq)} ${e.type}${e.name === null ? "" : `(${e.name})`}${inp}${out}`;
    })
    .join("\n");
}

export async function analyzeTrace(runId: string): Promise<TraceAnalysis> {
  const run = getRun(runId);
  if (!run) throw new ClaudeAssistError("run 을 찾을 수 없습니다.");
  const trace = listTrace(runId);
  if (trace.length === 0) throw new ClaudeAssistError("이 run 에는 trace event 가 없습니다.");
  const scenario = getScenario(run.scenarioId);

  const parts = [
    SYSTEM,
    "",
    "--- run 메타 ---",
    `status=${run.status} runner=${run.runner}`,
    `promptTokens=${String(run.promptTokens ?? "?")} completionTokens=${String(run.completionTokens ?? "?")} costUsd=${String(run.costUsd ?? "?")}`,
    run.error === null ? "" : `error=${run.error}`,
    "",
    "--- 시나리오 ---",
    scenario === undefined
      ? "(없음)"
      : `name=${scenario.name}\ninput=${scenario.input.slice(0, 800)}\nassertions=${JSON.stringify(scenario.expectation.assertions ?? [])}`,
    "",
    "--- trace events ---",
    summarizeTrace(trace),
  ];
  const raw = await runClaudeOnce(parts.join("\n"), { timeoutMs: 90_000 });
  const obj = extractJsonObject(raw);
  const parsed = traceAnalysisSchema.safeParse(obj);
  if (!parsed.success) {
    throw new ClaudeAssistError(
      `분석 JSON 스키마 불일치: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`,
    );
  }
  return parsed.data;
}
