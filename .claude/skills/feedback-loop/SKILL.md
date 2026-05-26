---
name: feedback-loop
description: OpsPilot 피드백 루프 전체 — ingest → work-evaluator eval → proposal-reviewer → apply. MCP opspilot 사용. Cursor 작업 후 개선안 자동화·HITL.
---

# Feedback Loop Skill

OpsPilot 데이몬(`:3001`) + MCP `opspilot` 전제.

## 파이프라인

```
ingest_cursor_session
  → eval (work-evaluator) → draft proposals
  → review_proposals (proposal-reviewer) → approve/reject + 저위험 auto-apply
  → apply_proposal (proposal-applier / 사람) → workflow_patch 등 잔여
  → scan_project
```

## MCP 순서

1. `ingest_cursor_session({ projectId, gitRef, retro, evalSource: "local-claude" })`
2. eval 완료까지 `list_proposals` 또는 ingest status 폴링 (`evaluating` → `done` → `reviewing` → `reviewed`)
3. `review_proposals({ ingestId })` — eval 후 자동 큐됐으면 생략 가능
4. `list_proposals({ ingestId, status: "all" })` — proposalReviews·applied 확인
5. `apply_proposal({ proposalId, confirm: true })` — approved 잔여 (특히 workflow_patch)
6. `scan_project({ projectId })`

## 프로젝트 준비

대상 repo `.claude/agents/`에 필요:

- `work-evaluator`
- `proposal-reviewer`
- `proposal-applier` (선택 — MCP 직접 호출도 가능)

등록 후 `scan_project`.

## fixture 검증

`evalSource: "fixture"` + `review_proposals` fixture — CI·로컬 결정론 테스트.

## 한계

- reviewer 거절 패턴을 다음 eval에 학습하지 않음 (환류 OPSP-21 미구현)
- workflow_patch는 append만 — 중복 검사는 reviewer+사람 몫
