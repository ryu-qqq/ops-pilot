import Database from "better-sqlite3";

// 단일 SQLite 핸들. 로컬 1인용이라 동기 API(better-sqlite3)가 적합 (CONVENTIONS.md 스택).
let db: Database.Database | undefined;

export function getDb(path = process.env.OPS_DB_PATH ?? "opspilot.sqlite"): Database.Database {
  if (db) return db;
  db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  return db;
}

export function closeDb(): void {
  db?.close();
  db = undefined;
}
