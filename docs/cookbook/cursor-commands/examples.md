# 레포별 설정 예시

템플릿 복사 후 **「이 레포 설정」** 블록만 아래 값으로 교체.

---

## spring-platform-commons (linked에 가까움)

| 키 | 값 |
|---|---|
| projectId | `9f83dd39-85e2-4fb2-807c-b565c27d82b3` |
| projectName | spring-platform-commons |
| workspaceMode | `linked` (clonePath = devPath) |
| devPath | `/Users/ryu-qqq/Documents/ryu-qqq/spring-platform-commons` |
| clonePath | 동일 |
| runbook | `docs/opspilot-feedback-loop.md` |

---

## Infrastructure (managed — 이중 checkout)

| 키 | 값 |
|---|---|
| projectId | `d7ee3efd-67da-44d3-bd8c-0cdea1f42baf` |
| projectName | infrastructure |
| workspaceMode | `managed` |
| devPath | `/Users/ryu-qqq/Documents/ryu-qqq/Infrastructure` |
| clonePath | `/Users/ryu-qqq/Documents/ryu-qqq/ryu-qqq__Infrastructure` |
| syncStrategy | `cherry-pick` 또는 `push-pull` |

REG-02 이후 **linked 재등록** 권장 → devPath만 사용.

---

## ops-pilot (자체 개발)

| 키 | 값 |
|---|---|
| projectName | ops-pilot |
| workspaceMode | `linked` (일상 경로 = 레포 루트) |
| devPath | `/Users/ryu-qqq/Documents/ryu-qqq/ops-pilot` |
| runbook | `README.md` · `docs/project-registration-two-mode-spec.md` |

projectId는 OpsPilot DB 등록 후 `GET /api/projects`로 확인.
