# 의제1 — 사용량 랭킹·작업기반 평가·prune (자산 헬스)

> 사용자 첫 아젠다(2026-06-01)를 `opspilot-crew`로 분해한 카드 백로그.
> `opspilot-po`가 코드 조사 후 정리. 다음 세션이 "카드 B 이어가자" 했을 때 복원 근거.

## 의제 한 줄

내가 만든 자산이 **실제로 쓰이는지**를 Grafana처럼 **켜자마자 첫 화면에서** 보고,
안 쓰는 건 지우고, 평가는 시나리오를 따로 돌리는 게 아니라 **실제 작업에서 자동 수집**되게.
→ *측정의 자동화 + 첫인상 전환*이 핵심이고, 측정 엔진 자체는 이미 70% 존재했다.

## North Star·원칙 (판단 기준)

- North Star: "에이전트가 제대로·일관되게 작동하는지 판단을 빨리 돕는가".
- **무상 측정 영역**: trigger 정확도·usage는 정답 정의 없이 공짜로 측정. 효과(가치) 판정은 누군가 "좋음"을 정의해야 하는 비용 → 사용자가 싫어함. **무상 프록시 지표까지만.**
- 차별점: agent-crew 공통 자산 소비 + 로컬 transcript 사용량 + 격리실행·eval을 묶은 통합 로컬 컨트롤 플레인.
- 저작 vs 평가 경계: 저작은 터미널/agent-crew, **ops-pilot UI = 평가·사용량·prune 전용** → UI 저작 기능 늘리지 말 것.

## 카드

### 카드 A — 첫 진입을 "개요 대시보드"로 (Grafana 첫인상) ✅ 완료 (`60eb8b4`)

- **무엇을**: 기본 탭을 `feedback` → 개요(overview)로. 이미 만든 전역 리더보드(7/30)·자산 헬스를 켜자마자 보이는 첫 화면으로 승격.
- **왜**: 작동을 *판단*하는 첫 신호가 사용량인데 피드백 큐가 먼저 떠서 비전과 반대.
- **성공기준**: 앱 켜면 첫 화면에 7/30일 Top 자산 + 미사용 수.
- **결과**: overview 탭 신설·기본탭(persist키 `opspilot.tab.v2`), `OverviewView`(리더보드+헬스 요약 재사용), 측정로직 0.

### 카드 D — 작업기반 평가 자동 수집 ✅ 완료 (ADR `9efdc15` + 백 `e3ca907` + 프론트 `498e482`)

- **무엇을**: 평가 신호를 worktree 재실행이 아니라 실작업 transcript에서 추출 — 발화·정정왕복. 주기 스캔 자동 수집.
- **왜**: 사용자가 가장 원한 것이자 가장 큰 갭. worktree 재실행(LLM 확률성·토큰 낭비)을 사용자가 거부.
- **결과**: ADR-0001. 신호=발화+정정왕복(**참고신호, 품질점수 아님** — 발화별 0/1, corr≤발화수, 자동주입 user 배제), 단위=세션(JSONL), 트리거=주기 전수스캔, worktree eval 기본에서 내림. `asset_work_metric` 테이블·`GET/POST /usage/work-metrics`·자산 헬스 "정정왕복〔참고〕" 컬럼(오독방지 라벨링).

### 카드 B — 공통 crew 자산 vs 프로젝트 전용 출처 구분 ✅ 완료 (`d7bb9df` + merge `e24db20`)

