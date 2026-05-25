import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  feedbackIngestRequestSchema,
  ingestBundleDetailSchema,
} from "@opspilot/shared-types";
import {
  FeedbackIngestError,
  getIngestDetail,
  ingestFeedback,
} from "../../domains/feedback/service.js";

const errorSchema = z.object({ error: z.string(), detail: z.string() });

const feedback: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/feedback/ingest",
    {
      schema: {
        body: feedbackIngestRequestSchema,
        response: { 200: ingestBundleDetailSchema, 400: errorSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return ingestFeedback(req.body);
      } catch (e) {
        if (e instanceof FeedbackIngestError) {
          if (e.code === "NotFound") {
            return reply.status(404).send({ error: "NotFound", detail: e.message });
          }
          return reply.status(400).send({ error: e.code, detail: e.message });
        }
        throw e;
      }
    },
  );

  fastify.get(
    "/feedback/ingest/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: ingestBundleDetailSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      const detail = getIngestDetail(req.params.id);
      if (!detail) {
        return reply.status(404).send({ error: "NotFound", detail: "ingest bundle not found" });
      }
      return detail;
    },
  );
};

export default feedback;
