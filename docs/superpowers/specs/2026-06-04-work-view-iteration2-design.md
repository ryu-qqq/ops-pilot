# 작업 뷰 iteration 2 — 2차 사용 피드백 (용어·구조·시각 친절화)

- 날짜: 2026-06-04
- 대상: `apps/web/src/domains/work/components/work-detail-view.tsx`, `apps/web/src/domains/feedback/components/{proposal-card,trigger-badge,pipeline-flow-band,post-apply-banner}.tsx`, `apps/web/src/domains/project/components/project-bar.tsx`, `apps/web/src/domains/work/lib/badge-variant.ts`
- 종류: UI/UX 친절화(용어·정보구조·시각). 통합 구조·백엔드 API 무변경.
- 선행: iteration1(점진노출·라벨·배지·필터·칩) 후 2차 사용 피드백.
- 분리: 온보딩 가이드 투어(#8)는 **별도 sub-project** — 이 spec 범위 밖.

## 배경

내부 전문용어(eval·review·ingest·레지스트리 스캔·작업 신호 스캔·auto)가 제3자/처음 쓰는 사람에게 불친절하고, 상세 심화 정보가 한 묶음으로 뭉쳐 있으며, auto 배지 색이 거슬린다. North Star("판단을 빨리")에 앞서 "무슨 화면인지 이해"가 선행돼야 한다.

## 개선 항목

### A. 상세 심화 = 의미별 개별 접힘 (#6·#7)

`work-detail-view.tsx`의 현재 단일 Disclosure "처리 단계·평가·검토 상세"(셋 묶음) + 그 안의 트레이스 토글(중첩)을 해체한다. 심화를 **각각 독립 Disclosure(기본 닫힘)**로:

WorkDetailIngest 구조:
```
[항상 펼침] 커밋 헤더 + 판정(VerdictStrip) + 개선안 결정 큐
▸ 평가        GradePanel·HumanScore·RunRetro (evalRunId)
▸ 실행 과정    TraceSection (트레이스 리스트 ⇄ 흐름 그래프) — 평가에서 분리(#7)
▸ 검토        reviewSummary + 검토 과정 버튼 (reviewRunId)
▸ 처리 단계    IngestPipelineSteps + 파이프라인 액션(eval/review 재처리·강제종료)
▸ 변경 diff    DiffView
```
WorkDetailRun(수동 실행)은 평가·실행 과정·변경 diff 세 접힘만(검토·처리단계·개선안 없음).

- `TraceSection`은 더 이상 "평가" 안에서 자체 open 토글을 갖지 않는다 — "실행 과정" Disclosure가 펼침을 제어하고, 그 안에서는 리스트/그래프 모드 전환만(항상 표시). 즉 접힘 중첩 제거.
- Disclosure 컴포넌트(iteration1에서 만든 것) 재사용. 각 섹션 독립 open 상태.

### B. 용어 평이화 + 인라인 설명 (#2~#5)

| 위치 | 현재 | 변경 |
|---|---|---|
| proposal-card.tsx | "eval 트레이스" / "review 트레이스" | **"평가 과정" / "검토 과정"** |
| work-detail-view.tsx ② 검토 버튼 | "review 트레이스" | **"검토 과정"** |
| project-bar.tsx | "작업 신호 스캔" | **"정정 신호 새로고침"**, InfoMark: "이 자산을 쓸 때 사람이 몇 번 고쳐줬는지(정정 왕복) 참고 신호를 갱신. 품질 점수 아님." |
| post-apply-banner.tsx | "레지스트리 스캔 (권장)" | **"자산 목록 새로고침"**, 보조문구: "방금 반영한 변경을 자산·버전 목록에 반영합니다." (완료 메시지 "레지스트리 스캔 완료"도 "자산 목록 새로고침 완료"로) |
| pipeline-flow-band.tsx 자동 평가 칩 InfoMark | "끄려면 서버 OPS_AUTO_INGEST 를 끕니다." | **"서버 관리자 설정에서 켜고 끕니다 — 이 화면에선 바꿀 수 없어요. 켜져 있으면 새 커밋을 30분마다 최대 3건씩 자동 평가합니다."** |
| trigger-badge.tsx auto 툴팁 | "자동 ingest — 주기 스캔이 만든 번들 (ADR 0004)" | **"사람 개입 없이 30분 주기 스캔이 자동으로 만든 작업"** (ADR 내부참조 제거) |

- 라벨만 바꾸고 동작·핸들러는 그대로(scanWork·scanProject mutation 등 불변).

### C. auto 배지 색 (#1)

`work/lib/badge-variant.ts`의 `triggerVariant`: auto = `default`(흰/밝은 톤, 거슬림) → **차분한 톤**으로. Badge variant 중 `secondary`(회색) 또는 절제된 `info` 톤 사용(흰색 탈피). manual은 `outline` 유지. work 카드·상세·proposal(TriggerBadge)에서 auto 표현이 시각적으로 일관되도록 — TriggerBadge(trigger-badge.tsx)의 auto variant("info")와 triggerVariant(badge-variant.ts)가 충돌하지 않게 한쪽 기준으로 통일(badge-variant 기준 권장).

## 범위 밖

- 온보딩 가이드 투어(#8) — 별도 sub-project.
- 통합 뷰 구조(목록↔드릴다운), 백엔드 API·스키마.
- 트레이스/diff/proposal 내부 컴포넌트 로직.

## 검증

- `corepack pnpm -r typecheck` · `corepack pnpm lint` · `cd apps/web && corepack pnpm build`.
- Playwright 실연동(:5173, terraform 실데이터):
  1. 상세 진입 → 판정+개선안만 펼침, "평가/실행 과정/검토/처리 단계/변경 diff" **각각 독립 접힘**. 하나 펼쳐도 다른 건 닫힘 유지.
  2. "실행 과정" 펼침 → 트레이스 리스트/그래프 전환(중첩 토글 없이 바로 표시).
  3. 용어: "평가 과정"·"검토 과정"·"정정 신호 새로고침"·"자산 목록 새로고침"·자동평가 칩 ⓘ 새 문구.
  4. auto 배지 색이 흰색 아님(차분한 톤), manual과 구분.
  - mutation(승인/거절/스캔/벤치마크) 클릭 금지 — 렌더만 확인.
