# 작업 뷰 iteration 1 — 1차 사용 피드백 개선 설계

- 날짜: 2026-06-04
- 대상: `apps/web/src/domains/work/` (work-list-view, work-detail-view) + `apps/web/src/domains/feedback/components/pipeline-flow-band.tsx`
- 종류: UI/UX 개선(정보구조·시각·용어). 통합 구조·백엔드 API 무변경.
- 선행: 작업 중심 통합 뷰(`2026-06-04-work-centric-view-design.md`) 구현 완료 후 사용자 1차 사용 피드백.

## 배경

사용자가 :5173 작업 탭을 직접 사용하고 7개 문제를 지적. 통합 방향은 유지하되 정보 과부하·시각 구분·용어 불친절을 고친다. North Star("잘했나/뭘 고치나 빨리 판단")에서 핵심은 판정+개선안 결정이고, 처리단계·트레이스·검토·diff는 파고들 때만 필요한 보조다.

## 개선 항목

### A. 상세 화면 — 점진적 노출 (#1·#3·#4)

`WorkDetailIngest` 세로 서사를 2층으로 재배치:
- **항상 펼침(핵심)**: 커밋 헤더 + 판정 한 줄(VerdictStrip: 점수·상태) + ③ 개선안 결정 큐(ProposalCard 승인/거절/반영).
- **접힘(심화, 기본 닫힘 → 클릭 펼침)**: 처리단계(IngestPipelineSteps) + 파이프라인 액션(eval/review 재처리·강제종료) + ① 평가 상세(GradePanel·HumanScore·RunRetro·TraceSection) + ② 검토 + ④ diff.
- 접기 UI: shadcn 패턴 내 기존 컴포넌트로 구현. 별도 의존성 추가 금지 — `<details>`/`<summary>` 또는 간단한 useState 토글 섹션(disclosure). 섹션 제목 좌측에 ▸/▾.
- `WorkDetailRun`(수동 실행)도 동일 원칙: 판정 항상, ①평가 상세·④diff는 접힘.
- IngestPipelineSteps는 더 이상 상단 큰 자리 차지 안 함 — 심화 영역 안.

### B. 라벨 도구 중립화 (#2)

`WorkListView` 그룹 제목: "Cursor 작업" → **"코드 작업"**(커밋 흡수 ingest), "수동 실행"은 유지. (ingest에 작업 도구(Cursor/Claude) 정보가 없어 도구별 구분 불가 — 중립 표현.)

### C. 배지 컬러 코딩 (#5)

status·trigger 배지에 의미별 색(목록·상세 일관). 기존 `run-list.tsx`의 `statusVariant` 매핑 패턴 재사용:
- status: `reviewed`/`done`=success(초록), `evaluating`/`reviewing`=warning(노랑), `failed`=destructive(빨강), `pending`=secondary(회색).
- trigger: `auto`/`manual` 구분 variant(예: auto=default 톤, manual=outline) — 같은 secondary 회색 탈피.
- run status도 동일 매핑(이미 RunListItem.status 존재).
- 매핑은 work 도메인 내 공용 상수(`work/lib/badge-variant.ts` 또는 기존 statusVariant import)로 단일화 — 중복 정의 금지.

### D. 파이프라인 단계 = 클릭 필터 (#6)

`PipelineFlowBand`의 단계 카운트(대기/평가중/리뷰중/검토됨)를 **클릭 가능한 토글 필터**로:
- 클릭하면 그 status의 작업만 목록에 표시, 다시 클릭(또는 "전체")하면 해제.
- 필터 상태는 `WorkListView` 로컬 상태(useState). 선택된 단계는 active 스타일.
- `PipelineFlowBand`에 `activeStatus`·`onToggleStatus` props 추가(현재 표시 전용 → 인터랙티브). feedback-view는 제거됐으므로 work-list-view만 소비 — 시그니처 확장 자유.
- 필터는 cursor(ingest) 그룹에 적용. manual 그룹은 별도(영향 없음) 또는 필터 시 숨김 — 단순화 위해 status 필터 활성 시 cursor 그룹만 필터.

### E. 자동 ingest 칩 간소화 (#7)

`AutoIngestStatusChip`(pipeline-flow-band.tsx 내):
- 본문 텍스트: "자동 ingest ON · 30분 · batch 3" → **"자동 평가 켜짐"** (OFF면 "자동 평가 꺼짐").
- 주기·배치 등 상세는 ⓘ InfoMark 툴팁에 평이하게: "새 커밋을 30분마다 최대 3건씩 자동으로 평가합니다. 끄려면 서버 env OPS_AUTO_INGEST 를 끕니다."
- 전문용어(batch·interval·window) 표면 노출 제거.

## 범위 밖

- 통합 뷰 구조(목록↔드릴다운), 백엔드 API·스키마.
- 비교·벤치마크 패널(직전 재연결됨, 그대로).
- 트레이스/diff 내부 컴포넌트.

## 검증

- `corepack pnpm -r typecheck` · `corepack pnpm lint` · `cd apps/web && corepack pnpm build`.
- Playwright 실연동(:5173, terraform 실데이터):
  1. 상세 진입 → 판정+개선안만 펼침, 처리단계·트레이스·diff는 접힘. ▸ 클릭 시 펼침.
  2. 목록 그룹 제목 "코드 작업"/"수동 실행".
  3. status/trigger 배지 색이 의미별로 다름(검토됨 초록·실패 빨강 등).
  4. 파이프라인 단계 클릭 → 목록 필터, 재클릭 해제.
  5. 자동 ingest 칩 "자동 평가 켜짐" + ⓘ 툴팁 설명.
  - mutation(승인/거절/벤치마크 실행)은 실데이터 보호로 클릭 금지, 렌더만 확인.
