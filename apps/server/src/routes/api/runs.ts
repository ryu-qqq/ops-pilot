import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  benchmarkAggregateSchema,
  runDiffFileSchema,
  runSchema,
  scoreSchema,
  scorerSchema,
} from "@opspilot/shared-types";
import { RunInputError, startRun } from "../../domains/run/service.js";
import { DEMO_FIXTURE, fixtureSource, localClaudeSource } from "../../domains/run/source.js";
import {
  cancelRun,
  getRun,
  listLastAssistantTexts,
  listRunDiff,
  listRunDiffCounts,
  listRunScenarioNames,
  listRuns,
  listTrace,
} from "../../domains/run/repository.js";
import { aggregateBenchmark } from "../../domains/run/benchmark.js";
import { getAnalysis, startAnalysis } from "../../domains/assist/analysis-store.js";
import { traceAnalysisSchema } from "../../domains/assist/analyze-trace.js";
import { createScore, listScores, listScoresForRuns } from "../../domains/score/repository.js";

const errorSchema = z.object({ error: z.string(), detail: z.string() });

const runBody = z.object({
  assetVersionId: z.string().uuid(),
  scenarioId: z.string().uuid(),
  source: z.enum(["fixture", "local-claude"]).default("local-claude"),
  fixtureEvents: z.array(z.unknown()).optional(), // source=fixture 일 때 재생할 이벤트
});

const runListItem = z.object({
  id: z.string().uuid(),
  status: z.string(),
  runner: z.string(),
  createdAt: z.string(),
  promptTokens: z.number().nullable(),
  completionTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
  scenarioId: z.string().uuid(),
  scenarioName: z.string(),
  assetName: z.string(),
  assetKind: z.string(),
  gitCommit: z.string(),
});

const traceResponse = z.object({
  trace: z.array(
    z.object({
      seq: z.number().int(),
      type: z.string(),
      name: z.string().nullable(),
      input: z.unknown(),
      output: z.unknown(),
    }),
  ),
});

