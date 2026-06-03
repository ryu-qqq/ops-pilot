import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  feedbackApplyRequestSchema,
  feedbackIngestRequestSchema,
  feedbackProposalApplyResponseSchema,
  improvementProposalSchema,
  improvementProposalStatusSchema,
  ingestBundleDetailSchema,
  ingestBundleListResponseSchema,
  proposalWithSourceSchema,
} from "@opspilot/shared-types";
import {
  FeedbackIngestError,
  getIngestDetail,
  ingestFeedback,
  listIngestsByProject,
  reprocessFeedbackIngest,
  reprocessReviewFeedbackIngest,
  reviewFeedbackIngest,
} from "../../domains/feedback/service.js";
import {
  FeedbackProposalError,
  applyProposal,
  approveProposal,
  getProposalDetail,
  listProposalsForProject,
  rejectProposal,
} from "../../domains/feedback/proposal-service.js";

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
    "/feedback/ingests",
    {
      schema: {
        querystring: z.object({ projectId: z.string().uuid() }),
        response: { 200: ingestBundleListResponseSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return { ingests: listIngestsByProject(req.query.projectId) };
      } catch (e) {
        if (e instanceof FeedbackIngestError && e.code === "NotFound") {
          return reply.status(404).send({ error: "NotFound", detail: e.message });
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

  fastify.post(
    "/feedback/ingest/:id/reprocess",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: ingestBundleDetailSchema, 400: errorSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return await reprocessFeedbackIngest(req.params.id);
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

  fastify.post(
    "/feedback/ingest/:id/review",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z
          .object({
            evalSource: z.enum(["fixture", "local-claude"]).default("local-claude"),
          })
          .default({}),
        response: { 200: ingestBundleDetailSchema, 400: errorSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return reviewFeedbackIngest(req.params.id, req.body.evalSource);
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

  fastify.post(
    "/feedback/ingest/:id/reprocess-review",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: ingestBundleDetailSchema, 400: errorSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return await reprocessReviewFeedbackIngest(req.params.id);
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
    "/feedback/proposals",
    {
      schema: {
        querystring: z.object({
          projectId: z.string().uuid(),
          status: improvementProposalStatusSchema.optional(),
        }),
        response: { 200: z.array(proposalWithSourceSchema), 400: errorSchema },
      },
    },
    async (req) => {
      return listProposalsForProject(req.query.projectId, req.query.status);
    },
  );

  fastify.get(
    "/feedback/proposals/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: improvementProposalSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      const proposal = getProposalDetail(req.params.id);
      if (!proposal) {
        return reply.status(404).send({ error: "NotFound", detail: "proposal not found" });
      }
      return proposal;
    },
  );

  fastify.post(
    "/feedback/proposals/:id/approve",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: improvementProposalSchema, 400: errorSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return approveProposal(req.params.id);
      } catch (e) {
        if (e instanceof FeedbackProposalError) {
          if (e.code === "NotFound") {
            return reply.status(404).send({ error: "NotFound", detail: e.message });
          }
          return reply.status(400).send({ error: e.code, detail: e.message });
        }
        throw e;
      }
    },
  );

  fastify.post(
    "/feedback/proposals/:id/reject",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: improvementProposalSchema, 400: errorSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return rejectProposal(req.params.id);
      } catch (e) {
        if (e instanceof FeedbackProposalError) {
          if (e.code === "NotFound") {
            return reply.status(404).send({ error: "NotFound", detail: e.message });
          }
          return reply.status(400).send({ error: e.code, detail: e.message });
        }
        throw e;
      }
    },
  );

  fastify.post(
    "/feedback/proposals/:id/apply",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: feedbackApplyRequestSchema,
        response: {
          200: feedbackProposalApplyResponseSchema,
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        return applyProposal(req.params.id);
      } catch (e) {
        if (e instanceof FeedbackProposalError) {
          if (e.code === "NotFound") {
            return reply.status(404).send({ error: "NotFound", detail: e.message });
          }
          return reply.status(400).send({ error: e.code, detail: e.message });
        }
        throw e;
      }
    },
  );
};

export default feedback;
