import type { Project } from "@opspilot/shared-types";
import { listAssets } from "../registry/repository.js";
import {
  scanTranscriptUsage,
  type UsageScanResult,
  type UsageStat,
} from "./scan-usage.js";

// transcript 사용량을 OpsPilot 에 정의된 자산과 조인한다.
// "정의됐는데 0회"(neverUsed) 와 "이 프로젝트 안 사용 vs 전체 사용"을 구분해
// prune 판단(만들고 안 쓰는 자산)을 돕는다.

/** 스킬·에이전트만 transcript 로 추적 가능. command·cursor_* 는 아직 출처 없음. */
function isSupported(kind: string): boolean {
  return kind === "agent" || kind === "skill";
}

function statFor(
  scan: UsageScanResult,
  kind: string,
  name: string,
): UsageStat | null {
  const table =
    kind === "agent" ? scan.agents : kind === "skill" ? scan.skills : null;
  if (!table) return null;
  if (table[name]) return table[name];
  // 플러그인 네임스페이스(plugin:name) — suffix 매칭으로 보강.
  const hit = Object.entries(table).find(
    ([key]) => key.split(":").pop() === name,
  );
  return hit ? hit[1] : null;
}

export interface AssetUsage {
  kind: string;
  name: string;
  /** transcript 로 사용량 추적이 가능한 종류인가 (agent·skill). */
  supported: boolean;
  /** 이 프로젝트(clonePath) 안에서의 호출. */
  inProjectCount: number;
  inProjectLastUsed: string | null;
  /** 모든 프로젝트 합산. */
  totalCount: number;
  totalLastUsed: string | null;
  totalProjectCount: number;
  /** supported 자산이 전체에서 0회 — 만들고 한 번도 안 씀. */
  neverUsed: boolean;
}

export interface ProjectUsageReport {
  projectId: string;
  projectName: string;
  clonePath: string;
  scannedSessions: number;
  assets: AssetUsage[];
  /** 호출은 됐지만 이 프로젝트의 정의된 자산이 아닌 것 (빌트인·타 프로젝트 자산). */
  unmatchedUsage: {
    kind: "agent" | "skill";
    name: string;
    count: number;
    lastUsed: string | null;
  }[];
}

export function assetUsageForProject(project: Project): ProjectUsageReport {
  const scan = scanTranscriptUsage();
  const assets = listAssets(project.id);
  const clone = project.clonePath.replace(/\/$/, "");

  const matchedNames = new Set<string>();
  const usages: AssetUsage[] = assets.map((a) => {
    const stat = statFor(scan, a.kind, a.name);
    const supported = isSupported(a.kind);
    if (stat) matchedNames.add(`${a.kind}:${a.name}`);
    const inProject = stat
      ? Object.entries(stat.byCwd)
          .filter(([cwd]) => cwd === clone || cwd.startsWith(`${clone}/`))
          .reduce(
            (acc, [, v]) => ({
              count: acc.count + v.count,
              lastUsed:
                !acc.lastUsed || (v.lastUsed && v.lastUsed > acc.lastUsed)
                  ? v.lastUsed
                  : acc.lastUsed,
            }),
            { count: 0, lastUsed: null as string | null },
          )
      : { count: 0, lastUsed: null };
    return {
      kind: a.kind,
      name: a.name,
      supported,
      inProjectCount: inProject.count,
      inProjectLastUsed: inProject.lastUsed,
      totalCount: stat?.count ?? 0,
      totalLastUsed: stat?.lastUsed ?? null,
      totalProjectCount: stat ? Object.keys(stat.byCwd).length : 0,
      neverUsed: supported && (stat?.count ?? 0) === 0,
    };
  });

  const unmatchedUsage: ProjectUsageReport["unmatchedUsage"] = [];
  for (const [kind, table] of [
    ["agent", scan.agents],
    ["skill", scan.skills],
  ] as const) {
    for (const [name, stat] of Object.entries(table)) {
      if (matchedNames.has(`${kind}:${name}`)) continue;
      // 이 프로젝트에서 실제로 호출된 것만 — 다른 프로젝트 전용 자산까지 다 끌어오지 않음.
      const inClone = Object.keys(stat.byCwd).some(
        (cwd) => cwd === clone || cwd.startsWith(`${clone}/`),
      );
      if (inClone)
        unmatchedUsage.push({
          kind,
          name,
          count: stat.count,
          lastUsed: stat.lastUsed,
        });
    }
  }
  unmatchedUsage.sort((a, b) => b.count - a.count);

  return {
    projectId: project.id,
    projectName: project.name,
    clonePath: project.clonePath,
    scannedSessions: scan.scannedSessions,
    assets: usages,
    unmatchedUsage,
  };
}

export { scanTranscriptUsage };
