import { z } from "zod";

// OPSP-2 도메인 스키마. DB 행 ↔ API ↔ 프론트가 이 단일 출처를 공유한다.
// (docs/DATA_MODEL.md 와 1:1)

export const assetKindSchema = z.enum([
  "agent",
  "skill",
  "command",
  "cursor_skill",
  "cursor_command",
  "cursor_rule",
]);
export type AssetKind = z.infer<typeof assetKindSchema>;

/** OpsPilot 저작 UI·Claude draft — `.claude/` only. */
export const claudeAssetKindSchema = z.enum(["agent", "skill", "command"]);
export type ClaudeAssetKind = z.infer<typeof claudeAssetKindSchema>;

export const assetScopeSchema = z.enum(["project", "user", "plugin"]);
export type AssetScope = z.infer<typeof assetScopeSchema>;

export const runStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
]);
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

export const scorerSchema = z.enum([
  "schema",
  "assertion",
  "llm_judge",
  "human",
]);
export type Scorer = z.infer<typeof scorerSchema>;

const id = z.string().uuid();
const ts = z.string().datetime();

// REG-01: linked = Cursor dev 경로, managed = OpsPilot clone (v1 기본).
export const projectWorkspaceModeSchema = z.enum(["linked", "managed"]);
export type ProjectWorkspaceMode = z.infer<typeof projectWorkspaceModeSchema>;

export const projectSchema = z.object({
  id,
  name: z.string().min(1),
  gitUrl: z.string().min(1),
  clonePath: z.string().min(1),
  workspaceMode: projectWorkspaceModeSchema,
  remoteVerified: z.boolean(),
  defaultBranch: z.string().nullable(),
  createdAt: ts,
});
export type Project = z.infer<typeof projectSchema>;

export const assetSchema = z.object({
  id,
  projectId: id,
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
  retro: z.string().nullable(), // OPSP-46: 선택적 회고 메모
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

// OPSP-30: worktree base 커밋↔실행 후 git diff 결과(파일 1개당 1행).
export const runDiffFileStatusSchema = z.enum([
  "added",
  "modified",
  "deleted",
  "renamed",
  "binary",
]);
export type RunDiffFileStatus = z.infer<typeof runDiffFileStatusSchema>;

export const runDiffFileSchema = z.object({
  id,
  runId: id,
  filePath: z.string().min(1),
  status: runDiffFileStatusSchema,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  binary: z.boolean(),
  truncated: z.boolean(),
  patch: z.string().nullable(),
});
export type RunDiffFile = z.infer<typeof runDiffFileSchema>;

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

// OPSP-31: 같은 (asset_version × scenario) 를 N회 실행한 결과의 집계.
// 비결정 자산이 얼마나 일관되게 작동하는지 — 통과율/평균/표준편차 한눈에.
const numericStatsSchema = z.object({
  mean: z.number(),
  stdDev: z.number().nonnegative(),
  min: z.number(),
  max: z.number(),
});

export const benchmarkAggregateSchema = z.object({
  count: z.number().int().nonnegative(),
  statusCounts: z.object({
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
  }),
  passRate: z.number().min(0).max(1), // succeeded / count (terminated 기준 — running/pending 제외)
  durationMs: numericStatsSchema.nullable(),
  promptTokens: numericStatsSchema.nullable(),
  completionTokens: numericStatsSchema.nullable(),
  costUsd: numericStatsSchema.nullable(),
  // assertion 자동 평가(OPSP-20) 점수 분포 — 없으면 null.
  assertion: numericStatsSchema
    .extend({ passN: z.number().int().nonnegative() })
    .nullable(),
  // LLM judge(OPSP-10 follow-up) — 있으면.
  judge: numericStatsSchema.nullable(),
});
export type BenchmarkAggregate = z.infer<typeof benchmarkAggregateSchema>;

// OPSP-42: 전역 설정 — 지라/노션 인증. OpsPilot 인스턴스 전역값.
// 토큰은 write-only — 조회 응답엔 설정 여부(*Set)만 싣고 평문은 내보내지 않는다.
export const settingsViewSchema = z.object({
  jira: z.object({
    siteUrl: z.string(),
    email: z.string(),
    apiTokenSet: z.boolean(),
  }),
  notion: z.object({
    tokenSet: z.boolean(),
  }),
});
export type SettingsView = z.infer<typeof settingsViewSchema>;

// 갱신 입력. 토큰 필드는 optional — 미지정/빈 문자열이면 기존 토큰을 유지한다.
export const settingsUpdateSchema = z.object({
  jira: z.object({
    siteUrl: z.string(),
    email: z.string(),
    apiToken: z.string().optional(),
  }),
  notion: z.object({
    token: z.string().optional(),
  }),
});
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

// OPSP-43: 지라/노션 → 시나리오 import.
// 실제 업무(지라 이슈·노션 페이지)를 가져와 시나리오 폼을 채운다.
// 목록(Summary)은 가볍게 — 메타만. 1건 선택 시 상세(Detail)에서 본문을 받는다.

export const jiraIssueSummarySchema = z.object({
  key: z.string(),
  summary: z.string(),
  status: z.string(),
});
export type JiraIssueSummary = z.infer<typeof jiraIssueSummarySchema>;

export const jiraIssueDetailSchema = z.object({
  key: z.string(),
  summary: z.string(), // → 시나리오 name
  body: z.string(), // → 시나리오 input (ADF 를 평탄화한 plaintext)
});
export type JiraIssueDetail = z.infer<typeof jiraIssueDetailSchema>;

export const notionPageSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
});
export type NotionPageSummary = z.infer<typeof notionPageSummarySchema>;

