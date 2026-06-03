import type { DesignSource, Scenario } from "@opspilot/shared-types";
import { startRun } from "../run/service.js";
import {
  DEMO_FIXTURE,
  fixtureSource,
  localClaudeSource,
} from "../run/source.js";
import { createScenario } from "../scenario/repository.js";
import { generateScenarioAbPair, type ScenarioSuggestion } from "./scenario-suggest.js";

// ADR 0003 Follow-up #2 (A/B 품질 측정 — 최소 슬라이스):
// 같은 입력으로 asset·baked 둘 다 산출해(scenario-suggest.generateScenarioAbPair) source 로 태깅해 저장한다.
// 다운스트림(run.source 상속)·집계(aggregateBenchmark.bySource)·자동 실행은 이번 범위 밖 — 여기선 산출+저장만.

// suggestion → scenario 폼 매핑 규칙. /assist/scenario-suggest → RunLauncher 폼 매핑(api.ts)과 동일:
// - description = purpose (빈 문자열이면 null)
// - expectation.judge = expectedBehavior (빈 문자열이면 undefined)
// - expectation.assertions = successCriteria (빈 배열이면 undefined)
function toExpectation(s: ScenarioSuggestion) {
  return {
    judge: s.expectedBehavior.trim() === "" ? undefined : s.expectedBehavior,
    assertions: s.successCriteria.length > 0 ? s.successCriteria : undefined,
  };
}

// 이름 UNIQUE(asset_id, name) 충돌 회피. createScenario 가 throw 하면 suffix(짧은 카운터)를 붙여 재시도.
// asset/baked 가 같은 suggestion.name 을 낼 수 있고, 재실행 시 과거 산출과도 충돌할 수 있어 둘 다 대비.
const MAX_NAME_RETRIES = 5;
function createScenarioWithUniqueName(args: {
  assetId: string;
  baseName: string;
  description: string | null;
  input: string;
  expectation: ReturnType<typeof toExpectation>;
  source: DesignSource;
}): Scenario {
  for (let attempt = 0; attempt <= MAX_NAME_RETRIES; attempt += 1) {
    const name = attempt === 0 ? args.baseName : `${args.baseName} (${String(attempt + 1)})`;
    try {
      return createScenario({
        assetId: args.assetId,
        name,
        description: args.description,
        input: args.input,
        expectation: args.expectation,
        source: args.source,
      });
    } catch (e) {
      // UNIQUE 충돌이면 다음 suffix 로 재시도, 마지막 시도까지 실패하면 그대로 throw.
      const isUnique = e instanceof Error && /UNIQUE/i.test(e.message);
      if (!isUnique || attempt === MAX_NAME_RETRIES) throw e;
    }
  }
  // 도달 불가(루프가 return 또는 throw 로 끝남) — 타입 만족용.
  throw new Error("이름 충돌 회피 재시도 소진");
}

// 공유 추출(중복 제거): asset+baked 양쪽 산출 → 각각 source-tagged scenario 로 저장.
// createScenarioAbPair(생성 전용)·createScenarioAbPairAndRun(생성+실행) 둘 다 이 헬퍼를 쓴다.
// asset 경로 불가(미sync)면 generateScenarioAbPair 가 ClaudeAssistError 를 throw →
// route 에서 400 으로 매핑(A/B 불성립 명시).
async function buildScenarioAbPair(input: {
  assetId: string;
  hint?: string;
  ticketText?: string;
}): Promise<{ asset: Scenario; baked: Scenario }> {
  const pair = await generateScenarioAbPair(input);

  const asset = createScenarioWithUniqueName({
    assetId: input.assetId,
    baseName: `${pair.asset.name} [asset]`,
    description: pair.asset.purpose.trim() === "" ? null : pair.asset.purpose,
    input: pair.asset.input,
    expectation: toExpectation(pair.asset),
    source: "asset",
  });

  const baked = createScenarioWithUniqueName({
    assetId: input.assetId,
    baseName: `${pair.baked.name} [baked]`,
    description: pair.baked.purpose.trim() === "" ? null : pair.baked.purpose,
    input: pair.baked.input,
    expectation: toExpectation(pair.baked),
    source: "baked",
  });

  return { asset, baked };
}

// asset+baked 양쪽 산출 → 각각 source-tagged scenario 로 저장(생성 전용).
export async function createScenarioAbPair(input: {
  assetId: string;
  hint?: string;
  ticketText?: string;
}): Promise<{ asset: Scenario; baked: Scenario }> {
  return buildScenarioAbPair(input);
}

// RunnerSource 빌드 — POST /runs 와 동일 규약(fixture→DEMO_FIXTURE 재생, local-claude→spawn).
function buildRunnerSource(source: "fixture" | "local-claude") {
  return source === "fixture" ? fixtureSource(DEMO_FIXTURE) : localClaudeSource();
}

// ADR 0003 Follow-up #2 (A/B 자동 오케스트레이션): 두 시나리오를 생성(공유 추출 재사용)한 뒤
// 각각 startRun 으로 즉시 실행한다. startRun 은 비동기(즉시 반환·백그라운드 runLoop)라 두 run 모두
// status=running 으로 반환된다. run.source 는 scenario.source(asset|baked)를 상속(D1)하고,
// 자동 채점(assertion)은 run 종료 시 기존 evaluateAssertionsForRun 가 수행 — 새 러너·스코어러 없음.
export async function createScenarioAbPairAndRun(input: {
  assetId: string;
  assetVersionId: string;
  hint?: string;
  ticketText?: string;
  source: "fixture" | "local-claude";
}): Promise<{
  assetScenario: Scenario;
  bakedScenario: Scenario;
  assetRunId: string;
  bakedRunId: string;
}> {
  const { asset, baked } = await buildScenarioAbPair(input);

  const assetRun = startRun({
    assetVersionId: input.assetVersionId,
    scenarioId: asset.id,
    source: buildRunnerSource(input.source),
  });
  const bakedRun = startRun({
    assetVersionId: input.assetVersionId,
    scenarioId: baked.id,
    source: buildRunnerSource(input.source),
  });

  return {
    assetScenario: asset,
    bakedScenario: baked,
    assetRunId: assetRun.id,
    bakedRunId: bakedRun.id,
  };
}
