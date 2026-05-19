import { join } from "node:path";
import Fastify, { type FastifyError } from "fastify";
import autoload from "@fastify/autoload";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

// Composition: 플러그인/라우트는 @fastify/autoload 로 자동 등록 (CONVENTIONS.md 3).
export async function buildApp() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

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
