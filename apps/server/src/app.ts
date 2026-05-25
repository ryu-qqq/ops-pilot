import { join } from "node:path";
import Fastify, { type FastifyError } from "fastify";
import autoload from "@fastify/autoload";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

// Composition: 플러그인/라우트는 @fastify/autoload 로 자동 등록 (CONVENTIONS.md 3).
// OPSP-18: 기본 logger level 을 warn 으로 — 매 요청 info 한 줄(JSON) 도배 방지.
// 터미널-친화 채널은 mcp/log.ts(컬러 한 줄, mcpLog) 가 별도로 담당. 디버그 시 OPS_LOG_LEVEL=info.
export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.OPS_LOG_LEVEL ?? "warn" },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // 중앙 에러 핸들러: Zod 검증 에러는 400으로 일관 매핑.
  app.setErrorHandler((error: FastifyError, _req, reply) => {
    if (error.validation) {
      return reply.status(400).send({ error: "ValidationError", detail: error.message });
    }
    app.log.error(error);
    return reply.status(error.statusCode ?? 500).send({ error: "InternalError" });
  });

  await app.register(autoload, { dir: join(import.meta.dirname, "plugins") });
  await app.register(autoload, { dir: join(import.meta.dirname, "routes") });

  return app;
}
