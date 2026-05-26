import type { ZodType } from "zod";

// 백엔드는 에러를 일관되게 { error, detail } 로 응답한다(app.ts·routes/*).
// 프론트엔 raw JSON 을 보이지 말고 code/detail 로 분해해 친화 메시지로 변환(OPSP-25).
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
    readonly detail: string | null = null,
  ) {
    super(message);
  }
}

function toApiError(status: number, statusText: string, text: string): ApiError {
  try {
    const body: unknown = JSON.parse(text);
    if (
      body !== null &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
    ) {
      const code = (body as { error: string }).error;
      const detail =
        "detail" in body && typeof (body as { detail: unknown }).detail === "string"
          ? (body as { detail: string }).detail
          : null;
      return new ApiError(status, detail ?? code, code, detail);
    }
  } catch {
    // JSON 아님 — 아래 폴백
  }
  return new ApiError(status, text || statusText);
}

async function parseOrThrow<T>(res: Response, schema: ZodType<T>): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw toApiError(res.status, res.statusText, text);
  }
  return schema.parse(await res.json());
}

async function networkFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ApiError(
      0,
      "OpsPilot 서버에 연결할 수 없습니다. 터미널에서 apps/server dev(:3001)가 실행 중인지 확인하세요.",
      "NetworkError",
      msg,
    );
  }
}

// 응답을 항상 shared-types Zod 로 검증 (CONVENTIONS.md 1: 단일 출처).
export async function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  return parseOrThrow(await networkFetch(path), schema);
}

export async function apiPost<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
  const res = await networkFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseOrThrow(res, schema);
}

// OPSP-34: 시나리오 등 부분 update / 삭제용.
export async function apiPatch<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
  const res = await networkFetch(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseOrThrow(res, schema);
}

export async function apiDelete<T>(path: string, schema: ZodType<T>): Promise<T> {
  return parseOrThrow(await networkFetch(path, { method: "DELETE" }), schema);
}

// OPSP-42: 전역 설정 등 전체 교체용.
export async function apiPut<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
  const res = await networkFetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseOrThrow(res, schema);
}
