// OPSP-18: MCP 어댑터 — OpsPilot 데이몬을 Claude Code 세션의 MCP 툴로 노출.
// REST 라우트(routes/api/*)와 같은 domains 함수를 재사용 (비즈니스 로직 중복 X).
// 노출 툴: scan_project / list_projects / list_assets / list_scenarios /
//          start_run / get_run / compare_runs /
//          ingest_cursor_session / list_proposals / apply_proposal.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { mcpLog } from "./log.js";
import {
  getProject,
  listProjects as repoListProjects,
} from "../domains/project/repository.js";
import { pullProject } from "../domains/project/service.js";
import {
  getAsset,
  listAssets as repoListAssets,
  listVersions,
  saveScan,
} from "../domains/registry/repository.js";
import { scanRepo } from "../domains/registry/scanner.js";
import { RunInputError, startRun } from "../domains/run/service.js";
import {
  DEMO_FIXTURE,
  fixtureSource,
  localClaudeSource,
} from "../domains/run/source.js";
import {
  getRun,
  listLastAssistantTexts,
  listRunDiffCounts,
  listRunScenarioNames,
  listTrace,
} from "../domains/run/repository.js";
import { listScoresForRuns } from "../domains/score/repository.js";
import { listScenariosByAsset } from "../domains/scenario/repository.js";
import {
  FeedbackIngestError,
  getIngestDetail,
  ingestFeedback,
} from "../domains/feedback/service.js";
import {
  FeedbackProposalError,
  applyProposalHitl,
  listProposalsForIngest,
} from "../domains/feedback/proposal-service.js";

const MCP_SERVER_VERSION = "0.1.0";

