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

// 카드 B: 자산 출처 — agent-crew 공통(crew) vs 프로젝트 전용(project-local).
// 판정 원천 = agent-crew.lock 의 syncedFiles manifest 멤버십(scanner 태깅).
// unknown = lock 은 있으나 manifest 미기록(legacy sync) — 추측 금지, re-sync 로 채워진다.
export const assetSourceSchema = z.enum(["crew", "project-local", "unknown"]);
export type AssetSource = z.infer<typeof assetSourceSchema>;

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

// ADR 0003 (D1): 평가 "설계" 산출이 어느 프롬프트 경로로 만들어졌는가 —
// "asset"=agent-crew 자산 본문 주입(ADR 0002 1B), "baked"=fallback(4B).
// 설계 산출물(scenario)에 붙어 → 그 산출로 만든 run 으로 상속 → source 별 A/B 집계.
export const designSourceSchema = z.enum(["asset", "baked"]);
export type DesignSource = z.infer<typeof designSourceSchema>;

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
  source: assetSourceSchema,
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
  // ADR 0003 (D1): 이 시나리오 초안이 어느 설계 경로로 만들어졌는가(asset|baked).
  // suggest 산출에서 채워지고, 수동 작성 시나리오는 null. run 으로 상속된다.
  source: designSourceSchema.nullable(),
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
  // ADR 0003 (D1): 이 run 을 만든 설계 산출(scenario)의 source 를 상속(asset|baked).
  // source 별 다운스트림 A/B 집계의 단일 진실. scenario.source 가 null 이면 null.
  source: designSourceSchema.nullable(),
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

// ADR 0003 (C3): source 별 다운스트림 분포 — 전체 집계와 같은 신호를 source 단위로.
export const benchmarkBySourceEntrySchema = z.object({
  count: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1),
  assertion: numericStatsSchema
    .extend({ passN: z.number().int().nonnegative() })
    .nullable(),
  judge: numericStatsSchema.nullable(),
});
export type BenchmarkBySourceEntry = z.infer<typeof benchmarkBySourceEntrySchema>;

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
  // ADR 0003 (C3·D1): source(asset|baked) 별 분포. source 가 기록된 run 이 하나도
  // 없으면 null. 있으면 해당 source 키만 채워진다(§6.4 — 단순 가산 아닌 source 별 분리).
  bySource: z
    .object({
      asset: benchmarkBySourceEntrySchema.optional(),
      baked: benchmarkBySourceEntrySchema.optional(),
    })
    .nullable(),
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
  // 카드 B: 자산 출처 — crew(공통) / project-local(전용) / unknown(legacy lock).
  // prune 안전판단: "0회지만 공용" vs "정말 미사용"을 데이터로 가른다.
  source: assetSourceSchema,
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

// 전역 사용량 랭킹 (리더보드) — days=N 이면 최근 N일.
// 개요 재설계(스파크라인·프로젝트 점): days 토글과 무관한 고정 윈도우 시계열을 함께 싣는다.
export const usageRankRowSchema = z.object({
  name: z.string(),
  // 선택 days(7/30, 미지정=전체) 윈도우 내 호출수. 랭킹 정렬 기준.
  count: z.number().int(),
  lastUsed: z.string().nullable(),
  projectCount: z.number().int(),
  // 자산별 스파크라인 — 최근 14일 일별 호출수(과거→현재, 빈 날 0). 길이 14 고정.
  spark: z.array(z.number().int()),
  // 자산별 cwd 분포 상위 5개(프로젝트 점). cwd=절대경로(프론트가 basename 표시).
  cwds: z.array(z.object({ cwd: z.string(), count: z.number().int() })),
});
export type UsageRankRow = z.infer<typeof usageRankRowSchema>;

