import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { assetVersionSchema } from "@opspilot/shared-types";
import { assetExists, listVersions } from "../../domains/registry/repository.js";

const versionSummarySchema = assetVersionSchema.omit({ content: true });
const errorSchema = z.object({ error: z.string(), detail: z.string() });

// 자산 버전 조회만 유지 (등록·스캔·목록은 프로젝트 스코프로 projects.ts 로 이동).
const registry: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/registry/assets/:id/versions",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ versions: z.array(versionSummarySchema) }), 404: errorSchema },
      },
    },
    async (req, reply) => {
      if (!assetExists(req.params.id)) {
        return reply.status(404).send({ error: "NotFound", detail: "asset not found" });
      }
      return { versions: listVersions(req.params.id) };
    },
  );
};

export default registry;
