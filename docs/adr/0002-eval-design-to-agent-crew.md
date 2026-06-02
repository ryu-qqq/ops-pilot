# 0002. 평가 설계 로직의 agent-crew 자산화 — 로컬 Claude가 하네스 자산을 호출

- 상태: Accepted
- 날짜: 2026-06-02

## 맥락 (Context)

OpsPilot의 평가 경로에는 두 부류의 로직이 섞여 있다 — **"설계(생성)"**(평가에
쓸 트리거 쿼리·시나리오·성공조건·자산 description을 만들어내는 LLM 작업)와
**"측정"**(만들어진 입력으로 실제 발화를 감지·실행·채점하는 결정적 작업).

현재 *설계* 로직은 ops-pilot 백엔드에 **baked TS 프롬프트 + `runClaudeOnce`** 형태로
박혀 있다:

- `trigger-eval/service.ts` — `suggestTriggerQueries`(L60), `improveDescription`(L185),
  `improveDescriptionLoop`(L261)
- `assist/scenario-suggest.ts` — `suggestScenario`(L36). 이미 zod
  `scenarioSuggestionSchema`로 출력을 검증한다.

호출 메커니즘은 두 변종이 공존한다:

- `assist/claude.ts`의 `runClaudeOnce` — 빈 cwd·MCP 차단·텍스트 출력. *설계*용.
- `trigger-eval/probe.ts` — 임시 `.claude` 주입 + stream-json 발화 감지. 이건
  **측정 템플릿**이다(자연 트리거를 흉내내 발화를 잡는다).

출력 계약은 `shared-types/domain.ts`의 `expectationSchema`(assertions)·
`scenarioSchema`(input + expectation)에 정의돼 있다.

OpsPilot의 역할분담 불변식(pivot ADR·`_overview`)은 **"agent-crew = 설계 원본,
ops-pilot = 소비·측정"**이다. 그런데 설계 로직이 ops-pilot 백엔드에 baked 프롬프트로
박혀 있으면 이 분담이 코드 차원에서 깨진다 — 프롬프트를 고치려면 ops-pilot을
재배포해야 하고, agent-crew의 tag·sync 흐름을 타지 못하며, "하네스 자산이
실작업에서 잘 작동하는가"를 묻는 OpsPilot이 정작 *자기 평가 설계*는 하네스 자산으로
검증하지 않는(도그푸딩 부재) 모순이 생긴다.

핵심 질문: **평가 "설계" 로직 4종(① 트리거 쿼리 생성 ② description 자동개선
③ 시나리오 생성 ④ 성공조건 빌더)을 agent-crew 하네스 자산(에이전트/스킬)으로
옮기고, 로컬 `claude -p`(헤드리스)가 호출하도록 전환할 것인가.** 단 **측정**(probe
발화 감지·run·채점)은 결정성·재현성을 위해 ops-pilot에 결정적으로 유지한다.

활용 가능한 기존 자산:

- `.claude/agents/harness-trigger-designer.md` — 이미 "쿼리 산출 → ops-pilot 입력"
  으로 설계됨. JSON `[{query, should_trigger}]` 출력. ①의 직접 재사용 후보.
- `agent-evaluator`·`work-evaluator` — 실물 존재. JSON 출력 자산의 본보기.
- 시나리오(③)·성공조건(④) 생성 자산은 **아직 없다**(신규 필요).

이 ADR은 위 전환의 *결정·근거*까지를 다룬다. 구현·Decision Outcome·Consequences는
사람의 결정(Accepted) 후 채운다 — 지금은 TBD.

## 결정 동인 (Decision Drivers)

- **결정성·재현성** — 측정은 결정적으로 유지되어야 한다. 설계의 비결정성이 측정
  결과를 오염시키면 안 된다.
- **도그푸딩 가치 vs 자가편향** — 설계를 하네스 자산으로 옮기면 OpsPilot이 자기
  자산을 실사용하는 도그푸딩이 된다. 그러나 99-evaluation-framework(§4.5/§6.4)의
  **자가편향 경고** — "자가점수 단독 release 금지·외부비교 병행" — 가 평가 *설계*
  에도 유추 적용될 위험이 있다(평가용 입력을 같은 하네스가 만들면 편향 유입).
- **Claude Code 종속(portability)** — `.claude` 주입·자연 트리거는 Claude Code에
  종속된다. 99-evaluation-framework(§4.1.b/§6.5)의 **"rubric=보편, 자동실행=Claude
  Code 종속"** 분리가 여기서도 작동한다 — Cursor 비호환 한계를 정직하게 떠안아야 함.