export const usageGlobalSchema = z.object({
  scannedSessions: z.number().int(),
  days: z.number().int().nullable(),
  agents: z.array(usageRankRowSchema),
  skills: z.array(usageRankRowSchema),
  // 전역 활동 잔디 — 모든 자산 byDay 합산 최근 84일 일별 총량(과거→현재, 빈 날 0).
  activity: z.array(z.object({ date: z.string(), count: z.number().int() })),
});
export type UsageGlobal = z.infer<typeof usageGlobalSchema>;

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

// ADR-0001 작업 기반 자동 평가 — transcript 무상 신호(reference signal).
// ⚠️ 이 지표는 "품질 점수"가 아니라 "참고 신호(reference signal)"다.
// 정정 왕복이 많다고 자산이 나쁜 게 아니다 — 작업 난도·탐색·사용자 변심이 혼란변수.
// 단위 = 세션(JSONL 1파일 = sessionId). 트리거 = 주기/수동 전수 스캔(멱등 upsert).

// 프로젝트의 자산별 작업 지표 집계 응답.
export const projectWorkMetricRowSchema = z.object({
  kind: z.enum(["agent", "skill"]),
  name: z.string(),
  // 이 프로젝트(clonePath) 안에서 이 자산이 발화된 세션 수.
  sessionCount: z.number().int().nonnegative(),
  // 세션 합산 발화 횟수.
  totalInvocations: z.number().int().nonnegative(),
  // 세션 합산 정정 왕복 — ⚠️ reference signal(품질 점수 아님).
  // 좁힌 정의: 자산 발화마다 "발화 직후 사용자가 처음 끼어든 타이핑 1회"만 그 발화의
  // 정정으로 센다(발화별 0/1, corr ≤ invocationCount). tool_result·system-reminder 등
  // 자동 주입 메시지는 배제 (ADR-0001 §정정왕복 경계).
  totalCorrectionRoundtrips: z.number().int().nonnegative(),
  // 발화당 평균 정정 왕복 (참고용). 발화 0이면 null.
  avgCorrectionRoundtrips: z.number().nullable(),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
});
export type ProjectWorkMetricRow = z.infer<typeof projectWorkMetricRowSchema>;

export const projectWorkMetricReportSchema = z.object({
  // ⚠️ 응답 전체가 reference signal — UI 라벨로 "품질 점수" 오독 방지 (ADR-0001).
  signalType: z.literal("reference"),
  signalNote: z.string(),
  projectId: id,
  projectName: z.string(),
  clonePath: z.string(),
  // 마지막 전수 스캔으로 저장된 세션×자산 row 수(이 프로젝트 한정).
  metricCount: z.number().int().nonnegative(),
  assets: z.array(projectWorkMetricRowSchema),
});
export type ProjectWorkMetricReport = z.infer<
  typeof projectWorkMetricReportSchema
>;

// 수동 전수 스캔 트리거 결과 (멱등 upsert).
export const workMetricScanResultSchema = z.object({
  scannedSessions: z.number().int().nonnegative(),
  // upsert 된 (sessionId, assetKey) row 수.
  upsertedMetrics: z.number().int().nonnegative(),
  scannedAt: ts,
});
export type WorkMetricScanResult = z.infer<typeof workMetricScanResultSchema>;

// 트리거 정확도 평가 — description 이 켜져야 할 때 켜지고 아닐 때 안 켜지나 (T4, skill-creator 차용).
export const triggerQueryResultSchema = z.object({
  query: z.string(),
  // true=should-trigger(켜져야 함), false=should-NOT(안 켜져야 함, near-miss).
  shouldTrigger: z.boolean(),
  runs: z.number().int(),
  triggered: z.number().int(),
  triggerRate: z.number(),
  // 의도대로 동작했는가 (should-trigger면 rate≥0.5, should-NOT면 rate<0.5).
  pass: z.boolean(),
  firstTools: z.array(z.string()),
});
export type TriggerQueryResult = z.infer<typeof triggerQueryResultSchema>;

