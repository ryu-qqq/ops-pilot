import { randomUUID } from "node:crypto";
import type { Asset } from "@opspilot/shared-types";
import { getDb } from "../../db/index.js";
import type { ScannedAsset } from "./scanner.js";

// asset_version 에서 content 를 뺀 목록용 뷰 (페이로드 절약).
export interface AssetVersionSummary {
  id: string;
  assetId: string;
  gitCommit: string;
  gitRef: string | null;
  contentHash: string;
  committedAt: string;
  commitMessage: string | null;
  createdAt: string;
}

const nowIso = () => new Date().toISOString();

// 멱등 적재 (프로젝트 스코프): asset UNIQUE(project_id,kind,name,scope).
export function saveScan(
  projectId: string,
  scanned: ScannedAsset[],
): { assets: number; versions: number } {
  const db = getDb();

  const upsertAsset = db.prepare<{
    id: string;
    projectId: string;
    kind: string;
    name: string;
    scope: string;
    sourcePath: string;
    createdAt: string;
  }>(
    `INSERT INTO asset (id, project_id, kind, name, scope, source_path, created_at)
     VALUES (@id, @projectId, @kind, @name, @scope, @sourcePath, @createdAt)
     ON CONFLICT(project_id, kind, name, scope) DO UPDATE SET source_path = excluded.source_path
     RETURNING id`,
  );

  const insertVersion = db.prepare<{
    id: string;
    assetId: string;
    gitCommit: string;
    gitRef: string | null;
    contentHash: string;
    content: string;
    committedAt: string;
    commitMessage: string | null;
    createdAt: string;
  }>(
    `INSERT INTO asset_version
       (id, asset_id, git_commit, git_ref, content_hash, content, committed_at, commit_message, created_at)
     VALUES
       (@id, @assetId, @gitCommit, @gitRef, @contentHash, @content, @committedAt, @commitMessage, @createdAt)
     ON CONFLICT(asset_id, git_commit) DO NOTHING`,
  );

  const tx = db.transaction((items: ScannedAsset[]) => {
    let assetCount = 0;
    let versionCount = 0;
    for (const a of items) {
      const row = upsertAsset.get({
        id: randomUUID(),
        projectId,
        kind: a.kind,
        name: a.name,
        scope: a.scope,
        sourcePath: a.sourcePath,
        createdAt: nowIso(),
      }) as { id: string };
      assetCount += 1;
      for (const v of a.versions) {
        const res = insertVersion.run({
          id: randomUUID(),
          assetId: row.id,
          gitCommit: v.gitCommit,
          gitRef: v.gitRef,
          contentHash: v.contentHash,
          content: v.content,
          committedAt: v.committedAt,
          commitMessage: v.commitMessage,
          createdAt: nowIso(),
        });
        versionCount += res.changes;
      }
    }
    return { assets: assetCount, versions: versionCount };
  });

  return tx(scanned);
}

export function listAssets(projectId: string): Asset[] {
  return getDb()
    .prepare(
      `SELECT id, project_id AS projectId, kind, name, scope,
              source_path AS sourcePath, created_at AS createdAt
       FROM asset WHERE project_id = ? ORDER BY kind, name`,
    )
    .all(projectId) as Asset[];
}

export function assetExists(id: string): boolean {
  return (
    getDb().prepare("SELECT 1 FROM asset WHERE id = ?").get(id) !== undefined
  );
}

export function getAsset(id: string): Asset | undefined {
  return getDb()
    .prepare(
      `SELECT id, project_id AS projectId, kind, name, scope,
              source_path AS sourcePath, created_at AS createdAt
       FROM asset WHERE id = ?`,
    )
    .get(id) as Asset | undefined;
}

// 수정 prefill 용 — 가장 최근 커밋 버전의 본문.
export function latestContent(assetId: string): string | undefined {
  const row = getDb()
    .prepare(
      `SELECT content FROM asset_version WHERE asset_id = ?
       ORDER BY committed_at DESC LIMIT 1`,
    )
    .get(assetId) as { content: string } | undefined;
  return row?.content;
}

export function assetVersionExists(id: string): boolean {
  return (
    getDb().prepare("SELECT 1 FROM asset_version WHERE id = ?").get(id) !==
    undefined
  );
}

// 실행 격리용: asset_version → asset → project 의 클론경로·커밋.
export function versionExecContext(
  assetVersionId: string,
):
  | { clonePath: string; gitCommit: string; kind: string; name: string }
  | undefined {
  return getDb()
    .prepare(
      `SELECT p.clone_path AS clonePath, av.git_commit AS gitCommit,
              a.kind AS kind, a.name AS name
       FROM asset_version av
       JOIN asset a ON a.id = av.asset_id
       JOIN project p ON p.id = a.project_id
       WHERE av.id = ?`,
    )
    .get(assetVersionId) as
    | { clonePath: string; gitCommit: string; kind: string; name: string }
    | undefined;
}

export function listVersions(assetId: string): AssetVersionSummary[] {
  return getDb()
    .prepare(
      `SELECT id, asset_id AS assetId, git_commit AS gitCommit, git_ref AS gitRef,
              content_hash AS contentHash, committed_at AS committedAt,
              commit_message AS commitMessage, created_at AS createdAt
       FROM asset_version WHERE asset_id = ? ORDER BY committed_at DESC`,
    )
    .all(assetId) as AssetVersionSummary[];
}
