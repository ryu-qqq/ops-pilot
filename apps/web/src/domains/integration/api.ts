import { z } from "zod";
import {
  jiraIssueDetailSchema,
  jiraIssueSummarySchema,
  notionPageDetailSchema,
  notionPageSummarySchema,
  type JiraIssueDetail,
  type JiraIssueSummary,
  type NotionPageDetail,
  type NotionPageSummary,
} from "@opspilot/shared-types";
import { apiGet } from "../../lib/api-client";

// OPSP-43: 지라/노션 → 시나리오 import.

// Query Key Factory (CONVENTIONS.md 2).
export const integrationKeys = {
  all: ["integrations"] as const,
  jiraIssues: (projectKey: string) =>
    [...integrationKeys.all, "jira-issues", projectKey] as const,
  notionPages: (query: string) => [...integrationKeys.all, "notion-pages", query] as const,
};

const jiraIssuesResponse = z.object({ issues: z.array(jiraIssueSummarySchema) });
const notionPagesResponse = z.object({ pages: z.array(notionPageSummarySchema) });

export async function getJiraIssues(projectKey: string): Promise<JiraIssueSummary[]> {
  const res = await apiGet(
    `/api/integrations/jira/issues?projectKey=${encodeURIComponent(projectKey)}`,
    jiraIssuesResponse,
  );
  return res.issues;
}

export async function getJiraIssue(key: string): Promise<JiraIssueDetail> {
  return apiGet(`/api/integrations/jira/issues/${encodeURIComponent(key)}`, jiraIssueDetailSchema);
}

export async function getNotionPages(query: string): Promise<NotionPageSummary[]> {
  const res = await apiGet(
    `/api/integrations/notion/pages?query=${encodeURIComponent(query)}`,
    notionPagesResponse,
  );
  return res.pages;
}

export async function getNotionPage(id: string): Promise<NotionPageDetail> {
  return apiGet(`/api/integrations/notion/pages/${encodeURIComponent(id)}`, notionPageDetailSchema);
}
