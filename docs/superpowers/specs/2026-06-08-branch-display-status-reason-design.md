# 브랜치 표시 + 상세 상태 이유

2026-06-08. 실사용 중 발견한 두 빈틈. (1) 프로젝트가 main만 보는 줄 알았는데 사실 폴더 현재 브랜치를 보고, 화면엔 등록 시 defaultBranch가 떠 어긋남. (2) 자산 상태(문제/주의) 이유가 목록 hover tooltip에만 있고 상세엔 없음.

## 1번 — 현재 브랜치 표시

화면이 `defaultBranch`(등록 시 HEAD)를 보여줘 실제 폴더 브랜치와 어긋난다. 실시간 현재 브랜치를 추가한다.

- **서버**: `scanner.ts`의 `currentGitRef`를 export. `projectSchema`(domain.ts:88)에 `currentBranch: z.string().nullable().optional()` 추가. `GET /projects` 라우트(projects.ts:102)에서 `listProjects()` 결과 각 항목에 `currentBranch: currentGitRef(clonePath)` 매핑.
- **프론트**: project-bar 드롭다운(line 85)을 `currentBranch ?? defaultBranch ?? "?"`로. `ProjectPathHint` 배지 줄에 현재 브랜치 칩(⎇) 추가. main이 아니면 색 강조.

실시간 git HEAD라 매 조회마다 7개 프로젝트 git 호출 — 작아서 무방.

## 2번 — 상세에 상태 이유

목록과 똑같은 `computeAssetStatus(asset, usage, lint, graphItem)`(graph.ts:34)를 상세 패널에서 재계산해 헤더에 배지+이유 한 줄로 표시. 새 판정 로직 안 만들고 기존 함수 재사용 — 목록·상세 항상 일치.

- **데이터**: asset-detail-panel에서 toolkit과 같은 hook(`useProjectAssetUsage`·`useProjectAssetLint`·`useAssetGraph`(projectId))으로 맵을 만들고, `refKey(kind,name)`·`asset.id`로 해당 자산 항목을 찾아 `computeAssetStatus`. TanStack Query 캐시 공유라 중복 fetch 없음.
- **표시**: 상세 헤더 description 아래에 상태 배지(🟢🟡🔴)+reason 한 줄.

## 검증
typecheck·lint·build + Playwright로 (1) project-bar 현재 브랜치 칩 (2) 자산 상세 상태 이유 실렌더.

## 비포함 (YAGNI)
브랜치 *전환* 기능(여전히 폴더 현재 브랜치만), 상태 판정 기준 변경.