- **무엇을**: asset에 `source`(crew / project-local) 메타 부여. **agent-crew.lock의 sync 범위와 대조해 스캔 시 태깅**. UI 배지로 분리 표시 + 리더보드/헬스에서 필터.
- **결과**: 판정 원천 = sync가 복사 파일 목록을 `agent-crew.lock`의 `syncedFiles` manifest로 기록 → scanner가 멤버십 대조로 태깅. legacy lock(manifest 없음)=`unknown`(추측 금지, re-sync로 채움). `AssetSource`(crew/project-local/unknown) enum·`asset.source` 컬럼·멱등 마이그레이션·헬스 대시보드 출처 배지+필터(unknown 숨김 → 과도기 노이즈 0). 검증: scanner 시뮬레이션 22 crew/12 전용 정확 분류·Playwright 실연동. **남은 액션: ops-pilot 자체 re-sync 1회**(실DB는 그 전까지 전부 unknown). 리더보드는 범위 제외(이름 집계라 자산 FK 없음 — 헬스 대시보드만).
- **왜**: 차별점 직결(agent-crew 소비 + 로컬 사용량 결합). "이 미사용 자산이 *내 것*이라 지워도 되나, *공용*이라 다른 프로젝트가 쓰나"를 구분해야 prune 판단이 안전. 지금은 UsageCell이 "다른 곳만 쓰임 → 공용일 수 있음"을 **추정 툴팁으로만** 표기.
- **성공기준**: 각 자산이 crew/local 배지로 구분되고, "전체 0회지만 다른 프로젝트에서 쓰임"과 "정말 아무도 안 씀"이 **데이터로** 갈린다.
- **범위**: 포함 = asset `source` 컬럼·스캐너 태깅·UI 배지·필터. 제외 = crew 자산의 타 머신 원격 사용량(로컬 transcript 한정).
- **근거 파일**: `apps/server/src/domains/registry/repository.ts`(자산엔 현재 `scope`(user/project)만, source/tagSource 없음), `apps/server/src/db/migrate.ts`·`schema.sql`(source 컬럼 마이그레이션), `.claude/agent-crew.lock`(sync 범위 = crew 자산 목록), `apps/web/.../asset-health-dashboard.tsx`·`usage-leaderboard.tsx`(배지·필터).
- **권고(PO)**: 진행(로컬 한정 명시). 마이그레이션 1건. 무상 측정 영역이라 비용 대비 가치 높음.

### 카드 C — prune 추천 → 실행(삭제 액션) ✅ 완료 (`8435453` + merge `ae9c761`)

- **무엇을**: 헬스 대시보드 미사용 자산에 "보관/삭제 제안" 액션. 삭제 = `.claude`에서 제거 + 구조화 커밋(git=버전 단일원천 규칙 준수). **crew 자산은 삭제 차단/경고**.
- **결과**: `deleteAsset`(authoring/service.ts) = writeAsset 대칭 미러 — 이중 가드(`source==="project-local"` 만, crew·unknown 차단 / `.claude` agent·skill·command 만) → `git rm -rf` + 구조화 커밋(`[opspilot pruned]`) → DB행 하드삭제(asset_version→run→score/trace·scenario cascade; work_metric 은 FK 아니라 잔존). skill 은 디렉터리 단위 삭제. `POST /registry/assets/:id/prune`(Zod, 차단 400). 프론트 상세패널 하단 파괴적 액션(2단계 확인·사유·**실행/평가 이력 영구삭제 고지**·project-local 만 활성). 프론트 비활성+서버 400 이중 방어. 검증: 백엔드 스모크·Playwright 실연동(전용 삭제→파일·DB·UI행 제거, crew 차단, 직접 API 400)·skill 디렉터리 prune 스모크. **아카이브(보관)는 범위에서 제외**(최소 원칙). 남은 한계: fallback(.claude untracked 엣지) fs 선삭제 후 커밋 실패 시 복구 어려움(드묾, 주석 명시)·단위테스트 미추가.
- **왜**: 비전의 "안 쓰이는 건 지운다"를 닫음. 단 crew 자산은 카드 B의 출처 구분이 **선행돼야 안전**(공용 오삭제 방지).
- **성공기준**: 미사용 local 자산을 UI에서 한 번에 제거하고 커밋이 남는다. crew 자산은 삭제 차단.
- **범위**: 포함 = local 자산 삭제+커밋. 제외 = crew 원본(agent-crew 레포) 수정.
- **권고(PO)**: 카드 B 이후 진행. B 없이 열면 공용 자산 오삭제 위험.

## PO 솔직한 경고 (재확인)

- 비전을 그대로 "기능 추가"로 받으면 **중복 개발**한다. 실제 작업은 대부분 *노출·연결·데이터 보강*.
- "CLI 등록 시 자동 ops-pilot 등록"은 **이미 동작**(post-commit→scan). 새 기능 아님 — 온보딩/가시화 문제.
- 카드 D의 "**가치 판정**"은 보류 — 발화·정정왕복은 무상이나, "좋았나"는 정답 정의 비용. 무상 프록시까지만.

## 출처·링크

- ADR: [`docs/adr/0001-work-based-auto-evaluation.md`](../adr/0001-work-based-auto-evaluation.md)
- 진행 상태 메모: vault `opspilot-harness-creator-crew`
- crew 자산: `.claude/agents/opspilot-{po,designer,backend-dev,frontend-dev,reviewer}.md` · `.claude/skills/opspilot-crew/SKILL.md`
