import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ClaudeAssistError } from "../../domains/assist/claude.js";
import { judgeResultSchema, judgeRuns } from "../../domains/assist/judge-runs.js";
import {
  scenarioSuggestionSchema,
  suggestScenarioWithMeta,
} from "../../domains/assist/scenario-suggest.js";

// OPSP-27: 로컬 Claude 어시스트 라우트.
// (A) 자산 저작 초안 검수, (B) 자산 본문 기반 시나리오 폼 초안 제안.
// 둘 다 실 토큰 — 사용자 명시적 버튼 클릭 시에만 호출.

const errorSchema = z.object({ error: z.string(), detail: z.string() });

const assist: FastifyPluginAsyncZod = async (fastify) => {
  // C. 비교 판정 (OPSP-10 follow-up): N개 run 결과 → "어느 게 나음+왜" JSON.
  fastify.post(
    "/assist/judge-runs",
    {
      schema: {
        body: z.object({ runIds: z.array(z.string().uuid()).min(2).max(5) }),
        response: { 200: judgeResultSchema, 400: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return await judgeRuns(req.body.runIds);
      } catch (e) {
        if (e instanceof ClaudeAssistError) {
          return reply.status(400).send({ error: "AssistError", detail: e.message });
        }
        throw e;
      }
    },
  );

  // B. 시나리오 초안: 자산 본문 + 사용자 힌트 → 폼 5필드 JSON.
  fastify.post(
    "/assist/scenario-suggest",
    {
      schema: {
        body: z.object({
          assetId: z.string().uuid(),
          hint: z.string().optional(),
          // ADR 0002 5C: 정규화된 티켓 자유텍스트 슬롯(선택). 실 MCP(Jira/Notion) 조회 배선은 범위 밖.
          ticketText: z.string().optional(),
        }),
        response: { 200: scenarioSuggestionSchema, 400: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        const { suggestion, meta } = await suggestScenarioWithMeta(req.body);
        // 권고 3·6: 도메인은 로깅하지 않고 meta 만 반환 — route 에서 pino 로 구조화 로깅.
        // baked fallback 은 자산 미발견/실행 실패 신호이므로 진단을 위해 warn 으로 남긴다.
        if (meta.source === "baked") {
          fastify.log.warn(
            { assetId: req.body.assetId, fallbackReason: meta.fallbackReason },
            "scenario-suggest baked fallback",
          );
        }
        // 응답 계약(2C) 불변: meta 는 싣지 않고 suggestion 만 반환.
        return suggestion;
      } catch (e) {
        if (e instanceof ClaudeAssistError) {
          return reply.status(400).send({ error: "AssistError", detail: e.message });
        }
        throw e;
      }
    },
  );
};

export default assist;
