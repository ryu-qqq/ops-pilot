# Terraform Module Layout

## 표준 파일

```
terraform/modules/<name>/
  main.tf
  variables.tf
  outputs.tf
  versions.tf      # provider constraints
  README.md        # legacy — v2는 docs/platform/modules/<name>.md
  CHANGELOG.md     # supported만 유지; v2 전환 중엔 platform doc이 우선
```

## 필수 패턴

- **태그**: `merge(local.required_tags, { ... })` — `common-tags` 모듈 사용
- **암호화**: KMS (AES256 단독 금지 — governance 참고)
- **네이밍**: 리소스 kebab-case, 변수 snake_case

## common-tags

거의 모든 모듈이 `../common-tags`를 source한다. **supported** foundation 모듈.

## v2 문서 템플릿 (docs/platform/modules/)

1. 한 줄 목적
2. Tier + 소비처 (레포/스택)
3. Key inputs / outputs (variables.tf·outputs.tf 기준)
4. Minimal example (1개)
5. Governance notes
6. Legacy README는 링크만

## 신규 모듈

1. `docs/platform/modules/_index.yaml`에 tier 등록 (기본 `maintained`)
2. platform doc 작성 후 코드 PR
3. legacy README는 `# Legacy` + platform doc 링크 한 줄
