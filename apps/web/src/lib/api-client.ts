import type { ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function parseOrThrow<T>(res: Response, schema: ZodType<T>): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || res.statusText);
  }
  return schema.parse(await res.json());
}

// 응답을 항상 shared-types Zod 로 검증 (CONVENTIONS.md 1: 단일 출처).
export async function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  return parseOrThrow(await fetch(path), schema);
}

export async function apiPost<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseOrThrow(res, schema);
}
