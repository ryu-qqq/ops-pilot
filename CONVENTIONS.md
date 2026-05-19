# OpsPilot 코드 컨벤션

스택: Vite+React+TS (프론트) / Node+TS+Fastify (백엔드) / pnpm workspace.
근거: 토스 *Frontend Fundamentals* 4원칙 + TanStack Query / typescript-eslint / Fastify 공식 권장.

---

## 0. 철학 — "좋은 코드 = 변경하기 쉬운 코드"

코드 리뷰·구현의 판단 기준은 토스 4원칙. 서로 충돌하면 상황에 맞게 우선순위를 정한다.

| 원칙 | 규칙 | 안티패턴 |
|---|---|---|
| **가독성** | 동시에 안 도는 코드 분리, 매직넘버·조건에 이름 | 한 컴포넌트에 `if(isAdmin)` 떡칠, 중첩 삼항 |
| **예측가능성** | 숨은 side effect 금지, 같은 계열 함수는 반환타입 통일 | 패칭 함수가 몰래 로깅, `useA`는 객체·`useB`는 값 반환 |
| **응집도** | 함께 바뀌는 파일은 같은 폴더 | 전역 `components/` `hooks/` `utils/` 타입별 분리 |
| **결합도** | 섣부른 추상화보다 중복 허용 | 인자 폭증하는 만능 공통 훅 |

> 핵심: 규칙 암기가 아니라 "왜 이게 변경하기 쉬운가"의 트레이드오프를 매번 판단한다.

---

## 1. 공통 / 모노레포

- pnpm workspace: `apps/web`(React) · `apps/server`(Fastify) · `packages/shared-types` · `packages/config`(공유 lint/ts).
- 패키지 간 참조는 `workspace:*` 프로토콜.
- lint/ts 설정은 `packages/config` 한 곳에서만 정의 → 패키지마다 복붙 금지(설정 드리프트 제거).
- 입력 검증은 프론트·백엔드 **공통 Zod**. 스키마는 `packages/shared-types`에 두고 양쪽이 import.
- **폴더는 도메인(기능) 단위**: `<app>/src/domains/<feature>/{components,hooks,api,utils}`.
  타입별 전역 폴더 금지. 폴더 깊이 ≤ 3.
- 파일·폴더 네이밍 **kebab-case** (`trace-viewer.tsx`, `use-run.ts`). lint로 강제.
- 배럴 파일(`index.ts`)은 기능 폴더의 public API 용도로만 절제해서. 무분별 남발 금지.
- 공통화는 **2회+ 동일 반복 & 앞으로도 동일할 확신**이 있을 때만. 그 전엔 중복 허용.

## 2. 프론트엔드 (React)

- **서버 데이터 = TanStack Query / UI·로컬 상태 = useState·Zustand.** 절대 안 섞는다.
  판단 기준: "이 데이터를 누가 소유하나?" 서버가 소유하면 Query.
- 기능별 **Query Key Factory** 객체로만 쿼리키 생성·무효화:
  ```ts
  export const runKeys = {
    all: ['runs'] as const,
    list: (assetId: string) => [...runKeys.all, 'list', assetId] as const,
    detail: (id: string) => [...runKeys.all, 'detail', id] as const,
  }
  ```
- 패칭 훅은 패칭만. 로깅·토스트·네비게이션은 **호출부(onClick 등)에서 명시적으로**.
- 권한/모드 분기는 라우터 컴포넌트 + 분기별 컴포넌트로 분리.
- 같은 계열 훅은 반환 타입 통일(모든 API 훅은 `useQuery` 결과 객체 그대로 반환).
- 컴포넌트 전용 훅은 그 컴포넌트 옆에. 범용 훅만 상위 `hooks/`.

## 3. 백엔드 (Fastify)

- `@fastify/autoload`로 `src/routes` · `src/plugins` 자동 등록. 도메인별 route/service/repository.
- `fastify-type-provider-zod`로 **body·params·query·response 전부 스키마 정의.**
  응답 스키마는 필수(의도치 않은 필드 노출 차단 + 직렬화 성능).
- 중앙 `setErrorHandler` 하나로 에러 정규화. Zod 검증 에러는 400으로 일관 매핑.
- 환경변수는 부팅 시 Zod로 검증 후 **타입된 config 객체로 주입**.
  검증 안 된 `process.env` 직접 접근 금지.
- 검증 함수 반환은 `{ ok: boolean, reason?: string }` 형태로 통일.

## 4. 도구 설정

- tsconfig: `target ES2022` / `module NodeNext` / `moduleResolution NodeNext` /
  `strict true` / `noUncheckedIndexedAccess true` / `verbatimModuleSyntax true` /
  `skipLibCheck true` / `forceConsistentCasingInFileNames true`. 데코레이터 비활성화.
- lint: **typescript-eslint flat config** (`recommended` + `strict` + `stylistic`).
  Airbnb 원본 채택 안 함(방치 상태·ESLint 9 미지원).
- Prettier = 포맷팅 전담 / ESLint = 정확성 전담. 역할 분리.

## 5. 적용 체크리스트 (PR 자가검토)

- [ ] 한 컴포넌트/훅/함수가 한 종류의 일만 하는가 (결합도)
- [ ] 함수 시그니처에서 안 드러나는 동작이 안에 숨어 있지 않은가 (예측가능성)
- [ ] 같이 바뀌는 파일이 같은 폴더에 있는가 (응집도)
- [ ] 매직넘버·복잡 조건에 이름이 붙었는가 (가독성)
- [ ] 서버 상태를 useState로 다루고 있지 않은가
- [ ] 새 API에 Zod 스키마(요청+응답)가 다 붙었는가
- [ ] 추상화가 "2회+ 반복 & 확신" 조건을 충족하는가
