import { z } from "zod";

/**
 * 공통 스키마 자리. 프론트·백엔드가 같은 Zod 스키마를 import 해
 * 요청/응답 검증과 타입 추론을 단일 출처로 유지한다 (CONVENTIONS.md 1).
 *
 * 도메인 스키마(asset/version/scenario/run/trace/score)는 OPSP-2에서 추가한다.
 */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
