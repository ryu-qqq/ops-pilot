import type { JiraIssueDetail, JiraIssueSummary } from "@opspilot/shared-types";
import { getJiraCredentials } from "../setting/repository.js";

// OPSP-43: 지라 REST API 직접 호출 (MCP 경유 안 함 — OpsPilot 서버는 MCP 호스트가 아님).
// 인증은 전역 설정(OPSP-42)의 email + apiToken 으로 Basic 인증.
// 실제 업무 이슈를 시나리오로 가져오는 게 목적 — 제목 → name, 본문(ADF) → input.

export class JiraIntegrationError extends Error {}

interface JiraContext {
  baseUrl: string;
  authHeader: string;
}

// 프로젝트 키는 JQL 에 직접 끼우므로 형식을 좁게 검증한다(injection 방지).
const PROJECT_KEY_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

function jiraContext(): JiraContext {
  const { siteUrl, email, apiToken } = getJiraCredentials();
  if (siteUrl.trim() === "" || email.trim() === "" || apiToken.trim() === "") {
    throw new JiraIntegrationError(
      "지라 인증이 설정되지 않았습니다. 헤더의 설정(톱니)에서 사이트 URL·이메일·API 토큰을 입력하세요.",
    );
  }
  // siteUrl 은 'example.atlassian.net' 또는 'https://example.atlassian.net/' 둘 다 허용 → 정규화.
  const host = siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
  return { baseUrl: `https://${host}`, authHeader };
}

async function jiraFetch(ctx: JiraContext, path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${ctx.baseUrl}${path}`, {
      headers: { Authorization: ctx.authHeader, Accept: "application/json" },
    });
  } catch (e) {
    throw new JiraIntegrationError(
      `지라 서버에 연결하지 못했습니다: ${(e as Error).message}. 사이트 URL 을 확인하세요.`,
    );
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new JiraIntegrationError("지라 인증 실패 — 설정의 이메일·API 토큰을 확인하세요.");
    }
    if (res.status === 404) {
      throw new JiraIntegrationError("지라에서 찾을 수 없습니다 — 프로젝트 키·이슈 키를 확인하세요.");
    }
    const text = await res.text().catch(() => "");
    throw new JiraIntegrationError(`지라 API 오류 (${String(res.status)}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * 지라 v3 description 은 ADF(Atlassian Document Format · JSON 트리)다.
 * 시나리오 input 으로 쓰려면 plaintext 가 필요 — 트리를 재귀로 평탄화한다.
 * 사람이 폼에서 다듬는 게 전제라 완벽 변환보다 핵심 텍스트 보존이 목표.
 */
export function adfToText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node; // 빈 값/구버전 호환 방어
  if (typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  const children = Array.isArray(n.content) ? n.content.map(adfToText).join("") : "";
  switch (n.type) {
    case "listItem":
      return `- ${children.trim()}\n`;
    case "paragraph":
    case "heading":
    case "blockquote":
    case "codeBlock":
    case "panel":
      return `${children}\n`;
    default:
      // doc·bulletList·orderedList 등 — 자식 결과를 그대로 잇는다.
      return children;
  }
}

/** 프로젝트의 최근 갱신 이슈 목록 (최대 50건, 메타만). */
export async function listJiraIssues(projectKey: string): Promise<JiraIssueSummary[]> {
  if (!PROJECT_KEY_RE.test(projectKey)) {
    throw new JiraIntegrationError(
      `프로젝트 키 형식이 올바르지 않습니다: ${projectKey} (영문으로 시작, 영숫자만).`,
    );
  }
  const ctx = jiraContext();
  const jql = encodeURIComponent(`project = "${projectKey}" ORDER BY updated DESC`);
  const data = await jiraFetch(
    ctx,
    `/rest/api/3/search/jql?jql=${jql}&fields=summary,status&maxResults=50`,
  );
  const issues = (data as { issues?: unknown[] }).issues ?? [];
  return issues.map((raw) => {
    const i = raw as { key?: string; fields?: { summary?: string; status?: { name?: string } } };
    return {
      key: i.key ?? "",
      summary: i.fields?.summary ?? "(제목 없음)",
      status: i.fields?.status?.name ?? "",
    };
  });
}

/** 이슈 1건 상세 — 제목 + 본문(ADF 평탄화). */
export async function getJiraIssue(issueKey: string): Promise<JiraIssueDetail> {
  const ctx = jiraContext();
  const data = await jiraFetch(
    ctx,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,description`,
  );
  const d = data as { key?: string; fields?: { summary?: string; description?: unknown } };
  return {
    key: d.key ?? issueKey,
    summary: d.fields?.summary ?? "(제목 없음)",
    body: adfToText(d.fields?.description).trim(),
  };
}
