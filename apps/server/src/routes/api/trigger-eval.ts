import {
  improveResultSchema,
  triggerEvalResultSchema,
  triggerSuggestResponseSchema,
} from "@opspilot/shared-types";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  TriggerEvalError,
  evaluateTrigger,
  improveDescriptionLoopWithMeta,
  suggestTriggerQueriesWithMeta,
} from "../../domains/trigger-eval/service.js";

function labeled(positives: string[], negatives: string[]) {
  return [
    ...positives.map((text) => ({ text, shouldTrigger: true })),
    ...negatives.map((text) => ({ text, shouldTrigger: false })),
  ];
}

const errorSchema = z.object({ error: z.string(), detail: z.string() });

// 트리거 정확도 평가 — description 이 켜져야 할 때 켜지나 (T4, skill-creator 차용).
// 두 엔드포인트 모두 로컬 claude 를 spawn → 실 토큰 소모. UI 확인 후 호출.
const triggerEval: FastifyPluginAsyncZod = async (fastify) => {
  // 자산 description 기반 should-trigger 쿼리 자동 생성.
  fastify.post(
    "/trigger-eval/suggest",
    {
      schema: {
        body: z.object({
          assetId: z.string().uuid(),
          n: z.number().int().min(1).max(12).default(5),
        }),
        response: {
          200: triggerSuggestResponseSchema,
          400: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        // ADR 0002 1B·4B: 자산(harness-trigger-designer) 본문 주입 우선, 실패 시 baked fallback.
        const { queries, meta } = await suggestTriggerQueriesWithMeta(
          req.body.assetId,
          req.body.n,
        );
        // 도메인은 로깅하지 않고 meta 만 반환 — route 에서 pino 구조화 로깅(scenario 패턴).
        if (meta.source === "baked") {
          fastify.log.warn(
            { assetId: req.body.assetId, fallbackReason: meta.fallbackReason },
            "trigger-eval suggest baked fallback",
          );
        } else if (meta.formatDrift) {
          // ①b: 자산 경로인데 baked 호환 객체 형식으로 파싱됨 — 동작은 맞지만 자산이
          // 문서화된 `[{query, should_trigger}]` 형식과 드리프트. silent 통과 방지로 관측.
          fastify.log.warn(
            { assetId: req.body.assetId },
            "trigger-eval suggest asset format drift (object fallback, expected [{query, should_trigger}] array)",
          );
        }
        // 응답 계약(2C) 불변: meta 는 싣지 않고 queries 만 반환.
        return queries;
      } catch (e) {
        if (e instanceof TriggerEvalError) {
          return reply
            .status(400)
            .send({ error: "TriggerEvalError", detail: e.message });
        }
        throw e;
      }
    },
  );

  // 쿼리 셋으로 트리거율 측정 (각 쿼리 runsPerQuery 회 probe).
  fastify.post(
    "/trigger-eval/run",
    {
      schema: {
        body: z.object({
          assetId: z.string().uuid(),
          positives: z.array(z.string().min(1)).min(1).max(20),
          negatives: z.array(z.string().min(1)).max(20).default([]),
          runsPerQuery: z.number().int().min(1).max(5).default(3),
        }),
        response: {
          200: triggerEvalResultSchema,
          400: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        return await evaluateTrigger(
          req.body.assetId,
          labeled(req.body.positives, req.body.negatives),
          req.body.runsPerQuery,
        );
      } catch (e) {
        if (e instanceof TriggerEvalError) {
          return reply
            .status(400)
            .send({ error: "TriggerEvalError", detail: e.message });
        }
        throw e;
      }
    },
  );

  // description 자동개선 루프 — 실패 케이스로 description 후보 생성·재측정, best 제안.
  // 비싸다(반복 × 쿼리 × runsPerQuery 회 claude). 자산은 수정 안 하고 제안만 반환.
  fastify.post(
    "/trigger-eval/improve",
    {
      schema: {
        body: z.object({
          assetId: z.string().uuid(),
          positives: z.array(z.string().min(1)).min(1).max(20),
          negatives: z.array(z.string().min(1)).max(20).default([]),
          runsPerQuery: z.number().int().min(1).max(3).default(2),
          maxIterations: z.number().int().min(1).max(5).default(3),
        }),
        response: {
          200: improveResultSchema,
          400: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        // ADR 0002 1B·4B: 개선 루프 스텝별 자산/baked 경로를 집계해 관측(①a).
        const { result, sourceCounts } = await improveDescriptionLoopWithMeta(
          req.body.assetId,
          labeled(req.body.positives, req.body.negatives),
          {
            runsPerQuery: req.body.runsPerQuery,
            maxIterations: req.body.maxIterations,
          },
        );
        // 도메인은 로깅 안 함 — route 가 meta(sourceCounts) 로 구조화 로깅(/suggest 대칭).
        // baked 가 1회 이상이면 졸업조건(무fallback 안정 산출) 미충족 신호 → warn.
        const logBindings = { assetId: req.body.assetId, sourceCounts };
        if (sourceCounts.baked > 0) {
          fastify.log.warn(
            logBindings,
            "trigger-eval improve loop used baked fallback in some steps",
          );
        } else if (sourceCounts.asset > 0) {
          fastify.log.info(
            logBindings,
            "trigger-eval improve loop fully on asset path",
          );
        }
        // 응답 계약 불변(ImproveResult): sourceCounts 는 싣지 않고 result 만 반환.
        return result;
      } catch (e) {
        if (e instanceof TriggerEvalError) {
          return reply
            .status(400)
            .send({ error: "TriggerEvalError", detail: e.message });
        }
        throw e;
      }
    },
  );
};

export default triggerEval;
