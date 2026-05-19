import { z } from "zod";
import { projectSchema } from "@opspilot/shared-types";
import { apiGet, apiPost } from "../../lib/api-client";

const projectsResponse = z.object({ projects: z.array(projectSchema) });
const scanResponse = z.object({
  scannedAssets: z.number(),
  scannedVersions: z.number(),
  saved: z.object({ assets: z.number(), versions: z.number() }),
});
export type ScanResult = z.infer<typeof scanResponse>;

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
};

export async function getProjects() {
  return (await apiGet("/api/projects", projectsResponse)).projects;
}

export async function createProject(gitUrl: string) {
  return apiPost("/api/projects", { gitUrl }, projectSchema);
}

export async function scanProject(projectId: string) {
  return apiPost(`/api/projects/${projectId}/scan`, {}, scanResponse);
}
