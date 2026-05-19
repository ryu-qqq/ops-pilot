import { randomUUID } from "node:crypto";
import type { Project } from "@opspilot/shared-types";
import { getDb } from "../../db/index.js";

const nowIso = () => new Date().toISOString();

export interface NewProject {
  name: string;
  gitUrl: string;
  clonePath: string;
  defaultBranch: string | null;
}

export function createProject(p: NewProject): Project {
  const db = getDb();
  const id = randomUUID();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO project (id, name, git_url, clone_path, default_branch, created_at)
     VALUES (@id, @name, @gitUrl, @clonePath, @defaultBranch, @createdAt)`,
  ).run({ id, ...p, createdAt });
  return { id, ...p, createdAt };
}

const SELECT = `SELECT id, name, git_url AS gitUrl, clone_path AS clonePath,
                       default_branch AS defaultBranch, created_at AS createdAt
                FROM project`;

export function listProjects(): Project[] {
  return getDb().prepare(`${SELECT} ORDER BY created_at DESC`).all() as Project[];
}

export function getProject(id: string): Project | undefined {
  return getDb().prepare(`${SELECT} WHERE id = ?`).get(id) as Project | undefined;
}

export function getProjectByUrl(gitUrl: string): Project | undefined {
  return getDb().prepare(`${SELECT} WHERE git_url = ?`).get(gitUrl) as Project | undefined;
}
