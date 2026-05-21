import type { NotionPageDetail, NotionPageSummary } from "@opspilot/shared-types";
import { getNotionToken } from "../setting/repository.js";

// OPSP-43: 노션 REST API 직접 호출. 인증은 전역 설정(OPSP-42)의 Integration 토큰.
// 페이지를 시나리오로 가져온다 — 제목 → name, 블록 텍스트 → input.
// 주의: Integration 에 공유된 페이지만 검색·조회된다(노션 권한 모델).

export class NotionIntegrationError extends Error {}

const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28"; // 노션 API 는 버전 헤더가 필수.

// rich_text 를 담는 블록 타입 — 본문 평탄화 대상.
const RICH_TEXT_BLOCKS = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "quote",
  "callout",
  "code",
  "toggle",
]);
const LIST_BLOCKS = new Set(["bulleted_list_item", "numbered_list_item", "to_do"]);

function notionToken(): string {
  const token = getNotionToken();
  if (token.trim() === "") {
    throw new NotionIntegrationError(
      "노션 토큰이 설정되지 않았습니다. 헤더의 설정(톱니)에서 Integration 토큰을 입력하세요.",
    );
  }
  return token;
}

async function notionFetch(token: string, path: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${NOTION_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    throw new NotionIntegrationError(`노션 서버에 연결하지 못했습니다: ${(e as Error).message}`);
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new NotionIntegrationError("노션 인증 실패 — 설정의 Integration 토큰을 확인하세요.");
    }
    if (res.status === 404) {
      throw new NotionIntegrationError(
        "노션에서 찾을 수 없습니다 — 페이지가 Integration 에 공유돼 있는지 확인하세요.",
      );
    }
    const text = await res.text().catch(() => "");
    throw new NotionIntegrationError(`노션 API 오류 (${String(res.status)}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** 페이지 properties 에서 title 타입 속성의 텍스트를 뽑는다. */
function extractTitle(properties: unknown): string {
  if (properties == null || typeof properties !== "object") return "(제목 없음)";
  for (const value of Object.values(properties as Record<string, unknown>)) {
    const prop = value as { type?: string; title?: { plain_text?: string }[] };
    if (prop.type === "title" && Array.isArray(prop.title)) {
      const text = prop.title
        .map((t) => t.plain_text ?? "")
        .join("")
        .trim();
      if (text !== "") return text;
    }
  }
  return "(제목 없음)";
}

/** 블록 1개를 텍스트 한 줄로 — 리스트 블록은 '- ' 접두. (단위 테스트 대상 → export) */
export function blockToText(block: unknown): string {
  if (block == null || typeof block !== "object") return "";
  const b = block as { type?: string } & Record<string, unknown>;
  const type = b.type;
  if (type == null || !RICH_TEXT_BLOCKS.has(type)) return "";
  const payload = b[type] as { rich_text?: { plain_text?: string }[] } | undefined;
  const text = (payload?.rich_text ?? []).map((t) => t.plain_text ?? "").join("");
  if (text === "") return "";
  return LIST_BLOCKS.has(type) ? `- ${text}` : text;
}

/** 검색 — Integration 에 공유된 페이지 중 query 매칭 (최대 30건). */
export async function listNotionPages(query: string): Promise<NotionPageSummary[]> {
  const token = notionToken();
  const data = await notionFetch(token, "/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      filter: { property: "object", value: "page" },
      page_size: 30,
    }),
  });
  const results = (data as { results?: unknown[] }).results ?? [];
  return results.map((raw) => {
    const r = raw as { id?: string; url?: string; properties?: unknown };
    return {
      id: r.id ?? "",
      title: extractTitle(r.properties),
      url: r.url ?? "",
    };
  });
}

/**
 * 페이지 1건 상세 — 제목 + 본문.
 * 본문은 최상위 블록(최대 100개)만 평탄화한다. 토글·중첩 리스트 안쪽은 생략 —
 * 사람이 폼에서 다듬는 게 전제라 핵심 텍스트 보존을 우선한다.
 */
export async function getNotionPage(pageId: string): Promise<NotionPageDetail> {
  const token = notionToken();
  const page = await notionFetch(token, `/pages/${encodeURIComponent(pageId)}`);
  const title = extractTitle((page as { properties?: unknown }).properties);
  const blocksData = await notionFetch(
    token,
    `/blocks/${encodeURIComponent(pageId)}/children?page_size=100`,
  );
  const blocks = (blocksData as { results?: unknown[] }).results ?? [];
  const body = blocks
    .map(blockToText)
    .filter((line) => line !== "")
    .join("\n");
  return { id: pageId, title, body };
}
