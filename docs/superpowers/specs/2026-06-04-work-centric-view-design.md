# 작업 중심 통합 뷰 — 실행/트레이스 + 피드백 재설계

- 날짜: 2026-06-04
- 대상: `apps/web/src/domains/{feedback,run}`, `apps/web/src/app.tsx`
- 종류: 정보구조·플로우 재설계 (UI/UX). 백엔드 API 변경 없음(기존 endpoint 재사용).

## 배경 — 진단

OpsPilot의 실제 흐름은 하나의 파이프라인이다:

```
Cursor 작업(커밋)
  → [ingest]      작업 흡수
  → [eval run]    work-evaluator 채점        ┐ 이 두 run이 현 "실행/트레이스" 탭 항목
  → [review run]  proposal-reviewer 검토      ┘
  → [proposal]    개선안 생성
  → [HITL 결정]   승인 / 거절 / clone 반영      이게 현 "피드백" 탭 결정 큐
```

현재 UI는 이 한 흐름을 **두 탭으로 분리**한다:
- **피드백 탭** = 파이프라인의 *결정*(개선안 큐, 승인/반영)
- **실행/트레이스 탭** = 같은 파이프라인의 *증거*(eval·review run 트레이스·점수)

증거는 결정 화면(proposal 카드의 "eval 트레이스" 버튼)에서 다른 탭으로 점프해 봐야 하고, 돌아오면 맥락이 끊긴다. 실행/트레이스 탭의 run은 모두 이 파이프라인 산물인데 목적별 묶음 없이 평면 나열돼 "이 run이 뭐였는지"가 안 보인다.

North Star("에이전트가 제대로·일관되게 작동하는지 **판단을 빨리** 돕는가") 기준으로, 사용자의 핵심 질문은 **"내 자산이 이번 작업에서 잘 했나? 아니면 뭘 고치지?"** 하나다. 지금은 그 답을 보려고 두 탭을 오가야 해 판단이 느려진다. 서사가 끊긴 것이 근본 원인.

> 실증: terraform-modules에서 작업을 많이 했는데 실행/트레이스가 비어, 만든 사람조차 "왜 안 나오지?"를 헷갈렸다. 개요의 *활동(usage 스캔)* 과 실행/피드백의 *eval 파이프라인* 이 다른 소스인데 UI가 그 차이를 설명하지 않는다(원인은 자동 ingest OFF였다). 통합 뷰가 없애야 할 혼란 1순위.

## 설계 결정 (확정)

| # | 결정 | 선택 | 근거 |
|---|---|---|---|
| 통합 수준 | A. 작업 중심 단일 뷰 | 채택 | 서사 통합이 North Star 직결 |
| 1차 객체 | 작업(ingest) | 채택 | 직접실행·벤치마크 run은 "수동 실행" 그룹으로 동일 리스트 수용 |
| 우측 배치 | 드릴다운 전체폭 | 채택 | "한 번에 하나 집중"(토스 원칙). 목록·상세 둘 다 풀폭 |
| ★1 비교·벤치마크 | 유지 + 작업 목록 상단 보조 진입점 | 채택 | 자산 평가 영역의 별개 작업 — 재배치는 스코프 밖 |
| ★2 마이그레이션 | 과감히 3탭 교체 | 채택 | 기존 컴포넌트 재사용. 병행은 "어느 탭?" 혼란. git 롤백 안전 |

## 목표 구조

### 탭 재편 (4 → 3)

```
개요  |  프로젝트  |  작업
```
- 개요·프로젝트(registry: 자산 등록·저작·실행)는 변경 없음.
- "피드백" + "실행/트레이스" → **작업** 한 탭으로 통합.

### 화면 A: 작업 목록 (전체폭)

- 단위 = ingest(Cursor 작업) 한 건.
- 카드 구성: **커밋 subject · 상태(평가중/검토중/검토됨/실패) · 판정 요약(점수, 개선안 N건) · 자동/수동 배지 · 시각**.
- 그룹: `Cursor 작업`(ingest) 섹션 + `수동 실행`(registry 직접 실행·벤치마크) 섹션 구분.
- 상단: 전역 projectId 프로젝트 필터 + 파이프라인 흐름 띠(현 `PipelineFlowBand`: 대기→평가중→리뷰중→검토됨 카운트 + 자동 ingest 상태 칩) + 비교/벤치마크 보조 진입점.
- 빈 상태: 프로젝트에 ingest 0건이면 "아직 작업이 없어요 + 자동 ingest 켜는 법" 안내(terraform 혼란 직접 대응).

### 화면 B: 작업 상세 (목록에서 클릭 → 전체폭, 뒤로가기로 목록)

