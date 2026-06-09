# diff 문법 강조 (prism)

2026-06-09. diff가 +초록/-빨강 배경만이라 .java·.md 같은 코드가 한 덩어리로 보인다.
확장자별 문법 색을 입혀 IDE처럼 읽히게 한다.

## 의존성 결정 (최소 원칙 예외 기록)

`prismjs` 추가. 근거: diff syntax highlight의 표준이고 가볍다(core ~2KB + 언어 grammar는
필요한 것만 동적 import). IDE급 `shiki`는 grammar·wasm이 수MB라 과하고, OpsPilot 핵심
가치(에이전트 평가)와 곁가지라 안 쓴다. prism이 가성비 균형.

## 까다로운 지점

prism은 완전한 코드 파일을 토큰화하는데 diff는 줄마다 `+`/`-` 프리픽스 + 잘린 코드라
그냥 먹이면 토큰화가 깨진다. 그래서 줄 단위로: 프리픽스(`+`/`-`/` `/`@@`) 분리 →
코드 부분만 prism highlight → +/- 배경은 그대로 유지.

## 적용

- `apps/web/src/domains/work/components/commit-diff-view.tsx`(커밋 diff)와
  `apps/web/src/domains/run/components/diff-view.tsx`(run worktree diff) 둘 다. patch 줄을
  색칠하는 공통 로직을 **공유 헬퍼**로 빼서 양쪽이 같게 보이게.
- 언어 매핑: 파일 경로 확장자 → prism lang. java·ts·tsx·js·jsx·md·yaml·yml·json·sh/bash·
  css·py·sql·go·kt 등 자주 쓰는 것. 미지원 확장자는 지금처럼 plain(깨지지 말 것).
- lazy: 언어 grammar는 동적 import로 그 파일을 열 때 로드. 번들 분리.
- 헤더 줄(`diff --git`/`@@`/`---`/`+++`)은 지금처럼 muted·primary 강조 유지.

## 테마 (하드코딩 hex 금지)

prism 기본 테마는 hex라 OpsPilot의 CSS 변수 토큰 원칙과 안 맞는다. prism 토큰 클래스
(`.token.keyword`·`.string`·`.comment`·`.function` 등)를 OpsPilot 색 토큰(또는 토큰에서
파생한 색)으로 매핑하는 작은 CSS를 다크·라이트 양쪽에 둔다. +/- 배경(`bg-success/15`·
`bg-destructive/15`)은 토큰 색 위에 그대로 얹혀 보이게.

## 검증
번들 증가량 측정(prism core + 동적 언어), typecheck·lint·web build, :5173에서 java·md·ts
섞인 커밋 diff를 열어 색·다크/라이트·+/- 배경 공존 확인.

## 비포함 (YAGNI)
shiki(풀 IDE급), 라인 넘버, 워드 단위 diff(intra-line), 모든 언어 망라.
