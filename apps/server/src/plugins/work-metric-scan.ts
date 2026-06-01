import fp from "fastify-plugin";
import { runWorkMetricScan } from "../domains/usage/work-metric-service.js";

// ADR-0001 결정 3: 자동 트리거 = 주기 전수 스캔(멱등). 데몬·훅 의존 없이 누락 복원력.
// MVP: 부팅 시 1회 + 완만한 interval. 즉시성은 포기(주기 스캔). 수동 트리거는 라우트.
// 과설계 금지 — 별도 잡 스케줄러 없이 setInterval 하나.

// 완만한 주기(기본 30분). 1인 로컬이라 전수 스캔 비용 낮음. 0 이면 interval 비활성.
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

function intervalMs(): number {
  const raw = process.env.OPS_WORK_METRIC_SCAN_INTERVAL_MS;
  if (raw === undefined) return DEFAULT_INTERVAL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_INTERVAL_MS;
}

export default fp(
  (fastify, _opts, done) => {
    fastify.addHook("onReady", async () => {
      // 부팅 시 1회 — 마지막 스캔 이후 누적분 반영.
      // scanWorkMetrics 는 readFileSync 기반 완전 동기라, 전수 순회가 수백 세션/수백 MB면
      // 이벤트 루프를 블록해 서버 readiness(헬스체크·/api/runs)를 지연시킨다.
      // CLAUDE.md "비동기 실행" 정신대로 onReady 는 즉시 반환하고, 실제 스캔은 다음 틱에.
      setImmediate(() => {
        try {
          const r = runWorkMetricScan();
          fastify.log.info(
            `work-metric 부팅 스캔: 세션 ${String(r.scannedSessions)}개 → ${String(r.upsertedMetrics)} row upsert`,
          );
        } catch (e) {
          fastify.log.error({ err: e }, "work-metric 부팅 스캔 실패(스키마 미초기화 가능)");
        }
      });
    });

    const ms = intervalMs();
    if (ms > 0) {
      const timer = setInterval(() => {
        try {
          runWorkMetricScan();
        } catch (e) {
          fastify.log.error({ err: e }, "work-metric 주기 스캔 실패");
        }
      }, ms);
      // 타이머가 프로세스 종료를 막지 않도록.
      timer.unref();
      fastify.addHook("onClose", async () => {
        clearInterval(timer);
      });
    }

    done();
  },
  { name: "work-metric-scan" },
);
