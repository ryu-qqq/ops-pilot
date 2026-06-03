import { existsSync } from "node:fs";
import { listProjects } from "../project/repository.js";
import { isOpsPilotHarnessSubject } from "./commit-format.js";
import { listRecentCommits } from "./diff.js";
import type { FeedbackEvalSource } from "./eval-queue.js";
import { getIngestedGitRefs } from "./repository.js";
import { ingestFeedback } from "./service.js";

// ADR 0004: 자동 ingest 플라이휠 — 등록 프로젝트 clone 의 git log 와 ingest_bundle 차집합으로
// "미ingest 신규 커밋"을 탐지해 ingestFeedback(trigger:'auto') 을 재사용한다(2A 주기 스캔 / 2E 커밋 단위).
//
// 안전장치:
//   - off-by-default: 호출하는 plugin 이 OPS_AUTO_INGEST==='1' 일 때만 부팅·interval 실행(여기 함수 자체는 게이트 없음 — 검증용 직접 호출 가능).
//   - 자가 루프 차단(§6.4): OpsPilot apply 커밋(ops(...))은 후보에서 제외 → apply→ops()커밋→자동ingest→eval→… 무한루프 방지.
//   - merge 제외: listRecentCommits 가 --no-merges.
//   - WINDOW: 최근 N개 커밋만(전체 history 미훑음·즉시성 포기, ADR 0001 결정3 상속).
//   - BATCH(3B): 이번 스캔에서 트리거할 총 ingest 수 상한(전 프로젝트 합산) → eval run 폭주 차단.

const DEFAULT_WINDOW = 20;
const DEFAULT_BATCH = 3;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function evalSource(): FeedbackEvalSource {
  // 기본 local-claude(실 플라이휠). 'fixture' 면 토큰 0(검증용).
  return process.env.OPS_AUTO_INGEST_EVAL_SOURCE === "fixture" ? "fixture" : "local-claude";
}

export interface AutoIngestScanResult {
  scannedProjects: number;
  candidates: number;
  triggered: number;
  skipped: number;
  errors: { projectId: string; gitRef: string; message: string }[];
}

export interface AutoIngestScanOptions {
  window?: number;
  batch?: number;
}

export function runAutoIngestScan(opts: AutoIngestScanOptions = {}): AutoIngestScanResult {
  const window = opts.window ?? envInt("OPS_AUTO_INGEST_WINDOW", DEFAULT_WINDOW);
  const batch = opts.batch ?? envInt("OPS_AUTO_INGEST_BATCH", DEFAULT_BATCH);
  const source = evalSource();

  const result: AutoIngestScanResult = {
    scannedProjects: 0,
    candidates: 0,
    triggered: 0,
    skipped: 0,
    errors: [],
  };

  for (const project of listProjects()) {
    if (!project.clonePath || !existsSync(project.clonePath)) continue;
    result.scannedProjects += 1;

    const recent = listRecentCommits(
      project.clonePath,
      window,
      project.defaultBranch ?? undefined,
    );
    const ingested = new Set(getIngestedGitRefs(project.id));

    // 차집합: 미ingest + 자가 루프(ops(...)) 제외. 오래된→최신 순으로 시간순 ingest.
    const candidates = recent
      .filter((c) => !ingested.has(c.sha) && !isOpsPilotHarnessSubject(c.subject))
      .reverse();
    result.candidates += candidates.length;

    for (const commit of candidates) {
      // BATCH cap(전 프로젝트 합산) 도달 시 즉시 중단.
      if (result.triggered >= batch) return result;
      try {
        ingestFeedback({
          projectId: project.id,
          gitRef: commit.sha,
          evalSource: source,
          trigger: "auto",
        });
        result.triggered += 1;
      } catch (e) {
        // 잡 커밋 subject 검증 실패(InvalidCommitSubject) 등은 정상 skip.
        result.skipped += 1;
        result.errors.push({
          projectId: project.id,
          gitRef: commit.sha,
          message: (e as Error).message,
        });
      }
    }
  }

  return result;
}
