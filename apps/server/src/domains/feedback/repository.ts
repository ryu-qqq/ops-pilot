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

export function updateIngestStatus(id: string, status: IngestBundleStatus): void {
  getDb().prepare("UPDATE ingest_bundle SET status = ? WHERE id = ?").run(status, id);
}

export function mergeIngestContext(id: string, patch: Partial<IngestBundleContext>): IngestBundle | undefined {
  const existing = getIngestBundle(id);
  if (!existing) return undefined;
  const next = { ...existing.contextJson, ...patch };
  getDb()
    .prepare("UPDATE ingest_bundle SET context_json = ? WHERE id = ?")
    .run(JSON.stringify(next), id);
  return { ...existing, contextJson: next };
}

export interface NewImprovementProposal {
  ingestId: string;
  runId: string;
  targetKind: ImprovementProposal["targetKind"];
  targetPath: string;
  rationale: string;
  content: string;
}

export function createImprovementProposal(input: NewImprovementProposal): ImprovementProposal {
  const db = getDb();
  const id = randomUUID();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO improvement_proposal
       (id, ingest_id, run_id, target_kind, target_path, rationale, content, status, applied_commit, created_at)
     VALUES (@id, @ingestId, @runId, @targetKind, @targetPath, @rationale, @content, 'draft', NULL, @createdAt)`,
  ).run({ id, ...input, createdAt });
  return {
    id,
    ingestId: input.ingestId,
    runId: input.runId,
    targetKind: input.targetKind,
    targetPath: input.targetPath,
    rationale: input.rationale,
    content: input.content,
    status: "draft",
    appliedCommit: null,
    createdAt,
  };
}

export function listProposalsByIngestId(ingestId: string): ImprovementProposal[] {
  const rows = getDb()
    .prepare(`${PROPOSAL_SELECT} WHERE ingest_id = ? ORDER BY created_at ASC`)
    .all(ingestId) as Record<string, unknown>[];
  return rows.map(rowToProposal);
}

export interface IngestBundleListRow {
  id: string;
  projectId: string;
  notionTaskUrl: string | null;
  gitRef: string;
  status: IngestBundleStatus;
  createdAt: string;
  draftProposalCount: number;
}

export function listIngestBundlesByProject(projectId: string): IngestBundleListRow[] {
  const rows = getDb()
    .prepare(
      `SELECT ib.id,
              ib.project_id AS projectId,
              ib.notion_task_url AS notionTaskUrl,
              ib.git_ref AS gitRef,
              ib.status,
              ib.created_at AS createdAt,
              (SELECT COUNT(*) FROM improvement_proposal p
                 WHERE p.ingest_id = ib.id AND p.status = 'draft') AS draftProposalCount
         FROM ingest_bundle ib
        WHERE ib.project_id = ?
        ORDER BY ib.created_at DESC`,
    )
    .all(projectId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id as string,
    projectId: row.projectId as string,
    notionTaskUrl: (row.notionTaskUrl as string | null) ?? null,
    gitRef: row.gitRef as string,
    status: row.status as IngestBundleStatus,
    createdAt: row.createdAt as string,
    draftProposalCount: Number(row.draftProposalCount ?? 0),
  }));
}

export function getImprovementProposal(id: string): ImprovementProposal | undefined {
  const row = getDb().prepare(`${PROPOSAL_SELECT} WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToProposal(row) : undefined;
}

export function updateProposalStatus(
  id: string,
  status: ImprovementProposal["status"],
): ImprovementProposal | undefined {
  const existing = getImprovementProposal(id);
  if (!existing) return undefined;
  getDb().prepare("UPDATE improvement_proposal SET status = ? WHERE id = ?").run(status, id);
  return { ...existing, status };
}

export function markProposalApplied(
  id: string,
  appliedCommit: string,
): ImprovementProposal | undefined {
  const existing = getImprovementProposal(id);
  if (!existing) return undefined;
  getDb()
    .prepare(
      "UPDATE improvement_proposal SET status = 'applied', applied_commit = ? WHERE id = ?",
    )
    .run(appliedCommit, id);
  return { ...existing, status: "applied", appliedCommit };
}
