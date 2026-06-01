import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { getProject } from "../../domains/project/repository.js";
import {
  assetUsageForProject,
  scanTranscriptUsage,
} from "../../domains/usage/service.js";

const errorSchema = z.object({ error: z.string(), detail: z.string() });

const assetUsageSchema = z.object({
  kind: z.string(),
  name: z.string(),
  supported: z.boolean(),
  inProjectCount: z.number().int(),
  inProjectLastUsed: z.string().nullable(),
  totalCount: z.number().int(),
  totalLastUsed: z.string().nullable(),
  totalProjectCount: z.number().int(),
  neverUsed: z.boolean(),
});

const rankRowSchema = z.object({
  name: z.string(),
  count: z.number().int(),
  lastUsed: z.string().nullable(),
  projectCount: z.number().int(),
});

// 자산 사용량 — 로컬 Claude Code transcript 스캔 기반 (사람 실사용, worktree 제외).
// 만들고 안 쓰는 자산을 수치로 식별해 prune 판단을 돕는다.
const usage: FastifyPluginAsyncZod = async (fastify) => {
  // 한 프로젝트의 정의된 자산 × 사용량 조인.
  fastify.get(
    "/usage/assets",
    {
      schema: {
        querystring: z.object({ projectId: z.string().uuid() }),
        response: {
          200: z.object({
            projectId: z.string(),
            projectName: z.string(),
            clonePath: z.string(),
            scannedSessions: z.number().int(),
            assets: z.array(assetUsageSchema),
            unmatchedUsage: z.array(
              z.object({
                kind: z.enum(["agent", "skill"]),
                name: z.string(),
                count: z.number().int(),
                lastUsed: z.string().nullable(),
              }),
            ),
          }),
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const project = getProject(req.query.projectId);
      if (!project)
        return reply
          .status(404)
          .send({ error: "NotFound", detail: "project not found" });
      return assetUsageForProject(project);
    },
  );

  // 전역 랭킹 — 모든 transcript 합산 (어떤 자산이 가장/가장 안 쓰이나).
  fastify.get(
    "/usage/global",
    {
      schema: {
        response: {
          200: z.object({
            scannedSessions: z.number().int(),
            agents: z.array(rankRowSchema),
            skills: z.array(rankRowSchema),
          }),
        },
      },
    },
    async () => {
      const scan = scanTranscriptUsage();
      const rank = (table: typeof scan.agents) =>
        Object.entries(table)
          .map(([name, s]) => ({
            name,
            count: s.count,
            lastUsed: s.lastUsed,
            projectCount: Object.keys(s.byCwd).length,
          }))
          .sort((a, b) => b.count - a.count);
      return {
        scannedSessions: scan.scannedSessions,
        agents: rank(scan.agents),
        skills: rank(scan.skills),
      };
    },
  );
};

export default usage;
