# ingest(커밋 가져오기)와 eval(자동 평가) 분리

2026-06-08. 지금은 커밋 가져오기와 평가가 한 덩어리다 — `ingestFeedback`이 무조건
`queueFeedbackEval`을 부른다(service.ts:60). 그래서 scan 게이트(`OPS_AUTO_INGEST=1`)를
끄면 평가뿐 아니라 **커밋 유입 자체가 멈춘다**. 실제로 그 탓에 spring-platform-commons
6/8 커밋이 작업 목록에 안 들어왔다.

사용자가 원하는 구조: **커밋은 항상 다 가져오고, 자동 평가만 켜고 끈다.** 끄면 커밋이
작업 목록에 대기로 쌓이고, 사람이 원하는 것만 골라 수동 평가한다.

## 3단 구조 (목표)

| 단계 | 동작 | 제어 |
|---|---|---|
| 가져오기 (ingest) | 새 커밋을 작업 목록에 `pending`으로 유입 | **항상 ON** (scan) |
| 자동 평가 (eval) | pending → work-evaluator 평가 | **토글** (기본 OFF) |
| 자동 검토 (review) | 평가 후 개선안 reviewer 검토 | 토글 (이미 있음, 기본 OFF) |

## 결정

### 1. ingest 스캔은 항상 ON
서버를 `OPS_AUTO_INGEST=1`로 영구 기동한다(이 플래그의 의미를 "ingest 스캔 켜기"로
유지 — eval 아님). 스캔은 30분마다 미평가 커밋을 작업 목록에 `pending`으로 넣는다.
완전히 끄고 싶으면 env로 0 가능(코드 게이트는 남긴다).

### 2. 자동 평가 토글 (autoEval setting, 기본 OFF)
- `setting/repository.ts`: `SETTING_KEYS.autoEval = "feedback.autoEval"`,
  `getSettingsView`/`updateSettings` 반영, `getAutoEval()` helper(기본 off).
- `domain.ts`: `settingsViewSchema`(boolean)·`settingsUpdateSchema`(optional)에 `autoEval`.
- `service.ts` ingestFeedback: `queueFeedbackEval(...)` →
  `if (getAutoEval()) queueFeedbackEval(...)`. OFF면 ingest 후 **`pending`에서 멈춘다**
  (status는 이미 "pending"으로 생성됨 — eval을 안 부르면 그대로 유지).

### 3. 수동 평가 경로 (pending → eval)
`reprocess` 계열은 evalRunId가 있어야 동작(이미 평가한 것 재처리)하므로 pending엔 못 쓴다.
- 서버: `POST /feedback/ingest/:id/evaluate` → 해당 ingest가 pending이면
  `queueFeedbackEval(id, evalSource)` 호출. (이미 평가중/완료면 거부.)
- 프론트: `useEvaluateIngest` 훅 + 작업 상세 pending 상태에 "평가" 버튼.
  (수동 검토 버튼이 done에서 뜨는 기존 패턴과 동일한 자리.)

### 4. "자동 평가" 칩·설정 정합
- 지금 칩은 `getAutoIngestConfig`(scan 상태)를 "자동 평가"로 표시 → scan이 항상 ON이면
  늘 "켜짐"이라 무의미. 칩이 **autoEval setting**을 반영하게 바꾼다.
- 설정 다이얼로그(톱니바퀴)에 "자동 평가" 토글 추가 — "자동 검토" 옆. 서버 가동 중
  즉시 반영(다음 ingest부터). 칩의 "이 화면에선 못 바꿈" 문구도 설정으로 안내.

## 용어 (화면에서 헷갈리지 않게)
가져오기 = 커밋을 작업으로 (항상) · 자동 평가 = 그 커밋을 평가 (토글) ·
자동 검토 = 평가 결과를 reviewer가 (토글).

## 검증
typecheck·lint·web build. 토글 OFF면 ingest 후 pending에서 멈추고 수동 "평가" 버튼이
뜨는지, ON이면 자동 평가 도는지. 서버 `OPS_AUTO_INGEST=1` 재기동 후 spc 6/8 커밋이
pending으로 유입되는지 실확인.

## 비포함 (YAGNI)
scan 완전 끄기 UI(env로 충분), 평가 batch/interval 변경, pending 일괄 평가 버튼(개별 수동으로 충분).