export const notionPageDetailSchema = z.object({
  id: z.string(),
  title: z.string(), // → 시나리오 name
  body: z.string(), // → 시나리오 input (블록 텍스트를 평탄화)
});
export type NotionPageDetail = z.infer<typeof notionPageDetailSchema>;

// TASK-5 MVP: Cursor 작업 ingest + evaluator 개선안.
export const ingestBundleStatusSchema = z.enum([
  "pending",
  "evaluating",
  "done",
  "reviewing",
  "reviewed",
  "failed",
]);
export type IngestBundleStatus = z.infer<typeof ingestBundleStatusSchema>;

export const proposalReviewDecisionSchema = z.enum([
  "approve",
  "reject",
  "revise",
]);
export type ProposalReviewDecision = z.infer<
  typeof proposalReviewDecisionSchema
>;

export const proposalReviewConfidenceSchema = z.enum(["high", "medium", "low"]);
export type ProposalReviewConfidence = z.infer<
  typeof proposalReviewConfidenceSchema
>;

export const proposalReviewRiskSchema = z.enum(["low", "high"]);
export type ProposalReviewRisk = z.infer<typeof proposalReviewRiskSchema>;

export const proposalReviewItemSchema = z.object({
  proposalId: id,
  decision: proposalReviewDecisionSchema,
  confidence: proposalReviewConfidenceSchema,
  risk: proposalReviewRiskSchema,
  autoApply: z.boolean(),
  rationale: z.string(),
  conflicts: z.array(z.string()).default([]),
  revisedContent: z.string().optional(),
});
export type ProposalReviewItem = z.infer<typeof proposalReviewItemSchema>;

export const proposalReviewOutputSchema = z.object({
  reviews: z.array(proposalReviewItemSchema),
  summary: z.string(),
});
export type ProposalReviewOutput = z.infer<typeof proposalReviewOutputSchema>;

export const proposalReviewMetaSchema = z.object({
  decision: proposalReviewDecisionSchema,
  confidence: proposalReviewConfidenceSchema,
  risk: proposalReviewRiskSchema,
  autoApply: z.boolean(),
  rationale: z.string(),
  conflicts: z.array(z.string()).optional(),
  applied: z.boolean().optional(),
  applyError: z.string().optional(),
});
export type ProposalReviewMeta = z.infer<typeof proposalReviewMetaSchema>;

export const improvementProposalStatusSchema = z.enum([
  "draft",
  "approved",
  "rejected",
  "applied",
]);
export type ImprovementProposalStatus = z.infer<
  typeof improvementProposalStatusSchema
>;

export const improvementTargetKindSchema = z.enum([
  "cursor_rule",
  "cursor_skill",
  "agent",
  "skill",
  "command",
  "workflow_patch",
]);
export type ImprovementTargetKind = z.infer<typeof improvementTargetKindSchema>;

export const ingestBundleContextSchema = z.object({
  retro: z.string().optional(),
  commitSubject: z.string().optional(),
  transcriptExcerpt: z.string().optional(),
  taskTitle: z.string().optional(),
  diffTruncated: z.boolean().optional(),
  evalSource: z.enum(["fixture", "local-claude"]).optional(),
  evalRunId: z.string().uuid().optional(),
  evalError: z.string().optional(),
  reviewRunId: z.string().uuid().optional(),
  reviewError: z.string().optional(),
  reviewSummary: z.string().optional(),
  skipReviewReason: z.string().optional(),
  proposalReviews: z.record(z.string(), proposalReviewMetaSchema).optional(),
});
export type IngestBundleContext = z.infer<typeof ingestBundleContextSchema>;

