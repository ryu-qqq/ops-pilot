import { readFileSync } from "node:fs";
import { join } from "node:path";
import { closeDb, getDb } from "./index.js";

// schema.sql 을 그대로 적용한다. 모든 DDL은 IF NOT EXISTS 라 멱등.
export function migrate(dbPath?: string): void {
  const db = getDb(dbPath);
  const sql = readFileSync(join(import.meta.dirname, "schema.sql"), "utf8");
  db.exec(sql);
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
