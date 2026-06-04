import { defineConfig } from "vitest/config";

// 백엔드 슬라이스 테스트 설정. node 환경 + 임시 SQLite 파일로 격리.
// better-sqlite3 는 네이티브 모듈 — vitest 의 기본 worker(threads)에서는 N-API 핸들이
// 깨질 수 있어 pool:'forks'(자식 프로세스)로 실행한다. 각 파일은 별도 fork 라 getDb
// 싱글톤도 파일 간 누수 없이 깨끗하다.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "forks",
    server: {
      deps: {
        // 네이티브 바인딩은 변환 없이 그대로 require 되도록 inline 처리.
        inline: ["better-sqlite3"],
      },
    },
  },
});