- **변경 용이성** — agent-crew tag·sync(런타임 자산 교체) vs ops-pilot 재배포
  (코드 변경). 프롬프트를 자산으로 빼면 변경이 sync로 가벼워진다.
- **0001 패턴 일관성** — 0001의 "수집 vs 생성 분리", "폐기 아닌 격하(코드 유지·
  명시 호출)", 점진 전환 원칙과 정렬되는가.
- **"새 러너 금지" 원칙** — 측정 러너(probe·run)를 새로 만들지 않는다. 생성 호출은
  기존 `assist` 헬퍼 계열을 재사용하고, 측정 러너는 불변으로 둔다.

## 검토한 옵션 (Considered Options)

결정포인트별로 대안을 나눈다. 권고 후보는 "(연구 권고: …)"로 표기하되,
**최종 채택은 Decision Outcome에서 사람이 정한다(현재 TBD)**.

### 1. 호출 메커니즘 — 로컬 Claude가 자산을 어떻게 부르나

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **1A 자연 트리거** | `.claude` 디렉터리를 임시 주입하고 자연 발화로 자산을 부른다(probe 측정 템플릿과 동형) | 도그푸딩 충실(실사용과 동일 경로), 트리거 자체도 함께 검증됨 | 비결정적(트리거가 안 걸릴 수 있음), Claude Code 강종속, 디버깅 난도↑ |
| **1B 본문 주입(프롬프트 라이브러리)** | 자산 본문을 프롬프트로 읽어 `runClaudeOnce`에 직접 주입 | 결정적에 가까움, 자산 텍스트는 agent-crew SSOT 유지 | 자산을 "파일로 읽어 쓰는" 절충 — 자연 트리거의 도그푸딩은 못 얻음 |
| **1C 명시 강제(--agent/Skill)** | `claude -p`에 `--agent`/Skill을 명시 지정해 강제 호출 | 결정적이면서 자산 경로를 그대로 탐, 도그푸딩 일부 확보 | Claude Code 종속 여전, CLI 플래그 안정성 의존 |

축: 결정성 ↔ 도그푸딩 ↔ 종속. (연구 권고: 측정 오염 방지를 위해 결정성 우선 →
**1C 또는 1B** 우세. 1A는 측정이 아니라 *설계*용이라 비결정성이 그대로 입력 품질
편차로 새는 위험.)

### 2. 출력 계약/결정성 — JSON 스키마 검증을 어디서 하나

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **2A 자산 스키마만** | 자산 본문에 출력 JSON 스키마를 명시, ops-pilot은 신뢰 | 계약이 자산과 함께 버전됨 | ops-pilot이 깨진 출력을 못 거름, zod 검증 우회 |
| **2B ops-pilot 후처리 파싱만** | 자산은 자유 출력, ops-pilot이 zod로 파싱·검증 | 기존 `scenarioSuggestionSchema` 재사용, 견고 | 계약이 자산 밖에 있어 자산만 봐선 출력 형태 불명 |
| **2C 둘 다 (SSOT 1곳 지정)** | 자산·ops-pilot 양쪽에 두되 **SSOT를 한 곳으로 지정** | 자산 가독 + ops-pilot 견고 둘 다 | 이중 정의 동기화 부담(SSOT 미지정 시 드리프트) |

(연구 권고: **2C + SSOT = zod**. 이미 `scenarioSuggestionSchema`가 검증 중이고
0001식 견고성과 정렬. 자산 본문엔 스키마를 "참고"로만, 강제 검증은 ops-pilot zod.)

### 3. 재사용 vs 신규 / 스킬 vs 에이전트

| 옵션 | 구성 | 장점 | 단점 |
|---|---|---|---|
| **3A trigger-designer 최대 재사용** | 기존 `harness-trigger-designer`를 ①에, 나머지도 최대한 거기 묶음 | 신규 자산 최소, 본보기 검증됨 | description개선·시나리오·성공조건은 역할이 달라 억지 결합 위험 |
| **3B 역할별 신규** | ①②③④ 각각 자산 신설 | 역할 분리 명확, 단일책임 | 자산 4개 관리·버전 부담, agent-crew 비대화 |
| **3C ①②재사용 + ③④통합 신규 1(에이전트)** | ①=trigger-designer, ②=기존 흐름, ③④=시나리오+성공조건 묶은 신규 에이전트 1 | 재사용·신규 균형, 시나리오·성공조건은 짝이라 결합 자연스러움 | ③④ 결합 경계가 흐려질 수 있음 |

축: 자산 수 ↔ 단일책임 ↔ 재사용. (연구 권고: **3C**. ①은 본보기 자산 그대로,
③④는 "시나리오 input + expectation"이 `scenarioSchema`에서 이미 한 쌍이라 통합
에이전트가 자연스럽다.)

