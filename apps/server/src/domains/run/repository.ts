import { randomUUID } from "node:crypto";
import type { Run, RunStatus } from "@opspilot/shared-types";
import { getDb } from "../../db/index.js";
import type { NormalizedEvent, RunUsage } from "./normalizer.js";

const nowIso = () => new Date().toISOString();

export function createRun(input: {
  assetVersionId: string;
  scenarioId: string;
  runner: string;
}): string {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO run (id, asset_version_id, scenario_id, status, runner, started_at, created_at)
     VALUES (@id, @assetVersionId, @scenarioId, 'running', @runner, @now, @now)`,
  ).run({ id, assetVersionId: input.assetVersionId, scenarioId: input.scenarioId, runner: input.runner, now: nowIso() });
  return id;
}

export function appendTrace(runId: string, seq: number, e: NormalizedEvent): void {
  getDb()
    .prepare(
      `INSERT INTO trace_event (id, run_id, seq, type, name, input, output, started_at, raw)
       VALUES (@id, @runId, @seq, @type, @name, @input, @output, @startedAt, @raw)`,
    )
    .run({
      id: randomUUID(),
      runId,
      seq,
      type: e.type,
      name: e.name,
      input: e.input === null ? null : JSON.stringify(e.input),
      output: e.output === null ? null : JSON.stringify(e.output),
      startedAt: nowIso(),
      raw: JSON.stringify(e.raw),
    });
}

export function finishRun(
  runId: string,
  status: Extract<RunStatus, "succeeded" | "failed">,
  opts: { error?: string | null; usage?: RunUsage | null } = {},
): void {
  getDb()
    .prepare(
      `UPDATE run SET status=@status, finished_at=@now, error=@error,
         prompt_tokens=@pt, completion_tokens=@ct, cost_usd=@cost
       WHERE id=@runId`,
    )
    .run({
      runId,
      status,
      now: nowIso(),
      error: opts.error ?? null,
      pt: opts.usage?.promptTokens ?? null,
      ct: opts.usage?.completionTokens ?? null,
      cost: opts.usage?.costUsd ?? null,
    });
}

export function getRun(id: string): Run | undefined {
  return getDb()
    .prepare(
      `SELECT id, asset_version_id AS assetVersionId, scenario_id AS scenarioId, status, runner,
              model, started_at AS startedAt, finished_at AS finishedAt, error,
              prompt_tokens AS promptTokens, completion_tokens AS completionTokens,
              cost_usd AS costUsd, created_at AS createdAt
       FROM run WHERE id = ?`,
    )
    .get(id) as Run | undefined;
}

export interface TraceRow {
  seq: number;
  type: string;
  name: string | null;
  input: unknown;
  output: unknown;
}

export function listTrace(runId: string): TraceRow[] {
  const rows = getDb()
    .prepare(
      `SELECT seq, type, name, input, output FROM trace_event
       WHERE run_id = ? ORDER BY seq ASC`,
    )
    .all(runId) as { seq: number; type: string; name: string | null; input: string | null; output: string | null }[];
  return rows.map((r) => ({
    seq: r.seq,
    type: r.type,
    name: r.name,
    input: r.input === null ? null : (JSON.parse(r.input) as unknown),
    output: r.output === null ? null : (JSON.parse(r.output) as unknown),
  }));
}
