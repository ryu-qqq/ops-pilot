# 실행/트레이스 탭 UI/UX 결함 3건 수정 — 설계

- 날짜: 2026-06-04
- 대상: `apps/web/src/domains/run/` (runs-view, run-list) + `apps/web/src/app.tsx`
- 배경: 실행/트레이스 탭 실사용 중 발견한 UI/UX 결함 3건. 셋 다 코드로 원인 확정.

## 문제 (코드 근거)

1. **배지 깨짐** — `run-list.tsx:58-63`. `projectName` Badge에 `shrink`/`truncate`가 없고 부모 flex에 `min-w-0`가 없어, 긴 이름(`spring-platform-commons`)이 줄지 않고 옆 `scenarioName`을 밀어내 레이아웃이 터진다.
2. **빈 상태 공백** — `runs-view.tsx:69` `grid-cols-[340px_1fr]`. 우측 영역 전체가 `selectedRunId !== null &&` 가드라, run 미선택 시 우측 1fr이 완전 공백. 좌측 340px 카드만 떠서 가시성이 나쁘다.
3. **stale 상세** — `app.tsx:90` `onProjectIdChange={setProjectId}`. 프로젝트만 바꾸고 `selectedRunId`는 그대로. 둘 다 `usePersistedState`(localStorage 영속)라, run 0개 프로젝트로 바꾸면 좌측은 "아직 실행한 적 없어요"인데 우측은 **이전 프로젝트 run 상세**가 남는다(새로고침해도 잔존).

## 해결

### 핵심: 선택 동기화 한 규칙 (2 + 3 동시 해결)

`selectedRunId`가 현재 필터된 run 목록(`useRuns(projectId)`의 결과)에 **포함되지 않으면 → 목록 첫 run id로 교체, 목록이 비면 → null**.

- 프로젝트 변경으로 생긴 stale → 자동으로 새 프로젝트 첫 run 선택 (3 해결)
- localStorage에 남은 죽은 id → mount 시 정리 (새로고침 stale 차단)
- run 0개 → `null` → 우측 placeholder 노출 (2의 빈 상태는 "run 없음"일 때만)

**구현 위치**: run 목록을 쥔 곳에서 effect 하나. `RunList`가 `useRuns(projectId)` 결과를 이미 가지므로 거기서 동기화하고 부모로 통지한다.

**시그니처 조정**: 현재 `onSelect: (id: string) => void` 라 `null`을 통지할 수 없다. 동기화가 null을 보낼 수 있어야 하므로 `RunList`의 `onSelect`(그리고 그것을 받는 `RunsView` → `app.tsx`의 `setSelectedRunId` 배선)를 `(id: string | null) => void`로 넓힌다. `setSelectedRunId`는 이미 `string | null` 상태라 app.tsx 쪽은 타입만 맞으면 된다.

**effect 동작 (RunList 내부)**:
```
runs 로드 완료 후:
  selectedId 가 runs 에 없으면 → onSelect(runs[0]?.id ?? null)
```
- 의존성: `runs`(목록), `selectedId`. 깜빡임/루프 방지를 위해 "이미 일치하면 호출 안 함" 가드.
- 로딩/에러 중에는 동기화하지 않음(목록 미확정 상태에서 null로 밀지 않기 위해).

### (1) 배지 — 프로젝트명 우선, 시나리오명 줄임

`run-list.tsx` 2번째 메타 줄:
- 컨테이너 flex에 `min-w-0`
- `projectName` Badge: `shrink-0` + `max-w-[140px] truncate` (식별 핵심이라 우선 보존)
- `scenarioName` span: `truncate min-w-0` (공간 부족 시 이쪽이 줄어듦)
- 첫 줄(`assetName`)도 동일 패턴인지 점검, 필요 시 같은 처리.

### (2) 빈 상태 placeholder — 우측

`selectedRunId === null` && 비교/벤치마크 비활성일 때 우측에 안내 카드:
- run 0개 프로젝트: 아이콘 + "이 프로젝트엔 아직 실행이 없어요" + 힌트(좌측 EmptyState와 문구 일관).
- 자동선택 덕에 "run 있는데 미선택" 상태는 거의 발생하지 않으므로 placeholder의 주 역할은 0개 케이스.

## 범위 밖 (이번에 안 건드림)

- 비교(`ComparisonView`)·벤치마크(`BenchmarkSummary`) 패널
- run 상세 3탭 내부(트레이스/평가/시나리오)
- 폴링·쿼리 키 구조

## 검증

- `corepack pnpm -r typecheck` · `corepack pnpm lint` · `cd apps/web && corepack pnpm build`
- Playwright 실연동:
  1. 프로젝트 A(run 다수) 선택 → 첫 run 자동 상세 표시
  2. 프로젝트 B(run 0개, terraform-modules)로 전환 → 우측이 이전 상세를 버리고 placeholder, 좌측과 일치
  3. 긴 이름(spring-platform-commons) 배지가 레이아웃 안 깨고 truncate
  4. 새로고침 후에도 stale 상세 안 남음