세로 서사 한 흐름:
```
커밋 헤더    subject · gitRef · 시각 · 자동/수동 배지 · 전체 판정 한 줄(VerdictStrip)
① 평가       work-evaluator 점수/판정 (GradePanel·HumanScore·machine score) · [트레이스 ▸ 인라인]
② 검토       proposal-reviewer 요약 (있을 때) · [review 트레이스 ▸]
③ 개선안     결정 큐 — 카드별 [승인][거절] / [clone 반영] (현 ProposalCard 기능 그대로)
④ 변경 diff   [▸ 펼침] (현 DiffView)
```
- 기존 컴포넌트를 **이 서사 안에 재배치**: `VerdictStrip`·`GradePanel`·`HumanScore`·`RunRetro`·`TraceView`/`FlowGraph`·`ProposalCard`·`DiffView`. 새 컴포넌트는 서사를 묶는 컨테이너와 단계 헤더 정도.
- 트레이스는 인라인 펼침(리스트 ⇄ 그래프 토글 유지) — 현 3탭 트레이스 탭 내용을 ① 평가 단계 안으로.
- "수동 실행" 작업의 상세는 ③ 개선안이 없으므로 ①평가 + ④diff 중심(서사가 자연히 짧아짐).

## 컴포넌트 경계

- `WorkListView` (신규) — 화면 A. 목록·그룹·필터·흐름 띠·보조 진입점. 현 `FeedbackView`의 목록 부분 + run 목록 통합.
- `WorkDetailView` (신규) — 화면 B. 작업 하나의 세로 서사. 기존 상세 컴포넌트 오케스트레이션.
- 상태: 선택 작업 id(1차 키 = ingest id)를 작업 도메인 상태로 관리하고, 값이 null이면 목록 / 있으면 상세를 렌더(드릴다운 = 목록/상세 토글). 기존 `selectedRunId` 영속 패턴을 따라 `usePersistedState`로 영속.
- 기존 `RunsView`·`FeedbackView`는 위 둘로 흡수 후 제거(과감 교체). 비교/벤치마크 컴포넌트(`ComparisonView`·`BenchmarkSummary`)는 보조 진입점에서 그대로 호출.

## 데이터 흐름 (API 변경 없음)

- 작업 목록: `GET /api/feedback/ingests?projectId=` + (수동 실행) `GET /api/runs?projectId=`. 두 소스를 한 리스트로 머지·그룹.
- 작업 상세: ingest 상세(`/api/feedback/ingest/:id` — evalRunId·reviewRunId·proposals 포함) + 각 run의 trace/scores/diff(`/api/runs/:id/*`). 기존 hook(`useIngestDetail`·`useRun`·`useRunTrace` 등) 재사용.
- proposal 액션(approve/reject/apply)·reprocess·review·cancel: 기존 mutation 그대로.

## 범위 밖 (이번에 안 건드림)

- 백엔드 API·스키마.
- 비교·벤치마크 기능 자체의 재설계(진입점만 유지).
- 개요·프로젝트(registry) 탭.
- 자동 ingest 트리거 로직(별개로 이미 동작).

## 마이그레이션 / 리스크

- 과감 교체: app.tsx 탭 3개로, `feedback`/`runs` 탭 제거. 세 진입 핸들러(`handleRunCreated`·`handleBenchmarkStarted`·`handleOpenEvalRun`)는 새 작업 탭으로 라우팅하도록 갱신.
- 영속 키(`opspilot.tab.v2`·`opspilot.runs.selectedRunId`) 마이그레이션: 제거된 탭 값이 저장돼 있으면 기본값으로 폴백.
- 단계적 구현 가능: (1) WorkDetailView 서사(기존 컴포넌트 재배치) → (2) WorkListView 통합 목록 → (3) app.tsx 탭 교체·옛 뷰 제거. 각 단계 typecheck/lint/build 통과 후 진행.

## 검증

- `corepack pnpm -r typecheck` · `corepack pnpm lint` · `cd apps/web && corepack pnpm build`.
- Playwright 실연동(자동 ingest로 채워진 terraform-modules 실데이터 사용):
  1. 작업 탭 → 목록에 Cursor 작업 + 수동 실행 그룹 표시, 프로젝트 필터 동작.
  2. 작업 클릭 → 전체폭 서사(①평가 점수 ②검토 ③개선안 결정 ④diff) 한 화면, 뒤로가기로 목록 복귀.
  3. 개선안 [승인]/[거절] 동작이 상세 안에서 그대로.
  4. 트레이스 인라인 펼침(리스트⇄그래프).
  5. 빈 프로젝트: "작업 없음 + 자동 ingest 안내" placeholder.
