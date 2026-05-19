import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { assetSchema, expectationSchema, scenarioSchema } from "@opspilot/shared-types";
import { assetExists } from "../../domains/registry/repository.js";
import { createScenario } from "../../domains/scenario/repository.js";

const createBody = z.object({
  assetId: assetSchema.shape.id,
  name: z.string().min(1),
  description: z.string().nullable().default(null),
  input: z.string().min(1),
  expectation: expectationSchema.default({}),
});
const errorSchema = z.object({ error: z.string(), detail: z.string() });

const scenarios: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/scenarios",
    { schema: { body: createBody, response: { 200: scenarioSchema, 400: errorSchema } } },
    async (req, reply) => {
      if (!assetExists(req.body.assetId)) {
        return reply.status(400).send({ error: "BadRequest", detail: "asset not found" });
      }
      return createScenario(req.body);
    },
  );
};

export default scenarios;
