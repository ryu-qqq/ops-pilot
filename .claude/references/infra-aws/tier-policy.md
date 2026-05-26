# Infrastructure Module Tier Policy

> agent-crew `references/infra-aws` 공유 자산. 모듈 티어 정의의 **원본**.
> 소비 프로젝트(Infrastructure)는 `docs/platform/modules/_index.yaml`에 동기화한다.

## Tier 정의

| Tier | 의미 | v2 문서 | OpsPilot eval | breaking change |
|------|------|---------|---------------|-----------------|
| **supported** | prod/stage 스택 또는 타 레포 git import로 **실사용 중** | 필수 (`docs/platform/modules/<name>.md`) | 우선 | CHANGELOG + semver |
| **maintained** | 레포 내부 스택에서 사용. 외부 소비 적거나 전용 | 권장 | 선택 | CHANGELOG 권장 |
| **legacy** | **대체 모듈 존재**. 신규 사용 금지 | 대체 경로만 명시 | 없음 | bugfix만 |
| **candidate-deprecate** | environments·타 레포 **소비처 미발견** (README 예시만) | 없음 | 없음 | 제거 검토 |

## 분류 절차 (에이전트·사람 공통)

1. `terraform/environments/**` 및 타 레포에서 `Infrastructure.git//terraform/modules/<name>` grep
2. `modules/<name>/` 내부 상대 `source = "../modules/..."` (다른 모듈에 의한 간접 사용) 확인
3. 대체 모듈 여부 (예: `log-subscription-filter` → `log-subscription-filter-v2`)
4. `docs/platform/modules/_index.yaml` 갱신 — **legacy README/CHANGELOG 내용은 신뢰하지 않는다**

## SSOT 우선순위

1. **코드** — `variables.tf` / `outputs.tf` / 실제 `source =` 호출
2. **docs/platform/** — v2 operational truth
3. **wiki** — narrative·도식·ADR
4. **modules/*/README.md** — legacy (v2 전환 전까지 참고만)

## Harness references 로드

`project.stack: infra-aws` 이면 Glob `**/references/infra-aws/*.md` 후 Read.
