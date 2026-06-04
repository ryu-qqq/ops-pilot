# 머신 스코어러 — 기준-인식 자동 judge 설계

- 날짜: 2026-06-04
- 상태: 설계 (승인 대기)
- 관련: ADR 0002(평가설계 agent-crew 이관) · ADR 0003(asset vs baked A/B grading) · §6.4 신뢰 게이트 패턴

## 1. 배경 · 문제

OpsPilot 평가축은 셋이다 — **시나리오 성공조건 / 사람 점수(`scorer=human`) / 머신 스코어러(미구현)**. 머신 스코어러만 비어 있었다(`scorer` enum에 값조차 없음).

단순히 "run 완료 시 LLM judge를 자동 실행"하는 것으로는 부족하다. 자동 채점이 의미를 가지려면 **사람이 정한 기준(successCriteria)** 위에서만 신뢰할 수 있는데, 현장에는 두 가지 구멍이 있다:

- **(P1) 기준 부재** — successCriteria를 뭘 적을지 몰라 안 넣었거나 빼먹음 → 뭔가 돌았는데 평가할 근거가 없음.
- **(P2) 기준 신뢰** — 기준이 *있어도* 그게 정말 작성자의 의도를 가르는지 LLM 혼자선 확신 못 함.

기준이 부실한데 점수만 뱉으면, 가짜 점수를 "측정했다"고 포장하는 셈이다 — OpsPilot 정직성 규칙·North Star("판단을 빨리 돕는가")에 정면으로 어긋난다.

## 2. 결정

머신 스코어러를 **"기준-인식 자동 judge"** 로 만든다. 채점보다 **기준 품질 판정을 먼저** 하고, 부실하면 점수 대신 정직한 보류 + 보강 제안을 낸다. 임베딩·로컬 모델은 쓰지 않고 **Claude API만** 사용한다(의존성 0).

### 2.1 산출 — 단일 점수가 아니라 3상태

| 상태 | 조건 | 산출 |
|---|---|---|
| 🟢 `scored` | successCriteria 충분 | PASS/FAIL + `score`(0~1) + **변별력 critique**("이 기준이 의도를 가르나") |
| 🟡 `criteria_weak` | 기준 있으나 모호 (LLM 판정) | 점수는 내되 **신뢰 보류** 플래그 + **기준 보강 제안** |
| 🔴 `no_criteria` | 기준 비었음 (결정적 체크) | 점수 없음(`null`) + **기준 초안 제안** (P1 해결) |

`criteria_weak`·`no_criteria`의 보강/초안 제안이 P1·P2를 정면으로 다룬다 — "뭘 적을지 몰라 안 넣음"을 LLM이 제안으로 메우고, "이 기준이 의도를 가르나"를 critique로 표면화한다.

## 3. 데이터 모델

- `scorer` enum에 **`machine` 신규 추가**. 기존 `llm_judge`와 **분리**한다 — 멘탈모델상 별도의 "머신 축"이고, 게이트 상태(`criteria_weak`/`no_criteria`)는 `llm_judge`엔 없는 새 의미다. (`llm_judge`는 사람이 특정 run을 깊게 보려 수동 호출하는 기존 용도 그대로 둔다.)
- 마이그레이션: `human` 추가 때 쓴 `reconcileScoreCheck` 패턴 재사용 — 기존 DB의 `score.scorer` CHECK 제약에 `'machine'`을 더하는 테이블 재구성. **추가형이라 데이터 안전**. shared-types `scorerSchema`(zod)와 `schema.sql` CHECK, `migrate.ts` reconcile 세 곳을 함께 갱신.
- score 행 저장 — `gateStatus`별 명확한 정책:

  | gateStatus | `passed` | `score` |
  |---|---|---|
  | `scored` | LLM 채점 PASS=true / FAIL=false | 0~1 |
  | `criteria_weak` | LLM 채점 PASS/FAIL (단 신뢰 보류) | 0~1 (보류 신호는 detail·UI가 전달) |
  | `no_criteria` | `false` (채점 불가 = 통과로 위장 금지) | `null` |

  - `detail` JSON: `{ gateStatus: 'scored'|'criteria_weak'|'no_criteria', criteriaCritique: string, suggestedCriteria: string[] }`
  - `score` 컬럼 CHECK는 `NULL` 허용이므로(`score IS NULL OR ...`) `no_criteria`의 `null` 저장에 스키마 변경 불필요.

## 4. 채점 파이프라인 (Claude API만)

```
run 완료
  └─ [project.yaml eval.autoMachineScore == ON ?]  (OFF면 스킵)
       └─ 기준 게이트
            1) 결정적 체크: scenario.successCriteria(또는 expectation.assertions) 비었나?
                 → 비었으면 no_criteria (LLM 호출 없이 즉시, 초안 제안만 LLM)
            2) LLM 단일 호출: "기준이 의도를 변별하나" 판정 + (충분하면) PASS/FAIL 채점 + 보강/초안 제안
                 → scored | criteria_weak
       └─ score(scorer='machine') 저장 (detail에 gateStatus·critique·제안)
```

