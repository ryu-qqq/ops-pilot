import { projectUsageReportSchema } from "@opspilot/shared-types";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { getProject } from "../../domains/project/repository.js";
import {
  assetUsageForProject,
  scanTranscriptUsage,
} from "../../domains/usage/service.js";

const errorSchema = z.object({ error: z.string(), detail: z.string() });

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
          200: projectUsageReportSchema,
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

  // 전역 랭킹 — 모든 transcript 합산. days=N 이면 최근 N일만 (리더보드).
  fastify.get(
    "/usage/global",
    {
      schema: {
        querystring: z.object({
          days: z.coerce.number().int().min(1).max(365).optional(),
        }),
        response: {
          200: z.object({
            scannedSessions: z.number().int(),
            days: z.number().int().nullable(),
            agents: z.array(rankRowSchema),
            skills: z.array(rankRowSchema),
          }),
        },
      },
    },
    async (req) => {
      const days = req.query.days ?? null;
      const sinceIso =
        days === null
          ? undefined
          : new Date(Date.now() - days * 86_400_000).toISOString();
      const scan = scanTranscriptUsage({ sinceIso });
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
        days,
        agents: rank(scan.agents),
        skills: rank(scan.skills),
      };
    },
  );
};

export default usage;
