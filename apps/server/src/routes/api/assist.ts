import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  designSourceSchema,
  scenarioAbPairResponseSchema,
  scenarioAbRunResponseSchema,
} from "@opspilot/shared-types";
import { ClaudeAssistError } from "../../domains/assist/claude.js";
import { judgeResultSchema, judgeRuns } from "../../domains/assist/judge-runs.js";
import {
  createScenarioAbPair,
  createScenarioAbPairAndRun,
} from "../../domains/assist/scenario-ab-service.js";
import { RunInputError } from "../../domains/run/service.js";
import {
  scenarioSuggestionSchema,
  suggestScenarioWithMeta,
} from "../../domains/assist/scenario-suggest.js";

// ADR 0003 (D1): suggest 응답에 설계 경로(source)를 additive·optional 로 노출한다.
// ADR 0002 의 "meta 미노출(2C)" 은 source DB 영속화의 선행 조건과 충돌하므로, source 만
// 한정 노출해 클라이언트가 scenario 저장 시 함께 넘길 수 있게 한다(fallbackReason 은 진단용).
const scenarioSuggestionWithSourceSchema = scenarioSuggestionSchema.extend({
  source: designSourceSchema,
  fallbackReason: z.string().optional(),
});

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
        response: { 200: scenarioSuggestionWithSourceSchema, 400: errorSchema },
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
        // ADR 0003 (D1): suggestion + source(설계 경로)를 함께 반환 → 클라이언트가 scenario
        // 저장 시 source 를 넘겨 영속화한다. source 별 다운스트림 A/B 집계의 기점.
        return { ...suggestion, source: meta.source, fallbackReason: meta.fallbackReason };
      } catch (e) {
        if (e instanceof ClaudeAssistError) {
          return reply.status(400).send({ error: "AssistError", detail: e.message });
        }
        throw e;
      }
    },
  );

  // ADR 0003 Follow-up #2 (A/B 품질 측정 — 최소 슬라이스): 같은 입력을 asset·baked 양쪽으로
  // *강제* 산출해 두 source-tagged 시나리오로 저장한다. 자동 실행·채점은 범위 밖 — 사용자가
  // 기존 실행 UI 로 둘 다 run → run.source 상속 → aggregateBenchmark.bySource 로 비교한다.
  // asset 경로 불가(scenario-designer 미sync)면 400 — A/B 불성립을 조용히 단일화하지 않고 명시.
  fastify.post(
    "/assist/scenario-ab",
    {
      schema: {
        body: z.object({
          assetId: z.string().uuid(),
          hint: z.string().optional(),
          ticketText: z.string().optional(),
        }),
        response: { 200: scenarioAbPairResponseSchema, 400: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return await createScenarioAbPair(req.body);
      } catch (e) {
        if (e instanceof ClaudeAssistError) {
          return reply.status(400).send({ error: "AssistError", detail: e.message });
        }
        throw e;
      }
    },
  );

  // ADR 0003 Follow-up #2 (A/B 자동 오케스트레이션): 위 scenario-ab 는 생성만 하고 실행은 수동이었다.
  // 이 라우트는 두 source-tagged 시나리오를 생성한 뒤 둘 다 즉시 실행(비동기 startRun)한다.
  // run 은 status=running 으로 반환되고 자동 채점·bySource 집계는 기존 다운스트림이 재사용된다.
  // asset 경로 불가(미sync)면 400(ClaudeAssistError), assetVersionId 등 실행 입력 오류도 400(RunInputError).
  fastify.post(
    "/assist/scenario-ab-run",
    {
      schema: {
        body: z.object({
          assetId: z.string().uuid(),
          assetVersionId: z.string().uuid(),
          hint: z.string().optional(),
          ticketText: z.string().optional(),
          source: z.enum(["fixture", "local-claude"]).default("fixture"),
        }),
        response: { 200: scenarioAbRunResponseSchema, 400: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return await createScenarioAbPairAndRun(req.body);
      } catch (e) {
        if (e instanceof ClaudeAssistError) {
          return reply.status(400).send({ error: "AssistError", detail: e.message });
        }
        if (e instanceof RunInputError) {
          return reply.status(400).send({ error: "BadRequest", detail: e.message });
        }
        throw e;
      }
    },
  );
};

export default assist;
