-- OpsPilot 스키마 (OPSP-2). docs/DATA_MODEL.md 와 1:1.
-- 시각=ISO8601 UTC TEXT, bool=INTEGER 0/1, id=UUID TEXT.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS project (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  git_url         TEXT NOT NULL UNIQUE,
  clone_path      TEXT NOT NULL,
  workspace_mode  TEXT NOT NULL DEFAULT 'managed'
                  CHECK (workspace_mode IN ('linked', 'managed')),
  remote_verified INTEGER NOT NULL DEFAULT 0 CHECK (remote_verified IN (0, 1)),
  default_branch  TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES project (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('agent', 'skill', 'command')),
  name        TEXT NOT NULL,
  scope       TEXT NOT NULL CHECK (scope IN ('project', 'user', 'plugin')),
  source_path TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (project_id, kind, name, scope)
);

CREATE TABLE IF NOT EXISTS asset_version (
  id             TEXT PRIMARY KEY,
  asset_id       TEXT NOT NULL REFERENCES asset (id) ON DELETE CASCADE,
  git_commit     TEXT NOT NULL,
  git_ref        TEXT,
  content_hash   TEXT NOT NULL,
  content        TEXT NOT NULL,
  committed_at   TEXT NOT NULL,
  commit_message TEXT,
  created_at     TEXT NOT NULL,
  UNIQUE (asset_id, git_commit)
);

CREATE TABLE IF NOT EXISTS scenario (
  id              TEXT PRIMARY KEY,
  asset_id        TEXT NOT NULL REFERENCES asset (id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  input           TEXT NOT NULL,
  expectation     TEXT NOT NULL,
  definition_hash TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (asset_id, name)
);

CREATE TABLE IF NOT EXISTS run (
  id                TEXT PRIMARY KEY,
  asset_version_id  TEXT NOT NULL REFERENCES asset_version (id) ON DELETE CASCADE,
  scenario_id       TEXT NOT NULL REFERENCES scenario (id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  runner            TEXT NOT NULL,
  model             TEXT,
  started_at        TEXT,
  finished_at       TEXT,
  error             TEXT,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  cost_usd          REAL,
  retro             TEXT,                       -- OPSP-46: 선택적 회고 메모 ("왜")
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_asset_version ON run (asset_version_id);
CREATE INDEX IF NOT EXISTS idx_run_scenario ON run (scenario_id);
CREATE INDEX IF NOT EXISTS idx_run_status ON run (status);

CREATE TABLE IF NOT EXISTS trace_event (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES run (id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  type        TEXT NOT NULL CHECK (type IN (
                'user_message', 'assistant_message', 'thinking',
                'tool_call', 'tool_result', 'system', 'result')),
  name        TEXT,
  input       TEXT,
  output      TEXT,
  started_at  TEXT,
  duration_ms INTEGER,
  raw         TEXT,
  UNIQUE (run_id, seq)
);

CREATE TABLE IF NOT EXISTS score (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES run (id) ON DELETE CASCADE,
  scorer     TEXT NOT NULL CHECK (scorer IN ('schema', 'assertion', 'llm_judge', 'human')),
  passed     INTEGER NOT NULL CHECK (passed IN (0, 1)),
  score      REAL CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
  detail     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_score_run ON score (run_id);

-- OPSP-30: 실행 결과 파일 변경. worktree 격리이므로 base 커밋↔실행 후 diff = 에이전트가
-- 만진 파일·라인이 정확. 큰 patch 는 truncated=1 로 자르고, 바이너리는 status='binary'.
CREATE TABLE IF NOT EXISTS run_diff_file (
  id        TEXT PRIMARY KEY,
  run_id    TEXT NOT NULL REFERENCES run (id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  status    TEXT NOT NULL CHECK (status IN ('added','modified','deleted','renamed','binary')),
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  binary    INTEGER NOT NULL DEFAULT 0 CHECK (binary IN (0, 1)),
  truncated INTEGER NOT NULL DEFAULT 0 CHECK (truncated IN (0, 1)),
  patch     TEXT,
  UNIQUE (run_id, file_path)
);
CREATE INDEX IF NOT EXISTS idx_run_diff_file_run ON run_diff_file (run_id);

-- OPSP-39: AI 트레이스 분석 결과. run 종속 캐시 + 비동기 작업 상태.
-- run 당 1개(UNIQUE) — 재분석은 덮어쓰기. 화면 이동해도 결과 유실 안 되게 DB 보존.
CREATE TABLE IF NOT EXISTS trace_analysis (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES run (id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  result     TEXT,
  error      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (run_id)
);
CREATE INDEX IF NOT EXISTS idx_trace_analysis_run ON trace_analysis (run_id);

-- OPSP-42: 전역 설정 (key-value). 지라/노션 인증 등 OpsPilot 인스턴스 전역값.
-- 프로젝트 무관 — 인증은 인스턴스에 한 번만 넣는다.
CREATE TABLE IF NOT EXISTS setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- TASK-5 MVP: Cursor 작업 ingest 번들 + evaluator 개선안.
CREATE TABLE IF NOT EXISTS ingest_bundle (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES project (id) ON DELETE CASCADE,
  notion_task_url TEXT,
  git_ref         TEXT NOT NULL,
  diff_summary    TEXT NOT NULL,
  context_json    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'evaluating', 'done', 'reviewing', 'reviewed', 'failed')),
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ingest_bundle_project ON ingest_bundle (project_id);
CREATE INDEX IF NOT EXISTS idx_ingest_bundle_status ON ingest_bundle (status);

CREATE TABLE IF NOT EXISTS improvement_proposal (
  id             TEXT PRIMARY KEY,
  ingest_id      TEXT NOT NULL REFERENCES ingest_bundle (id) ON DELETE CASCADE,
  run_id         TEXT REFERENCES run (id) ON DELETE SET NULL,
  target_kind    TEXT NOT NULL CHECK (target_kind IN ('cursor_rule', 'agent', 'skill', 'command', 'workflow_patch')),
  target_path    TEXT NOT NULL,
  rationale      TEXT NOT NULL,
  content        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'approved', 'rejected', 'applied')),
  applied_commit TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_improvement_proposal_ingest ON improvement_proposal (ingest_id);
CREATE INDEX IF NOT EXISTS idx_improvement_proposal_status ON improvement_proposal (status);
