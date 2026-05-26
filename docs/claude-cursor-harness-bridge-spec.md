# Claude → Cursor Harness Bridge — 스펙 (BRIDGE Epic)

> **추적:** Engineering OS Epic 「Claude → Cursor Harness Bridge」·Tasks BRIDGE-01 ~ BRIDGE-07  
> **선행:** [project-registration-two-mode-spec.md](./project-registration-two-mode-spec.md) (linked apply)

---

## 1. 문제

REG Epic 이후 apply는 **linked dev 폴더**에 떨어지지만, 대부분 **`.claude/`** (Claude Code harness) 이다.  
Cursor는 **`.cursor/rules/`** 만 기본 소비 → 피드백 루프가 **eval/review 파이프라인**에는 기여하지만 **Cursor Composer 품질**에는 반쪽만 반영된다.

---

## 2. North Star

> **`.claude/` = SSOT** (버저닝 · eval · apply · agent-crew sync)  
> **`.cursor/` = derived** (Cursor가 읽는 rules · skills · commands)  
> 피드백 1회 → Claude eval도 좋아지고 **Cursor 다음 세션도** 좋아진다.

---

## 3. SSOT · drift 정책 (v1)

| 규칙 | 내용 |
|---|---|
| **방향** | Claude → Cursor **one-way** (양방향 sync는 v2) |
| **생성** | `sync_cursor_harness` 가 `.cursor/` 파일에 generated marker 포함 |
| **수동 편집** | generated 블록은 다음 sync 시 덮어씀 — hand-authored는 `.cursor/rules/` 에만 (cursor_rule proposal) |
| **커밋** | linked apply 후 auto sync → 구조화 커밋 `ops(harness-bridge): …` |

---

## 4. 매핑표

| Claude (`.claude/`) | Cursor (`.cursor/`) | v1 전략 |
|---|---|---|
| `skills/<name>/SKILL.md` | `skills/<name>/SKILL.md` | 1:1 mirror (frontmatter 호환) |
| `commands/<name>.md` | `commands/<name>.md` | 1:1 mirror |
| `agents/<name>.md` | `rules/<name>.mdc` | derive (본문 + globs 근사) |
| `references/**` | skill `reference.md` 또는 rules 링크 | v1: mirror 생략, agent derive 시 요약 링크 |
| eval-only agents | — | **제외** (§5) |

---

## 5. 제외 목록 (eval-only · mirror 안 함)

OpsPilot 백그라운드 eval/review 전용 — Cursor에 노출하지 않는다.

- `work-evaluator`
- `proposal-reviewer`
- `proposal-applier`

(목록은 BRIDGE-01에서 lock 파일·config로 확장 가능)

---

## 6. 파이프라인

```
feedback apply → .claude/ (기존)
    ↓ linked only
sync_cursor_harness
    ↓
.cursor/skills · commands · rules (derived)
    ↓
Cursor 다음 세션
```

**managed** 프로젝트: auto sync 없음 — MCP/커맨드 수동 (`/opspilot-sync-cursor-harness`).

---

## 7. API · MCP (BRIDGE-02 ~ 06)

| 입구 | 설명 | 상태 |
|---|---|---|
| `POST /api/projects/:id/sync-cursor-harness` | REST `{ dryRun?, commit? }` | ✅ v1 |
| MCP `sync_cursor_harness` | `{ projectId, dryRun?, commit? }` | ✅ v1 |
| apply hook (linked) | proposal apply 성공 후 auto sync | ✅ v1 |

---

## 8. feedback targetKind 확장 (BRIDGE-05)

| kind | path | 상태 |
|---|---|---|
| `cursor_rule` | `.cursor/rules/*.mdc` | ✅ |
| `cursor_skill` | `.cursor/skills/*/SKILL.md` | ✅ v1 |

`cursor_skill` apply 후 bridge auto-sync **안 함** (hand-authored 보호). `.claude` agent/skill/command apply 후에만 sync.

---

## 9. 검증 (Epic Done — BRIDGE-07)

1. **Infrastructure linked** — sync 1회 → `feedback-loop` skill · `terraform-reviewer` derive rule 존재
2. **ingest → apply → sync** — Cursor Composer가 mirrored skill/rule 참조
3. `corepack pnpm -r typecheck` · `lint` · `cd apps/web && build`

---

## 10. 정직한 한계 (v1 이후)

- Claude agent frontmatter (MCP tools) → Cursor subagent 1:1 불가
- Subagent 포맷 변동 → v1은 agent→rule 우선
- `.cursor/` 레지스트리 UI는 optional
- agent-crew sync와 bridge sync 순서: **agent-crew 먼저 → bridge**

---

## 11. Task 의존 그래프

```
BRIDGE-01 (spec)
    ↓
BRIDGE-02 (transform)
    ├→ BRIDGE-03 (apply hook)
    ├→ BRIDGE-04 (scanner)
    ├→ BRIDGE-05 (cursor_skill)
    ├→ BRIDGE-06 (MCP·commands)
    └→ BRIDGE-07 (Infrastructure pilot)
```

---

*작성: 2026-05-26 · Engineering OS Epic 등록 · BRIDGE-01 산출물*
