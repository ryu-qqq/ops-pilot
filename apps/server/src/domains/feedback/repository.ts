import { randomUUID } from "node:crypto";
import type {
  ImprovementProposal,
  IngestBundle,
  IngestBundleContext,
  IngestBundleStatus,
} from "@opspilot/shared-types";
import { getDb } from "../../db/index.js";

const nowIso = () => new Date().toISOString();

const INGEST_SELECT = `SELECT id,
                                project_id AS projectId,
                                notion_task_url AS notionTaskUrl,
                                git_ref AS gitRef,
                                diff_summary AS diffSummary,
                                context_json AS contextJsonRaw,
                                status,
                                created_at AS createdAt
                         FROM ingest_bundle`;

const PROPOSAL_SELECT = `SELECT id,
                                  ingest_id AS ingestId,
                                  run_id AS runId,
                                  target_kind AS targetKind,
                                  target_path AS targetPath,
                                  rationale,
                                  content,
                                  status,
                                  applied_commit AS appliedCommit,
                                  created_at AS createdAt
                           FROM improvement_proposal`;

function parseContext(raw: string): IngestBundleContext {
  return JSON.parse(raw) as IngestBundleContext;
}

function rowToIngest(row: Record<string, unknown>): IngestBundle {
  return {
    id: row.id as string,
    projectId: row.projectId as string,
    notionTaskUrl: (row.notionTaskUrl as string | null) ?? null,
    gitRef: row.gitRef as string,
    diffSummary: row.diffSummary as string,
    contextJson: parseContext(row.contextJsonRaw as string),
    status: row.status as IngestBundleStatus,
    createdAt: row.createdAt as string,
  };
}

function rowToProposal(row: Record<string, unknown>): ImprovementProposal {
  return {
    id: row.id as string,
    ingestId: row.ingestId as string,
    runId: (row.runId as string | null) ?? null,
    targetKind: row.targetKind as ImprovementProposal["targetKind"],
    targetPath: row.targetPath as string,
    rationale: row.rationale as string,
    content: row.content as string,
    status: row.status as ImprovementProposal["status"],
    appliedCommit: (row.appliedCommit as string | null) ?? null,
    createdAt: row.createdAt as string,
  };
}

export interface NewIngestBundle {
  projectId: string;
  notionTaskUrl: string | null;
  gitRef: string;
  diffSummary: string;
  contextJson: IngestBundleContext;
  status?: IngestBundleStatus;
}

export function createIngestBundle(input: NewIngestBundle): IngestBundle {
  const db = getDb();
  const id = randomUUID();
  const createdAt = nowIso();
  const status = input.status ?? "pending";
  db.prepare(
    `INSERT INTO ingest_bundle
       (id, project_id, notion_task_url, git_ref, diff_summary, context_json, status, created_at)
     VALUES (@id, @projectId, @notionTaskUrl, @gitRef, @diffSummary, @contextJsonRaw, @status, @createdAt)`,
  ).run({
    id,
    projectId: input.projectId,
    notionTaskUrl: input.notionTaskUrl,
    gitRef: input.gitRef,
    diffSummary: input.diffSummary,
    contextJsonRaw: JSON.stringify(input.contextJson),
    status,
    createdAt,
  });
  return {
    id,
    projectId: input.projectId,
    notionTaskUrl: input.notionTaskUrl,
    gitRef: input.gitRef,
    diffSummary: input.diffSummary,
    contextJson: input.contextJson,
    status,
    createdAt,
  };
}

export function getIngestBundle(id: string): IngestBundle | undefined {
  const row = getDb().prepare(`${INGEST_SELECT} WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToIngest(row) : undefined;
}

export function listProposalsByIngestId(ingestId: string): ImprovementProposal[] {
  const rows = getDb()
    .prepare(`${PROPOSAL_SELECT} WHERE ingest_id = ? ORDER BY created_at ASC`)
    .all(ingestId) as Record<string, unknown>[];
  return rows.map(rowToProposal);
}
