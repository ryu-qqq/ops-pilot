# 0006. World 1(시나리오·점수 기반 .claude 자산 엄밀 평가) 역할 정리

- 상태: Accepted
- 날짜: 2026-06-07

## 맥락 (Context)

OpsPilot 초기 평가 모델 **World 1** = ".claude 자산을 자산별 시나리오로 실행하고 human/machine 점수로 엄밀 채점한다". 이 고유 용도가 실제로 죽었는지, 살릴지/정리할지를 결정해야 한다.

실 DB(`apps/server/opspilot.sqlite`) 증거:

- 규모 — asset 276 · scenario 12 · run 217 · score 2 · ingest_bundle 146 · improvement_proposal 85.
- **run 217개가 전부 scenario에 연결돼 있으나**, 그 scenario가 모두 `cursor-feedback-mvp` / `cursor-feedback-review` 하나로 수렴한다 → run/scenario/score 인프라는 World 1이 아니라 **World 2(Cursor 피드백 루프) eval이 통째로 재사용** 중이다. 2026-06에 run이 194개 폭증(local-claude 200 · fixture 17, succeeded 171 · failed 46).
- score 2건은 둘 다 `scorer=machine` 이고 둘 다 `passed=0`(실패) · score값 null. **human 점수는 0건**.

결론: World 1 고유 용도(자산별 시나리오 채점 + human/machine 점수)는 사실상 죽었다. 다만 scenario/run/score 인프라를 World 2가 통째로 재사용하고 있어 **단순 삭제는 불가능**하다.

이 결정은 무게중심이 World 1 → World 2로 옮겨간 흐름(Cursor-first pivot · 도구무관 플라이휠) 위에 있다. North Star("에이전트가 제대로·일관되게 작동하는지 판단을 빨리 돕는가")와 콜드오픈 혼란 제거(죽은 기능·내부자 어휘 노출 최소화) 사이에서, 끊김 없이 어디까지 정리할지를 가린다.

### 공유 인프라 (World 2가 의존 — 보존선)

World 2가 실제로 의존하므로 건드리면 끊긴다:

- `domains/run/service.ts`(startRun · runLoop), `scenario/repository.ts`, `score/repository.ts`
- DB FK 사슬: scenario → run → score, `improvement_proposal.run_id`
- shared-types: `scenarioSchema` · `scoreSchema` · `scorerSchema`
- 프론트: VerdictStrip · GradePanel · HumanScore (work 상세 화면이 재사용)

### World 1 고유 표면 (World 2가 안 씀)

- registry `asset-detail-panel.tsx`의 "③시나리오·실행" 탭(ScenarioManager · RunLauncher · RegressionLauncher · BenchmarkLauncher)
- `routes/api/scenarios.ts` 전체, `runs.ts:90-474`(배치 · 벤치 · baseline · grade · compare · machine-score 수동), `assist.ts`(scenario-ab · judge-runs) + `scenario-ab-service.ts` · `judge-runs.ts`
- work-list-view의 BenchmarkSummary · ComparisonView(트리거 state는 registry 런처만 채움), `app.tsx`의 benchmark/compare state
- MCP `list_scenarios` · `compare_runs`(수동), `machine-score.ts`(ADR 0005)

### 회색지대 3종 (귀속 미정 — 사람 판단)

1. 수동 `/runs/:id/scores`(human) — UI가 work 상세에도 붙어 있음
2. machine-score 자동훅(off-by-default이나 World 2 run에도 걸림)
3. `scorer` enum의 `machine`(스키마 CHECK 제약)

## 결정 동인 (Decision Drivers)

- **끊김 위험** — 공유 인프라 경계가 섬세하고 회색지대 귀속이 미정. 오판 시 World 2 eval이 끊긴다.
- **콜드오픈 혼란** — 죽은 기능·내부자 어휘 노출이 North Star("판단을 빨리 돕는가")를 흐린다.
- **선례 정합** — ADR 0002는 "폐기가 아니라 격하/졸업". 0003·0005가 World 1 고유 표면에 묶여 있다.
- **데이터·운영 투자 의지** — 살리기는 코드보다 수집·운영 비용이 크다.
- **되살리기 비용** — 지금 흔적을 지우면 나중에 World 1을 복권할 때 비용.

## 검토한 옵션 (Considered Options)

### A. 정리 (Cleanup)
World 2가 안 쓰는 고유 표면만 삭제하고 공유 인프라는 보존.
- 장점: 콜드오픈에서 죽은 기능·내부자 어휘 제거(North Star 정렬).
- 위험: 삭제 경계가 섬세 — 회색지대 오판 시 World 2 끊김. ADR 0005가 즉시 무력화.

### B. 격하 (Demote)
고유 표면 코드를 두되 기본 UI에서 숨긴다(flag/접힘).
- 장점: 끊김 위험 최소. ADR 0002 "폐기 아닌 격하" 정렬. 되살리기 쉬움.
- 단점: 죽은 코드 유지 · 혼란 잔존.

