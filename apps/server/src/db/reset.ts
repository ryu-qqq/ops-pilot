import { closeDb, getDb } from "./index.js";
import { migrate } from "./migrate.js";

// 개발용: 모든 테이블 DROP 후 재생성. 현 데이터는 재스캔으로 복구 가능한 것뿐.
export function reset(dbPath?: string): void {
  const db = getDb(dbPath);
  db.pragma("foreign_keys = OFF");
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  const tx = db.transaction(() => {
    for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  });
  tx();
  db.pragma("foreign_keys = ON");
  migrate(dbPath);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  reset();
  console.log("DB reset 완료 (전체 DROP → 재생성).");
  closeDb();
}
