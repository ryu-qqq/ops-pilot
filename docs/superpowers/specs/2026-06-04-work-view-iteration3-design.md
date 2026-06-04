# 작업 뷰 iteration 3 — 투어 펄스·처리단계·검토 인라인

- 날짜: 2026-06-04
- 대상: `apps/web/src/domains/onboarding/tour-overlay.tsx`, `apps/web/src/domains/work/components/work-detail-view.tsx`
- 종류: UI/UX 수정 + 버그픽스. 통합·API 무변경.
- 선행: 온보딩 투어 + 작업 뷰 iteration2. 3차 사용 피드백.

## 개선 항목

### #1 투어 펄스 부드럽게 (tour-overlay.tsx)
현재 타겟 펄스가 `animate-ping`(1초에 확 퍼지며 사라짐 → 빠르고 산만). → **퍼짐 없는 잔잔한 맥동**: 펄스 `<span>`의 `animate-ping` → `animate-pulse`(밝기만 천천히 맥동). ring 색은 유지. "확 퍼지는 원" 효과 제거.

### #2 처리 단계 항상 노출 (work-detail-view.tsx)
`IngestPipelineSteps`(대기→평가중→리뷰중→검토됨 진행)는 작고 한눈에 봐야 의미 있다. 현재 "처리 단계" Disclosure 안에 있는 걸 빼서 **판정(VerdictStrip) 바로 아래 상단에 항상 노출**. 그 Disclosure에 함께 있던 **파이프라인 액션**(eval/review 재처리·강제종료)은 별도 접힘("파이프라인 액션" Disclosure)으로 남긴다(자주 안 쓰는 액션이라). WorkDetailRun(수동 실행)은 IngestPipelineSteps 없음 — 변경 없음.

### #3 검토 과정 인라인 (work-detail-view.tsx) — 버그픽스
현재 ②검토 Disclosure의 "검토 과정" 버튼이 `onOpenRun(reviewRunId)` → `WorkDetailRun`(수동 실행 상세)로 전환돼 맥락이 깨진다("수동 실행"이라는 엉뚱한 화면). → 버튼 제거하고, 검토 Disclosure 안에서 **review 트레이스를 인라인**으로: reviewSummary + `<TraceSection runId={reviewRunId} onOpenRun={onOpenRun} />`(실행 과정과 동일 패턴). 화면을 떠나지 않고 같은 자리에서 검토 실행 트레이스를 본다. (TraceSection의 onOpenRun은 그래프 노드 클릭용으로만 유지 — 검토 진입 자체는 인라인.)

## 범위 밖
- 투어 단계·트리거, 통합 구조, 백엔드.

## 검증
- `corepack pnpm -r typecheck` · `corepack pnpm lint` · `cd apps/web && corepack pnpm build`.
- Playwright(:5173, terraform 실데이터):
  1. 투어 켜기 → 타겟 펄스가 잔잔히 맥동(확 퍼지지 않음).
  2. 작업 상세 → 처리 단계(진행 배지)가 판정 아래 항상 보임(접힘 아님).
  3. 검토 Disclosure 펼침 → review 트레이스가 인라인 표시, "검토 과정" 버튼으로 화면 안 떠남.
  - mutation 클릭 금지.
