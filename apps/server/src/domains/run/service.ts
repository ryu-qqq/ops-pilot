import type { Run } from "@opspilot/shared-types";
import { assetVersionExists } from "../registry/repository.js";
import { getScenario } from "../scenario/repository.js";
import { extractUsage, normalizeEvent, type RunUsage } from "./normalizer.js";
import { appendTrace, createRun, finishRun, getRun } from "./repository.js";
import type { RunnerSource } from "./source.js";

export class RunInputError extends Error {}

/**
 * (asset_version × scenario) 1회 실행.
 * 소스 이벤트 → 정규화 → trace_event 적재, 종료 시 run 마감(상태/토큰).
 */
export async function executeRun(params: {
  assetVersionId: string;
  scenarioId: string;
  cwd: string;
  source: RunnerSource;
}): Promise<Run> {
  if (!assetVersionExists(params.assetVersionId)) {
    throw new RunInputError("asset_version not found");
  }
  const scenario = getScenario(params.scenarioId);
  if (!scenario) throw new RunInputError("scenario not found");

  const runId = createRun({
    assetVersionId: params.assetVersionId,
    scenarioId: params.scenarioId,
    runner: params.source.kind,
  });

  let seq = 0;
  let usage: RunUsage | null = null;
  try {
    for await (const raw of params.source.run({ prompt: scenario.input, cwd: params.cwd })) {
      for (const ev of normalizeEvent(raw)) {
        appendTrace(runId, seq, ev);
        seq += 1;
      }
      const u = extractUsage(raw);
      if (u) usage = u;
    }
    finishRun(runId, "succeeded", { usage });
  } catch (e) {
    finishRun(runId, "failed", { error: (e as Error).message, usage });
  }

  const run = getRun(runId);
  if (!run) throw new Error("run row 사라짐 (불변식 위반)");
  return run;
}
