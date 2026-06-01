---
name: opspilot-crew
description: OpsPilot 고도화 의제를 받아 전용 팀(backend-dev·frontend-dev·reviewer + 기존 test-strategist·work-evaluator·기록자)에 분업시키는 오케스트레이터 스킬. 의제→작업 분해→구현 위임→검증→채점→기록→커밋의 한 흐름. "ops-pilot 의제 던질게", "이거 팀으로 작업", "ops-pilot 고도화하자", "이 기능 ops-pilot에 만들어줘", "대시보드 이렇게 바꾸자" 같이 OpsPilot 자체를 개선·확장하려는 요청에 트리거. 의제 단위로 OpsPilot을 직접 발전시킬 때 적극 사용한다.
---

# OpsPilot Crew Skill

> OpsPilot **프로젝트 전용** 스킬 (`.claude/skills/`). 의제를 팀에 분업시키는 오케스트레이터.

사용자가 던진 **의제 한 건**을 받아 OpsPilot 전용 팀에 분업시킨다. 스스로 구현·리뷰·평가하지
않는다 — **조율 전담**이다. 구현은 dev, 리뷰는 reviewer, 채점은 work-evaluator/ops-pilot.

## 작업 전 — OpsPilot 맥락 로드 (필수)

- **`CLAUDE.md`** — 작업 루프(예외 없음), 핵심 설계, 운영 함정, 정직성 규칙
- **`CONVENTIONS.md`** — 토스 4원칙·프론트·백엔드 규칙
- **`.claude/project.yaml`** — `tracking`(Notion Engineering OS·vault). Task ID = `TASK-xxx`

## 역할 분담 맵

| 역할 | 담당 자산 | 비고 |
|---|---|---|
| 제품 방향(PO) | `opspilot-po` | 신규(전용) |
| UX 설계 | `opspilot-designer` | 신규(전용) |
| 백엔드 개발 | `opspilot-backend-dev` | 신규(전용) |
| 프론트 개발 | `opspilot-frontend-dev` | 신규(전용) |
| 컨벤션 리뷰 | `opspilot-reviewer` | 신규(전용) |
| 테스트 계획 | `test-strategist` + `test-plan` 스킬 | 기존 재사용 |
| 작업 4원칙 채점 | `work-evaluator` | 기존 재사용 |
| 작업 관리(PM) | `notion-manager` + `engineering-os` 스킬 | 기존 재사용 (Engineering OS Task) |
| 기록 | `journal-recorder`·`wiki-curator`·`notion-doc-writer` | 기존 재사용 |

> 전용 테스터는 아직 없다 — `test-strategist`(계획) + dev의 검증으로 커버, 후속 단계에서 검토.

## 파이프라인 (의제 한 건)

```
의제 접수·가치판단 → 작업 분해 → (UI면)설계 → 구현 위임 → 검증 → 채점 → 기록 → 커밋·머지
```

1. **의제 접수·가치판단** (HITL) — `opspilot-po`로 North Star 대비 가치·**성공기준**·범위·우선순위를 정리. 보류·범위축소 권고도 받는다. 모호하면 묻는다(가정 금지).
2. **작업 분해** — 프론트/백엔드/공유(shared-types) 갈래로 나눈다. 필요하면 `engineering-os`로 Engineering OS Task(`TASK-xxx`) 발행·`진행 중`.
3. **설계** (UI 의제일 때) — `opspilot-designer`로 정보구조·레이아웃·상태·컴포넌트 매핑 스펙을 받아 frontend 구현의 입력으로.
4. **구현 위임** — `main`에서 `feat/...` 브랜치(직접 커밋 금지). 백엔드는 `opspilot-backend-dev`, 프론트는 `opspilot-frontend-dev`(designer 스펙 반영). 독립 작업이면 병렬, shared-types 변경은 먼저 합의.
5. **검증** — `opspilot-reviewer`로 컨벤션·운영함정 리뷰 + (필요시)`test-strategist` 테스트 계획 + 빌드/타입/lint. UI는 Playwright 실연동.
6. **채점** — `work-evaluator`로 작업 4원칙(가정·최소·범위·검증) 채점.
7. **기록** — 의미 있으면 `journal-recorder`(vault 시드)·`notion-manager`(Task 완료, Wiki ADR·Commit 필드).
8. **커밋·머지** (HITL) — 한국어 커밋, 루프 닫히면 `main --no-ff` 머지.

## 경계 (지킬 것)

- crew는 **조율만**. 구현·리뷰·평가를 직접 하지 않고 담당 자산에 위임한다.
- **기존 자산을 재발명하지 않는다** — 위 맵의 기존 에이전트를 그대로 호출.
- 핵심 설계(CLAUDE.md "바꾸지 말 것")를 깨는 의제는 사용자에게 트레이드오프를 드러내고 합의 전 진행하지 않는다.
- 검증 실패·미구현은 숨기지 말고 보고 (정직성 규칙).

## HITL 지점

의제 성공기준 확정 · 작업 분해 승인 · 커밋·머지. 이 셋은 사람이 정한다.

## 호출 경로

- **사용자 직접** — "ops-pilot에 이거 만들어줘", "이 의제로 팀 돌려"
- OpsPilot 자체를 개선·확장하는 모든 작업의 진입점
