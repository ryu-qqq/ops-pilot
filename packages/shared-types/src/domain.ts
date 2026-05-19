import { z } from "zod";

// OPSP-2 도메인 스키마. DB 행 ↔ API ↔ 프론트가 이 단일 출처를 공유한다.
// (docs/DATA_MODEL.md 와 1:1)

export const assetKindSchema = z.enum(["agent", "skill", "command"]);
export type AssetKind = z.infer<typeof assetKindSchema>;

export const assetScopeSchema = z.enum(["project", "user", "plugin"]);
export type AssetScope = z.infer<typeof assetScopeSchema>;

export const runStatusSchema = z.enum(["pending", "running", "succeeded", "failed"]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const traceEventTypeSchema = z.enum([
  "user_message",
  "assistant_message",
  "thinking",
  "tool_call",
  "tool_result",
  "system",
  "result",
]);
export type TraceEventType = z.infer<typeof traceEventTypeSchema>;

export const scorerSchema = z.enum(["schema", "assertion", "llm_judge"]);
export type Scorer = z.infer<typeof scorerSchema>;

const id = z.string().uuid();
const ts = z.string().datetime();

export const assetSchema = z.object({
  id,
  kind: assetKindSchema,
  name: z.string().min(1),
  scope: assetScopeSchema,
  sourcePath: z.string().min(1),
  createdAt: ts,
});
export type Asset = z.infer<typeof assetSchema>;

export const assetVersionSchema = z.object({
  id,
  assetId: id,
  gitCommit: z.string().min(7),
  gitRef: z.string().nullable(),
  contentHash: z.string().min(1),
  content: z.string(),
  committedAt: ts,
  commitMessage: z.string().nullable(),
  createdAt: ts,
});
export type AssetVersion = z.infer<typeof assetVersionSchema>;

// 시나리오 채점 기준. 세 스코어러 중 필요한 것만 채운다 (CONVENTIONS.md 결합도).
export const expectationSchema = z.object({
  schema: z.unknown().optional(), // 응답이 만족해야 할 JSON 스키마
  assertions: z.array(z.string()).optional(), // 결정론 단언(트레이스/출력 대상)
  judge: z.string().optional(), // LLM-judge 평가 기준 프롬프트
});
export type Expectation = z.infer<typeof expectationSchema>;

export const scenarioSchema = z.object({
  id,
  assetId: id,
  name: z.string().min(1),
  description: z.string().nullable(),
  input: z.string().min(1),
  expectation: expectationSchema,
  definitionHash: z.string().min(1),
  createdAt: ts,
  updatedAt: ts,
});
export type Scenario = z.infer<typeof scenarioSchema>;

export const runSchema = z.object({
  id,
  assetVersionId: id,
  scenarioId: id,
  status: runStatusSchema,
  runner: z.string().min(1),
  model: z.string().nullable(),
  startedAt: ts.nullable(),
  finishedAt: ts.nullable(),
  error: z.string().nullable(),
  promptTokens: z.number().int().nonnegative().nullable(),
  completionTokens: z.number().int().nonnegative().nullable(),
  costUsd: z.number().nonnegative().nullable(),
  createdAt: ts,
});
export type Run = z.infer<typeof runSchema>;

export const traceEventSchema = z.object({
  id,
  runId: id,
  seq: z.number().int().nonnegative(),
  type: traceEventTypeSchema,
  name: z.string().nullable(),
  input: z.unknown().nullable(),
  output: z.unknown().nullable(),
  startedAt: ts.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  raw: z.unknown(),
});
export type TraceEvent = z.infer<typeof traceEventSchema>;

export const scoreSchema = z.object({
  id,
  runId: id,
  scorer: scorerSchema,
  passed: z.boolean(),
  score: z.number().min(0).max(1).nullable(),
  detail: z
    .object({
      reason: z.string().optional(),
      expected: z.unknown().optional(),
      actual: z.unknown().optional(),
    })
    .nullable(),
  createdAt: ts,
});
export type Score = z.infer<typeof scoreSchema>;
