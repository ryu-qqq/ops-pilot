import { existsSync, rmSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";
import { closeDb, getDb } from "../../db/index.js";
import { migrate } from "../../db/migrate.js";
import { ingestReviewProposal } from "./service.js";
import { listProposalsByIngestId } from "./repository.js";

const TMP = "/tmp/opspilot-review-proposal.sqlite";

beforeEach(() => {
  closeDb();
  migrate(TMP);
  const db = getDb(TMP);
  db.prepare(
    "INSERT INTO project (id, name, git_url, clone_path, workspace_mode, created_at) VALUES ('p1','t','git://p1-test','/x','linked','2026-01-01')",
  ).run();
});
afterEach(() => {
  closeDb();
  for (const f of [TMP, `${TMP}-wal`, `${TMP}-shm`]) if (existsSync(f)) rmSync(f);
});

it("creates a pr_review bundle (status done) + draft proposal", () => {
  const { ingestId, proposalId } = ingestReviewProposal({
    projectId: "p1",
    targetKind: "skill",
    targetPath: "skills/foo/SKILL.md",
    rationale: "반복된 지적",
    content: "수정 초안",
    review: { prNumber: 12, repo: "o/r", commentUrl: "https://x", reviewer: "rv", mistakeType: "naming" },
    scenarioId: null,
  });
  const db = getDb(TMP);
  const bundle = db.prepare("SELECT status, ingest_trigger FROM ingest_bundle WHERE id = ?").get(ingestId) as {
    status: string; ingest_trigger: string;
  };
  expect(bundle.ingest_trigger).toBe("pr_review");
  expect(bundle.status).toBe("done");
  const drafts = listProposalsByIngestId(ingestId).filter((p) => p.status === "draft");
  expect(drafts).toHaveLength(1);
  expect(drafts[0]?.id).toBe(proposalId);
});

it("throws NotFound for an unknown project", () => {
  expect(() =>
    ingestReviewProposal({
      projectId: "99999999-9999-9999-9999-999999999999",
      targetKind: "skill",
      targetPath: "skills/foo/SKILL.md",
      rationale: "x",
      content: "y",
      review: { prNumber: 1, repo: "o/r", commentUrl: "https://x", reviewer: "rv", mistakeType: "naming" },
      scenarioId: null,
    }),
  ).toThrow(/not found/i);
});
