import { z } from "zod";
import { projectSchema } from "@opspilot/shared-types";
import { apiGet, apiPost } from "../../lib/api-client";

const projectsResponse = z.object({ projects: z.array(projectSchema) });
const scanResponse = z.object({
  scannedAssets: z.number(),
  scannedVersions: z.number(),
  saved: z.object({ assets: z.number(), versions: z.number() }),
  agentCrewDrift: z
    .object({
      drift: z.boolean(),
      lockTag: z.string().nullable(),
      lockCommit: z.string().nullable(),
      projectYamlTag: z.string().nullable(),
    })
    .optional(),
});
export type ScanResult = z.infer<typeof scanResponse>;

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
};

export async function getProjects() {
  return (await apiGet("/api/projects", projectsResponse)).projects;
}

export type CreateProjectRequest =
  | { mode: "linked"; localPath: string; gitUrl?: string; name?: string }
  | { mode: "managed"; gitUrl: string; name?: string };

export async function createProject(input: CreateProjectRequest) {
  return apiPost("/api/projects", input, projectSchema);
}

export async function scanProject(projectId: string) {
  return apiPost(`/api/projects/${projectId}/scan`, {}, scanResponse);
}

const installHooksResponse = z.object({
  settingsMerged: z.boolean(),
  scriptPath: z.string(),
  gitHookPath: z.string(),
  committed: z.string().nullable(),
});

export async function installHooks(projectId: string) {
  return apiPost(`/api/projects/${projectId}/install-hooks`, {}, installHooksResponse);
}

// 화면에 보여줄 부분만 발췌(서버 응답은 더 큼 — 나머지 키는 zod 가 무시).
const syncAgentCrewResponse = z.object({
  sync: z.object({
    tag: z.string(),
    tagSource: z.enum(["override", "project-yaml-newer", "lock"]),
    copiedDirs: z.array(z.string()),
    mustReference: z.object({ applied: z.boolean(), items: z.array(z.string()) }),
  }),
});
export type SyncAgentCrewResult = z.infer<typeof syncAgentCrewResponse>;

export async function syncAgentCrew(projectId: string) {
  return apiPost(
    `/api/projects/${projectId}/sync-agent-crew`,
    { scan: true },
    syncAgentCrewResponse,
  );
}
