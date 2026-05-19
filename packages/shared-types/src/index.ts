import { z } from "zod";

// 프론트·백엔드가 같은 Zod 스키마를 import 해 검증·타입을 단일 출처로 유지 (CONVENTIONS.md 1).
export * from "./domain.js";

/** 서버 헬스체크 응답. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