### 4. 마이그레이션 — baked 프롬프트에서 자산으로 전환 방식

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **4A 즉시 교체** | baked 프롬프트 제거, 자산 호출로 일괄 전환 | 이원성 즉시 해소, 코드 깔끔 | 자산 호출 실패 시 평가 설계 전체 마비, 롤백 어려움 |
| **4B 격하·fallback 점진(0001식)** | 자산 호출을 기본으로, 실패 시 baked 프롬프트로 fallback. 졸업조건 충족 시 fallback 제거 | 0001의 "폐기 아닌 격하"와 정렬, 리스크 점진 흡수 | 이원 경로 일시 잔존(유지보수), 졸업조건 명시 필요 |

명시: **"생성 호출 = 기존 assist 헬퍼 재사용, 측정 러너 불변"** 을 못박아 "새 러너
금지" 원칙과의 충돌을 회피한다. (연구 권고: **4B**. 0001 선례와 동형, 평가 설계
마비 리스크를 점진 흡수.)

### 5. 성공조건 빌더(④)의 입력 경로 — MCP 티켓을 어떻게 다루나

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **5A 자유 텍스트만** | 자산이 자유 텍스트 요구사항만 받아 성공조건 산출 | 단순, 종속 없음 | 티켓 맥락(Notion·Jira) 활용 못함 |
| **5B MCP 티켓 직접** | 자산이 MCP로 티켓을 직접 조회해 성공조건 산출 | 맥락 풍부 | 자산이 MCP 종속·비결정성↑, 측정/설계 경계 흐려짐 |
| **5C 입력 어댑터 분리** | MCP 조회는 ops-pilot이, 자산엔 **정규화된 텍스트만** 넘김 | 자산 결정성·portability 유지, 종속이 ops-pilot에 격리 | 어댑터 1겹 추가 |

(연구 권고: **5C**. MCP는 ops-pilot 책임으로 격리해 자산을 결정적·이식 가능하게
유지. 1·2번의 결정성 우선 기조와 정렬.)

## 결정 필요 → 해소 (사람이 답함)

아래 6개 항목은 모두 결정으로 닫혔다(상세는 Decision Outcome·Consequences 참조):

1. **도그푸딩 vs 결정성 우선순위** → **결정성 우선(1B)**.
2. **JSON 계약 SSOT** → **shared-types zod(2C)**.
3. **② 반복 개선 루프 골격 위치** → **ops-pilot 유지**. LLM은 개선 한 스텝만
   자산이 담당하고, train/test·반복(`improveDescriptionLoop`)은 ops-pilot이 제어.
4. **MCP 티켓 통합 시점** → **ops-pilot 어댑터로 점진(5C)**. 이번 ADR엔 자유텍스트
   + 어댑터 골격까지, 실 MCP 배선은 후속 가능. 자산은 MCP 비종속 유지.
5. **fallback 폐기 졸업조건** → **무fallback 안정 산출 확인 시 제거**(자산 경로가
   fallback 없이 안정적으로 산출됨을 연속 N회/수 릴리스로 확인하면 baked 데드코드 제거).
6. **portability 한계 수용 강도** → **Cursor 비호환을 정직 표기**. 헤드리스
   `claude -p`·`.claude` 종속은 Claude Code 전용이며, 이 생성 기능은 Cursor에
   제공되지 않음을 문서·UI 라벨 수준에서 명시.

## 결정 (Decision Outcome)

OpsPilot 평가 **"설계(생성)"** 로직을 agent-crew 하네스 자산으로 이관하고 로컬
`claude -p`(헤드리스)가 호출한다. **측정**(probe 발화 감지·run·채점)은 ops-pilot에
**결정적으로 유지**한다. 결정포인트별 채택은 다음과 같다.

1. **호출 메커니즘 = 1B(본문 주입).** 자산 `.md` 본문을 `claude -p` 프롬프트로 직접
   주입한다(자산 = 프롬프트 SSOT, 기존 `runClaudeOnce`의 빈 cwd 경로 재사용).
   결정성이 baked와 동등하고 현 코드 변경이 최소라는 점을 우선했다. 트레이드오프 —
   "Claude가 스스로 자산을 자연 트리거"하는 순수 도그푸딩(1A)은 약화된다. 단 자산
   본문이 단일 진실이므로 **"자산이 곧 로직"** 은 유지된다. 1A는 생성 단계의 발화
   실패가 곧 기능 마비로 이어지므로 불채택했다.
