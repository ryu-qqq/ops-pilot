---
name: tf-import
description: 기존 AWS 리소스(콘솔·수동 생성된 VPC·서브넷·NAT·endpoint·IAM 등)를 0-diff로 terraform state에 안전하게 입양(import)하는 스킬. 절차 — 라이브 인벤토리 조회 → raw config 미러링 → terraform import → plan 게이트(태그 외 변경 없으면 통과, recreate·destroy 감지 시 STOP) → 태그-only apply → 커밋. "이 VPC terraform으로 import 하자", "기존 prod 리소스 terraform 입양", "콘솔로 만든 거 terraform state에 넣어줘", "이 리소스들 import 0-diff로 관리", "terraform import 안전하게 어떻게 하지" 같은 요청에 트리거. 기존 인프라를 IaC로 흡수·마이그레이션하려 하거나 위험한 import에 안전 게이트가 필요할 때 적극 제안한다. 단, 새 인프라를 처음부터 생성하거나 이미 관리 중인 리소스의 일반 plan·apply 운영은 import가 아니므로 제외한다.
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - Edit
  - Write
---

# TF Import Skill — 기존 리소스 0-diff 입양

> agent-crew 공유 자산. 프로젝트·스택 고유 값은 `.claude/project.yaml`·`references/`에서 읽는다.

## 작업 전 — 프로젝트 설정 로드 (필수)

시작 전 `.claude/project.yaml`을 Read하여 `project.name`·`project.stack`을 확인한다.
`project.stack: infra-aws`이면 Glob `**/references/infra-aws/*.md` 후 Read한다
(특히 `governance-gates.md`의 HITL 경계, `tier-policy.md`의 SSOT 우선순위).

## 역할

이미 콘솔·CLI로 **존재하는** AWS 리소스를 terraform state로 안전하게 **입양(import)**하는
워크플로의 사용자 진입점이자 절차 오케스트레이터다. 새로 만드는 게 아니라 *현재 live 값을
그대로 코드로 미러링*해 0-diff로 state에 등록하고, 의도한 태깅만 1회 거는 것이 목표다.

import와 plan은 **비파괴적**이다(state 등록·비교만 하고 인프라를 바꾸지 않는다). 위험은
오직 *dirty plan을 apply할 때* 생긴다 — 그래서 이 스킬의 핵심은 6단계 **plan 게이트**다.

## 흐름

### 1. 대상·범위 확인

무엇을 입양하나(리소스 목록), 어느 terraform 패키지에, 어떤 backend state key로 넣나.
대상·패키지 위치·backend key는 **대상 프로젝트에서 정한다**. 모호하면 사용자에게 묻는다.

### 2. 인벤토리 조회 (read-only)

`aws ... describe-*`로 각 리소스의 **live 값을 정확히 조회**한다. SSOT는 live 값이다 —
wiki·README·추정으로 채우지 않는다(tier-policy의 F3 룰: 코드·live가 우선). describe 출력을
그대로 인벤토리로 남긴다.

diff가 가장 잘 나는 곳을 특히 정밀하게 조회한다:

- 라우트 테이블의 **개별 라우트**(기본경로 대상)와 **subnet association**
- NAT의 **EIP(AllocationId)** — NAT와 별개 리소스로 import 필요
- 리소스에 이미 붙은 **태그** — default_tags가 *더하는* 것과 *덮어쓰는* 것을 구분하려면 현재값을 알아야 한다
- 인라인 vs 분리 구조(예: route가 route_table 인라인인지 별도 리소스인지)는 live 구조에 맞춘다

### 3. raw config 미러링

조회한 live 값 그대로 raw 리소스(`aws_vpc`·`aws_subnet`·`aws_route_table`·`aws_route` 등)로
HCL을 작성한다. "새로 만들기"용 모듈은 재사용하지 않는다 — 모듈의 구조·기본값이 live와
어긋나 0-diff를 깬다. 모듈화는 입양이 끝난 뒤의 별도 선택이다.

required 태그(governance-gates의 공통 태그)는 개별 리소스가 아니라 **provider의
`default_tags`**에 둔다. 그래야 태깅이 한 곳에서 일관되게 걸리고, 6단계에서 "태그 추가"가
의도된 변경으로 깨끗하게 드러난다.

### 4. init — HITL

real backend로 `terraform init`을 실행한다. backend·state key를 건드리므로 **사용자
확인**을 받는다(governance-gates: real backend init은 HITL). validate가 필요하면
`-backend=false`로 따로 돌릴 수 있다(이건 read-only).

### 5. import — HITL

리소스마다 `terraform import <address> <id>`를 실행한다. state를 변경하므로 **사용자
확인**을 받는다. import 자체는 비파괴적이다(인프라가 아니라 state에 등록만 한다).
2단계 인벤토리의 ID를 주소와 정확히 짝지어 하나씩 등록한다(association·EIP 같은
복합 ID 형식에 주의 — 리소스 타입별 import 식별자 규약을 따른다).

### 6. plan 게이트 — 핵심 안전장치 (read-only)

`terraform plan` 출력을 분석해 변경을 분류한다:

- **add (tags only)** — default_tags가 태그를 더하는 것. *의도된 변경*이다.
- **modify** — 태그 외 속성 변경
- **recreate (replace)** — 리소스 파괴 후 재생성
- **destroy** — 리소스 제거

**게이트 통과 조건 = 변경이 "태그 추가"뿐**일 때. 태그 외 modify·recreate·destroy가
**하나라도** 있으면 **STOP**한다 — config가 live와 어긋났다는 신호다. 어긋난 리소스의
config를 live 값에 맞게 보정하고 다시 plan한다. 태그를 제외한 diff가 0이 될 때까지
반복한다.

공유 인프라일수록 서두르지 않는다. recreate·destroy는 import의 목적(무중단 입양)을
정면으로 깨므로, 게이트에서 막는 것이 이 스킬의 존재 이유다.

### 7. 태깅 apply — 의도된 1회 (HITL)

plan이 "태그 추가만"으로 깨끗하면 `terraform apply`로 태그를 건다. **사용자 확인**을
받는다(governance-gates: apply는 HITL). 태그-only apply는 무중단·비파괴다 — 이제
리소스가 terraform 관리 아래 들어오고 required 태그가 걸린다.

### 8. 커밋

config를 커밋한다(commit-format 컨벤션을 따른다). **push는 사람**이 한다.
이후 변경은 일반 PR 워크플로(Atlantis)를 따른다 — 필요하면 대상 디렉토리를
allowlist에 추가하는 건 후속 작업이다.

## HITL 경계

- **사용자 확인 필요**: real backend `init`(4) · `import`(5) · `apply`(7)
- **에이전트가 직접 (read-only)**: `aws describe-*`(2) · `terraform validate`(`-backend=false`) ·
  `terraform plan`(6) · config 작성·보정(3)

## 산출물

- 대상 패키지의 raw config(HCL) — live 값을 미러링하고 default_tags로 태깅
- state에 입양되고 required 태그가 걸린 리소스
- 게이트를 통과한(태그 외 0-diff) plan 기록

## 주의

- **게이트를 건너뛰지 않는다** — "태그 외 변경 STOP"이 안전장치의 전부다. 깨끗한 plan
  없이 apply하지 않는다.
- live 값이 SSOT다 — 문서·추정으로 config를 채우면 게이트에서 diff로 되돌아온다.
- import 직후 첫 plan에서 *태그 외*가 깨끗한지 먼저 확인하고, 그 다음에야 태그를 apply한다.
- shell 단어분리에 주의한다(리소스 목록을 루프로 돌릴 때 셸의 split 규칙을 확인).
