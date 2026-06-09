# MCP 레퍼런스

OpsPilot 데몬(:3001)이 떠 있으면 한 줄로 등록합니다. 이후 모든 Claude Code 세션에서 아래 툴을 자연어로 호출할 수 있습니다.

```bash
claude mcp add --transport http opspilot http://localhost:3001/mcp
```

Serena 같은 per-session stdio MCP와 달리, OpsPilot은 상태 데몬 + HTTP 모델입니다. 매 세션 새로 띄우지 않고, 한 번 떠 있는 데몬에 모든 세션이 붙습니다.

## 툴

| 툴 | 용도 |
| --- | --- |
| `register_project` | 프로젝트 등록 — `mode=linked`(로컬 경로) 또는 `managed`(git clone) |
| `scan_project` | 등록 경로 pull → `.claude` 스캔 → DB 적재 (멱등) |
| `list_projects` | 등록 프로젝트 목록 (`workspaceMode` · `clonePath` · `remoteVerified`) |
| `list_assets` | 한 프로젝트의 자산 + 최근 5개 버전 |
| `list_scenarios` | 한 자산에 묶인 시나리오 목록 |
| `start_run` | asset_version × scenario 비동기 실행 (runId 즉시 반환) |
| `get_run` | run 상세 + 옵션으로 trace 동봉 |
| `compare_runs` | 여러 run 매트릭스 비교 (상태/토큰/비용/diff수/점수) |
| `ingest_cursor_session` | Cursor 작업 ingest (= REST ingest, 자동 평가 켜져 있으면 eval run 도 큐) |
| `list_proposals` | ingest별 개선안 목록 (기본 draft) |
| `apply_proposal` | HITL 확인 후 개선안을 등록 경로에 반영 |
| `review_proposals` | proposal-reviewer run 큐 |
| `sync_agent_crew` | agent-crew tag → `.claude` sync + must-reference 주입 (+ 선택적 scan) |
| `sync_cursor_harness` | `.claude` → `.cursor` 미러 (skills · commands · agent rules) |

linked apply가 성공하면 `sync_cursor_harness` 가 자동으로 돕니다(best-effort). 수동으로 하려면 [`opspilot-sync-cursor-harness`](cookbook/cursor-commands/opspilot-sync-cursor-harness.md)를 씁니다.

## 자동 ingest

서버 env `OPS_AUTO_INGEST=1` 로 켜면 주기 스캔(기본 30분, 최대 batch 3건)이 등록 프로젝트의 새 커밋을 자동으로 ingest 합니다. 가져온 커밋은 작업 목록에 쌓입니다.

가져온 커밋을 자동으로 평가(work-evaluator)할지는 설정 화면의 "자동 평가" 토글로 끄고 켭니다(기본 꺼짐). 꺼두면 작업이 대기로 쌓이고, 평가할 것만 골라 작업 상세에서 직접 실행합니다. 평가 뒤 검토(proposal-reviewer)도 "자동 검토" 토글로 따로 제어합니다. 즉 가져오기는 env 로, 평가·검토는 화면 토글로 켭니다.
