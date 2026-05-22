import { readFileSync } from "node:fs";
import { join } from "node:path";
import { closeDb, getDb } from "./index.js";

// schema.sql 을 그대로 적용한다. 모든 DDL은 IF NOT EXISTS 라 멱등.
export function migrate(dbPath?: string): void {
  const db = getDb(dbPath);
  const sql = readFileSync(join(import.meta.dirname, "schema.sql"), "utf8");
  db.exec(sql);
  reconcileScoreCheck(db);
  reconcileRunRetro(db);
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
