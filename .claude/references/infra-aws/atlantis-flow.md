# Atlantis Flow — Infrastructure

## 원칙

- **PR → plan → (approve) → apply**. push 즉시 apply 워크플로와 **이중 관리 금지**
- `apply_requirements`: 기본 `approved`, `mergeable`
- prod 민감 스택은 예외 주석이 있어도 **기본값으로 되돌리는 것을 권장**

## v2 프로젝트 dir

`docs/platform/atlantis-v2.yaml`이 canonical 초안이다.  
각 `dir:`는 `terraform/environments/<env>/<stack>` 형식만 허용.

## Plan 워크플로 (default)

1. `terraform init` (project-local plugins — TF_PLUGIN_CACHE_DIR 비우기)
2. `terraform plan`
3. (선택) conftest/OPA — governance 주석 TODO 해제 전까지 **수동 validate 병행**

## 에이전트가 하지 않는 것

- Atlantis apply 트리거 (HITL)
- prod apply without approved PR

## 체크리스트 (PR 리뷰)

- [ ] `atlantis.yaml` 또는 v2에 **dir 실존**
- [ ] 모듈 `source` 경로가 `docs/platform/modules/_index.yaml` tier와 맞음 (legacy 모듈 신규 사용 없음)
- [ ] `terraform fmt -check` / `validate` 통과 (로컬 또는 CI)
