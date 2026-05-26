---
name: feedback-loop
description: OpsPilot 피드백 루프 전체 — ingest → work-evaluator eval → proposal-reviewer → apply. MCP opspilot 사용. Cursor 작업 후 개선안 자동화·HITL.
---

# Feedback Loop Skill

OpsPilot 데이몬(`:3001`) + MCP `opspilot` 전제.

## 파이프라인

```
sync_agent_crew (필요 시)
  → ingest_cursor_session
  → eval (work-evaluator) → draft proposals
  → review_proposals (proposal-reviewer) → approve/reject + 저위험 auto-apply
  → apply_proposal (proposal-applier / 사람) → workflow_patch 등 잔여
  → scan_project
```

## MCP 순서

1. `sync_agent_crew({ projectId })` — `.claude/` 에 work-evaluator·proposal-* 반영 (lock 기준)
2. `ingest_cursor_session({ projectId, gitRef, retro, evalSource: "local-claude" })`
3. eval 완료까지 ingest status 폴링 (`evaluating` → `done` → `reviewing` → `reviewed`)
4. `list_proposals({ ingestId, status: "all" })` — proposalReviews·applied 확인
5. `apply_proposal({ proposalId, confirm: true })` — approved 잔여 (특히 workflow_patch)
6. `scan_project({ projectId })`

## 프로젝트 준비

`.claude/project.yaml` 의 `agentCrew.version` 과 `agent-crew.lock` 을 맞춘 뒤 sync.

필수 agent: `work-evaluator`, `proposal-reviewer` (`proposal-applier` 선택).

## fixture 검증

`evalSource: "fixture"` + `review_proposals` fixture — CI·로컬 결정론 테스트.

## 한계

- reviewer 거절 패턴을 다음 eval에 학습하지 않음 (환류 미구현)
- workflow_patch는 append만 — 중복 검사는 reviewer+사람 몫
