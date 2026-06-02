import {
  projectUsageReportSchema,
  projectWorkMetricReportSchema,
  usageGlobalSchema,
  workMetricScanResultSchema,
} from "@opspilot/shared-types";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { getProject } from "../../domains/project/repository.js";
import {
  assetUsageForProject,
  scanTranscriptUsage,
} from "../../domains/usage/service.js";
import {
  runWorkMetricScan,
  workMetricsForProject,
} from "../../domains/usage/work-metric-service.js";

const errorSchema = z.object({ error: z.string(), detail: z.string() });

const SPARK_DAYS = 14; // 자산별 스파크라인 윈도우 (days 토글 무관 고정).
const ACTIVITY_DAYS = 84; // 전역 활동 잔디 윈도우 (days 토글 무관 고정).

/** new Date() 기준 N일치 YYYY-MM-DD 키 배열(과거→현재). 마지막 원소 = 오늘. */
function dayKeys(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

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

  // 전역 랭킹 + 시계열 — 모든 transcript 합산. days=N 이면 랭킹 count 만 최근 N일.
  // 스파크(14일)·활동잔디(84일)는 days 토글과 무관한 고정 윈도우라, 한 번의 스캔으로
  // 최소 84일(혹은 days 가 더 크면 그만큼)을 덮은 뒤 byDay 에서 윈도우별로 잘라 쓴다.
  fastify.get(
    "/usage/global",
    {
      schema: {
        querystring: z.object({
          days: z.coerce.number().int().min(1).max(365).optional(),
        }),
        response: { 200: usageGlobalSchema },
      },
    },
    async (req) => {
      const days = req.query.days ?? null;
      // 스캔 윈도우: days 미지정(전체)이면 전체 스캔(sinceIso 없음 → 평생 count).
      // days 지정이면 max(84, days) 를 덮어 스파크/잔디 시계열을 함께 확보.
      const sinceIso =
        days === null
          ? undefined
          : new Date(
              Date.now() - Math.max(ACTIVITY_DAYS, days) * 86_400_000,
            ).toISOString();
      const scan = scanTranscriptUsage({ sinceIso });

      const sparkKeys = dayKeys(SPARK_DAYS); // 최근 14일
      const activityKeys = dayKeys(ACTIVITY_DAYS); // 최근 84일
      // 랭킹 count 윈도우: days 미지정이면 전체(byDay 전부 합), 지정이면 최근 days 일.
      const rankKeys = days === null ? null : new Set(dayKeys(days));

      const rank = (table: typeof scan.agents) =>
        Object.entries(table)
          .map(([name, s]) => {
            const count =
              rankKeys === null
                ? Object.values(s.byDay).reduce((a, b) => a + b, 0)
                : Object.entries(s.byDay)
                    .filter(([d]) => rankKeys.has(d))
                    .reduce((a, [, c]) => a + c, 0);
            const spark = sparkKeys.map((d) => s.byDay[d] ?? 0);
            const cwds = Object.entries(s.byCwd)
              .map(([cwd, v]) => ({ cwd, count: v.count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 5);
            return {
              name,
              count,
              lastUsed: s.lastUsed,
              projectCount: Object.keys(s.byCwd).length,
              spark,
              cwds,
            };
          })
          // days 윈도우 밖이라 count=0 이 된 자산은 랭킹에서 제외(기존 "기간 내 호출" 의미).
          .filter((r) => r.count > 0)
          .sort((a, b) => b.count - a.count);

      // 활동 잔디 = 전 자산 byDay 합산, 최근 84일.
      const dayTotals: Record<string, number> = {};
      for (const table of [scan.agents, scan.skills]) {
        for (const s of Object.values(table)) {
          for (const [d, c] of Object.entries(s.byDay)) {
            dayTotals[d] = (dayTotals[d] ?? 0) + c;
          }
        }
      }
      const activity = activityKeys.map((date) => ({
        date,
        count: dayTotals[date] ?? 0,
      }));

      return {
        scannedSessions: scan.scannedSessions,
        days,
        agents: rank(scan.agents),
        skills: rank(scan.skills),
        activity,
      };
    },
  );

  // ADR-0001: 작업 기반 자동 평가 — transcript 무상 신호(reference signal).
  // ⚠️ 정정 왕복은 "품질 점수"가 아니라 "참고 신호"다. 응답에 라벨을 싣는다.

  // 프로젝트의 자산별 작업 지표(발화·정정 왕복 집계). 저장된 지표를 읽기만 한다(스캔 X).
  fastify.get(
    "/usage/work-metrics",
    {
      schema: {
        querystring: z.object({ projectId: z.string().uuid() }),
        response: {
          200: projectWorkMetricReportSchema,
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
      return workMetricsForProject(project);
    },
  );

  // 수동 전수 스캔 트리거 — 모든 세션을 재스캔해 멱등 upsert. (부팅 시 1회도 동일 함수.)
  fastify.post(
    "/usage/work-metrics/scan",
    { schema: { response: { 200: workMetricScanResultSchema } } },
    async () => runWorkMetricScan(),
  );
};

export default usage;
