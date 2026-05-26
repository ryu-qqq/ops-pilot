# Governance Gates

> 상세: 레포 `governance/`, `.claude/INFRASTRUCTURE_RULES.md` (legacy 원본)

## CRITICAL

1. **Tags** — `merge(local.required_tags)` (common-tags)
2. **Encryption** — customer-managed KMS
3. **Naming** — kebab-case / snake_case
4. **Secrets** — 하드코딩 금지

## 검증 레이어

| 레이어 | 도구 |
|--------|------|
| Pre-commit | fmt, validate |
| PR / local | `./governance/scripts/validators/*` |
| Atlantis plan | terraform plan (+ OPA TODO) |
| CI | tfsec, checkov, infracost |

## 에이전트 validate 명령 (read-only 권장)

```bash
terraform fmt -check -recursive terraform/modules/<name>
cd terraform/modules/<name> && terraform init -backend=false && terraform validate
```

apply·init with real backend는 **사용자 HITL**.

## F3 룰 (wiki ↔ 코드)

wiki·README 추정을 그대로 쓰지 않는다. **environments/*.tf + state list(사용자)** 로 교차검증.
