import { buildApp } from "./app.js";
import { cleanupZombieRuns } from "./domains/run/repository.js";

// OPSP-36 (1): 좀비 정리 임계 — 이 시간 넘게 running 인 run 은 비정상 종료로 간주.
const ZOMBIE_THRESHOLD_MIN = 30;

async function main() {
  const app = await buildApp();
  await app.ready();
  // 서버 재시작 시 좀비 run 정리 (컴퓨터 sleep/종료로 자식 프로세스 끊긴 경우).
  try {
    const cleaned = cleanupZombieRuns(ZOMBIE_THRESHOLD_MIN);
    if (cleaned > 0) app.log.warn(`좀비 run ${String(cleaned)}개 정리 (failed 마킹)`);
  } catch (e) {
    app.log.error({ err: e }, "좀비 정리 실패 (스키마 미초기화 가능)");
  }
  await app.listen({ port: app.config.PORT, host: "0.0.0.0" });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
