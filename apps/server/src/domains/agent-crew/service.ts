import type { Project } from "@opspilot/shared-types";
import { pullProject } from "../project/service.js";
import { scanRepo } from "../registry/scanner.js";
import { saveScan } from "../registry/repository.js";
import {
  AgentCrewSyncError,
  checkAgentCrewDrift,
  syncAgentCrewToProject,
} from "./sync.js";

export { AgentCrewSyncError, checkAgentCrewDrift, readAgentCrewLock } from "./sync.js";

export interface SyncAgentCrewOptions {
  tag?: string;
  scan?: boolean;
}

export interface SyncAgentCrewResponse {
  sync: ReturnType<typeof syncAgentCrewToProject>;
  driftBefore: ReturnType<typeof checkAgentCrewDrift>;
  scan?: { scannedAssets: number; scannedVersions: number; saved: { assets: number; versions: number } };
}

export function syncAgentCrewForProject(
  project: Project,
  opts: SyncAgentCrewOptions = {},
): SyncAgentCrewResponse {
  const driftBefore = checkAgentCrewDrift(project);
  let sync;
  try {
    sync = syncAgentCrewToProject(project, opts.tag);
  } catch (e) {
    if (e instanceof AgentCrewSyncError) throw e;
    throw new AgentCrewSyncError((e as Error).message);
  }

  if (opts.scan !== true) {
    return { sync, driftBefore };
  }

  pullProject(project.clonePath);
  const scanned = scanRepo(project.clonePath);
  const saved = saveScan(project.id, scanned);
  return {
    sync,
    driftBefore,
    scan: {
      scannedAssets: scanned.length,
      scannedVersions: scanned.reduce((n, a) => n + a.versions.length, 0),
      saved,
    },
  };
}
