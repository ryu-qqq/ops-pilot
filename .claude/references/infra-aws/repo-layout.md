# Infrastructure Repository Layout

> v2 SSOT: `docs/platform/`. 이 파일은 Harness가 빠르게 읽는 **레이아웃 요약**.

## 디렉터리

```
Infrastructure/
  terraform/
    modules/              # 재사용 모듈 SSOT (23개)
    environments/
      prod/<stack>/       # prod 스택 (kms, rds, atlantis, …)
      stage/<stack>/      # stage 스택
  governance/             # OPA, checkov, validate 스크립트
  docs/
    platform/             # v2 operational SSOT (모듈·스택·atlantis)
    guides/               # legacy 가이드 (점진 이전)
  atlantis.yaml           # v1 — 경로 드리프트 있음 → atlantis-v2.yaml 참고
  docs/platform/atlantis-v2.yaml
  .claude/                # Harness (agent-crew + 프로젝트 agents/skills)
```

## v1 vs v2 Atlantis

- **v1** (`atlantis.yaml`): `terraform/kms`, `terraform/rds` 등 **옛 flat 경로** — 대부분 MISSING
- **v2** (`docs/platform/atlantis-v2.yaml`): `terraform/environments/{prod,stage}/<stack>` 만 사용

Plan/apply 전 **dir 존재 여부**를 반드시 확인한다. 추측 금지.

## 타 레포 소비

앱 레포(MarketPlace, FileFlow 등)는 git module source로 `Infrastructure.git//terraform/modules/<name>?ref=...` 호출.

모듈 breaking change 시 **소비 레포 grep + semver/ref pin**을 함께 본다.

## Legacy Claude 설정

- `.claude/commands/if-*` — deprecated. `docs/platform/legacy-claude.md` 참고
- `~/.claude/agents/infra-*` — 레포 밖. **레포 `.claude/agents/`가 SSOT**
