import fp from "fastify-plugin";
import { autoIngestIntervalMs, runAutoIngestScan } from "../domains/feedback/auto-ingest.js";

// ADR 0004 (2A): 자동 ingest 플라이휠 트리거 = 주기 전수 스캔(work-metric-scan 패턴 복제).
// 새 스케줄러 신설 없이 setImmediate 부팅 1회 + setInterval/unref.
//
// ⚠️ off-by-default: 자동 ingest 는 LLM 토큰(eval+review run)을 쓰므로 기본 OFF.
//    OPS_AUTO_INGEST==='1' 일 때만 활성. 안 켜면 부팅 스캔·interval 둘 다 no-op.

export default fp(
  (fastify, _opts, done) => {
    // off-by-default 게이트 — 켜지 않으면 아무것도 등록하지 않는다.
    if (process.env.OPS_AUTO_INGEST !== "1") {
      done();
      return;
    }

    fastify.addHook("onReady", async () => {
      // 부팅 1회 — 마지막 스캔 이후 누적된 미ingest 커밋 반영. ingestFeedback 은
      // 동기(eval queue 만 비동기)라 다음 틱으로 미뤄 readiness 를 막지 않는다.
      setImmediate(() => {
        try {
          const r = runAutoIngestScan();
          fastify.log.info(
            `auto-ingest 부팅 스캔: 프로젝트 ${String(r.scannedProjects)} · 후보 ${String(r.candidates)} → triggered ${String(r.triggered)} / skipped ${String(r.skipped)}`,
          );
        } catch (e) {
          fastify.log.error({ err: e }, "auto-ingest 부팅 스캔 실패");
        }
      });
    });

    const ms = autoIngestIntervalMs();
    if (ms > 0) {
      const timer = setInterval(() => {
        try {
          const r = runAutoIngestScan();
          fastify.log.info(
            `auto-ingest 주기 스캔: triggered ${String(r.triggered)} / skipped ${String(r.skipped)}`,
          );
        } catch (e) {
          fastify.log.error({ err: e }, "auto-ingest 주기 스캔 실패");
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
  { name: "auto-ingest-scan" },
);
