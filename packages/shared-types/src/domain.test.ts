// @ts-nocheck — vitest 는 이 패키지 devDependency에 없음(서버 패키지 소유). tsc 는 건너뛰고 vitest 런타임이 직접 실행.
import { expect, it } from "vitest";
import { reviewProposalRequestSchema, ingestTriggerSchema } from "./domain.js";

it("ingestTrigger accepts pr_review", () => {
  expect(ingestTriggerSchema.parse("pr_review")).toBe("pr_review");
});

it("reviewProposalRequestSchema parses a valid review proposal", () => {
  const ok = reviewProposalRequestSchema.parse({
    projectId: "11111111-1111-1111-1111-111111111111",
    targetKind: "skill",
    targetPath: "skills/foo/SKILL.md",
    rationale: "반복된 지적",
    content: "수정 초안",
    review: { prNumber: 12, repo: "o/r", commentUrl: "https://x", reviewer: "rv", mistakeType: "naming" },
  });
  expect(ok.review.prNumber).toBe(12);
  expect(ok.scenarioId ?? null).toBeNull();
});