export const triggerEvalResultSchema = z.object({
  assetId: z.string(),
  kind: z.enum(["agent", "skill"]),
  name: z.string(),
  runsPerQuery: z.number().int(),
  // should-trigger 쿼리 평균 발화율 — 높을수록 좋음.
  positiveRate: z.number(),
  // should-NOT 쿼리 평균 발화율 — 낮을수록 좋음. should-NOT 없으면 null.
  negativeFireRate: z.number().nullable(),
  // pass 비율 (positive·negative 통합 정확도).
  accuracy: z.number(),
  queries: z.array(triggerQueryResultSchema),
});
export type TriggerEvalResult = z.infer<typeof triggerEvalResultSchema>;

export const triggerSuggestResponseSchema = z.object({
  // should-trigger(켜져야 함) / should-NOT(near-miss, 안 켜져야 함) 쿼리.
  positives: z.array(z.string()),
  negatives: z.array(z.string()),
});
export type TriggerSuggestResponse = z.infer<
  typeof triggerSuggestResponseSchema
>;

// description 자동개선 루프 결과 (T4-b). 실패 케이스로 description 후보를 만들어
// train/test 로 재측정, test 정확도 최댓값을 best 로 고른다. 제안만(자동커밋 X).
export const improveIterationSchema = z.object({
  iteration: z.number().int(),
  description: z.string(),
  trainAccuracy: z.number(),
  testAccuracy: z.number(),
});
export type ImproveIteration = z.infer<typeof improveIterationSchema>;

export const improveResultSchema = z.object({
  assetId: z.string(),
  kind: z.enum(["agent", "skill"]),
  name: z.string(),
  runsPerQuery: z.number().int(),
  trainCount: z.number().int(),
  testCount: z.number().int(),
  originalDescription: z.string(),
  bestDescription: z.string(),
  bestTestAccuracy: z.number(),
  // best 가 원본과 다른가 (개선안이 나왔나).
  improved: z.boolean(),
  iterations: z.array(improveIterationSchema),
});
export type ImproveResult = z.infer<typeof improveResultSchema>;

// frontmatter 검증 게이트 (T4-c) — Claude Code frontmatter 규칙 + 트리거 관점 lint.
export const lintIssueSchema = z.object({
  severity: z.enum(["error", "warning"]),
  field: z.string(),
  message: z.string(),
});
export type LintIssue = z.infer<typeof lintIssueSchema>;

export const assetLintResultSchema = z.object({
  ok: z.boolean(), // error 0 건
  issues: z.array(lintIssueSchema),
});
export type AssetLintResult = z.infer<typeof assetLintResultSchema>;

// 프로젝트 전 자산 배치 lint (자산 헬스 대시보드용 — claude 없이 동기).
export const projectAssetLintSchema = z.object({
  items: z.array(
    z.object({
      assetId: id,
      kind: assetKindSchema,
      name: z.string(),
      ok: z.boolean(),
      errorCount: z.number().int(),
      warningCount: z.number().int(),
    }),
  ),
});
export type ProjectAssetLint = z.infer<typeof projectAssetLintSchema>;

// 자산 관계(참조) 그래프 — "이 스킬이 어떤 에이전트를 호출하나" / "이 에이전트가 고아인가".
// 휴리스틱: 자산 본문에 같은 프로젝트의 다른 등록 자산 name 이 단어경계 정확일치로 등장하면 edge.
// 본문 언급 ≠ 실제 호출 보장 → "참조(reference)" 로만 라벨. 짧은 이름은 false positive 가능(repository 주석 참조).
const assetRefSchema = z.object({
  kind: assetKindSchema,
  name: z.string(),
});

export const assetGraphSchema = z.object({
  items: z.array(
    z.object({
      kind: assetKindSchema,
      name: z.string(),
      references: z.array(assetRefSchema), // 내가 본문에서 부르는 자산
      referencedBy: z.array(assetRefSchema), // 나를 본문에서 부르는 자산(역방향)
    }),
  ),
});
export type AssetGraph = z.infer<typeof assetGraphSchema>;