export const ingestBundleSchema = z.object({
  id,
  projectId: id,
  notionTaskUrl: z.string().nullable(),
  gitRef: z.string().min(1),
  diffSummary: z.string(),
  contextJson: ingestBundleContextSchema,
  status: ingestBundleStatusSchema,
  createdAt: ts,
});
export type IngestBundle = z.infer<typeof ingestBundleSchema>;

export const improvementProposalSchema = z.object({
  id,
  ingestId: id,
  runId: id.nullable(),
  targetKind: improvementTargetKindSchema,
  targetPath: z.string().min(1),
  rationale: z.string(),
  content: z.string(),
  status: improvementProposalStatusSchema,
  appliedCommit: z.string().nullable(),
  createdAt: ts,
});
export type ImprovementProposal = z.infer<typeof improvementProposalSchema>;

export const feedbackIngestRequestSchema = z.object({
  projectId: id,
  gitRef: z.string().min(1),
  notionTaskUrl: z.string().optional(),
  retro: z.string().optional(),
  transcriptPath: z.string().optional(),
  maxDiffBytes: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024)
    .optional(),
  /** 기본 local-claude. 검증·CI는 fixture. */
  evalSource: z.enum(["fixture", "local-claude"]).default("local-claude"),
});
export type FeedbackIngestRequest = z.infer<typeof feedbackIngestRequestSchema>;

export const ingestBundleDetailSchema = ingestBundleSchema.extend({
  proposals: z.array(improvementProposalSchema),
});
export type IngestBundleDetail = z.infer<typeof ingestBundleDetailSchema>;

export const feedbackApplyRequestSchema = z.object({
  confirm: z.literal(true),
});
export type FeedbackApplyRequest = z.infer<typeof feedbackApplyRequestSchema>;

export const cursorHarnessSyncResultSchema = z.object({
  dryRun: z.boolean(),
  written: z.array(z.string()),
  commit: z.string().nullable(),
  staleDerivedRules: z.array(z.string()),
  skippedReason: z.string().optional(),
});
export type CursorHarnessSyncResult = z.infer<
  typeof cursorHarnessSyncResultSchema
>;

export const feedbackProposalApplyResponseSchema = z.object({
  proposal: improvementProposalSchema,
  appliedCommit: z.string(),
  cursorHarnessSync: cursorHarnessSyncResultSchema.nullable().optional(),
});
export type FeedbackProposalApplyResponse = z.infer<
  typeof feedbackProposalApplyResponseSchema
>;

export const ingestBundleListItemSchema = z.object({
  id,
  projectId: id,
  notionTaskUrl: z.string().nullable(),
  gitRef: z.string(),
  status: ingestBundleStatusSchema,
  createdAt: ts,
  draftProposalCount: z.number().int().nonnegative(),
  approvedProposalCount: z.number().int().nonnegative().optional(),
  appliedProposalCount: z.number().int().nonnegative().optional(),
  commitSubject: z.string().nullable().optional(),
  retroPreview: z.string().nullable().optional(),
  evalRunId: id.nullable().optional(),
  reviewRunId: id.nullable().optional(),
});
export type IngestBundleListItem = z.infer<typeof ingestBundleListItemSchema>;

export const ingestBundleListResponseSchema = z.object({
  ingests: z.array(ingestBundleListItemSchema),
});
export type IngestBundleListResponse = z.infer<
  typeof ingestBundleListResponseSchema
>;

// 자산 사용량 — 로컬 Claude Code transcript 스캔 기반 (T3).
export const assetUsageSchema = z.object({
  kind: z.string(),
  name: z.string(),
  // transcript 로 사용량 추적 가능한 종류인가 (agent·skill). command·cursor_*는 false.
  supported: z.boolean(),
  // 이 프로젝트(clonePath) 안에서의 호출.
  inProjectCount: z.number().int(),
  inProjectLastUsed: z.string().nullable(),
  // 모든 프로젝트 합산.
  totalCount: z.number().int(),
  totalLastUsed: z.string().nullable(),
  totalProjectCount: z.number().int(),
  // supported 자산이 전체 0회 — 만들고 한 번도 안 씀.
  neverUsed: z.boolean(),
});
export type AssetUsage = z.infer<typeof assetUsageSchema>;

export const projectUsageReportSchema = z.object({
  projectId: id,
  projectName: z.string(),
  clonePath: z.string(),
  scannedSessions: z.number().int(),
  assets: z.array(assetUsageSchema),
  // 호출됐지만 이 프로젝트의 정의된 자산이 아닌 것 (빌트인·타 프로젝트 자산).
  unmatchedUsage: z.array(
    z.object({
      kind: z.enum(["agent", "skill"]),
      name: z.string(),
      count: z.number().int(),
      lastUsed: z.string().nullable(),
    }),
  ),
});
export type ProjectUsageReport = z.infer<typeof projectUsageReportSchema>;
