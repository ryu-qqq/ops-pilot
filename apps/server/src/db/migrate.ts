import { readFileSync } from "node:fs";
import { join } from "node:path";
import { closeDb, getDb } from "./index.js";

// schema.sql 을 그대로 적용한다. 모든 DDL은 IF NOT EXISTS 라 멱등.
export function migrate(dbPath?: string): void {
  const db = getDb(dbPath);
  const sql = readFileSync(join(import.meta.dirname, "schema.sql"), "utf8");
  db.exec(sql);
  reconcileScoreCheck(db);
  reconcileMachineScorer(db);
  reconcileRunRetro(db);
  reconcileAssetKind(db);
  reconcileAssetSource(db);
  reconcileImprovementProposalTargetKind(db);
  reconcileIngestBundleStatus(db);
  reconcileIngestTrigger(db);
  reconcileIngestTriggerPrReview(db);
  reconcileProjectWorkspaceMode(db);
  reconcileScenarioSource(db);
  reconcileRunSource(db);
}

// ADR 0004 (3D): ingest_bundle.ingest_trigger 컬럼 추가(auto|manual). 기존 row 는
// DEFAULT 'manual' 로 채워진다(legacy ingest 는 전부 수동 진입). 멱등(있으면 skip).
// reconcileIngestBundleStatus(테이블 재구성) 뒤에 호출돼야 한다 — 재구성 copy 목록엔
// ingest_trigger 가 없으므로(구 DB 면 status 재구성 후 여기서 ALTER 로 더한다).
function reconcileIngestTrigger(db: ReturnType<typeof getDb>): void {
  const cols = db
    .prepare("SELECT name FROM pragma_table_info('ingest_bundle')")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "ingest_trigger")) {
    db.exec(
      `ALTER TABLE ingest_bundle ADD COLUMN ingest_trigger TEXT NOT NULL DEFAULT 'manual'
         CHECK (ingest_trigger IN ('auto', 'manual'))`,
    );
  }
}

