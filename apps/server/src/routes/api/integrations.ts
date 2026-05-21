import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  jiraIssueDetailSchema,
  jiraIssueSummarySchema,
  notionPageDetailSchema,
  notionPageSummarySchema,
} from "@opspilot/shared-types";
import {
  JiraIntegrationError,
  getJiraIssue,
  listJiraIssues,
} from "../../domains/integration/jira.js";
import {
  NotionIntegrationError,
  getNotionPage,
  listNotionPages,
} from "../../domains/integration/notion.js";

// OPSP-43: 지라/노션 → 시나리오 import.
// 목록 → 1건 선택 → 상세 2-라운드트립. 인증 미설정·외부 오류는 400 IntegrationError 로.

const errorSchema = z.object({ error: z.string(), detail: z.string() });

// 도메인 에러 → 400, 그 외는 중앙 에러 핸들러로 재던짐.
function asIntegrationError(e: unknown): { error: string; detail: string } | null {
  if (e instanceof JiraIntegrationError || e instanceof NotionIntegrationError) {
    return { error: "IntegrationError", detail: e.message };
  }
  return null;
}

const integrations: FastifyPluginAsyncZod = async (fastify) => {
  // 지라 — 프로젝트별 이슈 목록.
  fastify.get(
    "/integrations/jira/issues",
    {
      schema: {
        querystring: z.object({ projectKey: z.string().min(1) }),
        response: { 200: z.object({ issues: z.array(jiraIssueSummarySchema) }), 400: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return { issues: await listJiraIssues(req.query.projectKey) };
      } catch (e) {
        const err = asIntegrationError(e);
        if (err) return reply.status(400).send(err);
        throw e;
      }
    },
  );

  // 지라 — 이슈 1건 상세(제목 + 본문).
  fastify.get(
    "/integrations/jira/issues/:key",
    {
      schema: {
        params: z.object({ key: z.string().regex(/^[A-Za-z][A-Za-z0-9]*-\d+$/) }),
        response: { 200: jiraIssueDetailSchema, 400: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return await getJiraIssue(req.params.key);
      } catch (e) {
        const err = asIntegrationError(e);
        if (err) return reply.status(400).send(err);
        throw e;
      }
    },
  );

  // 노션 — 페이지 검색 목록 (query 빈 문자열이면 공유된 전체).
  fastify.get(
    "/integrations/notion/pages",
    {
      schema: {
        querystring: z.object({ query: z.string().default("") }),
        response: { 200: z.object({ pages: z.array(notionPageSummarySchema) }), 400: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return { pages: await listNotionPages(req.query.query) };
      } catch (e) {
        const err = asIntegrationError(e);
        if (err) return reply.status(400).send(err);
        throw e;
      }
    },
  );

  // 노션 — 페이지 1건 상세(제목 + 본문).
  fastify.get(
    "/integrations/notion/pages/:id",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: notionPageDetailSchema, 400: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        return await getNotionPage(req.params.id);
      } catch (e) {
        const err = asIntegrationError(e);
        if (err) return reply.status(400).send(err);
        throw e;
      }
    },
  );
};

export default integrations;