interface ToolContent {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

function jsonResult(data: unknown): ToolContent {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): ToolContent {
  return { isError: true, content: [{ type: "text", text: message }] };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "opspilot", version: MCP_SERVER_VERSION });

  // 1) scan_project — clone pull + .claude 스캔 + DB 적재. 멱등.
  server.tool(
    "scan_project",
    "프로젝트 클론을 pull → .claude 디렉터리를 스캔 → asset/asset_version DB에 적재합니다(멱등). projectId 는 list_projects 로 조회.",
    { projectId: z.string().uuid().describe("프로젝트 UUID — list_projects 의 id") },
    ({ projectId }) => {
      mcpLog.mcp("scan_project");
      const project = getProject(projectId);
      if (!project) return errorResult(`project not found: ${projectId}`);
      pullProject(project.clonePath);
      let scanned;
      try {
        scanned = scanRepo(project.clonePath);
      } catch (e) {
        return errorResult(`scan failed: ${(e as Error).message}`);
      }
      const saved = saveScan(project.id, scanned);
      mcpLog.scan(project.name, saved.assets, saved.versions);
      return jsonResult({
        project: { id: project.id, name: project.name },
        scannedAssets: scanned.length,
        scannedVersions: scanned.reduce((n, a) => n + a.versions.length, 0),
        saved,
      });
    },
  );

  // 2) list_projects — 등록된 git URL 클론 프로젝트 전체.
  server.tool(
    "list_projects",
    "OpsPilot 에 등록된 모든 프로젝트(git URL 기반 클론) 목록.",
    {},
    () => jsonResult({ projects: repoListProjects() }),
  );

  // 3) list_assets — 프로젝트의 자산 목록 + 각 자산의 최근 버전 5개.
  server.tool(
    "list_assets",
    "프로젝트의 자산(agent/skill/command) 목록과 각 자산의 최근 버전 5개. 시나리오는 list_scenarios 로 별도 조회.",
    { projectId: z.string().uuid() },
    ({ projectId }) => {
      const project = getProject(projectId);
      if (!project) return errorResult(`project not found: ${projectId}`);
      const assets = repoListAssets(projectId).map((a) => ({
        ...a,
        recentVersions: listVersions(a.id).slice(0, 5),
      }));
      return jsonResult({ project: { id: project.id, name: project.name }, assets });
    },
  );

  // 4) list_scenarios — 한 자산에 묶인 시나리오 목록.
  server.tool(
    "list_scenarios",
    "한 자산(assetId)에 묶인 시나리오 목록. 각 행에 input/expectation/definitionHash. start_run 에 쓸 scenarioId 조회용.",
    { assetId: z.string().uuid() },
    ({ assetId }) => {
      const asset = getAsset(assetId);
      if (!asset) return errorResult(`asset not found: ${assetId}`);
      const scenarios = listScenariosByAsset(assetId);
      return jsonResult({ asset: { id: asset.id, name: asset.name, kind: asset.kind }, scenarios });
    },
  );

  // 5) start_run — asset_version × scenario 비동기 실행. runId 즉시 반환.
  server.tool(
    "start_run",
    "asset_version × scenario 로 실행을 시작합니다(비동기). runId 즉시 반환 — trace 는 get_run 으로 폴링. source=local-claude 는 실 Claude CLI 호출(토큰 소모), fixture 는 결정론 데모.",
    {
      assetVersionId: z
        .string()
        .uuid()
        .describe("asset_version UUID — list_assets 응답의 recentVersions[].id"),
      scenarioId: z.string().uuid(),
      source: z
        .enum(["fixture", "local-claude"])
        .default("local-claude")
        .describe("fixture=결정론 토큰0(검증/데모), local-claude=실 Claude CLI 실행(실 토큰)"),
    },
    ({ assetVersionId, scenarioId, source }) => {
      mcpLog.mcp("start_run");
      try {
        const run = startRun({
          assetVersionId,
          scenarioId,
          source: source === "fixture" ? fixtureSource(DEMO_FIXTURE) : localClaudeSource(),
        });
        return jsonResult({
          runId: run.id,
          status: run.status,
          startedAt: run.startedAt,
          hint: "이후 get_run({ runId, includeTrace:true }) 으로 진행 상태와 트레이스 폴링하세요.",
        });
      } catch (e) {
        if (e instanceof RunInputError) return errorResult(`bad input: ${e.message}`);
        return errorResult(`start failed: ${(e as Error).message}`);
      }
    },
  );

  // 6) get_run — run 상세 + 옵션으로 trace.
  server.tool(
    "get_run",
    "run 상세(상태·토큰·비용·회고)와 옵션으로 trace 이벤트 목록. includeTrace=true 면 trace 동봉(큰 trace 는 응답 길어짐).",
    {
      runId: z.string().uuid(),
      includeTrace: z
        .boolean()
        .default(false)
        .describe("true 면 trace_event 목록을 전부 동봉. 진행 중 run 의 trace 길이는 가변."),
    },
    ({ runId, includeTrace }) => {
      const run = getRun(runId);
      if (!run) return errorResult(`run not found: ${runId}`);
      const payload: Record<string, unknown> = { run };
      if (includeTrace) payload.trace = listTrace(runId);
      return jsonResult(payload);
    },
  );

  // 7) compare_runs — N개 run 의 매트릭스 비교. routes/api/runs.ts /runs/compare 로직 그대로.
  server.tool(
    "compare_runs",
    "여러 run(1~10개)을 매트릭스로 비교 — 각 run 의 상태/토큰/비용/diff 파일수/마지막 assistant 텍스트/assertion·judge·human 점수.",
    { runIds: z.array(z.string().uuid()).min(1).max(10) },
    ({ runIds }) => {
      const runs = runIds
        .map((id) => getRun(id))
        .filter((r): r is NonNullable<typeof r> => r !== undefined);
      if (runs.length === 0) return errorResult("none of runIds found");
      const ids = runs.map((r) => r.id);
      const diffCounts = listRunDiffCounts(ids);
      const lastTexts = listLastAssistantTexts(ids);
      const scoresByRun = listScoresForRuns(ids);
      const scenarioNames = listRunScenarioNames(ids);
      const pickLatest = (runId: string, scorer: "assertion" | "llm_judge" | "human") => {
        const list = (scoresByRun[runId] ?? []).filter((s) => s.scorer === scorer);
        return list.length === 0 ? null : (list[list.length - 1] ?? null);
      };
      return jsonResult({
        items: runs.map((run) => ({
          run,
          scenarioName: scenarioNames[run.id] ?? "(unknown)",
          diffFileCount: diffCounts[run.id] ?? 0,
          lastAssistantText: lastTexts[run.id] ?? null,
          assertionScore: pickLatest(run.id, "assertion"),
          judgeScore: pickLatest(run.id, "llm_judge"),
          humanScore: pickLatest(run.id, "human"),
        })),
      });
    },
  );

  // 8) ingest_cursor_session — Cursor 작업 ingest + eval run 큐 (= POST /api/feedback/ingest).
  server.tool(
    "ingest_cursor_session",
    "Cursor 작업 단위를 ingest(git diff + 메타)하고 work-evaluator eval run을 큐합니다. ingestId·status·proposals 를 반환 — eval 완료까지 get_run 또는 list_proposals 로 폴링.",
    {
      projectId: z.string().uuid().describe("프로젝트 UUID — list_projects 의 id"),
      gitRef: z.string().min(1).describe("프로젝트 clone 기준 commit SHA"),
      notionTaskUrl: z.string().optional(),
      retro: z.string().optional().describe("사용자 회고 1~3문장"),
      transcriptPath: z.string().optional().describe("로컬 transcript 절대경로 — 발췌만 읽음"),
      maxDiffBytes: z.number().int().positive().max(1024 * 1024).optional(),
      evalSource: z
        .enum(["fixture", "local-claude"])
        .default("local-claude")
        .describe("fixture=결정론(검증), local-claude=실 Claude eval"),
    },
    (input) => {
      mcpLog.mcp("ingest_cursor_session");
      try {
        const detail = ingestFeedback(input);
        return jsonResult({
          ingestId: detail.id,
          status: detail.status,
          evalRunId: detail.contextJson.evalRunId ?? null,
          proposalCount: detail.proposals.length,
          hint: "eval 완료 후 list_proposals({ ingestId }) 로 draft 개선안 조회.",
        });
      } catch (e) {
        if (e instanceof FeedbackIngestError) return errorResult(`${e.code}: ${e.message}`);
        return errorResult(`ingest failed: ${(e as Error).message}`);
      }
    },
  );

  // 9) list_proposals — ingest별 improvement_proposal 목록 (기본 draft).
  server.tool(
    "list_proposals",
    "ingestId별 improvement_proposal 목록. status 기본 draft — eval 완료 후 apply 전 HITL 검토용.",
    {
      ingestId: z.string().uuid(),
      status: z
        .enum(["draft", "approved", "rejected", "applied", "all"])
        .default("draft")
        .describe("필터 — all 이면 전 상태"),
    },
    ({ ingestId, status }) => {
      mcpLog.mcp("list_proposals");
      try {
        const bundle = getIngestDetail(ingestId);
        if (!bundle) return errorResult(`ingest not found: ${ingestId}`);
        const listed = listProposalsForIngest(ingestId, status);
        return jsonResult({
          ingest: {
            id: bundle.id,
            status: bundle.status,
            evalRunId: bundle.contextJson.evalRunId ?? null,
            evalError: bundle.contextJson.evalError ?? null,
          },
          proposals: listed.proposals,
        });
      } catch (e) {
        if (e instanceof FeedbackProposalError) return errorResult(`${e.code}: ${e.message}`);
        return errorResult(`list failed: ${(e as Error).message}`);
      }
    },
  );

  // 10) apply_proposal — HITL apply (confirm 필수). draft 면 승인+apply, approved 면 apply만.
  server.tool(
    "apply_proposal",
    "승인된(HITL confirm=true) improvement_proposal 을 프로젝트 clone에 반영합니다. draft 상태면 confirm 으로 승인+apply. REST 와 달리 MCP 는 한 번에 처리.",
    {
      proposalId: z.string().uuid(),
      confirm: z.literal(true).describe("반드시 true — 사람 확인 게이트"),
    },
    ({ proposalId, confirm: _confirm }) => {
      mcpLog.mcp("apply_proposal");
      try {
        const result = applyProposalHitl(proposalId);
        return jsonResult(result);
      } catch (e) {
        if (e instanceof FeedbackProposalError) return errorResult(`${e.code}: ${e.message}`);
        return errorResult(`apply failed: ${(e as Error).message}`);
      }
    },
  );

  return server;
}
