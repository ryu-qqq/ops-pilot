import type { Scenario } from "@opspilot/shared-types";
import { getDb } from "../../db/index.js";
import { getProject } from "../project/repository.js";
import { listAssets, listVersions, saveScan } from "../registry/repository.js";
import { scanRepo } from "../registry/scanner.js";
import { RunInputError, startRun } from "../run/service.js";
import { fixtureSource, localClaudeSource } from "../run/source.js";
import { getRun } from "../run/repository.js";
import {
  createScenario,
  getScenarioByAssetAndName,
  updateScenario,
} from "../scenario/repository.js";
import { FEEDBACK_EVAL_FIXTURE } from "./fixture.js";
import { parseProposalsFromRun } from "./parser.js";
import {
  createImprovementProposal,
  getIngestBundle,
  mergeIngestContext,
  updateIngestStatus,
} from "./repository.js";
import { buildFeedbackScenarioInput, FEEDBACK_SCENARIO_NAME } from "./scenario-template.js";

export type FeedbackEvalSource = "fixture" | "local-claude";

interface EvalAsset {
  assetId: string;
  versionId: string;
}

function markEvalFailed(ingestId: string, reason: string): void {
  mergeIngestContext(ingestId, { evalError: reason });
  updateIngestStatus(ingestId, "failed");
}

function findWorkEvaluator(projectId: string): EvalAsset | null {
  const asset = listAssets(projectId).find((a) => a.kind === "agent" && a.name === "work-evaluator");
  if (!asset) return null;
  const versions = listVersions(asset.id);
  const latest = versions[0];
  if (!latest) return null;
  return { assetId: asset.id, versionId: latest.id };
}

function upsertFeedbackScenario(assetId: string, input: string): Scenario {
  const existing = getScenarioByAssetAndName(assetId, FEEDBACK_SCENARIO_NAME);
  if (existing) {
    const updated = updateScenario(existing.id, {
      input,
      description: "TASK-5 MVP — ingest 치환 시나리오",
    });
    if (!updated) throw new Error("scenario update failed");
    return updated;
  }
  return createScenario({
    assetId,
    name: FEEDBACK_SCENARIO_NAME,
    description: "TASK-5 MVP — ingest 치환 시나리오",
    input,
    expectation: {},
  });
}

function parseFeedbackIngestId(retro: string | null | undefined): string | null {
  if (!retro) return null;
  try {
    const parsed = JSON.parse(retro) as { feedbackIngestId?: string };
    return parsed.feedbackIngestId ?? null;
  } catch {
    return null;
  }
}

/** ingest 후 work-evaluator run 큐. fixture 는 CI·로컬 검증용. */
export function queueFeedbackEval(ingestId: string, evalSource: FeedbackEvalSource): void {
  const bundle = getIngestBundle(ingestId);
  if (!bundle) return;

  const project = getProject(bundle.projectId);
  if (!project) {
    markEvalFailed(ingestId, "project not found");
    return;
  }

  try {
    saveScan(project.id, scanRepo(project.clonePath));
  } catch (e) {
    if (!findWorkEvaluator(project.id)) {
      markEvalFailed(ingestId, `scan failed: ${(e as Error).message}`);
      return;
    }
  }

  const evalAsset = findWorkEvaluator(project.id);
  if (!evalAsset) {
    markEvalFailed(ingestId, "work-evaluator asset not found — project scan 후 재시도");
    return;
  }

  let scenario: Scenario;
  try {
    scenario = upsertFeedbackScenario(
      evalAsset.assetId,
      buildFeedbackScenarioInput(bundle, project.name),
    );
  } catch (e) {
    markEvalFailed(ingestId, `scenario upsert failed: ${(e as Error).message}`);
    return;
  }

  updateIngestStatus(ingestId, "evaluating");

  const source =
    evalSource === "fixture" ? fixtureSource(FEEDBACK_EVAL_FIXTURE) : localClaudeSource();

  try {
    const run = startRun({
      assetVersionId: evalAsset.versionId,
      scenarioId: scenario.id,
      source,
      retro: JSON.stringify({ feedbackIngestId: ingestId }),
    });
    mergeIngestContext(ingestId, { evalRunId: run.id });
  } catch (e) {
    const msg = e instanceof RunInputError ? e.message : (e as Error).message;
    markEvalFailed(ingestId, `startRun failed: ${msg}`);
  }
}

/** run 종료 훅 — evaluator 출력 파싱 → improvement_proposal. */
export async function handleFeedbackRunCompleted(runId: string): Promise<void> {
  const run = getRun(runId);
  const ingestId = parseFeedbackIngestId(run?.retro);
  if (!ingestId) return;

  const ingest = getIngestBundle(ingestId);
  if (!ingest || ingest.status !== "evaluating") return;

  if (run?.status === "failed") {
    mergeIngestContext(ingestId, { evalError: run.error ?? "run failed" });
    updateIngestStatus(ingestId, "failed");
    return;
  }

  if (run?.status !== "succeeded") return;

  const parsed = parseProposalsFromRun(runId);
  if (!parsed.ok) {
    mergeIngestContext(ingestId, { evalError: parsed.error });
    updateIngestStatus(ingestId, "failed");
    return;
  }

  try {
    for (const p of parsed.proposals) {
      createImprovementProposal({ ingestId, runId, ...p });
    }
    updateIngestStatus(ingestId, "done");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markEvalFailed(ingestId, `proposal save failed: ${msg}`);
    throw e;
  }
}

/** eval run은 끝났으나 ingest 후처리(DB 등)만 실패한 경우 재파싱·proposal 저장. */
export async function reprocessFeedbackEval(ingestId: string): Promise<void> {
  const ingest = getIngestBundle(ingestId);
  if (!ingest) throw new Error("ingest not found");

  const evalRunId = ingest.contextJson.evalRunId;
  if (!evalRunId) throw new Error("evalRunId 없음 — ingest 재생성 필요");

  const run = getRun(evalRunId);
  if (!run) throw new Error("eval run not found");
  if (run.status === "running") throw new Error("eval run still running");

  const db = getDb();
  db.prepare("DELETE FROM improvement_proposal WHERE ingest_id = ? AND status = 'draft'").run(
    ingestId,
  );

  const ctx = { ...ingest.contextJson };
  delete ctx.evalError;
  db.prepare("UPDATE ingest_bundle SET context_json = ?, status = 'evaluating' WHERE id = ?").run(
    JSON.stringify(ctx),
    ingestId,
  );

  await handleFeedbackRunCompleted(evalRunId);
}