// ingest_trigger CHECK 에 'pr_review' 추가(리뷰 출처). 기존 DB 는 CHECK 변경 불가라 재구성.
// 멱등: sql 에 'pr_review' 가 이미 있으면 skip. reconcileIngestTrigger(컬럼 보장) 뒤에 호출.
function reconcileIngestTriggerPrReview(db: ReturnType<typeof getDb>): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ingest_bundle'")
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'pr_review'")) return;

  db.exec("PRAGMA foreign_keys=OFF;");
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE ingest_bundle__new (
        id              TEXT PRIMARY KEY,
        project_id      TEXT NOT NULL REFERENCES project (id) ON DELETE CASCADE,
        notion_task_url TEXT,
        git_ref         TEXT NOT NULL,
        diff_summary    TEXT NOT NULL,
        context_json    TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'evaluating', 'done', 'reviewing', 'reviewed', 'failed')),
        ingest_trigger  TEXT NOT NULL DEFAULT 'manual'
                        CHECK (ingest_trigger IN ('auto', 'manual', 'pr_review')),
        created_at      TEXT NOT NULL
      );
      INSERT INTO ingest_bundle__new
        SELECT id, project_id, notion_task_url, git_ref, diff_summary, context_json, status, ingest_trigger, created_at
        FROM ingest_bundle;
      DROP TABLE ingest_bundle;
      ALTER TABLE ingest_bundle__new RENAME TO ingest_bundle;
      CREATE INDEX IF NOT EXISTS idx_ingest_bundle_project ON ingest_bundle (project_id);
      CREATE INDEX IF NOT EXISTS idx_ingest_bundle_status ON ingest_bundle (status);
    `);
  });
  tx();
  db.exec("PRAGMA foreign_keys=ON;");
}

// ADR 0003 (D1): scenario.source · run.source 컬럼 추가(평가 설계 산출 경로 asset|baked).
// 기존 row 는 NULL(legacy — 설계 경로 미상). 멱등(있으면 skip). CHECK 는 NULL 허용.
function reconcileScenarioSource(db: ReturnType<typeof getDb>): void {
  const cols = db.prepare("SELECT name FROM pragma_table_info('scenario')").all() as { name: string }[];
  if (!cols.some((c) => c.name === "source")) {
    db.exec(
      `ALTER TABLE scenario ADD COLUMN source TEXT
         CHECK (source IS NULL OR source IN ('asset', 'baked'))`,
    );
  }
}

function reconcileRunSource(db: ReturnType<typeof getDb>): void {
  const cols = db.prepare("SELECT name FROM pragma_table_info('run')").all() as { name: string }[];
  if (!cols.some((c) => c.name === "source")) {
    db.exec(
      `ALTER TABLE run ADD COLUMN source TEXT
         CHECK (source IS NULL OR source IN ('asset', 'baked'))`,
    );
  }
}

// 카드 B: asset.source 컬럼 추가. 기존 row 는 DEFAULT 'unknown' 로 채워진다(legacy —
// 다음 re-sync 가 manifest 를 쓰면 재스캔 시 crew/project-local 로 갱신). 멱등(있으면 skip).
// reconcileAssetKind(테이블 재구성) 뒤에 호출돼야 한다 — 재구성 copy 목록엔 source 가 없으므로.
function reconcileAssetSource(db: ReturnType<typeof getDb>): void {
  const cols = db.prepare("SELECT name FROM pragma_table_info('asset')").all() as { name: string }[];
  if (!cols.some((c) => c.name === "source")) {
    db.exec(
      `ALTER TABLE asset ADD COLUMN source TEXT NOT NULL DEFAULT 'unknown'
         CHECK (source IN ('crew', 'project-local', 'unknown'))`,
    );
  }
}

// REG-01: project.workspace_mode · remote_verified. 기존 row → managed / 0.
function reconcileProjectWorkspaceMode(db: ReturnType<typeof getDb>): void {
  const cols = db.prepare("SELECT name FROM pragma_table_info('project')").all() as { name: string }[];
  if (!cols.some((c) => c.name === "workspace_mode")) {
    db.exec(`
      ALTER TABLE project ADD COLUMN workspace_mode TEXT NOT NULL DEFAULT 'managed'
        CHECK (workspace_mode IN ('linked', 'managed'));
    `);
  }
  if (!cols.some((c) => c.name === "remote_verified")) {
    db.exec(`
      ALTER TABLE project ADD COLUMN remote_verified INTEGER NOT NULL DEFAULT 0
        CHECK (remote_verified IN (0, 1));
    `);
  }
  db.prepare(
    `UPDATE project SET workspace_mode = 'managed' WHERE workspace_mode IS NULL OR workspace_mode = ''`,
  ).run();
  db.prepare(`UPDATE project SET remote_verified = 0 WHERE remote_verified IS NULL`).run();
}

// OPSP-46: 기존 DB 에 run.retro 컬럼 추가. CREATE TABLE IF NOT EXISTS 는
// 기존 테이블에 컬럼을 더하지 않으므로 ALTER 가 필요. 멱등(있으면 skip).
function reconcileRunRetro(db: ReturnType<typeof getDb>): void {
  const cols = db.prepare("SELECT name FROM pragma_table_info('run')").all() as { name: string }[];
  if (!cols.some((c) => c.name === "retro")) {
    db.exec("ALTER TABLE run ADD COLUMN retro TEXT");
  }
}

// OPSP-17: score.scorer CHECK 에 'human' 추가. 기존 DB는 CREATE IF NOT EXISTS 로
// 갱신 안 되므로, 구 CHECK(human 없음)면 테이블 재구성(행 보존). 멱등.
function reconcileScoreCheck(db: ReturnType<typeof getDb>): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='score'")
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'human'")) return;

  db.exec("PRAGMA foreign_keys=OFF;");
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE score__new (
        id         TEXT PRIMARY KEY,
        run_id     TEXT NOT NULL REFERENCES run (id) ON DELETE CASCADE,
        scorer     TEXT NOT NULL CHECK (scorer IN ('schema','assertion','llm_judge','human')),
        passed     INTEGER NOT NULL CHECK (passed IN (0,1)),
        score      REAL CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
        detail     TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO score__new SELECT id, run_id, scorer, passed, score, detail, created_at FROM score;
      DROP TABLE score;
      ALTER TABLE score__new RENAME TO score;
      CREATE INDEX IF NOT EXISTS idx_score_run ON score (run_id);
    `);
  });
  tx();
  db.exec("PRAGMA foreign_keys=ON;");
}

