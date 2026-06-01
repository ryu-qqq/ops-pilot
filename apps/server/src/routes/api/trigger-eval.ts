import {
  triggerEvalResultSchema,
  triggerSuggestResponseSchema,
} from "@opspilot/shared-types";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  TriggerEvalError,
  evaluateTrigger,
  suggestTriggerQueries,
} from "../../domains/trigger-eval/service.js";

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
        return await suggestTriggerQueries(req.body.assetId, req.body.n);
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
        const labeled = [
          ...req.body.positives.map((text) => ({ text, shouldTrigger: true })),
          ...req.body.negatives.map((text) => ({ text, shouldTrigger: false })),
        ];
        return await evaluateTrigger(
          req.body.assetId,
          labeled,
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
};

export default triggerEval;
