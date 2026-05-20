import { z } from "zod";
import { ClaudeAssistError, extractJsonObject, runClaudeOnce } from "./claude.js";
import { getAsset, latestContent } from "../registry/repository.js";
import {
  getRun,
  listLastAssistantTexts,
  listRunDiffCounts,
} from "../run/repository.js";
import { getDb } from "../../db/index.js";
import { getScenario } from "../scenario/repository.js";

// OPSP-10 follow-up: 같은 시나리오를 N개 버전으로 돌린 결과를 보고 "어느 게 나았나" 판정.
// 트레이스 통째는 prompt 너무 커서 *요약*만 보냄 — 마지막 응답·단계 수·diff 수·토큰 등.
// 자산 본문 + 시나리오 명세는 평가 기준의 정합성 검증용.

export const judgeVerdictSchema = z.enum(["best", "fine", "worse"]);
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;

export const judgeResultSchema = z.object({
  winnerRunId: z.string().nullable(),
  summary: z.string().min(1),
  perRun: z.array(
    z.object({
      runId: z.string(),
      verdict: judgeVerdictSchema,
      note: z.string(),
    }),
  ),
});
export type JudgeResult = z.infer<typeof judgeResultSchema>;

const SYSTEM = `당신은 Claude Code 에이전트 평가자다.
같은 시나리오를 같은 자산의 N개 버전으로 돌린 결과를 비교해 "어느 버전이 더 나았는가"를 판정한다.

판정 기준(우선순위):
1. 시나리오 성공조건(있으면)을 잘 충족하는가
2. 마지막 응답이 시나리오 입력·기대동작에 맞는가
3. 같은 결과라면 단계 수·토큰·비용이 적은 쪽이 낫다
4. 위험한 부작용(의도 외 파일 변경 등) 없음

JSON 한 객체만 출력하라. 코드펜스/설명 텍스트 금지.

{
  "winnerRunId": "<승자 runId. 우열 판단 불가/모두 동등하면 null>",
  "summary": "<2-3문장 한국어. 왜 이 결정인가>",
  "perRun": [
    { "runId": "<run id>", "verdict": "best|fine|worse", "note": "<1-2문장 한국어 평>" }
  ]
}

규칙:
- perRun 은 입력 받은 runId 전부 포함.
- verdict 는 정확히 best/fine/worse 중 하나(영문). best 는 winnerRunId 와 동일.
- 추측·과장 금지. 데이터에 없는 사실 만들지 말 것.`;

interface RunSummary {
  runId: string;
  gitCommit: string;
  status: string;
  stepCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  diffFileCount: number;
  lastAssistantText: string | null;
}

function getStepCount(runId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM trace_event WHERE run_id = ?")
    .get(runId) as { n: number };
  return row.n;
}

function getRunGitCommit(runId: string): string {
  // commit 은 SQLite 예약어 → alias 다른 이름으로.
  const row = getDb()
    .prepare(
      `SELECT av.git_commit AS gitCommit FROM run r
       JOIN asset_version av ON av.id = r.asset_version_id WHERE r.id = ?`,
    )
    .get(runId) as { gitCommit: string } | undefined;
  return row?.gitCommit ?? "?";
}

function buildSummaries(runIds: string[]): RunSummary[] {
  const diffCounts = listRunDiffCounts(runIds);
  const lastTexts = listLastAssistantTexts(runIds);
  const out: RunSummary[] = [];
  for (const id of runIds) {
    const run = getRun(id);
    if (!run) continue;
    out.push({
      runId: id,
      gitCommit: getRunGitCommit(id),
      status: run.status,
      stepCount: getStepCount(id),
      promptTokens: run.promptTokens,
      completionTokens: run.completionTokens,
      costUsd: run.costUsd,
      diffFileCount: diffCounts[id] ?? 0,
      lastAssistantText: lastTexts[id] ?? null,
    });
  }
  return out;
}

function formatRunBlock(s: RunSummary): string {
  return [
    `runId=${s.runId} (commit=${s.gitCommit.slice(0, 8)}):`,
    `  status=${s.status}, steps=${String(s.stepCount)},` +
      ` tokens=${String(s.promptTokens ?? "—")}/${String(s.completionTokens ?? "—")},` +
      ` cost=${s.costUsd === null ? "—" : String(s.costUsd)},` +
      ` diffFiles=${String(s.diffFileCount)}`,
    `  마지막 응답: ${s.lastAssistantText ?? "(없음)"}`,
  ].join("\n");
}

export async function judgeRuns(runIds: string[]): Promise<JudgeResult> {
  if (runIds.length < 2) throw new ClaudeAssistError("judgeRuns: 최소 2개 runId 필요");
  if (runIds.length > 5) throw new ClaudeAssistError("judgeRuns: 최대 5개까지");

  const summaries = buildSummaries(runIds);
  if (summaries.length < 2) throw new ClaudeAssistError("유효한 run 이 2개 미만");

  // 모든 run 이 같은 (asset_version → asset, scenario) 인지 확인. 안 같으면 의미 없음.
  const firstSummary = summaries[0];
  if (!firstSummary) throw new ClaudeAssistError("요약 없음");
  const firstRun = getRun(firstSummary.runId);
  if (!firstRun) throw new ClaudeAssistError("첫 run 조회 실패");
  const scenario = getScenario(firstRun.scenarioId);
  if (!scenario) throw new ClaudeAssistError("시나리오를 찾을 수 없음");
  const asset = getAsset(scenario.assetId);
  const assetContent = latestContent(scenario.assetId) ?? "(자산 본문 없음)";

  const prompt = [
    SYSTEM,
    "",
    "--- 시나리오 ---",
    `이름: ${scenario.name}`,
    `입력: ${scenario.input}`,
    scenario.expectation.judge ? `기대 동작: ${scenario.expectation.judge}` : "기대 동작: (미정)",
    scenario.expectation.assertions && scenario.expectation.assertions.length > 0
      ? `성공조건:\n  - ${scenario.expectation.assertions.join("\n  - ")}`
      : "성공조건: (없음)",
    "",
    `--- 자산 (kind=${asset?.kind ?? "?"}, name=${asset?.name ?? "?"}) ---`,
    assetContent,
    "",
    "--- run 결과 ---",
    summaries.map(formatRunBlock).join("\n"),
  ].join("\n");

  const raw = await runClaudeOnce(prompt, { timeoutMs: 120_000 });
  const obj = extractJsonObject(raw);
  const parsed = judgeResultSchema.safeParse(obj);
  if (!parsed.success) {
    throw new ClaudeAssistError(
      `judge JSON 스키마 불일치: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`,
    );
  }
  // perRun 이 입력 runIds 와 일치하는지 가벼운 검증.
  const inputSet = new Set(runIds);
  const respSet = new Set(parsed.data.perRun.map((p) => p.runId));
  for (const id of inputSet) {
    if (!respSet.has(id)) {
      throw new ClaudeAssistError(`judge 응답에 누락된 runId: ${id}`);
    }
  }
  return parsed.data;
}
