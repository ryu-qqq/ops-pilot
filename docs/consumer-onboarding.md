# 온보딩 가이드

OpsPilot이 이미 떠 있다는 전제입니다(아직이면 [README 시작하기](../README.md#시작하기)). 무엇을 하려는지에 따라 둘 중 하나로 시작하세요.

## 1. 내 프로젝트 자산을 평가해보기

내가 일하는 프로젝트의 `.claude` 자산을 OpsPilot에 올려 평가하는 가장 단순한 길입니다.

1. **등록** — 프로젝트 탭의 "프로젝트 등록"에서 내 로컬 폴더를 연결합니다(linked, 권장). Claude Code에서 하려면 `register_project` 로 `mode=linked`, `localPath=내 폴더`.
2. **스캔** — "스캔"을 누르면 그 폴더 `.claude` 의 에이전트·스킬·커맨드가 자산으로 잡힙니다.
3. **평가** — 헤더의 나침반(가이드 투어)을 켜면 작업을 평가하기까지 화면이 짚어줍니다.

## 2. 공용 하네스를 입히기

팀이 공유하는 자산 레포를 내 프로젝트 `.claude` 로 가져오는 길입니다. OpsPilot은 에이전트·스킬을 git tag로 버전 관리하는 공용 레포를, 지정한 tag대로 내 프로젝트에 복사(sync)합니다.

> 이 기능을 쓰려면 그런 공용 레포가 하나 있어야 합니다. 이 저장소가 쓰는 건 제 공용 레포 [ryu-qqq/agent-crew](https://github.com/ryu-qqq/agent-crew) 라서 아래 예시도 그걸 기준으로 적었습니다. 당신의 공용 레포가 같은 형식(`agents`·`skills`·`references` 폴더 + git tag)이면 위치만 바꿔 똑같이 쓰면 됩니다.

제 공용 레포(agent-crew)를 그대로 쓴다면 한 줄로 끝납니다.

```bash
./scripts/bootstrap.sh --with-agent-crew=/path/to/내-프로젝트
```

다른 공용 레포를 쓰거나 손으로 하려면 이렇게 합니다.

1. 공용 레포를 확보하고 `OPS_AGENT_CREW_PATH` 로 위치를 지정합니다(제 경우는 `~/Documents/ryu-qqq/agent-crew`).
2. 내 프로젝트에 `.claude/project.yaml` 을 만듭니다. 최소 세 값이면 됩니다.
   ```yaml
   project:
     ide: claude-code        # claude-code | cursor | both
   agentCrew:
     version: v0.9.1         # 가져올 tag
     mustReference:
       - work-evaluator-4-principles
   ```
3. 등록(`mode=linked`)한 뒤 sync 합니다 — `sync_agent_crew`(MCP) 또는 `POST /projects/:id/sync-agent-crew`. 공용 자산이 복사되고, `mustReference` 에 적은 자산은 `CLAUDE.md`(또는 Cursor 룰) 맨 위에 "이걸 먼저 참조하라"는 블록으로 자동 주입됩니다. 자산이 좋아도 LLM이 안 부르면 소용없으니, 항상 컨텍스트에 들어가는 자리에 박아두는 겁니다.

## 작업 탭 — 평가 결과 보고 개선안 결정하기

스캔까지 됐으면 Cursor·Claude로 일한 커밋이 작업 탭에 쌓입니다. 작업 하나를 열면 위에서부터 이렇게 읽으면 됩니다.

1. **판정** — work-evaluator 가 이 작업을 어떻게 봤는지 한 줄. 출처·시나리오·토큰·비용·시간이 같이 붙습니다.
2. **처리 단계** — 가져오기 → 평가 → 검토 → 반영 중 어디까지 왔는지.
3. **개선안** — "이 규칙을 이렇게 고치면 손이 덜 가겠다"는 제안. approve 하면 규칙·에이전트에 반영하고, reject 하면 버립니다. 결정이 여기서 일어납니다.

그 아래 평가·실행 과정·검토·변경 diff 는 접혀 있습니다. 필요할 때만 펼치세요. 평가는 점수와 직접 매기는 사람 점수 칸, 실행 과정은 work-evaluator 가 뭘 했는지 트레이스(리스트·흐름 그래프), 검토는 개선안을 거른 근거, 변경 diff 는 그 커밋이 실제로 바꾼 코드입니다(확장자별로 색을 입혀 보여줍니다).

## 평가는 켜고 끄는 겁니다

가져온 커밋을 바로 평가할지는 설정(헤더 톱니바퀴)의 "자동 평가" 토글로 정합니다. 기본은 꺼짐입니다. 꺼두면 작업이 '대기'로 쌓이고, 평가할 것만 골라 작업 상세에서 "평가" 버튼으로 직접 돌립니다. 평가에 LLM 비용이 드니까 다 자동으로 돌리지 않고 고르라는 거예요. 평가 뒤 검토(proposal-reviewer)도 "자동 검토" 토글로 따로 켜고 끕니다.

가져오기 자체를 자동으로 할지는 또 다른 스위치입니다. 데몬을 `OPS_AUTO_INGEST=1` 로 띄웠을 때만 타이머가 Cursor 작업을 빨아들입니다(바로 아래 참고). 정리하면 가져오기는 env 로, 평가·검토는 화면 토글로 켭니다.

## 데몬은 따로 띄워야 합니다

헷갈리기 쉬운 부분이라 미리 짚어둡니다. OpsPilot은 로컬에서 도는 서버(데몬)입니다. Claude Code를 켠다고 자동으로 뜨지 않아요. 위 등록·스캔·sync가 동작하려면 `:3001` 서버가 떠 있어야 합니다(아직이면 [README 시작하기](../README.md#시작하기)).

흐름은 늘 같습니다. **등록 → sync → 스캔.** 등록으로 내 프로젝트를 OpsPilot에 붙이고, sync로 공용 자산을 `.claude`에 가져오고(공용 하네스를 쓸 때만), 스캔으로 그 자산을 OpsPilot이 읽어 들입니다. UI에서 다 버튼으로 됩니다.

입구가 둘이라는 것도 기억해두면 편합니다. Cursor 작업을 자동으로 빨아들이는 ingest는 **데몬이 타이머로 돌립니다**(서버를 `OPS_AUTO_INGEST=1`로 띄웠을 때). 반면 MCP 툴(`register_project`·`scan_project`·`ingest_cursor_session` 등)은 **내가 Claude Code에서 직접 부르는 수동 입구**입니다. 자동 ingest를 안 켰으면 ingest는 수동으로 부르면 됩니다.

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
