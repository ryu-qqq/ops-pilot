import { randomUUID } from "node:crypto";
import type { Run, RunDiffFile, RunStatus } from "@opspilot/shared-types";
import { getDb } from "../../db/index.js";
import type { CollectedDiffFile } from "./diff.js";
import type { NormalizedEvent, RunUsage } from "./normalizer.js";

const nowIso = () => new Date().toISOString();

export function createRun(input: {
  assetVersionId: string;
  scenarioId: string;
  runner: string;
  retro?: string | null;
}): string {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO run (id, asset_version_id, scenario_id, status, runner, retro, started_at, created_at)
     VALUES (@id, @assetVersionId, @scenarioId, 'running', @runner, @retro, @now, @now)`,
  ).run({
    id,
    assetVersionId: input.assetVersionId,
    scenarioId: input.scenarioId,
    runner: input.runner,
    retro: input.retro ?? null,
    now: nowIso(),
  });
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

// OPSP-36 (1): 서버 부팅 시 좀비 정리 — 컴퓨터 sleep/종료로 자식 프로세스가
// 끊겼는데 status 가 running 으로 남은 run 을 failed 로 마킹. 임계 시간 초과분만.
export function cleanupZombieRuns(thresholdMinutes: number): number {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60_000).toISOString();
  const result = getDb()
    .prepare(
      `UPDATE run
          SET status='failed', finished_at=@now,
              error='서버 재시작 시 좀비 정리 — 실행이 비정상 종료된 것으로 추정'
        WHERE status='running' AND created_at < @cutoff`,
    )
    .run({ now: nowIso(), cutoff });
  return result.changes;
}

// OPSP-36 (1): 사용자 명시 강제 종료.
export function cancelRun(id: string): boolean {
  const result = getDb()
    .prepare(
      `UPDATE run SET status='failed', finished_at=@now, error='사용자가 강제 종료'
        WHERE id=@id AND status IN ('running','pending')`,
    )
    .run({ id, now: nowIso() });
  return result.changes > 0;
}

export function getRun(id: string): Run | undefined {
  return getDb()
    .prepare(
      `SELECT id, asset_version_id AS assetVersionId, scenario_id AS scenarioId, status, runner,
              model, started_at AS startedAt, finished_at AS finishedAt, error,
              prompt_tokens AS promptTokens, completion_tokens AS completionTokens,
              cost_usd AS costUsd, retro, created_at AS createdAt
       FROM run WHERE id = ?`,
    )
    .get(id) as Run | undefined;
}

// OPSP-46: run 회고 메모 갱신 (선택적 "왜"). 빈 문자열이면 NULL 로 비운다.
export function setRunRetro(id: string, retro: string): Run | undefined {
  const value = retro.trim() === "" ? null : retro;
  getDb().prepare("UPDATE run SET retro = ? WHERE id = ?").run(value, id);
  return getRun(id);
}

export interface RunListItem {
  id: string;
  status: string;
  runner: string;
  createdAt: string;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  scenarioId: string;
  scenarioName: string;
  assetName: string;
  assetKind: string;
  gitCommit: string;
}

export function listRuns(): RunListItem[] {
  return getDb()
    .prepare(
      `SELECT r.id, r.status, r.runner, r.created_at AS createdAt,
              r.prompt_tokens AS promptTokens, r.completion_tokens AS completionTokens,
              r.cost_usd AS costUsd,
              s.id AS scenarioId, s.name AS scenarioName, a.name AS assetName, a.kind AS assetKind,
              av.git_commit AS gitCommit
       FROM run r
       JOIN scenario s ON s.id = r.scenario_id
       JOIN asset_version av ON av.id = r.asset_version_id
       JOIN asset a ON a.id = av.asset_id
       ORDER BY r.created_at DESC`,
    )
    .all() as RunListItem[];
}

export interface TraceRow {
  seq: number;
  type: string;
  name: string | null;
  input: unknown;
  output: unknown;
}

// OPSP-30: 수집된 파일 diff 들을 한 트랜잭션으로 저장(중복 시 무시 — UNIQUE run+path).
export function saveRunDiff(runId: string, files: CollectedDiffFile[]): void {
  if (files.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO run_diff_file
       (id, run_id, file_path, status, additions, deletions, binary, truncated, patch)
     VALUES (@id, @runId, @filePath, @status, @additions, @deletions, @binary, @truncated, @patch)`,
  );
  const tx = db.transaction((rows: CollectedDiffFile[]) => {
    for (const f of rows) {
      stmt.run({
        id: randomUUID(),
        runId,
        filePath: f.filePath,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        binary: f.binary ? 1 : 0,
        truncated: f.truncated ? 1 : 0,
        patch: f.patch,
      });
    }
  });
  tx(files);
}

