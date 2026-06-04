# 실행/트레이스 재구성 — 프로젝트 필터 + 상세 3탭 설계

- 날짜: 2026-06-04
- 상태: 설계 (승인 대기)
- 대상: 실행/트레이스 탭 (`apps/web/src/domains/run/components/runs-view.tsx` 외)

## 1. 배경 · 문제

실행/트레이스 탭에 두 가지 불편이 있다:

- **(P1) 프로젝트 구분 없음** — run 목록이 모든 프로젝트의 실행을 시간순으로 쭉 섞어 보여줘, "어디서 뭐가 실행된 건지" 알 수 없다. `GET /api/runs`는 필터 파라미터가 없고 `listRuns()`는 전체를 반환한다.
- **(P2) 상세 화면이 너무 길다** — run을 선택하면 우측에 VerdictStrip → ScenarioPanel → GradePanel → HumanScore → RunRetro → TraceView가 세로로 한 화면에 다 쌓인다. TraceView만 500~2000px라 한 관심사(에이전트가 한 일 / 채점 / 시나리오)를 보려면 긴 스크롤을 헤맨다.

## 2. 결정

### A. 프로젝트 필터 (run 목록)

- 실행/트레이스 상단에 **`ProjectBar` 추가** — 개요·프로젝트 탭이 쓰는 **전역 `opspilot.projectId`**(app.tsx `usePersistedState`, localStorage)를 그대로 공유한다. 탭을 옮겨도 같은 프로젝트 선택이 유지된다.
- "전체"(미선택, `projectId=null`) 옵션 포함 — 안 고르면 지금처럼 전체.
- run 목록을 선택 프로젝트로 필터:
  - 백엔드: `GET /api/runs?projectId=<uuid>` 쿼리 파라미터 추가, `listRuns(projectId?)`가 `WHERE a.project_id = ?`(run→asset_version→asset 조인) 적용.
  - 프론트: `useRuns(projectId)` 훅이 projectId를 Query Key에 포함.
- **run 리스트 항목에 프로젝트 이름 표시** — 필터와 별개로, 어느 프로젝트 run인지 항목에서 바로 보이게. `listRuns` SELECT에 `p.name`(project) 추가, RunListItem 스키마·run-list.tsx 렌더에 반영.

### B. 상세 3탭 (VerdictStrip + 액션은 탭 위 고정)

어느 탭에 있든 판정·출처는 맥락으로 항상 보여야 하므로, **VerdictStrip(판정 한 줄 + 출처 브레드크럼)과 액션 버튼(변경보기·다시실행·강제종료)은 탭 위에 고정**한다. BenchmarkSummary·ComparisonView(벤치마크·비교 모드)도 기존처럼 이 고정 영역에 조건부로 둔다. 그 아래를 3탭으로 분리:

| 탭 | 내용 | 기존 컴포넌트 |
|---|---|---|
| ① **트레이스** (기본) | 에이전트가 한 일 — **리스트 ↔ 흐름 그래프 토글이 이 탭 안** | TraceView / FlowGraph + viewMode 토글 |
| ② **평가** | 채점(LLM·머신 채점 버튼) · 사람 점수 · 회고 | GradePanel · HumanScore · RunRetro |
| ③ **시나리오** | 목적 · 입력 · 기대 동작 · 성공조건 | ScenarioPanel |

- 기본 탭 = **트레이스**. run을 열면 에이전트 행동부터 보인다(판정 결과는 위 고정 줄에 이미 있음).
- 긴 TraceView·ScenarioPanel은 각자 탭 안에만 머물러 다른 관심사를 침범하지 않는다.
- 탭 컴포넌트는 프로젝트 상세 패널(`asset-detail-panel.tsx`)의 3탭 패턴과 동일한 UI 컨벤션 재사용(일관성).

## 3. 영향 파일 (예상)

- `apps/server/src/domains/run/repository.ts` — `listRuns(projectId?)` WHERE 조인 + SELECT에 project name, RunListItem 매핑.
- `apps/server/src/routes/api/runs.ts` — `GET /runs` querystring `{ projectId?: uuid }`.
- `packages/shared-types/src/domain.ts` — RunListItem 스키마에 `projectName`(+필요 시 `projectId`).
- `apps/web/src/domains/run/api.ts` · `use-run.ts` — `useRuns(projectId)` Query Key.
- `apps/web/src/domains/run/components/run-list.tsx` — 항목에 프로젝트 이름.
- `apps/web/src/domains/run/components/runs-view.tsx` — ProjectBar 추가 + 상세를 고정영역 + 3탭으로 재구성.
- (재사용) `domains/project/components/project-bar.tsx`, 프로젝트 상세 패널의 탭 UI 패턴.

## 4. 범위 밖 (이번에 안 함)

- run 리스트의 추가 필터(상태·source·종류) — 프로젝트 필터만. (기존에 있으면 유지.)
- 상세 컴포넌트 내부 로직 변경 — 위치(탭)만 옮기고 컴포넌트 자체는 그대로.
- 새 디자인 시스템 — 기존 탭/배지/카드 컴포넌트 재사용.
