import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  autoIngestConfigSchema,
  feedbackApplyRequestSchema,
  feedbackIngestRequestSchema,
  feedbackProposalApplyResponseSchema,
  improvementProposalSchema,
  improvementProposalStatusSchema,
  ingestBundleDetailSchema,
  ingestBundleListResponseSchema,
  proposalWithSourceSchema,
} from "@opspilot/shared-types";
import { getAutoIngestConfig } from "../../domains/feedback/auto-ingest.js";
import {
  FeedbackIngestError,
  evaluateFeedbackIngest,
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
import { UpstreamRequiredError } from "../../domains/feedback/classify-target.js";

const errorSchema = z.object({ error: z.string(), detail: z.string() });
const upstreamRequiredSchema = z.object({
  error: z.literal("UpstreamRequired"),
  upstream: z.object({
    crewRepoPath: z.string(),
    crewRelPath: z.string(),
    crewFileExists: z.boolean(),
    content: z.string(),
    resyncHint: z.string(),
  }),
});

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

  // 수동 평가: pending 작업을 사람이 골라 work-evaluator 평가 큐에 올린다.
  // 자동 평가(autoEval) off 일 때 사용. 이미 평가 시작된 작업이면 400.
  fastify.post(
    "/feedback/ingest/:id/evaluate",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: ingestBundleDetailSchema, 400: errorSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return evaluateFeedbackIngest(req.params.id);
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

  // ADR 0004: 자동 ingest 스캐너의 현재 env 설정 조회(읽기 전용). 전역이라 projectId 불필요.
  fastify.get(
    "/feedback/auto-ingest-config",
    {
      schema: {
        response: { 200: autoIngestConfigSchema },
      },
    },
    async () => getAutoIngestConfig(),
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
          409: upstreamRequiredSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        return applyProposal(req.params.id);
      } catch (e) {
        if (e instanceof UpstreamRequiredError) {
          return reply.status(409).send({ error: "UpstreamRequired", upstream: e.info });
        }
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