// OPSP-9: 여러 run 의 scenario.name 을 한꺼번에 — 비교 뷰가 회귀 모드 식별·표시.
export function listRunScenarioNames(runIds: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  if (runIds.length === 0) return map;
  const placeholders = runIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT r.id AS runId, s.name AS name FROM run r
       JOIN scenario s ON s.id = r.scenario_id
       WHERE r.id IN (${placeholders})`,
    )
    .all(...runIds) as { runId: string; name: string }[];
  for (const r of rows) map[r.runId] = r.name;
  return map;
}

// OPSP-10 비교 뷰: 여러 run 의 diff 파일 수만 한꺼번에 모음.
export function listRunDiffCounts(runIds: string[]): Record<string, number> {
  if (runIds.length === 0) return {};
  const placeholders = runIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT run_id AS runId, COUNT(*) AS count FROM run_diff_file
       WHERE run_id IN (${placeholders}) GROUP BY run_id`,
    )
    .all(...runIds) as { runId: string; count: number }[];
  const map: Record<string, number> = {};
  for (const r of rows) map[r.runId] = r.count;
  return map;
}

// OPSP-10 비교 뷰: 각 run 의 마지막 assistant 메시지 텍스트(미리보기).
// trace_event 의 output 은 정규화된 JSON 객체 — assistant_message 면 그 안에 text.
// 못 추출하면 null. 1차는 단순 — 마지막 assistant_message 의 output 통째 string.
export function listLastAssistantTexts(runIds: string[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  if (runIds.length === 0) return map;
  const db = getDb();
  const stmt = db.prepare(
    `SELECT output FROM trace_event
     WHERE run_id = ? AND type = 'assistant_message'
     ORDER BY seq DESC LIMIT 1`,
  );
  for (const id of runIds) {
    const row = stmt.get(id) as { output: string | null } | undefined;
    if (row === undefined || row.output === null) {
      map[id] = null;
      continue;
    }
    try {
      const parsed = JSON.parse(row.output) as unknown;
      // assistant 출력 normalization 형태: { text: "...", ... } 또는 raw 객체
      if (typeof parsed === "string") map[id] = parsed.slice(0, 280);
      else if (parsed !== null && typeof parsed === "object" && "text" in parsed) {
        const t = (parsed as { text: unknown }).text;
        map[id] = typeof t === "string" ? t.slice(0, 280) : JSON.stringify(parsed).slice(0, 280);
      } else {
        map[id] = JSON.stringify(parsed).slice(0, 280);
      }
    } catch {
      map[id] = row.output.slice(0, 280);
    }
  }
  return map;
}

/** trace_event output 컬럼 → assistant 텍스트. */
function decodeTraceOutput(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "string") return parsed;
    if (parsed !== null && typeof parsed === "object" && "text" in parsed) {
      const t = (parsed as { text: unknown }).text;
      return typeof t === "string" ? t : JSON.stringify(parsed);
    }
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
}

/** run 의 마지막 assistant 메시지 전문(파서용 — compare 미리보기용 truncate 없음). */
export function getLastAssistantText(runId: string): string | null {
  const row = getDb()
    .prepare(
      `SELECT output FROM trace_event
       WHERE run_id = ? AND type = 'assistant_message'
       ORDER BY seq DESC LIMIT 1`,
    )
    .get(runId) as { output: string | null } | undefined;
  return row === undefined ? null : decodeTraceOutput(row.output);
}

/** run 의 assistant 메시지 전체 — 최신 seq 먼저 (feedback JSON이 마지막 turn에 없을 때 대비). */
export function listAssistantTextsNewestFirst(runId: string): string[] {
  const rows = getDb()
    .prepare(
      `SELECT output FROM trace_event
       WHERE run_id = ? AND type = 'assistant_message'
       ORDER BY seq DESC`,
    )
    .all(runId) as { output: string | null }[];
  const texts: string[] = [];
  for (const row of rows) {
    const text = decodeTraceOutput(row.output);
    if (text !== null && text.trim() !== "") texts.push(text);
  }
  return texts;
}

export function listRunDiff(runId: string): RunDiffFile[] {
  const rows = getDb()
    .prepare(
      `SELECT id, run_id AS runId, file_path AS filePath, status,
              additions, deletions, binary, truncated, patch
       FROM run_diff_file WHERE run_id = ? ORDER BY file_path ASC`,
    )
    .all(runId) as {
    id: string;
    runId: string;
    filePath: string;
    status: string;
    additions: number;
    deletions: number;
    binary: number;
    truncated: number;
    patch: string | null;
  }[];
  return rows.map((r) => ({
    ...r,
    status: r.status as RunDiffFile["status"],
    binary: r.binary === 1,
    truncated: r.truncated === 1,
  }));
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
