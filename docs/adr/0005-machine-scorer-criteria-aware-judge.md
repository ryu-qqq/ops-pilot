# 0005. 머신 스코어러 — 기준-인식 자동 judge

- 상태: Accepted
- 날짜: 2026-06-04

## 맥락 (Context)

OpsPilot 평가축은 셋이다 — **시나리오 성공조건 / 사람 점수(`scorer=human`) / 머신 스코어러**. 앞 둘은 구현돼 있었고(assertion substring 자동채점 + llm_judge 수동 채점 + human 슬라이더), 머신 스코어러만 비어 있었다(`scorer` enum에 값조차 없음).

빈자리를 단순히 "run 완료 시 LLM judge를 자동 실행"으로 메우면 함정에 빠진다. 자동 채점이 의미를 가지려면 **사람이 정한 기준(successCriteria)** 위에서만 신뢰할 수 있는데, 현장에는 두 구멍이 있다:

- **(P1) 기준 부재** — successCriteria를 뭘 적을지 몰라 안 넣었거나 빼먹음 → 뭔가 돌았는데 평가할 근거가 없음.
- **(P2) 기준 신뢰** — 기준이 *있어도* 그게 작성자의 의도를 가르는지 LLM 혼자선 확신 못 함.

기준이 부실한데 점수만 뱉으면 가짜 점수를 "측정했다"고 포장하는 셈 — OpsPilot 정직성 규칙·North Star("에이전트가 제대로 작동하는지 판단을 빨리 돕는가")에 정면으로 어긋난다. 또 임베딩·로컬 모델은 환경에 없어 **Claude API만** 쓸 수 있다는 제약이 있다.

## 결정 (Decision)

머신 스코어러를 **"기준-인식 자동 judge"** 로 만든다. 채점보다 **기준 품질 판정을 먼저** 하고, 부실하면 점수 대신 정직한 보류 + 보강 제안을 낸다.

1. **산출은 단일 점수가 아니라 3상태** (`detail.gateStatus`로 저장):
   - 🟢 `scored` — 기준 충분 → PASS/FAIL + score(0~1) + 변별력 critique.
   - 🟡 `criteria_weak` — 기준 모호(LLM 판정) → 점수는 내되 **신뢰 보류** + 보강 제안.
   - 🔴 `no_criteria` — 기준 비었음(결정적 체크) → `passed=false`·`score=null`(채점 불가를 통과로 위장 금지) + 초안 제안.
2. **결정적 게이트 + LLM 채점 분리.** `evaluateCriteriaGate`(빈 기준 → `no_criteria`, LLM 호출 없이)로 먼저 가르고, 기준이 있으면 Claude API **한 번 호출**에 게이트 판정(scored/criteria_weak) + 채점 + 보강제안을 묶는다(토큰 절약). `no_criteria`는 채점 없이 초안 제안만.
3. **`scorer` enum에 `machine` 신규.** 기존 `llm_judge`(사람이 특정 run을 깊게 보는 수동 채점)와 분리 — 멘탈모델상 별도 "머신 축"이고 게이트 상태는 llm_judge엔 없는 새 의미. 마이그레이션은 `human` 추가 때 쓴 `reconcileScoreCheck` 행-보존 재구성 패턴 재사용.
4. **off-by-default env 토글 `OPS_AUTO_MACHINE_SCORE`.** ON일 때만 run 완료 후 비동기 자동 채점. ADR 0004 `OPS_AUTO_INGEST`가 `project.yaml`이 아닌 env로 구현된 선례와 일관(project.yaml은 경량 직접 파서라 확장 부담). assertion(무상 substring)은 그대로 항상 자동, machine judge만 토글 뒤 — LLM 비용 방어.
5. **수동 단건 라우트** `POST /runs/:id/machine-score`(기존 `/grade`와 대칭, 토글 OFF여도 호출 가능).
6. **보강 제안은 1차 읽기 전용 표시까지** — 사람이 보고 수동으로 시나리오 successCriteria에 반영. 원클릭 apply는 후속.

### 기각한 대안

- **단순 자동화**(기존 llm_judge를 run 완료 시 자동 실행만) — P1·P2를 방치해 부실 기준에 가짜 점수를 낸다.
- **기준 보충형**(successCriteria 없으면 LLM이 임시 기준 생성 후 채점) — "LLM이 만든 기준으로 LLM이 채점" = 자기참조(§6.4 자가편향과 같은 함정).
- **임베딩·로컬모델 시맨틱 유사도** — API 외 의존성 추가라 제외.

## 결과 (Consequences)

- shared-types `scorerSchema`+`machineGateStatusSchema`+`scoreSchema.detail`(게이트 필드), `db/schema.sql`·`migrate.ts reconcileMachineScorer`, `domains/score/machine-score.ts`(게이트+채점+자동 hook), `run/service.ts` 연결, `routes/api/runs.ts`(수동 라우트+compare `machineScore`), `run/benchmark.ts`(machine 분포 + `machineCriteriaWeak`/`machineNoCriteria` §6.4 신뢰 게이트), 프론트 표면화(verdict-strip·comparison-view·benchmark-summary `CriteriaGate`·grade-panel 제안). vitest 18 passed.
- **검증**: `no_criteria` 분기를 실토큰 e2e로 확인 — 기존 fixture run(assertions 없음)에 수동 채점 → verdict-strip 🔴 + grade-panel 보강 제안 3개 실렌더. `scored`/`criteria_weak`는 동일 컴포넌트 배지 분기(코드 리뷰로 3분기 확인). 통합 리뷰 Approved.
- **운영 함정(중요)**: 서버는 부팅 시 자동 migrate를 하지 않는다. 기존 영속 DB는 `score.scorer` CHECK에 `machine`이 없어, **`pnpm db:migrate` 선행 없이** 수동 채점하면 INSERT가 CHECK 위반난다. 이를 `MachineScoreError`로 정규화해 500 대신 400 + "`pnpm db:migrate` 필요" 안내로 처리했다(자동 hook은 흡수). 스키마 변경 후 영속 DB는 백업 뒤 migrate 필요.

### Follow-ups (범위 밖, 후속)

1. **원클릭 반영** — 보강/초안 제안을 시나리오 successCriteria에 바로 apply하는 HITL 액션(ADR 0004 proposal→apply 패턴 차용).
2. **프로젝트별 토글** — `project.yaml eval.autoMachineScore`로 프로젝트마다 on/off(경량 yaml 파서 확장). 1차는 env 전역.
3. **사람↔머신 점수 자동 환류** — 머신이 자기 점수로 추천을 닫는 자가편향(§6.4) 위험. 졸업 후.
4. **표면화 SSOT nit** — comparison-view help prose의 게이트 라벨 중복(통합 리뷰 Minor).

근거 문서: 설계 `docs/superpowers/specs/2026-06-04-machine-scorer-design.md`, 플랜 `docs/superpowers/plans/2026-06-04-machine-scorer.md`.
