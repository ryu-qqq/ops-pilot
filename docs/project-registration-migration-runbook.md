# 프로젝트 등록 2모드 — 기존 DB 마이그레이션 runbook

> **대상:** REG-01 이전에 등록된 프로젝트 (`workspace_mode` backfill = `managed`)  
> **스펙:** [`project-registration-two-mode-spec.md`](./project-registration-two-mode-spec.md)  
> **Engineering OS:** REG-06

---

## 1. 언제 뭘 쓰나

| 상황 | 권장 |
|---|---|
| Cursor dev 폴더 = 매일 여는 checkout | **`linked`로 맞추기** (apply 즉시 반영) |
| OpsPilot clone만 쓰거나 dev와 의도적 분리 | **`managed` 유지** + apply 후 sync |
| dev와 clone **같은 경로** (spring-platform-commons) | DB만 `linked`로 표시하면 됨 |
| dev와 clone **다른 경로** (Infrastructure) | `linked`로 경로 통합 **또는** managed + sync 루틴 |

---

## 2. 사전 확인

```bash
# 서버 중지 후 (또는 migrate만)
cd apps/server
corepack pnpm db:migrate   # workspace_mode 컬럼 없으면 추가

sqlite3 opspilot.sqlite "SELECT name, id, workspace_mode, clone_path FROM project;"
```

**백업 (권장):**

```bash
cp apps/server/opspilot.sqlite apps/server/opspilot.sqlite.bak-$(date +%Y%m%d)
```

---

## 3. 케이스 A — spring-platform-commons (경로 이미 일치)

| 항목 | 값 |
|---|---|
| projectId | `9f83dd39-85e2-4fb2-807c-b565c27d82b3` |
| clonePath | `~/Documents/ryu-qqq/spring-platform-commons` (= Cursor dev) |
| 현재 mode | `managed` (마이그레이션 backfill) |

**조치:** UI/API 변경 없이 DB만 `linked` 표시.

```bash
sqlite3 apps/server/opspilot.sqlite <<'SQL'
UPDATE project
SET workspace_mode = 'linked',
    remote_verified = 1
WHERE id = '9f83dd39-85e2-4fb2-807c-b565c27d82b3';
SQL
```

검증: UI 프로젝트 선택 → badge **로컬 연결** · ingest `gitRef` = 그 레포 HEAD.

---

## 4. 케이스 B — Infrastructure (이중 checkout)

| | dev (Cursor) | OpsPilot managed clone |
|---|---|---|
| 경로 | `~/Documents/ryu-qqq/Infrastructure` | `~/Documents/ryu-qqq/ryu-qqq__Infrastructure` |
| projectId | — | `d7ee3efd-67da-44d3-bd8c-0cdea1f42baf` |

### B-1. 권장 — linked로 통합 (projectId 유지)

기존 ingest·자산 레지스트리를 유지하려면 **삭제·재등록 대신 UPDATE**.

```bash
sqlite3 apps/server/opspilot.sqlite <<'SQL'
UPDATE project
SET clone_path = '/Users/ryu-qqq/Documents/ryu-qqq/Infrastructure',
    workspace_mode = 'linked',
    remote_verified = 1
WHERE id = 'd7ee3efd-67da-44d3-bd8c-0cdea1f42baf';
SQL
```

이후:

1. Cursor는 **`Infrastructure`** 만 열기
2. OpsPilot **스캔** (선택 `ryu-qqq__Infrastructure` clone 폴더는 더 이상 사용 안 함 — 나중에 수동 삭제 가능)
3. apply → Cursor에서 즉시 확인

> **주의:** `ryu-qqq__Infrastructure` clone에만 있는 커밋(apply 등)이 있으면 dev로 **cherry-pick / push·pull** 후 UPDATE. [cursor-commands](./cookbook/cursor-commands/opspilot-sync-managed-clone.md) 참고.

### B-2. managed 유지 + sync 루틴

linked 전환 없이 계속 쓸 때:

- Cursor → **dev** (`Infrastructure`)
- OpsPilot → **clone** (`ryu-qqq__Infrastructure`)
- apply 후 → 피드백 탭 sync 배너 또는 `/opspilot-sync-managed-clone`

### B-3. UI로 새 linked 등록 (비권장 — projectId 바뀜)

동일 `gitUrl` 중복 등록은 **400**. 기존 `infrastructure` row를 DB에서 제거한 뒤에만 가능 → ingest 이력 끊김. **B-1 UPDATE** 가 낫다.

---

## 5. 원샷 스크립트 (선택)

```bash
#!/usr/bin/env bash
# scripts/migrate-projects-to-linked.sh — 로컬 opspilot.sqlite 전용
set -euo pipefail
DB="${OPS_DB_PATH:-apps/server/opspilot.sqlite}"

sqlite3 "$DB" <<'SQL'
UPDATE project SET workspace_mode = 'linked', remote_verified = 1
WHERE id = '9f83dd39-85e2-4fb2-807c-b565c27d82b3';

UPDATE project
SET clone_path = '/Users/ryu-qqq/Documents/ryu-qqq/Infrastructure',
    workspace_mode = 'linked',
    remote_verified = 1
WHERE id = 'd7ee3efd-67da-44d3-bd8c-0cdea1f42baf';
SQL

echo "Done. Verify:"
sqlite3 "$DB" "SELECT name, workspace_mode, clone_path FROM project;"
```

```bash
chmod +x scripts/migrate-projects-to-linked.sh
OPS_DB_PATH=apps/server/opspilot.sqlite ./scripts/migrate-projects-to-linked.sh
```

---

## 6. MCP로 신규 등록 (새 프로젝트)

기존 row 수정 대신 **새 레포**를 linked로 등록할 때:

```json
{
  "tool": "register_project",
  "arguments": {
    "mode": "linked",
    "localPath": "/Users/me/Documents/ryu-qqq/MyRepo"
  }
}
```

---

## 7. 검증 체크리스트

- [ ] `GET /api/projects` → `workspaceMode` · `clonePath` 기대값
- [ ] UI badge: linked 프로젝트 → **로컬 연결**
- [ ] linked: ingest `gitRef` = dev `git rev-parse HEAD` (InvalidGitRef 없음)
- [ ] linked: apply 후 Cursor에서 harness 파일 변경 확인
- [ ] managed: apply 후 sync 배너 · dev 반영 확인

---

## 8. 롤백

```bash
cp apps/server/opspilot.sqlite.bak-YYYYMMDD apps/server/opspilot.sqlite
```

또는:

```sql
UPDATE project SET workspace_mode = 'managed', remote_verified = 0
WHERE id IN ('9f83dd39-...', 'd7ee3efd-...');
-- Infrastructure clone_path 는 수동으로 ryu-qqq__Infrastructure 경로 복원
```

---

*작성: 2026-05-26 · REG-06*
