# World 1 고유 표면 격하 (ADR 0006 D 즉시 단계)

2026-06-07. ADR 0006이 옵션 D(격하 후 시한부 정리)를 채택했다. 그 "즉시(격하)" 단계 — World 1 고유 UI를 상수 플래그로 숨긴다. 코드는 전부 보존, 되살리려면 플래그 하나만 `true`.

## 배경

World 1 고유 용도(자산별 시나리오 채점 + human/machine 점수)는 죽었다(score 2건 전부 실패, human 0). 하지만 scenario/run/score 인프라는 World 2(Cursor 피드백 eval)가 재사용 중이라 삭제 불가. 그래서 UI 표면만 숨겨 콜드오픈 혼란을 없애고, 코드·라우트·도메인은 그대로 둔다.

## 변경 (web만, 3파일)

### ① 플래그 상수 — `apps/web/src/lib/flags.ts` (신설)
`WORLD1_SCENARIO_SCORING_ENABLED = false`. 주석에 ADR 0006 근거(동결, 되살리려면 true).

### ② registry "③시나리오·실행" 탭 가드 — `asset-detail-panel.tsx`
- `TabsTrigger value="scenario"`(165)와 `TabsContent value="scenario"`(207~235)를 `WORLD1_SCENARIO_SCORING_ENABLED &&`로 가드.
- 기본 탭은 `version`(126)이라 scenario를 숨겨도 깨지지 않음.
- import(ScenarioManager·RunLauncher·RegressionLauncher·BenchmarkLauncher)는 가드 안에서 참조되니 유지 — unused 아님.

### ③ work-list 벤치/compare 가드 — `work-list-view.tsx`
- `benchmarkActive`(119)·`compareActive`(118) 조건에 플래그 AND. 플래그 false면 그 카드 블록 자체가 안 렌더.
- 트리거(registry 런처) 차단으로 이미 자동 비활성이지만, 한 곳 AND로 의도를 코드에 명시. app.tsx의 `handleBenchmarkStarted`/`handleRunCreated`는 dead 경로가 되지만 보존(되살리기).

## 비포함 (ADR 보존선)
- 서버 라우트(`scenarios.ts`·`runs.ts`·`assist.ts`)·MCP 툴·도메인 코드 무변경 — UI만 숨김.
- 회색지대 3종(수동 human score·machine 자동훅·scorer enum)·work 상세의 VerdictStrip/GradePanel/HumanScore 그대로(World 2 재사용). 정리는 시한부 단계로.

## 검증
- typecheck·lint(가드된 import가 unused로 안 잡히는지)·build
- Playwright: registry 자산 상세에 "시나리오·실행" 탭이 사라지고 버전·트리거만 남는지, work 탭 정상인지 실연동
