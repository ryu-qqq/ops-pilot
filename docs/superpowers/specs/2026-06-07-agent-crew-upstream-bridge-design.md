# agent-crew 상류 안내 다리

2026-06-07. 의제: 공유 crew 자산(agent/skill/command) 개선안이 프로젝트 clone에 조용히 적용돼 상류로 못 가고 분기되는 걸 막는다. 도구무관 플라이휠의 "개선 절반" 중 공유 crew로 가는 줄기(#2).

## 크기부터 재기 (증거)

영속 DB(`apps/server/opspilot.sqlite`) 개선안 85건 분포:

| targetKind | 건수 | 성격 |
|---|---|---|
| cursor_rule | 76 | 프로젝트 전용 |
| workflow_patch | 8 | 프로젝트 전용 |
| agent | 1 | crew 후보(유일) |
| skill / command / cursor_skill | 0 | — |

공유 crew로 올라갈 후보(agent/skill/command)는 85건 중 1건. 크로스레포 풀 자동화(fork→PR→tag→resync)는 수요 대비 과투자라 **버린다**(YAGNI). 입력이 Cursor 작업이라 교훈이 대부분 cursor_rule이고, crew 에이전트 본문을 고칠 메타 수준 교훈은 구조적으로 드물다 — 억눌린 게 아니라 수요가 희소하다.

## 실증 — 조용한 분기는 이미 일어났다

그 1건을 추적: `.claude/agents/terraform-reviewer.md`, project=infrastructure, **status=applied**.

- infrastructure의 `agent-crew.lock` `syncedFiles` manifest에 `terraform-reviewer.md`가 **crew 출처로 기록**돼 있다.
- 그런데 개선안은 프로젝트 clone에만 applied. 다음 sync 때 crew 원본이 덮어쓴다 = 분기 소실. 기능이 막으려는 시나리오의 실데이터 증거.
- **엣지케이스**: 그 파일이 현재 agent-crew 레포(`~/Documents/ryu-qqq/agent-crew/agents/`)엔 없다(tag drift 또는 crew에서 삭제). manifest 기준 crew지만 현 crew 버전엔 부재. 안내가 이걸 솔직히 처리해야 한다.

## 결정

자동화 ROI는 없지만 "조용한 분기"는 실재하는 구멍이다. **안내 다리** — crew 자산 개선안을 차단하고 "상류(agent-crew)에서 고쳐라"를 *미리* 알린다. 자동 push·PR 없음. 변형은 **사전 배지 + 차단**(apply 누르기 전부터 인지).

## 설계

### ① 판정 함수 — 단일 진실
`apps/server/src/domains/feedback/`에 `classifyProposalTarget(project, proposal) → "crew" | "project"`.
- 규칙: `targetKind ∈ {agent, skill, command}` **이고** `targetPath`가 그 프로젝트 `agent-crew.lock`의 `syncedFiles` manifest에 있으면 → `crew`. 아니면 `project`.
- cursor_rule·cursor_skill·workflow_patch는 항상 `project`.
- lock 없는 프로젝트는 전부 `project`(차단 안 됨 — 의도된 동작).
- on-the-fly 계산, 저장 안 함(lock은 sync마다 바뀌어 저장하면 stale). 기존 `readAgentCrewLock`·manifest 셋 재사용(scanner의 `buildSourceTagger`와 같은 기준이라 일관).

### ② 응답 스키마 — 배지용 노출
`@opspilot/shared-types`의 improvement proposal 응답 스키마에 `crewBound: boolean` 파생 필드 추가. 목록·단건 조회 API가 proposal을 돌려줄 때 `classifyProposalTarget` 결과를 채운다. 저장 컬럼 아님 — DB 마이그레이션 없음.

### ③ apply 차단
`applyProposalToProject` 진입에서 맨 먼저 판정. `crew`면 `writeAsset` 호출하지 않고 `UpstreamRequiredError`를 던진다(기존 `FeedbackApplyError` 계열이되 "실패"가 아니라 "상류행"이라 구분되는 타입). 페이로드:
- crew 레포 경로(`OPS_AGENT_CREW_PATH` 또는 기본 `~/Documents/ryu-qqq/agent-crew`)와 그 안 상대 경로(`agents/{name}.md`)
- **crew 레포에 그 파일 실존 확인** — 없으면 "manifest엔 crew인데 현 crew 버전엔 없음, tag 확인 필요"를 메시지에 담는다(엣지케이스).
- 새 본문(`proposal.content`)
- resync 절차 한 줄("거기서 고치고 tag 올린 뒤 `sync_agent_crew`")

MCP `apply_proposal` 핸들러와 `POST .../apply` 라우트가 이 에러를 잡아 200/구조화 응답으로 변환(500 아님 — 정상 분기). proposal-applier 에이전트도 이 응답이면 "상류에서 고치라" 안내로 전환.

### ④ UI — 사전 배지 + 안내
작업 탭 개선안 카드(`apps/web/src/domains/work/...`):
- `crewBound`면 배지 "공유 crew — 상류에서 수정".
- "프로젝트에 적용" 버튼 → "agent-crew에서 수정" 버튼으로 대체. 클릭하면 다이얼로그/팝오버에 crew 경로·상대경로·새 본문·resync 절차 표시. content 복사 버튼은 무방. 파일 export는 안 함(변형 경계).

### ⑤ 검증
- 판정 함수 단위 테스트(server에 테스트 러너 있음 — `benchmark.test.ts` 존재): crew/project 분기, lock 없음→project, manifest 매칭, crew 파일 부재 엣지.
- `corepack pnpm -r typecheck` · `corepack pnpm lint` · `cd apps/web && corepack pnpm build`.
- 실데이터 e2e: terraform-reviewer 1건이 apply 시 실제로 차단되고 안내가 나오는지(현 crew 부재 메시지 포함) 한 번 확인.
- UI는 Playwright로 배지·대체 버튼·다이얼로그 1회 실연동.

## 비포함 (YAGNI)
자동 commit/push/PR, fork, tag 생성, 충돌 병합 — 없음. 수요 1건이라 사람이 직접. crew 개선안이 쌓이면 ②의 `crewBound`가 그대로 반자동 export의 토대가 된다(증분 가능).
