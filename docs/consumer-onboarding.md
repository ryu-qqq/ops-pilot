# 온보딩 가이드

OpsPilot이 이미 떠 있다는 전제입니다(아직이면 [README 시작하기](../README.md#시작하기)). 무엇을 하려는지에 따라 둘 중 하나로 시작하세요.

## 1. 내 프로젝트 자산을 평가해보기

내가 일하는 프로젝트의 `.claude` 자산을 OpsPilot에 올려 평가하는 가장 단순한 길입니다.

1. **등록** — 프로젝트 탭의 "프로젝트 등록"에서 내 로컬 폴더를 연결합니다(linked, 권장). Claude Code에서 하려면 `register_project` 로 `mode=linked`, `localPath=내 폴더`.
2. **스캔** — "스캔"을 누르면 그 폴더 `.claude` 의 에이전트·스킬·커맨드가 자산으로 잡힙니다.
3. **평가** — 헤더의 나침반(가이드 투어)을 켜면 작업을 평가하기까지 화면이 짚어줍니다.

## 2. 팀 공통 하네스 입히기

팀이 공유하는 자산을 내 프로젝트에 가져오는 길입니다. agent-crew는 팀 공통 Claude Code 자산(에이전트·스킬·references)의 원본 레포([github.com/ryu-qqq/agent-crew](https://github.com/ryu-qqq/agent-crew))이고, git tag로 버전을 관리합니다. OpsPilot이 지정한 tag의 자산을 내 프로젝트 `.claude` 로 복사(sync)합니다.

가장 빠른 길은 한 줄입니다.

```bash
./scripts/bootstrap.sh --with-agent-crew=/path/to/내-프로젝트
```

손으로 하려면 이렇게 합니다.

1. agent-crew repo를 확보합니다 — `~/Documents/ryu-qqq/agent-crew` 에 clone, 또는 `OPS_AGENT_CREW_PATH` 로 위치를 지정합니다.
2. 내 프로젝트에 `.claude/project.yaml` 을 만듭니다. 최소 세 값이면 됩니다.
   ```yaml
   project:
     ide: claude-code        # claude-code | cursor | both
   agentCrew:
     version: v0.9.1         # 가져올 agent-crew tag
     mustReference:
       - work-evaluator-4-principles
   ```
3. 등록(`mode=linked`)한 뒤 sync 합니다 — `sync_agent_crew`(MCP) 또는 `POST /projects/:id/sync-agent-crew`. 공통 자산이 복사되고, `mustReference` 에 적은 자산은 `CLAUDE.md`(또는 Cursor 룰) 맨 위에 "이걸 먼저 참조하라"는 블록으로 자동 주입됩니다. 자산이 좋아도 LLM이 안 부르면 소용없으니, 항상 컨텍스트에 들어가는 자리에 박아두는 겁니다.

## 등록 두 모드

| | linked (기본 권장) | managed |
| --- | --- | --- |
| 누가 | 그 레포에서 매일 작업하는 사람 | 원격-only · 격리 실험 |
| 등록 입력 | 로컬 폴더 경로 | Git URL |
| apply 후 Cursor | 즉시 반영 | sync 필요 |

대부분 linked면 됩니다. managed는 로컬 checkout 없이 URL만으로 평가하거나, 일상 작업 폴더와 분리해서 실험하고 싶을 때 씁니다. (자세한 차이·마이그레이션은 [등록 두 모드 스펙](project-registration-two-mode-spec.md)에 있습니다.)

## Claude Code에서 호출

OpsPilot 툴을 Claude Code 세션에서 쓰려면 MCP를 등록합니다.

```bash
claude mcp add --transport http opspilot http://localhost:3001/mcp
```

자주 쓰는 건 `register_project` · `scan_project` · `ingest_cursor_session` · `list_proposals` · `apply_proposal` 정도입니다. 14개 툴 전부와 자세한 용도, 자동 ingest 설정은 [MCP 레퍼런스](mcp-reference.md)에 있습니다.
