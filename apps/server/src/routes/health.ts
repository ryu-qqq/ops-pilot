import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { healthResponseSchema } from "@opspilot/shared-types";

// CONVENTIONS.md 3: 응답에도 스키마를 붙인다(필드 노출 차단 + 직렬화 성능).
const health: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/health",
    { schema: { response: { 200: healthResponseSchema } } },
    async () => ({
      status: "ok" as const,
      service: "opspilot-server",
      timestamp: new Date().toISOString(),
    }),
  );
};

export default health;
