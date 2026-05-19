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

interface RunParams {
  assetVersionId: string;
  scenarioId: string;
  cwd: string;
  source: RunnerSource;
}

// 백그라운드 실행 루프 (run 행은 이미 생성됨). local-claude 는 worktree 격리.
async function runLoop(runId: string, scenarioInput: string, params: RunParams): Promise<void> {
  let seq = 0;
  let usage: RunUsage | null = null;
  let cwd = params.cwd;
  let cleanup: (() => void) | null = null;
  try {
    if (params.source.kind === "local-claude") {
      const ctx = versionExecContext(params.assetVersionId);
      if (!ctx) throw new Error("실행 컨텍스트(clonePath/commit) 조회 실패");
      const wt = createWorktree(ctx.clonePath, ctx.gitCommit, runId);
      cwd = wt;
      cleanup = () => {
        removeWorktree(ctx.clonePath, wt);
      };
      appendTrace(runId, seq, sysEvent("worktree", { ref: ctx.gitCommit, path: wt }));
      seq += 1;
    }
    for await (const raw of params.source.run({ prompt: scenarioInput, cwd })) {
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
}

/**
 * OPSP-29: 즉시 반환(비동기). 검증·run 생성은 동기 → status=running 즉시 응답.
 * 실제 실행은 백그라운드 → 클라이언트는 폴링으로 trace 실시간 수신(타임아웃 없음).
 */
export function startRun(params: RunParams): Run {
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

  // fire-and-forget — 응답을 막지 않는다.
  void runLoop(runId, scenario.input, params);

  const run = getRun(runId);
  if (!run) throw new Error("run row 사라짐 (불변식 위반)");
  return run; // status=running
}
