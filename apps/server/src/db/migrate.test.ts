import { existsSync, rmSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { closeDb, getDb } from "./index.js";
import { migrate } from "./migrate.js";

const TMP = "/tmp/opspilot-migrate-test.sqlite";

afterEach(() => {
  closeDb();
  for (const f of [TMP, `${TMP}-wal`, `${TMP}-shm`]) if (existsSync(f)) rmSync(f);
});

it("allows ingest_trigger='pr_review' after migrate", () => {
  migrate(TMP);
  const db = getDb(TMP);
  // project FK 충족용 최소 row (실제 schema: git_url NOT NULL UNIQUE, clone_path NOT NULL)
  db.prepare(
    "INSERT INTO project (id, name, git_url, clone_path, created_at) VALUES ('p1','t','https://github.com/t/t','/x','2026-01-01')",
  ).run();
  const insert = () =>
    db
      .prepare(
        `INSERT INTO ingest_bundle (id, project_id, git_ref, diff_summary, context_json, status, ingest_trigger, created_at)
         VALUES ('b1','p1','ref','d','{}','done','pr_review','2026-01-01')`,
      )
      .run();
  expect(insert).not.toThrow();
});