### C. 살리기 (Revive)
ADR 0003 졸업조건(source 영속화는 완료, 남은 #4 = 실 A/B 데이터) + ADR 0005 machine 스코어러 실가동에 투자.
- 장점: 평가 3축 완성.
- 단점: 큰 데이터·운영 투자. machine 2회 실패를 먼저 해결해야 함. World 2가 이미 빈자리를 메웠다면 중복.

### D. 혼합 — 격하 후 시한부 정리 (Demote then sunset)
B로 숨겨두고, World 2가 자산 품질 신호를 흡수하면 A로 제거, 흡수 못 하면 부분 복권.
- 장점: 즉시 혼란 제거 + 끊김 회피 + 데이터로 최종 판단.
- 단점: 두 번 손댐. "흡수했다"의 판정 기준이 필요.

### 추천 (참고용 — 결정 아님)
증거 균형은 **D**로 기운다 — World 2가 무게중심이고 World 1 고유 용도는 죽었으나, 공유 인프라 경계가 섬세하고 회색지대가 미해결이라 즉시 통삭제(A)는 위험. 단 아래 미해결 질문 1의 답이 "World 1만 채우는 빈 곳이 있다"면 **C**가 정당하다. 이 추천은 Decision Outcome이 아니며, 사람의 결정을 대체하지 않는다.

## 결정 (Decision Outcome)

**옵션 D — 격하 후 시한부 정리(Demote then sunset)** 를 채택한다.

먼저 World 1 고유 표면을 기본 UI에서 숨겨(격하) 콜드오픈 혼란을 즉시 없애되 코드·라우트는 보존한다. 이후 World 2(피드백→개선 루프)가 "자산이 제대로 작동하는지" 판단을 충분히 흡수했는지 데이터로 확인하고, 흡수됐으면 삭제(A), World 1만 채우는 빈 곳이 드러나면 부분 복권(C 일부)으로 간다.

즉시 통삭제(A)는 공유 인프라 경계가 섬세하고 회색지대 귀속이 미정이라 World 2 eval 끊김 위험이 커 배제했다. 격하(B)만으로 멈추면 죽은 코드와 혼란이 영구히 잔존하므로, 최종 판단을 데이터에 위임하는 D로 닫는다. 살리기(C)는 지금 단독으로 정당화할 데이터(미해결 질문 1)가 아직 없어 보류한다.

아래 "결정에 필요했던 미해결 질문" 5개는 이 결정으로 다음과 같이 해소·이연한다:

1. World 2의 흡수 여부 → **시한부 정리 단계의 재검토 트리거로 이연**(다음 평가축 의제에서 데이터로 판단).
2. 회색지대 3종 귀속 → 격하 단계에선 코드 보존이라 귀속 결정 불요. **정리(A) 단계로 이연**.
3. ADR 0005의 운명 → **동결**(off-by-default 유지, 폐기 아님).
4. 데이터 투자 의지 → C 보류로 지금은 불요. 부분 복권 검토 시 재론.
5. 콜드오픈 혼란 제거 강도 → **격하로 즉시 해소**(점진).

## 결과 (Consequences)

### 즉시 (격하 단계)

- World 1 고유 표면(registry "③시나리오·실행" 탭 = ScenarioManager · RunLauncher · RegressionLauncher · BenchmarkLauncher, work-list의 BenchmarkSummary · ComparisonView 트리거, 수동 human 점수 입력 UI)을 **기본 UI에서 숨긴다**(코드·라우트는 보존). 콜드오픈에서 죽은 기능·내부자 어휘 노출을 즉시 제거한다(미해결 질문 5 → 격하로 해소).
- **공유 인프라는 무손상**: `domains/run/service.ts`(startRun · runLoop), `scenario/repository.ts`, `score/repository.ts`, DB FK 사슬, shared-types 스키마, VerdictStrip · GradePanel · HumanScore(World 2 작업 상세 재사용)는 그대로. 삭제 0 → 끊김 위험 0.
- **ADR 0005(머신 스코어러)는 동결**: off-by-default 유지, 폐기 아님(미해결 질문 3 → 동결). machine 2회 실패 원인 수리는 살리기로 전환할 때만.
- 회색지대 3종(수동 `/runs/:id/scores` · machine-score 자동훅 · `scorer` enum `machine`)은 격하 단계에선 **건드리지 않는다** — 코드 보존이라 귀속 결정 불필요. 정리(A) 단계로 이연(미해결 질문 2).

### 나중에 (시한부 정리 단계)

- 재검토 트리거 = World 2(피드백→개선안 루프, 정정왕복 추세)가 "자산이 제대로 작동하는지" 판단을 충분히 흡수했는지 확인되는 시점(미해결 질문 1). 다음 평가축 의제에서 데이터로 판단한다.
- 흡수됐으면 → 숨긴 고유 표면을 실제 삭제(옵션 A), 그때 회색지대 3종 귀속 확정.
- World 1만 채우는 빈 곳(자산별 엄밀 채점 수요)이 드러나면 → 부분 복권(옵션 C 일부).

### 트레이드오프 (정직)

- 두 번 손댄다(숨김 → 나중 삭제/복권). ADR 0002 "폐기 아닌 격하/졸업" 선례와 정렬되지만, 결정을 완전히 닫지 않고 데이터에 위임한 셈.
- 숨긴 코드는 정리 전까지 유지보수 부담으로 남는다.

## 선례 (Related)

- ADR 0002 — 폐기 아닌 격하 / 졸업 모델.
- ADR 0003 — A/B · source 영속화 완료(남은 졸업조건 #4 = 실 A/B 데이터).
- ADR 0005 — machine 스코어러 off-by-default · 실행 2회 실패.
- vault: Cursor-first pivot · 도구무관 플라이휠 — 무게중심 World 1 → World 2 이동.