// 머신 스코어러: score.scorer CHECK 에 'machine' 추가. 'human' 재구성 뒤에 돌며,
// CHECK 에 'machine' 이 이미 있으면 skip(멱등). 행 보존 재구성.
function reconcileMachineScorer(db: ReturnType<typeof getDb>): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='score'")
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'machine'")) return;

  db.exec("PRAGMA foreign_keys=OFF;");
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE score__new (
        id         TEXT PRIMARY KEY,
        run_id     TEXT NOT NULL REFERENCES run (id) ON DELETE CASCADE,
        scorer     TEXT NOT NULL CHECK (scorer IN ('schema','assertion','llm_judge','human','machine')),
        passed     INTEGER NOT NULL CHECK (passed IN (0,1)),
        score      REAL CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
        detail     TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO score__new SELECT id, run_id, scorer, passed, score, detail, created_at FROM score;
      DROP TABLE score;
      ALTER TABLE score__new RENAME TO score;
      CREATE INDEX IF NOT EXISTS idx_score_run ON score (run_id);
    `);
  });
  tx();
  db.exec("PRAGMA foreign_keys=ON;");
}

// BRIDGE-04: asset.kind CHECK 에 cursor_* 추가.
function reconcileAssetKind(db: ReturnType<typeof getDb>): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='asset'")
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'cursor_skill'")) return;

  db.exec("PRAGMA foreign_keys=OFF;");
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE asset__new (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES project (id) ON DELETE CASCADE,
        kind        TEXT NOT NULL CHECK (kind IN ('agent', 'skill', 'command', 'cursor_skill', 'cursor_command', 'cursor_rule')),
        name        TEXT NOT NULL,
        scope       TEXT NOT NULL CHECK (scope IN ('project', 'user', 'plugin')),
        source_path TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        UNIQUE (project_id, kind, name, scope)
      );
      INSERT INTO asset__new
        SELECT id, project_id, kind, name, scope, source_path, created_at FROM asset;
      DROP TABLE asset;
      ALTER TABLE asset__new RENAME TO asset;
      CREATE INDEX IF NOT EXISTS idx_asset_project ON asset (project_id);
    `);
  });
  tx();
  db.exec("PRAGMA foreign_keys=ON;");
}

// TASK-5 / BRIDGE-05: improvement_proposal.target_kind CHECK 확장.
function reconcileImprovementProposalTargetKind(db: ReturnType<typeof getDb>): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='improvement_proposal'")
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'cursor_skill'")) return;

  db.exec("PRAGMA foreign_keys=OFF;");
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE improvement_proposal__new (
        id             TEXT PRIMARY KEY,
        ingest_id      TEXT NOT NULL REFERENCES ingest_bundle (id) ON DELETE CASCADE,
        run_id         TEXT REFERENCES run (id) ON DELETE SET NULL,
        target_kind    TEXT NOT NULL CHECK (target_kind IN ('cursor_rule', 'cursor_skill', 'agent', 'skill', 'command', 'workflow_patch')),
        target_path    TEXT NOT NULL,
        rationale      TEXT NOT NULL,
        content        TEXT NOT NULL,
        status         TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'approved', 'applied', 'rejected')),
        applied_commit TEXT,
        created_at     TEXT NOT NULL
      );
      INSERT INTO improvement_proposal__new
        SELECT id, ingest_id, run_id, target_kind, target_path, rationale, content, status, applied_commit, created_at
        FROM improvement_proposal;
      DROP TABLE improvement_proposal;
      ALTER TABLE improvement_proposal__new RENAME TO improvement_proposal;
      CREATE INDEX IF NOT EXISTS idx_improvement_proposal_ingest ON improvement_proposal (ingest_id);
      CREATE INDEX IF NOT EXISTS idx_improvement_proposal_status ON improvement_proposal (status);
    `);
  });
  tx();
  db.exec("PRAGMA foreign_keys=ON;");
}

// TASK-5 review phase: ingest_bundle.status CHECK 에 reviewing, reviewed 추가.
function reconcileIngestBundleStatus(db: ReturnType<typeof getDb>): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ingest_bundle'")
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'reviewing'")) return;

  db.exec("PRAGMA foreign_keys=OFF;");
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE ingest_bundle__new (
        id              TEXT PRIMARY KEY,
        project_id      TEXT NOT NULL REFERENCES project (id) ON DELETE CASCADE,
        notion_task_url TEXT,
        git_ref         TEXT NOT NULL,
        diff_summary    TEXT NOT NULL,
        context_json    TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'evaluating', 'done', 'reviewing', 'reviewed', 'failed')),
        created_at      TEXT NOT NULL
      );
      INSERT INTO ingest_bundle__new
        SELECT id, project_id, notion_task_url, git_ref, diff_summary, context_json, status, created_at
        FROM ingest_bundle;
      DROP TABLE ingest_bundle;
      ALTER TABLE ingest_bundle__new RENAME TO ingest_bundle;
      CREATE INDEX IF NOT EXISTS idx_ingest_bundle_project ON ingest_bundle (project_id);
      CREATE INDEX IF NOT EXISTS idx_ingest_bundle_status ON ingest_bundle (status);
    `);
  });
  tx();
  db.exec("PRAGMA foreign_keys=ON;");
}

// 직접 실행 시(`pnpm db:migrate`) 마이그레이션 후 테이블 목록 출력.
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  const tables = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];
  console.log(
    "마이그레이션 완료. 테이블:",
    tables.map((t) => t.name).join(", "),
  );
  closeDb();
}
