# 0007. 자산·하네스 평가 실행 엔진으로 DeepEval 채택 (CI/offline 축)

- 상태: Accepted
- 날짜: 2026-06-10

## 맥락 (Context)

OpsPilot 평가축은 셋이다 — 시나리오 성공조건 / 사람 점수(`scorer=human`) / 머신 스코어러(`scorer=machine`, ADR-0005). 이 셋은 **인프로덕트·per-run** 축이다: run이 끝나면 TypeScript 도메인 코드가 Claude API를 호출해 채점하고 결과를 DB·UI에 표면화한다.

그런데 OpsPilot이 평가하는 **대상 자산**(agent-crew 공유 자산 — work-evaluator 4축·agent-evaluator 8차원·`asset-quality-rubric.md`)의 *자체 채점 로직*은 별개 문제다. 이들은 LLM-judge를 쓰지만:

- **(H1) Pass^k 측정 환경 부재** — `asset-quality-rubric.md` 차원4(Determinism)가 "Pass^k 정량 측정"을 요구하면서도 *"측정 환경 부재"*로 스스로 비워둠.
- **(H2) executable verifier 부재** — 차원7(Verifiability)이 CI에서 결정적으로 돌릴 verifier가 없어 상시 낮게 찍힘.
- **(H3) 라벨 누적·회귀 감지 부재** — judge 점수가 시계열로 쌓이지 않아 자산 개선이 회귀를 일으켰는지 알 수 없음.

즉 OpsPilot에는 **인프로덕트 per-run 채점(있음)** 과 별개로, **자산·judge 하네스 자체를 CI/offline에서 회귀 검증하는 축(없음)** 이 비어 있다. 이 ADR은 후자를 표준 OSS로 메울지 결정한다.

RAGAS·DeepEval을 2026-06 기준으로 대조한 결과, DeepEval의 G-Eval(자연어 criteria → CoT LLM-judge → 0~1 점수 + threshold)은 OpsPilot이 자체 구현한 LLM-judge 채점과 **메커니즘이 동일**하고, `deepeval test run`(pytest)으로 Pass^k 반복·CI 게이팅을 표준 제공한다 — 정확히 H1·H2를 메운다. RAGAS는 RAG 전용이라 대체로 빗나간다.

## 결정 (Decision)

자산·하네스 평가의 **CI/offline 실행 엔진**으로 DeepEval을 채택한다(인프로덕트 머신 스코어러는 그대로 — "관계" 절 참조).

1. **D1 — work-evaluator 4축을 G-Eval criteria로 실행.** Pass^k는 metric 반복+pytest, `deepeval test run`을 차원7 executable verifier로 삼아 H1·H2를 메운다. scenario-designer 산출물 `{input, expectedBehavior, successCriteria}`를 DeepEval golden에 매핑한다.
2. **D2 — agent-evaluator 8차원·OpsPilot 루프는 현행 유지.** DeepEval은 채점 실행에만 적용한다. verdict threshold의 SSOT는 `asset-quality-rubric.md` 단일 — DeepEval은 실행만(이중 정의 금지).
3. **D3 — RAGAS는 retrieval 끼는 자산(wiki-lookup·context-preprocessor·vault 조회)에만 국소 도입.** context precision/recall/faithfulness로 조회 품질만 라벨링.

> **확정(2026-06-11)**: "관계" 절의 분담 미결을 **분리 유지**로 결정 — 머신 스코어러(ADR-0005)는 인프로덕트 per-run 채점으로 그대로, DeepEval 축은 CI/offline 자산 회귀 전담. 상호 위임 없음. 이로써 `Accepted`.

### 기각한 대안

- **기존 머신 스코어러(ADR-0005) 확장으로 흡수** — 인프로덕트 TS 채점기를 CI/Pass^k까지 떠맡기면 surface가 섞인다(per-run 제품 채점 ≠ 자산 회귀 검증). 분리가 맞다.
- **DeepEval+RAGAS 전면 도입** — 자산 대부분이 RAG가 아니라 RAGAS 과투자.
- **자체 Pass^k·CI 하네스 구현** — H1·H2를 자체 구현하는 비용. 성숙 OSS로 대체 가능.

## 관계 (ADR-0005 머신 스코어러와의 관계)

**두 축은 surface가 다르다 — 경쟁이 아니라 분담이다.**

| | 머신 스코어러 (ADR-0005) | DeepEval 축 (이 ADR) |
|---|---|---|
| 시점 | 인프로덕트, run 완료 시 | CI/offline, 커밋·PR 시 |
| 대상 | *개별 run* 결과 | *자산·judge 하네스* 회귀 |
| 스택 | TypeScript 도메인 코드 | Python/pytest |
| 산출 | gateStatus 3상태 + DB/UI | test pass/fail + Pass^k |

**확정(2026-06-11): 분리 유지.** 인프로덕트 머신 스코어러는 DeepEval에 위임하지 않고 각자 bespoke로 둔다 — surface(시점·대상·스택·산출)가 전부 달라 통합의 이득보다 결합 비용이 크다. 재검토 트리거: 두 축의 judge 기준이 실질적으로 중복되기 시작하면.

## 결과 (Consequences)

- **PoC 검증됨**(`eval/poc-deepeval/`): work-evaluator "범위" 축 1개를 G-Eval metric으로 이식, 골든 2건. judge는 로컬 Claude Code(`claude -p`)를 `DeepEvalBaseLLM`으로 감싸 **Anthropic API 키 없이** 구독 자격으로 채점(spawn 시 `--strict-mcp-config`로 serena 등 MCP 비활성화). 실측: `Pass Rate 50%` — in-scope golden PASS / scope-creep golden FAIL. → D1의 "`deepeval test run`이 executable verifier가 된다" 가설 end-to-end 입증.
- **남는 비용·미결**: Python 평가 하네스 의존 추가(TS 모노레포에 이질적). OpsPilot `start_run` 출력 → DeepEval golden 어댑터 위치 미정. 라벨 누적 저장소(vault `raw/` vs DeepEval 데이터셋) 미정. judge spawn(claude -p)은 API 대비 느려 대량 Pass^k엔 API judge가 유리.
- **승격 기록**: 분담을 분리 유지로 확정(2026-06-11) → `Accepted`.

## 내부 선례 (Related)

- **ADR-0005(이 repo)** — criteria-aware machine judge. 인프로덕트 per-run 채점 축. 이 ADR의 CI/offline 축과 surface 분담.
- **ADR-0001~0004(이 repo)** — work-based auto-eval, eval-design-to-agent-crew, asset-vs-baked grading, auto-ingest flywheel. 평가축 전반의 선례.
- 근거 사슬: `asset-quality-rubric.md`(agent-crew) → `ryu-qqq-wiki/research/agent-engineering/99-evaluation-framework.md`.
