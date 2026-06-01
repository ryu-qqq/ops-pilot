import { rmSync } from "node:fs";
import { join } from "node:path";
import type { Run } from "@opspilot/shared-types";
import { mcpLog } from "../../mcp/log.js";
import {
  assetVersionExists,
  versionExecContext,
} from "../registry/repository.js";
import { getScenario } from "../scenario/repository.js";
import { evaluateAssertionsForRun } from "../score/auto-evaluate.js";
import { collectDiffFiles } from "./diff.js";
import {
  extractUsage,
  normalizeEvent,
  type NormalizedEvent,
  type RunUsage,
} from "./normalizer.js";
import { notifyRunCompleted } from "./completion.js";
import {
  appendTrace,
  createRun,
  finishRun,
  getRun,
  saveRunDiff,
} from "./repository.js";
import type { RunnerSource } from "./source.js";
import { createWorktree, removeWorktree } from "./worktree.js";

export class RunInputError extends Error {}

function sysEvent(name: string, output: unknown): NormalizedEvent {
  return {
    type: "system",
    name,
    input: null,
    output,
    raw: { type: "opspilot", name, output },
  };
}

interface RunParams {
  assetVersionId: string;
  scenarioId: string;
  source: RunnerSource;
  /** OPSP-46 retro — feedback ingest 연결 등 내부 메타용 JSON 문자열 */
  retro?: string | null;
  /** baseline 대조군 — worktree 에서 이 자산 파일을 제거하고 실행 (자산 없을 때 결과). */
  disableAsset?: boolean;
}

// 자산 종류 → clone .claude 상대경로 (authoring assetRelPath 와 동일 규약).
function assetClaudeRelPath(kind: string, name: string): string | null {
  if (kind === "agent") return join(".claude", "agents", `${name}.md`);
  if (kind === "command") return join(".claude", "commands", `${name}.md`);
  if (kind === "skill") return join(".claude", "skills", name);
  return null; // cursor_* 등은 baseline 미지원
}

// 백그라운드 실행 루프 (run 행은 이미 생성됨). local-claude 는 worktree 격리.
async function runLoop(
  runId: string,
  scenarioInput: string,
  params: RunParams,
): Promise<void> {
  let seq = 0;
  let usage: RunUsage | null = null;
  let cleanup: (() => void) | null = null;
  try {
    // OPSP-44: 실행 cwd 는 프로젝트 clonePath 에서 자동 유도 — 사용자 입력 제거.
    const ctx = versionExecContext(params.assetVersionId);
    if (!ctx) throw new Error("실행 컨텍스트(clonePath/commit) 조회 실패");
    let cwd = ctx.clonePath;
    if (params.source.kind === "local-claude") {
      const wt = createWorktree(ctx.clonePath, ctx.gitCommit, runId);
      cwd = wt;
      // baseline 대조군: worktree 에서 평가 대상 자산 파일을 제거 → 자산 없이 같은 시나리오 실행.
      if (params.disableAsset) {
        const rel = assetClaudeRelPath(ctx.kind, ctx.name);
        if (rel) {
          rmSync(join(wt, rel), { recursive: true, force: true });
          appendTrace(
            runId,
            seq,
            sysEvent("baseline", {
              disabledAsset: `${ctx.kind}/${ctx.name}`,
              removed: rel,
            }),
          );
          seq += 1;
        }
      }
      // OPSP-30: worktree 폐기 직전 diff 수집 — 격리라 base↔실행 후가 곧 에이전트 작업.
      cleanup = () => {
        try {
          const files = collectDiffFiles(wt, ctx.gitCommit);
          saveRunDiff(runId, files);
        } catch {
          // diff 수집 실패가 실행 결과에 영향주지 않게 흡수.
        }
        removeWorktree(ctx.clonePath, wt);
      };
      appendTrace(
        runId,
        seq,
        sysEvent("worktree", { ref: ctx.gitCommit, path: wt }),
      );
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
    // OPSP-20: run 종료 후 시나리오 assertions 자동 측정 → score(scorer='assertion') 저장.
    // 실패해도 noop, 실행 결과에 영향 X.
    evaluateAssertionsForRun(runId);
    notifyRunCompleted(runId);
    // OPSP-18: 종료 결과 컬러 한 줄(데이몬 pane).
    const final = getRun(runId);
    if (final) {
      const tokens = (final.promptTokens ?? 0) + (final.completionTokens ?? 0);
      mcpLog.runDone(
        runId,
        final.status === "succeeded" ? "succeeded" : "failed",
        tokens > 0 ? tokens : null,
        final.costUsd,
      );
    }
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
    retro: params.retro ?? null,
  });

  // OPSP-18: 데이몬 pane 에 시작 한 줄(컬러). asset name 까지 끌어오면 join 추가 비용 → scenario.name + source 만.
  mcpLog.runStart(runId, `${scenario.name} via ${params.source.kind}`);

  // fire-and-forget — 응답을 막지 않는다.
  void runLoop(runId, scenario.input, params);

  const run = getRun(runId);
  if (!run) throw new Error("run row 사라짐 (불변식 위반)");
  return run; // status=running
}
