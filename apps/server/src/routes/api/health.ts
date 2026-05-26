import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { healthResponseSchema } from "@opspilot/shared-types";

/** 웹 프록시(/api) 경로용 헬스 — vite·프론트 apiGet 과 동일 prefix. */
const healthApi: FastifyPluginAsyncZod = async (fastify) => {
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

export default healthApi;
