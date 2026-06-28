/**
 * 라우트 통합 테스트: POST /api/feedback/review-proposal
 *
 * buildApp() 대신 최소 Fastify 앱을 직접 구성 — @fastify/autoload 동적 import 에서
 * Vitest forks pool 이 `.js`→`.ts` 해소를 처리하지 못하는 이슈를 피한다.
 * 실제 feedback 플러그인을 prefix '/api' 로 등록하여 전체 경로를 재현한다.
 *
 * DB 패턴: service.review-proposal.test.ts 와 동일 (closeDb → migrate → seed)
 */
import { existsSync, rmSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { closeDb, getDb } from "../../db/index.js";
import { migrate } from "../../db/migrate.js";
import feedbackPlugin from "./feedback.js";

const TMP = "/tmp/opspilot-review-proposal-route.sqlite";
const TEST_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

async function buildTestApp() {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(feedbackPlugin, { prefix: "/api" });
  return app;
}

beforeEach(() => {
  closeDb();
  migrate(TMP);
  getDb(TMP)
    .prepare(
      "INSERT INTO project (id, name, git_url, clone_path, workspace_mode, created_at) VALUES (?, 't', 'git://test-review-proposal', '/x', 'linked', '2026-01-01')",
    )
    .run(TEST_PROJECT_ID);
});

afterEach(() => {
  closeDb();
  for (const f of [TMP, `${TMP}-wal`, `${TMP}-shm`]) if (existsSync(f)) rmSync(f);
});

it("POST /api/feedback/review-proposal returns ingestId+proposalId (200)", async () => {
  const app = await buildTestApp();
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/feedback/review-proposal",
      payload: {
        projectId: TEST_PROJECT_ID,
        targetKind: "skill",
        targetPath: "skills/foo/SKILL.md",
        rationale: "반복된 지적",
        content: "수정 초안",
        review: {
          prNumber: 12,
          repo: "o/r",
          commentUrl: "https://x",
          reviewer: "rv",
          mistakeType: "naming",
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ingestId: string; proposalId: string };
    expect(body.ingestId).toBeTruthy();
    expect(body.proposalId).toBeTruthy();
  } finally {
    await app.close();
  }
});

it("POST /api/feedback/review-proposal returns 404 for unknown project", async () => {
  const app = await buildTestApp();
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/feedback/review-proposal",
      payload: {
        projectId: "99999999-9999-9999-9999-999999999999",
        targetKind: "skill",
        targetPath: "skills/foo/SKILL.md",
        rationale: "x",
        content: "y",
        review: {
          prNumber: 1,
          repo: "o/r",
          commentUrl: "https://x",
          reviewer: "rv",
          mistakeType: "naming",
        },
      },
    });
    expect(res.statusCode).toBe(404);
  } finally {
    await app.close();
  }
});
