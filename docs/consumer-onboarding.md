# 온보딩 가이드 — 내 프로젝트에 하네스 입히기

> "OpsPilot을 개발하는 사람"이 아니라 **"내 프로젝트에 공통 하네스를 적용하려는 사람"** 을 위한 가이드.
> 제품 개요·서사는 [README](../README.md) 참고.

## agent-crew란

우리 팀이 공통으로 쓰는 Claude Code 자산(에이전트·스킬·references)의 **원본 레포**([github.com/ryu-qqq/agent-crew](https://github.com/ryu-qqq/agent-crew), git tag로 버전 관리). OpsPilot은 이 원본을 **소비**해서, 지정한 tag의 자산을 내 프로젝트 `.claude/` 로 복사(sync)한다. 즉 _공통 에이전트·스킬을 내 프로젝트가 쓰게_ 만드는 게 sync다.

## 한 줄로

```bash
./scripts/bootstrap.sh --with-agent-crew=/path/to/내-프로젝트
```

서버를 띄우고, agent-crew repo를 확보한 뒤, 내 프로젝트에 공통 자산 + [must-reference](#must-reference) 블록까지 sync한다. 그 전에 내 프로젝트에 **`.claude/project.yaml`** 만 있으면 된다.

## 손으로 — 5단계

1. **agent-crew repo 확보** — `~/Documents/ryu-qqq/agent-crew` 에 clone(또는 `OPS_AGENT_CREW_PATH` 로 위치 지정).
2. **내 프로젝트에 `.claude/project.yaml`** 생성 — [agent-crew의 `project.yaml.example`](https://github.com/ryu-qqq/agent-crew/blob/main/project.yaml.example) 복사 후 최소 3값:
   ```yaml
   project:
     ide: claude-code # claude-code | cursor | both
   agentCrew:
     version: v0.9.1 # 가져올 agent-crew tag
     mustReference:
       - work-evaluator-4-principles # 항상 컨텍스트에 박을 핵심 원칙(기본 권장)
   ```
3. **등록** — OpsPilot에 `register_project`(MCP) 또는 `POST /api/projects` 로 `mode=linked`, `localPath=내-프로젝트`.
4. **sync** — `sync_agent_crew`(MCP) / `POST /projects/:id/sync-agent-crew`(REST) / 서버 없이 `corepack pnpm --filter @opspilot/server sync:agent-crew /내-프로젝트`. → 공통 자산 복사 + lock 갱신 + must-reference 주입.
5. **확인** — 대시보드 프로젝트 탭 또는 `list_assets` 로 자산이 잡혔는지.

## must-reference

자산이 아무리 좋아도 소비 프로젝트의 LLM이 **호출을 안 하면 무용지물**이다. must-reference는 _항상 컨텍스트에 들어가는 자리_ — Claude Code의 `CLAUDE.md` 맨 위, Cursor의 `alwaysApply` 룰 — 에 "이 원칙·자산을 먼저 참조하라"는 MUST 블록을 sync 시 자동 주입한다. 어느 자산을 강제할지는 `project.yaml.agentCrew.mustReference` 배열로 고른다(`work-evaluator-4-principles` 기본, `commit-format`·`pr-title` 등 opt-in). `project.ide` 값에 따라 `CLAUDE.md`·`.cursor/rules/agent-crew-must.mdc`·둘 다에 주입된다. 마커 블록(`<!-- agent-crew:must-reference:begin … end -->`)만 idempotent하게 교체하므로 기존 내용은 보존된다.

## 프로젝트 등록 — 두 모드

| 모드                 | 등록 UI         | apply land                | Cursor에서 보이려면                                      |
| -------------------- | --------------- | ------------------------- | -------------------------------------------------------- |
| **로컬 연결** (권장) | Cursor dev 경로 | 같은 폴더                 | 즉시                                                     |
| **관리 클론**        | git URL → clone | `OPS_PROJECTS_DIR/<slug>` | push/pull · cherry-pick · `/opspilot-sync-managed-clone` |

상세 스펙: [`project-registration-two-mode-spec.md`](./project-registration-two-mode-spec.md) · 마이그레이션: [`project-registration-migration-runbook.md`](./project-registration-migration-runbook.md)

### 흐름 — 로컬 연결 (linked, 권장)

```
Cursor(dev 경로) 작업 → commit
    ↓  ingest (gitRef = 그 경로 HEAD)
eval → review → HITL apply
    ↓
같은 폴더에 harness 반영 → (선택) 스캔 → 다음 Cursor 세션
```

### 흐름 — 관리 클론 (managed)

```
Cursor(dev) 작업 → commit → push (권장)
    ↓  OpsPilot scan (pull clone)
ingest → eval → review → HITL apply (clone만)
    ↓  sync — 피드백 배너 또는 /opspilot-sync-managed-clone
Cursor(dev) pull / cherry-pick
```

## Claude Code 에 등록 (MCP)

OpsPilot 서버(`:3001`)가 떠 있는 상태에서 한 줄로 등록한다 — 이후 모든 Claude Code 세션에서 OpsPilot 툴을 자연어로 호출할 수 있다.

```bash
claude mcp add --transport http opspilot http://localhost:3001/mcp
```

등록 후 노출되는 툴:

| 툴                      | 용도                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| `register_project`      | 프로젝트 등록 — `mode=linked`(로컬 경로) 또는 `managed`(git clone)      |
| `scan_project`          | 등록 경로 pull → `.claude` 스캔 → DB 적재 (멱등)                        |
| `list_projects`         | 등록 프로젝트 목록 (`workspaceMode` · `clonePath` · `remoteVerified`)   |
| `list_assets`           | 한 프로젝트의 자산 + 최근 5개 버전                                      |
| `list_scenarios`        | 한 자산에 묶인 시나리오 목록                                            |
| `start_run`             | asset_version × scenario 비동기 실행 (runId 즉시 반환)                  |
| `get_run`               | run 상세 + 옵션으로 trace 동봉                                          |
| `compare_runs`          | 여러 run 매트릭스 비교 (상태/토큰/비용/diff수/점수)                     |
| `ingest_cursor_session` | Cursor 작업 ingest + eval run 큐 (= REST ingest)                        |
| `list_proposals`        | ingest별 improvement_proposal 목록 (기본 draft)                         |
| `apply_proposal`        | HITL confirm 후 proposal 등록 경로에 반영                               |
| `review_proposals`      | proposal-reviewer run 큐                                                |
| `sync_agent_crew`       | agent-crew tag → `.claude` sync + must-reference 주입 (+ optional scan) |
| `sync_cursor_harness`   | `.claude` → `.cursor` derived mirror (skills · commands · agent rules)  |

linked apply 성공 시 **자동** `sync_cursor_harness` (best-effort). 수동: [`opspilot-sync-cursor-harness`](./cookbook/cursor-commands/opspilot-sync-cursor-harness.md).

> **참고** — Serena 같은 per-session stdio MCP 와 달리, OpsPilot 은 _상태 데이몬 + HTTP_ 모델이다. 매 세션마다 새로 띄우지 않고, 한 번 떠 있는 데이몬에 모든 세션이 붙는다.

## 자동 ingest (선택)

서버 env `OPS_AUTO_INGEST=1` 로 켜면, 주기 스캔(기본 30분, 최대 batch 3건)이 등록 프로젝트의 새 커밋을 자동으로 ingest·평가한다. 화면에선 끄고 켤 수 없다(서버 설정). 끄려면 env를 내린다.
