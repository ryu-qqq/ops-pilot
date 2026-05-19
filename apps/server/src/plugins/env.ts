import fp from "fastify-plugin";
import { z } from "zod";

// CONVENTIONS.md 3: 환경변수는 부팅 시 Zod로 검증 후 타입 config로 주입.
// 검증 안 된 process.env 직접 접근 금지 — fastify.config 만 사용한다.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
});

export type AppConfig = z.infer<typeof envSchema>;

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export default fp(
  (fastify) => {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      fastify.log.error(parsed.error.format(), "환경변수 검증 실패");
      throw new Error("Invalid environment configuration");
    }
    fastify.decorate("config", parsed.data);
  },
  { name: "env" },
);
