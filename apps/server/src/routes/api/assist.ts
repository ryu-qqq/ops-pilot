import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { assetKindSchema } from "@opspilot/shared-types";
import { ClaudeAssistError } from "../../domains/assist/claude.js";
import { reviewAuthoringDraft } from "../../domains/assist/authoring-review.js";
import {
  scenarioSuggestionSchema,
  suggestScenario,
} from "../../domains/assist/scenario-suggest.js";

// OPSP-27: 로컬 Claude 어시스트 라우트.
// (A) 자산 저작 초안 검수, (B) 자산 본문 기반 시나리오 폼 초안 제안.
// 둘 다 실 토큰 — 사용자 명시적 버튼 클릭 시에만 호출.

const errorSchema = z.object({ error: z.string(), detail: z.string() });

const assist: FastifyPluginAsyncZod = async (fastify) => {
  // A. 자산 저작 검수: 작성 중인 초안 → 의도 + 개선 제안(자유 텍스트).
  fastify.post(
    "/assist/authoring-review",
    {
      schema: {
        body: z.object({
          kind: assetKindSchema,
          name: z.string().min(1),
          content: z.string().min(1),
        }),
        response: { 200: z.object({ text: z.string() }), 400: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        const text = await reviewAuthoringDraft(req.body);
        return { text };
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
        }),
        response: { 200: scenarioSuggestionSchema, 400: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return await suggestScenario(req.body);
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
