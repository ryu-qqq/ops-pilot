# 온보딩 가이드 투어 — 설계

- 날짜: 2026-06-04
- 대상: `apps/web/src/domains/onboarding/`(신규) + `apps/web/src/app.tsx` + data-tour 속성 부여(project-bar, work-list-view, work-detail-view)
- 종류: 신규 기능(인터랙티브 온보딩 투어). 백엔드 무관, 프론트 전용. **의존성 추가 없음(자체구현)** — CLAUDE.md 의존성 최소 정책.
- 선행: 작업 중심 통합 뷰(3탭) main 머지 완료.

## 목적

처음 쓰는 사람이 "이 도구로 무엇을 어떤 순서로 하는지"를 따라갈 수 있게, **가이드 토글을 켜면** 핵심 경로의 요소를 **펄스 하이라이트 + 말풍선**으로 단계별 안내한다. North Star("판단을 빨리")에 앞서 "무슨 화면인지·뭘 하는지 이해"를 돕는다.

## 동작

- **트리거**: 헤더 ⓘ(InfoDialog) 옆에 **"가이드" 토글 버튼**(나침반 아이콘, aria-label "가이드 투어"). 켜면 1단계부터 시작. 끄거나 마지막 "완료" 누르면 종료. 첫 방문 자동 시작은 **하지 않는다**(수동 토글만).
- **형태**: 화면 딤 오버레이(반투명, 클릭 시 닫힘 옵션) + 현재 타겟 요소 둘레 **펄스 링**(Tailwind animate-ping 류) + 말풍선(제목·설명·`이전`/`다음`/`닫기`·진행 `N/M`). 마지막 단계 버튼은 `완료`.
- **탭/상세 자동 전환**: 단계가 다른 탭이나 작업 상세를 요구하면, 그 단계로 진입할 때 투어가 `setTab`·`setWorkSelection`을 호출해 화면을 맞춘다(사용자가 직접 클릭 안 해도 다음 단계 요소가 보이도록).
- **타겟 식별**: CSS 셀렉터 깨짐 방지를 위해 대상 요소에 `data-tour="<key>"` 속성을 부여하고 `document.querySelector('[data-tour="<key>"]')`로 찾는다.
- **위치 계산**: 타겟의 `getBoundingClientRect()`로 펄스 링·말풍선 위치 산정. `resize`·`scroll` 리스너로 갱신. 탭 전환/드릴다운 직후 요소 마운트 지연은 `requestAnimationFrame` 재시도(최대 N회) 또는 짧은 폴링으로 흡수.
- **엣지케이스**: 타겟 요소가 없으면(예: 작업 0건이라 카드 없음) 그 단계는 **하이라이트 없이 화면 중앙 말풍선 + 설명**만 띄운다(스킵하지 않고 안내는 유지). 투어는 데이터 유무와 무관하게 끝까지 진행 가능.

## 단계 시퀀스 (첫 사용 핵심 경로)

| # | 타겟(data-tour) | 탭/상태 사전 액션 | 제목 | 설명 |
|---|---|---|---|---|
| 1 | `project-select` (ProjectBar Select) | setTab("work") | 프로젝트 고르기 | 먼저 평가할 프로젝트를 골라요. |
| 2 | `scan` (ProjectBar 스캔 버튼) | setTab("work") | 자산 읽기 | 스캔하면 그 프로젝트의 에이전트·스킬·커맨드(자산)를 읽어들여요. |
| 3 | `work-list` (WorkListView 목록 영역) | setTab("work") | 작업이 쌓이는 곳 | Cursor·AI 작업이 자동 평가돼 여기 작업으로 쌓여요. 위 단계 배지로 진행 상태도 봐요. |
| 4 | `work-card` (목록 첫 작업 카드) | setTab("work"), selection=null | 작업 열기 | 작업 하나를 열면 그 작업의 평가·개선안이 한 화면에 보여요. |
| 5 | `verdict` (WorkDetail VerdictStrip) | setTab("work"), selection=첫 작업 | 잘했나 판단 | 이 작업을 잘했는지 — 점수·판정을 한눈에 봐요. |
| 6 | `proposals` (WorkDetail 개선안 섹션) | setTab("work"), selection=첫 작업 | 뭘 고치나 결정 | 개선안을 승인/거절해요. 승인하면 자산에 반영돼 다음 작업이 더 나아져요. |

- 5·6의 "첫 작업" 자동 선택: 4→5 전환 시 투어가 현재 프로젝트 작업 목록의 첫 항목을 `setWorkSelection({kind, id})`. 작업이 없으면 5·6은 엣지케이스(중앙 말풍선) 처리.
- 자동 선택할 첫 작업 id: **app.tsx가 제공한다**(app은 이미 전역 `projectId`를 쥐고 있으므로, `useIngests(projectId)` 첫 항목 id를 구해 use-tour의 selection 콜백에 넘긴다). use-tour는 화면 hook을 직접 참조하지 않고 콜백만 호출(결합도 최소).

## 컴포넌트 경계

- `domains/onboarding/tour-steps.ts` — 단계 정의 배열(`TourStep`: `key`, `target`(data-tour 값|null), `title`, `body`, `placement`, `tab`, `needsSelection?`). 순수 데이터.
- `domains/onboarding/use-tour.ts` — 투어 상태 hook: `active`·`stepIndex`·`start()`·`next()`·`prev()`·`close()`. 단계 전환 시 필요한 화면 액션(setTab·setWorkSelection)을 콜백으로 위임받아 호출.
- `domains/onboarding/tour-overlay.tsx` — 활성 시 렌더: 딤 오버레이 + 타겟 펄스 링 + 말풍선(네비). 위치 계산·리스너·마운트 재시도. 타겟 없으면 중앙 말풍선.
- `app.tsx` — 헤더 가이드 토글 버튼 + `<TourOverlay/>` 마운트. use-tour에 `setTab`·`setWorkSelection`·"첫 작업 id 조회"를 연결.
- data-tour 속성 부여: `project-bar.tsx`(project-select·scan), `work-list-view.tsx`(work-list·work-card[첫 항목]), `work-detail-view.tsx`(verdict·proposals).

## 범위 밖

- 분석·벤치마크·비교·프로젝트 등록·훅 설치 등 고급 기능 안내(핵심 경로만).
- 첫 방문 자동 시작·진행률 영속·다국어.
- 백엔드.

## 검증

- `corepack pnpm -r typecheck` · `corepack pnpm lint` · `cd apps/web && corepack pnpm build`.
- Playwright 실연동(:5173, terraform 실데이터):
  1. 헤더 가이드 토글 → 투어 시작, 1단계 프로젝트 선택에 펄스+말풍선.
  2. `다음`으로 2→3→4 진행, 탭/요소가 자동으로 맞춰짐, 진행 `N/6` 표시.
  3. 4→5 전환 시 첫 작업 자동 선택돼 상세 verdict에 하이라이트, 6에서 개선안 섹션.
  4. `완료`/`닫기`/토글 OFF로 종료, 오버레이 사라짐.
  5. 작업 0건 프로젝트로도 투어가 중앙 말풍선으로 끝까지 진행(깨지지 않음).
  - 투어 중 실제 mutation(승인/스캔) 클릭 금지 — 안내만.
