import { randomUUID } from "node:crypto";
import type { Project, ProjectWorkspaceMode } from "@opspilot/shared-types";
import { getDb } from "../../db/index.js";

const nowIso = () => new Date().toISOString();

export interface NewProject {
  name: string;
  gitUrl: string;
  clonePath: string;
  defaultBranch: string | null;
  workspaceMode?: ProjectWorkspaceMode;
  remoteVerified?: boolean;
}

export function createProject(p: NewProject): Project {
  const db = getDb();
  const id = randomUUID();
  const createdAt = nowIso();
  const workspaceMode = p.workspaceMode ?? "managed";
  const remoteVerified = p.remoteVerified ?? false;
  db.prepare(
    `INSERT INTO project (id, name, git_url, clone_path, workspace_mode, remote_verified,
                          default_branch, created_at)
     VALUES (@id, @name, @gitUrl, @clonePath, @workspaceMode, @remoteVerified,
             @defaultBranch, @createdAt)`,
  ).run({
    id,
    name: p.name,
    gitUrl: p.gitUrl,
    clonePath: p.clonePath,
    workspaceMode,
    remoteVerified: remoteVerified ? 1 : 0,
    defaultBranch: p.defaultBranch,
    createdAt,
  });
  return {
    id,
    name: p.name,
    gitUrl: p.gitUrl,
    clonePath: p.clonePath,
    workspaceMode,
    remoteVerified,
    defaultBranch: p.defaultBranch,
    createdAt,
  };
}

const SELECT = `SELECT id, name, git_url AS gitUrl, clone_path AS clonePath,
                       workspace_mode AS workspaceMode,
                       remote_verified AS remoteVerified,
                       default_branch AS defaultBranch, created_at AS createdAt
                FROM project`;

function mapProjectRow(row: Record<string, unknown>): Project {
  return {
    ...(row as Omit<Project, "remoteVerified">),
    remoteVerified: row.remoteVerified === 1 || row.remoteVerified === true,
  };
}

export function listProjects(): Project[] {
  const rows = getDb().prepare(`${SELECT} ORDER BY created_at DESC`).all() as Record<string, unknown>[];
  return rows.map(mapProjectRow);
}

export function getProject(id: string): Project | undefined {
  const row = getDb().prepare(`${SELECT} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? mapProjectRow(row) : undefined;
}

export function getProjectByUrl(gitUrl: string): Project | undefined {
  const row = getDb().prepare(`${SELECT} WHERE git_url = ?`).get(gitUrl) as
    | Record<string, unknown>
    | undefined;
  return row ? mapProjectRow(row) : undefined;
}
