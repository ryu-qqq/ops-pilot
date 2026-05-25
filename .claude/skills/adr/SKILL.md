---
name: adr
description: 기능·기술 결정을 조사·문서화·확정하는 ADR 파이프라인 스킬. 조사 → ADR 초안 → 사람의 결정 → 확정 → 결정 기록. "ADR", "아키텍처 결정", "이거 어떻게 결정하지", "기술 조사·결정", "의사결정" 같은 요청에 트리거. 기능 개발 착수 전 설계 결정이 필요할 때 제안한다.
allowed-tools:
  - Read
  - Glob
  - Grep
---

# ADR Skill — 조사·결정·기록 파이프라인

> agent-crew 공유 자산. 프로젝트 고유 값은 `.claude/project.yaml`에서 읽는다.

## 작업 전 — 프로젝트 설정 로드 (필수)

시작 전 `.claude/project.yaml`을 Read하여 `project.name`·`docs.adrPath`·`knowledge.vault`(선례 조회용)를 확인한다.

## 역할

기능·기술 결정의 파이프라인 오케스트레이터(Controller)다. 조사 → ADR 초안 → 결정 →
확정 → 기록을 단계별로 위임한다. 각 단계의 실제 작업은 에이전트가 한다.

## 흐름

1. **대상 확정** — 무엇을 결정하나. 모호하면 사용자에게 묻는다.
2. **선례 조회** — `wiki-lookup`으로 vault에 관련 선례가 있나 확인.
3. **조사** — `decision-researcher`에 대상 + 선례를 넘겨 리서치 브리프를 받는다.
4. **ADR 초안** — `adr-author`에 브리프를 넘겨 `{docs.adrPath}/NNNN-*.md` 초안 생성
   (Decision Outcome `TBD`, status `Proposed`).
5. **결정 — HITL** — 리서치 브리프의 옵션을 사용자에게 제시하고 **사용자가 결정**한다.
6. **ADR 확정** — `adr-author`에 사용자의 결정을 넘겨 Decision Outcome·Consequences를
   채우고 status `Accepted`로.
7. **결정 기록** — `journal-recorder`에 확정된 결정을 넘겨 vault `decisions` 시드로 남긴다.

## HITL — 5단계는 반드시 사람

ADR의 핵심은 *결정*이고, 결정은 사람이 한다 (토스 글: "Exception이 Question으로").
스킬·에이전트는 옵션과 트레이드오프를 갖춰주고, 고르는 건 사용자다. 에이전트가 대신
결정하지 않는다.

## 산출물

- `{docs.adrPath}/NNNN-제목.md` — 확정된 ADR (소비 프로젝트 레포, 코드와 함께 버전)
- vault `decisions` 시드 — 결정 기록

## 사용 흐름

- 기능 착수 전 설계 갈림길에서 — "이거 어떻게 갈지 ADR로 정하자"
- 기술 선택(라이브러리·패턴·구조)을 근거와 함께 남겨야 할 때

## 주의

- **5단계(결정)는 건너뛰지 않는다** — 결정 없는 ADR은 의미 없다
- 조사 단계에서 옵션이 1개뿐이면 결정거리가 아니다 — researcher에게 대안을 더 요구
- ADR 파일 커밋은 소비 프로젝트의 일반 워크플로를 따른다
