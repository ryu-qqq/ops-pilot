# review 자동/수동 토글

2026-06-08. auto-ingest를 켜면 eval 후 proposal-reviewer가 무조건 자동 실행된다(eval-queue.ts:162). 사용자가 ingest·eval은 자동, review는 자동/수동을 고르고 싶다 — 특히 off 해두고 돌려보고 싶은 작업만 수동으로.

## 결정

설정 다이얼로그(톱니바퀴)에 "자동 검토" on/off 토글. **기본 off(수동)**. DB(setting)에 저장해 서버 가동 중 토글이 다음 작업부터 즉시 반영(재기동 불필요).

## 수동 review는 이미 있다

`work-detail-view.tsx:148`: `showManualReview = status === "done" && 개선안 중 draft 있음`. review off면 작업이 done에서 멈추고 draft가 남으니, 그 상태에서 작업 상세에 수동 review 버튼이 자동으로 뜬다. `useReviewIngest` 훅 + `POST /feedback/ingest/:id/review` 라우트 전부 존재. **추가 작업 없음** — off 해두고 원하는 작업만 골라 수동 review가 그대로 작동한다.

## 변경

### 서버
- `domain.ts`: `settingsViewSchema`·`settingsUpdateSchema`에 `autoReview` 추가(view=boolean, update=optional).
- `setting/repository.ts`: `SETTING_KEYS.autoReview = "feedback.autoReview"`, getSettingsView/updateSettings에 반영, `getAutoReview()` helper(기본 off).
- `eval-queue.ts:162`: `queueProposalReview(...)` → `if (getAutoReview()) queueProposalReview(...)`. off면 done에서 멈춤.
- settings 라우트(GET/PUT /settings)는 SettingsView/Update를 그대로 쓰므로 추가 변경 없음.

### 프론트
- `settings-dialog.tsx`: "자동 검토" Switch 한 줄. useSettings로 autoReview get, update로 set.

## 검증
typecheck·lint·build. 토글 off면 eval 후 done에서 멈추고 수동 버튼이 뜨는지, on이면 자동 review 도는지.

## 비포함 (YAGNI)
수동 review 새 경로(이미 있음), auto-ingest config 자체 변경.