const runs: FastifyPluginAsyncZod = async (fastify) => {
  // OPSP-10: 같은 시나리오로 여러 자산 버전을 한 번에 실행 → 즉시 N개 run 반환.
  // 내부적으로 startRun N번. 모두 백그라운드·worktree 격리(local-claude)이라 자연스레 병렬.
  fastify.post(
    "/runs/batch",
    {
      schema: {
        body: z.object({
          assetVersionIds: z.array(z.string().uuid()).min(2).max(5),
          scenarioId: z.string().uuid(),
          source: z.enum(["fixture", "local-claude"]).default("local-claude"),
          fixtureEvents: z.array(z.unknown()).optional(),
        }),
        response: { 200: z.object({ runs: z.array(runSchema) }), 400: errorSchema },
      },
    },
    async (req, reply) => {
      const { assetVersionIds, scenarioId, source, fixtureEvents } = req.body;
      try {
        const runs = assetVersionIds.map((assetVersionId) =>
          startRun({
            assetVersionId,
            scenarioId,
            source:
              source === "fixture"
                ? fixtureSource(fixtureEvents ?? DEMO_FIXTURE)
                : localClaudeSource(),
          }),
        );
        return { runs };
      } catch (e) {
        if (e instanceof RunInputError) {
          return reply.status(400).send({ error: "BadRequest", detail: e.message });
        }
        throw e;
      }
    },
  );

  // OPSP-9: 같은 자산 버전을 N개 시나리오로 한 번에 회귀 — N run 즉시 반환.
  // OPSP-10 batch 와 다른 축(시나리오 다중 vs 버전 다중) — 별도 라우트로 분리해 명확.
  fastify.post(
    "/runs/batch-scenarios",
    {
      schema: {
        body: z.object({
          assetVersionId: z.string().uuid(),
          scenarioIds: z.array(z.string().uuid()).min(2).max(10),
          source: z.enum(["fixture", "local-claude"]).default("local-claude"),
          fixtureEvents: z.array(z.unknown()).optional(),
        }),
        response: { 200: z.object({ runs: z.array(runSchema) }), 400: errorSchema },
      },
    },
    async (req, reply) => {
      const { assetVersionId, scenarioIds, source, fixtureEvents } = req.body;
      try {
        const runs = scenarioIds.map((scenarioId) =>
          startRun({
            assetVersionId,
            scenarioId,
            source:
              source === "fixture"
                ? fixtureSource(fixtureEvents ?? DEMO_FIXTURE)
                : localClaudeSource(),
          }),
        );
        return { runs };
      } catch (e) {
        if (e instanceof RunInputError) {
          return reply.status(400).send({ error: "BadRequest", detail: e.message });
        }
        throw e;
      }
    },
  );

  // OPSP-31: 같은 (asset_version × scenario) 를 N회 실행 — 비결정 자산 통과율·분산.
  // batch/batch-scenarios 와 다른 축(같은 입력 N회) — 별도 라우트로 의미 분리.
  fastify.post(
    "/runs/benchmark",
    {
      schema: {
        body: z.object({
          assetVersionId: z.string().uuid(),
          scenarioId: z.string().uuid(),
          source: z.enum(["fixture", "local-claude"]).default("local-claude"),
          n: z.number().int().min(1).max(10),
          fixtureEvents: z.array(z.unknown()).optional(),
        }),
        response: { 200: z.object({ runs: z.array(runSchema) }), 400: errorSchema },
      },
    },
    async (req, reply) => {
      const { assetVersionId, scenarioId, source, n, fixtureEvents } = req.body;
      try {
        const runs = Array.from({ length: n }, () =>
          startRun({
            assetVersionId,
            scenarioId,
            source:
              source === "fixture"
                ? fixtureSource(fixtureEvents ?? DEMO_FIXTURE)
                : localClaudeSource(),
          }),
        );
        return { runs };
      } catch (e) {
        if (e instanceof RunInputError) {
          return reply.status(400).send({ error: "BadRequest", detail: e.message });
        }
        throw e;
      }
    },
  );

  // OPSP-31: 위 benchmark 의 N개 run 통계 집계 — passRate / 평균 / 표준편차 / assertion 분포.
  fastify.get(
    "/runs/benchmark-aggregate",
    {
      schema: {
        querystring: z.object({ ids: z.string().min(1) }), // csv of uuid
        response: { 200: benchmarkAggregateSchema, 400: errorSchema },
      },
    },
    async (req, reply) => {
      const ids = req.query.ids
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");
      if (ids.length < 1 || ids.length > 10) {
        return reply.status(400).send({ error: "BadRequest", detail: "ids 1~10개" });
      }
      return aggregateBenchmark(ids);
    },
  );

  // OPSP-10: 비교 뷰용 N개 run 요약 한꺼번에(N+1 회피).
  // OPSP-20: assertion / llm_judge / human score 를 같이 합쳐 컬럼 데이터로.
  // OPSP-9: scenarioName 추가(회귀 모드면 컬럼 헤더에 시나리오 이름 표시).
  fastify.get(
    "/runs/compare",
    {
      schema: {
        querystring: z.object({ ids: z.string().min(1) }), // csv of uuid
        response: {
          200: z.object({
            items: z.array(
              z.object({
                run: runSchema,
                scenarioName: z.string(),
                diffFileCount: z.number().int().nonnegative(),
                lastAssistantText: z.string().nullable(),
                assertionScore: scoreSchema.nullable(),
                judgeScore: scoreSchema.nullable(),
                humanScore: scoreSchema.nullable(),
              }),
            ),
          }),
          400: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const ids = req.query.ids.split(",").map((s) => s.trim()).filter((s) => s !== "");
      if (ids.length === 0 || ids.length > 10) {
        return reply.status(400).send({ error: "BadRequest", detail: "ids 1~10개" });
      }
      const runs = ids.map((id) => getRun(id)).filter((r): r is NonNullable<typeof r> => r !== undefined);
      const runIds = runs.map((r) => r.id);
      const diffCounts = listRunDiffCounts(runIds);
      const lastTexts = listLastAssistantTexts(runIds);
      const scoresByRun = listScoresForRuns(runIds);
      const scenarioNames = listRunScenarioNames(runIds);
      // 한 run 에 같은 scorer 가 여러 행이면 가장 최근(createdAt 오름차순이므로 마지막).
      const pickLatest = (runId: string, scorer: "assertion" | "llm_judge" | "human") => {
        const list = (scoresByRun[runId] ?? []).filter((s) => s.scorer === scorer);
        return list.length === 0 ? null : list[list.length - 1] ?? null;
      };
      return {
        items: runs.map((run) => ({
          run,
          scenarioName: scenarioNames[run.id] ?? "(unknown)",
          diffFileCount: diffCounts[run.id] ?? 0,
          lastAssistantText: lastTexts[run.id] ?? null,
          assertionScore: pickLatest(run.id, "assertion"),
          judgeScore: pickLatest(run.id, "llm_judge"),
          humanScore: pickLatest(run.id, "human"),
        })),
      };
    },
  );

  fastify.post(
    "/runs",
    { schema: { body: runBody, response: { 200: runSchema, 400: errorSchema } } },
    async (req, reply) => {
      const { assetVersionId, scenarioId, source, fixtureEvents } = req.body;
      const runnerSource =
        source === "fixture"
          ? fixtureSource(fixtureEvents ?? DEMO_FIXTURE)
          : localClaudeSource();
      try {
        // 즉시 반환(status=running). 실제 실행은 백그라운드 → 클라가 폴링.
        return startRun({ assetVersionId, scenarioId, source: runnerSource });
      } catch (e) {
        if (e instanceof RunInputError) {
          return reply.status(400).send({ error: "BadRequest", detail: e.message });
        }
        throw e;
      }
    },
  );

  fastify.get(
    "/runs",
    { schema: { response: { 200: z.object({ runs: z.array(runListItem) }) } } },
    async () => ({ runs: listRuns() }),
  );

  fastify.get(
    "/runs/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: runSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      const run = getRun(req.params.id);
      if (!run) return reply.status(404).send({ error: "NotFound", detail: "run not found" });
      return run;
    },
  );

  // OPSP-37 (1): 실패/완료한 run 을 같은 조건으로 다시 실행.
  fastify.post(
    "/runs/:id/rerun",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: runSchema, 400: errorSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      const old = getRun(req.params.id);
      if (!old) return reply.status(404).send({ error: "NotFound", detail: "run not found" });
      try {
        // OPSP-44: cwd 는 서버가 assetVersionId → clonePath 로 자동 유도 — 별도 조회 불필요.
        return startRun({
          assetVersionId: old.assetVersionId,
          scenarioId: old.scenarioId,
          source: old.runner === "fixture" ? fixtureSource(DEMO_FIXTURE) : localClaudeSource(),
        });
      } catch (e) {
        if (e instanceof RunInputError) {
          return reply.status(400).send({ error: "BadRequest", detail: e.message });
        }
        throw e;
      }
    },
  );

  // OPSP-36 (1): 사용자 명시 강제 종료 — running/pending → failed.
  fastify.post(
    "/runs/:id/cancel",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ cancelled: z.boolean() }),
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      if (!getRun(req.params.id)) {
        return reply.status(404).send({ error: "NotFound", detail: "run not found" });
      }
      return { cancelled: cancelRun(req.params.id) };
    },
  );

  // OPSP-39: AI 트레이스 분석 — 비동기 시작 + DB 캐시. run 의 startRun 패턴.
  fastify.post(
    "/runs/:id/analyze",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ started: z.boolean(), reason: z.string().optional() }),
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      if (!getRun(req.params.id)) {
        return reply.status(404).send({ error: "NotFound", detail: "run not found" });
      }
      return startAnalysis(req.params.id);
    },
  );

  // OPSP-39: 분석 상태+결과 조회 — running 이면 클라가 폴링, done 이면 캐시된 결과.
  fastify.get(
    "/runs/:id/analysis",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            status: z.enum(["running", "done", "failed", "none"]),
            result: traceAnalysisSchema.nullable(),
            error: z.string().nullable(),
          }),
        },
      },
    },
    async (req) => {
      const a = getAnalysis(req.params.id);
      if (!a) return { status: "none" as const, result: null, error: null };
      return { status: a.status, result: a.result, error: a.error };
    },
  );

  fastify.get(
    "/runs/:id/trace",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: traceResponse },
      },
    },
    async (req) => ({ trace: listTrace(req.params.id) }),
  );

  // OPSP-30: 실행 후 worktree base↔결과 git diff 결과(파일별).
  fastify.get(
    "/runs/:id/diff",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ files: z.array(runDiffFileSchema) }) },
      },
    },
    async (req) => ({ files: listRunDiff(req.params.id) }),
  );

  // 사람(또는 기타) 스코어링 (OPSP-17). 한 run 에 여러 score 가능.
  const scoreBody = z.object({
    scorer: scorerSchema.default("human"),
    passed: z.boolean(),
    score: z.number().min(0).max(1).nullable().default(null),
    reason: z.string().nullable().default(null),
  });

  fastify.get(
    "/runs/:id/scores",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ scores: z.array(scoreSchema) }) },
      },
    },
    async (req) => ({ scores: listScores(req.params.id) }),
  );

  fastify.post(
    "/runs/:id/scores",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: scoreBody,
        response: { 200: scoreSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      if (!getRun(req.params.id)) {
        return reply.status(404).send({ error: "NotFound", detail: "run not found" });
      }
      return createScore({ runId: req.params.id, ...req.body });
    },
  );
};

export default runs;
