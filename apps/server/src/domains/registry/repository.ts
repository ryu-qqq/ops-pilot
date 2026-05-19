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

// 멱등 적재: asset UNIQUE(kind,name,scope), asset_version UNIQUE(asset_id,git_commit).
export function saveScan(scanned: ScannedAsset[]): { assets: number; versions: number } {
  const db = getDb();

  const upsertAsset = db.prepare<{
    id: string;
    kind: string;
    name: string;
    scope: string;
    sourcePath: string;
    createdAt: string;
  }>(
    `INSERT INTO asset (id, kind, name, scope, source_path, created_at)
     VALUES (@id, @kind, @name, @scope, @sourcePath, @createdAt)
     ON CONFLICT(kind, name, scope) DO UPDATE SET source_path = excluded.source_path
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

export function listAssets(): Asset[] {
  return getDb()
    .prepare(
      `SELECT id, kind, name, scope, source_path AS sourcePath, created_at AS createdAt
       FROM asset ORDER BY kind, name`,
    )
    .all() as Asset[];
}

export function assetExists(id: string): boolean {
  return getDb().prepare("SELECT 1 FROM asset WHERE id = ?").get(id) !== undefined;
}

export function assetVersionExists(id: string): boolean {
  return getDb().prepare("SELECT 1 FROM asset_version WHERE id = ?").get(id) !== undefined;
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