- 기존 `domains/score/llm-grade.ts`의 변별력 critique 로직을 **확장 재사용**한다. 새 모듈(예: `domains/score/machine-score.ts`)이 게이트 판정 + 채점 + 보강제안을 **Claude API 한 번 호출**에 묶어 추가 토큰을 최소화한다.
- 호출 지점: `auto-evaluate.ts`(assertion 자동채점)가 이미 run 완료 후 호출되는 hook(`run/service.ts` runLoop 말미)이다. 그 옆에 토글-가드된 machine judge 호출을 붙인다. 실패는 catch하여 run 결과에 영향 없음(assertion 패턴 동일).

## 5. 트리거 · 비용

- **env 전역 토글 `OPS_AUTO_MACHINE_SCORE` (기본 off)**. `'1'`일 때만 run 완료 시 자동 채점. ADR 0004 자동 ingest가 실제로 `project.yaml`이 아닌 env(`OPS_AUTO_INGEST`)로 구현된 선례와 일관 — project.yaml은 경량 직접 파서라 eval 섹션 파싱 추가가 부담. **프로젝트별 project.yaml 토글은 후속(§8)**.
- assertion(무상 substring)은 지금처럼 항상 자동. **machine judge만 토글 뒤**에 둔다 — ADR 0004 `OPS_AUTO_INGEST` off-by-default와 같은 비용 방어.
- 수동 경로도 유지: `POST /runs/:id/machine-score`(단건) — 토글 OFF여도 사용자가 특정 run을 눌러 채점 가능. (현재 `POST /runs/:id/grade`와 대칭.)

## 6. UI 표면화 (기존 컴포넌트 재사용, 새 백엔드 최소)

- **verdict-strip.tsx**: 판정 한 줄에 `machine` 칸 추가(🟢/🟡/🔴 + score). 기존 단언·판정·사람 옆.
- **compare 뷰**(`GET /runs/compare`): `machineScore` 필드 추가(assertion/judge/human 옆 최신 1건).
- **benchmark §6.4 신뢰 게이트 재사용**: `criteria_weak`/`no_criteria` 비율이 높으면 "기준 보강 필요 — 측정 신뢰 보류"를 그대로 표면화. (이미 외부 표본 부족 시 "비교 신뢰 보류" 패턴 있음.)
- **상세 패널 ③ 시나리오·실행 / trace grade-panel**: `criteriaCritique`와 `suggestedCriteria`를 표시. **1차 범위 = 제안 표시까지** — 사람이 보고 수동으로 시나리오 successCriteria에 반영한다.

## 7. 테스트

- `apps/server/vitest.config.ts`(기존) 위에 `machine-score.test.ts` 추가:
  - 결정적 게이트: successCriteria 빈 시나리오 → `no_criteria`, LLM 채점 호출 안 함(또는 초안 제안만).
  - score 저장: `scorer='machine'`, `gateStatus` detail 직렬화·역직렬화.
  - 마이그레이션: 기존 DB(`machine` 없는 CHECK)에 reconcile 후 `'machine'` INSERT 성공.
- LLM 호출부는 결정적 단위테스트 불가 → 격리 DB 스모크 + (선택) 실토큰 e2e 1회(scored/criteria_weak/no_criteria 3분기 확인).

## 8. 범위 밖 (후속)

- **원클릭 반영** — 보강/초안 제안을 시나리오에 바로 apply하는 HITL 액션. 1차는 제안 표시만. (ADR 0004 proposal→apply HITL 패턴 차용 가능.)
- **프로젝트별 토글** — `project.yaml` `eval.autoMachineScore`로 프로젝트마다 on/off. 1차는 env 전역. (경량 yaml 파서 확장 필요.)
- **임베딩·로컬모델 시맨틱 유사도** — API 외 의존성 추가라 제외.
- **사람 점수↔머신 점수 자동 환류** — 머신이 자기 점수로 추천을 닫는 자가편향(§6.4) 위험. 졸업 후.

## 9. 영향받는 파일 (예상)

- `packages/shared-types/src/domain.ts` — `scorerSchema`에 `machine`, machine-score 응답 zod
- `apps/server/src/db/schema.sql` · `db/migrate.ts` — CHECK 갱신 + `reconcileMachineScorer`
- `apps/server/src/domains/score/machine-score.ts` (신규) — 게이트 + 채점 + 제안
- `apps/server/src/domains/score/auto-evaluate.ts` 또는 `run/service.ts` — 토글-가드 호출 hook
- `apps/server/src/routes/api/runs.ts` — `POST /runs/:id/machine-score`, compare에 machineScore
- `apps/server/src/domains/run/benchmark.ts` — machine 분포·신뢰 게이트
- `apps/web` — verdict-strip · compare · benchmark-summary · grade-panel 표면화
- 토글 게이트 = env `OPS_AUTO_MACHINE_SCORE` (hook 안에서 직접 읽음, 새 config 파일 불필요)
