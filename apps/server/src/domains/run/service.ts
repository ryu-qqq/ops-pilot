import type { Run } from "@opspilot/shared-types";
import { assetVersionExists, versionExecContext } from "../registry/repository.js";
import { getScenario } from "../scenario/repository.js";
import { extractUsage, normalizeEvent, type NormalizedEvent, type RunUsage } from "./normalizer.js";
import { appendTrace, createRun, finishRun, getRun } from "./repository.js";
import type { RunnerSource } from "./source.js";
import { createWorktree, removeWorktree } from "./worktree.js";

export class RunInputError extends Error {}

function sysEvent(name: string, output: unknown): NormalizedEvent {
  return { type: "system", name, input: null, output, raw: { type: "opspilot", name, output } };
}

/**
 * (asset_version × scenario) 1회 실행.
 * local-claude 는 프로젝트 클론에서 해당 버전 커밋으로 worktree를 떠 *격리 실행*,
 * 종료 시 worktree 폐기. fixture 는 격리 불필요(실행 없음).
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
  let cwd = params.cwd;
  let cleanup: (() => void) | null = null;

  try {
    if (params.source.kind === "local-claude") {
      const ctx = versionExecContext(params.assetVersionId);
      if (!ctx) throw new RunInputError("실행 컨텍스트(clonePath/commit) 조회 실패");
      const wt = createWorktree(ctx.clonePath, ctx.gitCommit, runId);
      cwd = wt;
      cleanup = () => {
        removeWorktree(ctx.clonePath, wt);
      };
      appendTrace(
        runId,
        seq,
        sysEvent("worktree", { ref: ctx.gitCommit, path: wt, clone: ctx.clonePath }),
      );
      seq += 1;
    }

    for await (const raw of params.source.run({ prompt: scenario.input, cwd })) {
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
  } finally {
    cleanup?.();
  }

  const run = getRun(runId);
  if (!run) throw new Error("run row 사라짐 (불변식 위반)");
  return run;
}