2. **출력 계약 = 2C, SSOT = shared-types zod.** 자산 본문에 출력 JSON 스키마를
   명시하되, **단일 진실은 `packages/shared-types`의 zod**(`scenarioSchema`·
   `expectationSchema`·트리거 쿼리 스키마)다. ops-pilot이 zod로 검증·재시도하며,
   자산 `.md`는 "요약 + shared-types 참조"로 두어 drift를 최소화한다.
3. **자산 구성 = 3C.** ① 트리거 쿼리·② description 개선은 기존
   `harness-trigger-designer`(agent-crew)를 재사용한다(②의 "실패 사례 피드백" 산출
   지침은 본문 확장이 필요). ③ 시나리오 + ④ 성공조건은 **신규 에이전트 1개
   (`scenario-designer`, agent-crew)** 로 통합한다 — 시나리오 input과 assertions가
   동반 생성되어 응집도가 높기 때문이다. 종류는 **에이전트**(피호출 서브 역할,
   `agent-evaluator` 계열)이며 저작 경로는 `harness-creator` 스킬이다.
4. **마이그레이션 = 4B(격하·fallback 점진).** baked 프롬프트를 즉시 삭제하지 않고
   자산 호출 경로를 우선하며, 실패 시 baked로 fallback한다(0001의 "폐기 아닌 격하"
   패턴). 자산 산출 vs baked의 A/B 비교로 자가편향을 외부 검증한다
   (99-evaluation-framework §6.4). **"생성 호출 = 기존 assist 헬퍼(`runClaudeOnce`)
   재사용, 측정 러너(run/source·probe) 불변"** 을 못박아 "새 러너 금지" 원칙과의
   충돌을 회피한다. **fallback 졸업조건** — 자산 경로가 fallback 없이 안정 산출
   (예: 연속 N회/수 릴리스 무fallback)됨을 확인하면 baked 데드코드를 제거한다.
5. **성공조건 빌더 입력 = 5C(입력 어댑터 분리).** 자유텍스트 입력 + 티켓
   (Jira/Notion)은 **ops-pilot 측 MCP 어댑터가 텍스트로 정규화**해 자산에 주입한다.
   **자산은 MCP 비종속(portable)으로 유지**한다. 티켓 통합은 ops-pilot 어댑터로
   점진 적용하며, 이번 ADR 범위는 자유텍스트 + 어댑터 골격까지다(실 MCP 배선은
   후속 가능).

## 결과 (Consequences)

### 긍정

- 평가 설계 로직이 agent-crew **tag·sync로 진화**한다 — ops-pilot 재배포 없이
  프롬프트를 고칠 수 있고, 멀티프로젝트로 전파된다.
- **agent-crew = 설계 / ops-pilot = 측정** 역할분담이 코드 차원에서 강화된다
  (pivot ADR·`_overview`의 불변식과 일관).
- OpsPilot이 자기 평가 설계를 하네스 자산으로 수행하는 **도그푸딩**이 성립한다.

### 부정 / 위험

- **agent-crew sync 의존 증가** — "자동 sync 제품 기능 없음(수동)" 한계를 상속한다.
  자산을 고쳐도 소비 레포에 sync하지 않으면 반영되지 않는다.
- **Claude Code 종속(Cursor 비호환)** — 헤드리스 `claude -p`·`.claude` 종속이라
  이 생성 기능은 Cursor에 제공되지 않는다. 문서·UI에 정직히 표기한다.
- **자산 산출 변동성** — LLM 생성의 비결정성. 2C(zod 검증·재시도)와 4B(baked
  fallback)로 관리한다.
- **자가편향 위험** — 평가용 입력을 같은 하네스가 만든다. 측정을 결정적으로
  유지하고(설계와 분리), A/B(자산 vs baked) 외부 검증으로 방어한다.
- **두 경로 병존 유지비** — 자산 경로와 baked fallback이 일시 공존한다. 졸업조건
  (무fallback 안정 산출 확인)으로 종료한다.

### 0001과의 관계

- 0001(무상축 — 수집·표시)은 불변이며, 0002는 유상·생성축을 다룬다. 두 ADR은
  충돌 없이 겹치며, 0002는 0001의 점진 전환·"폐기 아닌 격하" 패턴을 그대로 차용한다.

## 후속 작업 (Follow-ups)

1. **agent-crew** — `harness-trigger-designer` 본문 확장(②의 실패 사례 피드백 지침)
   + `scenario-designer` 신규 에이전트 저작(`harness-creator` 스킬) → 버전 tag → sync.
2. **ops-pilot** — `trigger-eval/service`·`assist/scenario-suggest`를 자산 본문 주입
   호출로 전환(4B fallback), shared-types zod 계약 정렬, 티켓 어댑터 골격 추가.
3. **측정 불변 확인** — probe·run·score 경로는 변경하지 않음을 검증한다.
