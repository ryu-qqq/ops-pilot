import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ImprovementTargetKind } from "@opspilot/shared-types";
import { type AgentCrewLockFile, DEFAULT_CREW_PATH } from "../agent-crew/sync.js";

/** crew 로 올라갈 수 있는 자산 종류. cursor_* · workflow_patch 는 항상 프로젝트 전용. */
const CREW_KINDS = new Set<ImprovementTargetKind>(["agent", "skill", "command"]);

/**
 * 개선안 대상이 공유 crew 자산인지 프로젝트 전용인지 판정한다 — 단일 진실.
 * 기준: targetKind 가 crew 종류이고 targetPath 가 그 프로젝트 agent-crew.lock 의
 * syncedFiles manifest 에 있으면 crew. (scanner 의 buildSourceTagger 와 같은 기준.)
 * lock 없음 / manifest 빔 = project (추측 금지).
 */
export function classifyProposalTarget(
  lock: AgentCrewLockFile | null,
  targetKind: ImprovementTargetKind,
  targetPath: string,
): "crew" | "project" {
  if (!CREW_KINDS.has(targetKind)) return "project";
  const manifest = lock?.syncedFiles;
  if (!manifest || manifest.length === 0) return "project";
  return manifest.includes(targetPath) ? "crew" : "project";
}

export interface UpstreamRequiredInfo {
  crewRepoPath: string;
  crewRelPath: string;
  crewFileExists: boolean;
  content: string;
  resyncHint: string;
}

/** crew 차단 시 안내 페이로드. crewFileExists=false 면 tag drift(manifest엔 crew인데 현 버전 부재). */
export function buildUpstreamInfo(targetPath: string, content: string): UpstreamRequiredInfo {
  const crewRepoPath = process.env.OPS_AGENT_CREW_PATH ?? DEFAULT_CREW_PATH;
  const crewRelPath = targetPath.replace(/^\.claude\//, "");
  const crewFileExists = existsSync(join(crewRepoPath, crewRelPath));
  const driftNote = crewFileExists
    ? ""
    : " (주의: manifest 엔 crew 인데 현 crew 레포엔 이 파일이 없음 — tag 확인 필요)";
  return {
    crewRepoPath,
    crewRelPath,
    crewFileExists,
    content,
    resyncHint: `${crewRepoPath} 에서 ${crewRelPath} 를 고치고 tag 올린 뒤 sync_agent_crew 로 재동기화하세요.${driftNote}`,
  };
}

/** apply 차단 신호 — "실패"가 아니라 "상류에서 처리해야 함". route/MCP 가 잡아 안내로 변환. */
export class UpstreamRequiredError extends Error {
  readonly info: UpstreamRequiredInfo;
  constructor(info: UpstreamRequiredInfo) {
    super("공유 crew 자산이라 프로젝트 clone 에 적용하지 않습니다 — agent-crew 레포에서 수정하세요.");
    this.name = "UpstreamRequiredError";
    this.info = info;
  }
}
