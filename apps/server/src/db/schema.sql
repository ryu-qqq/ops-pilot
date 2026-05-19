-- OpsPilot 스키마 (OPSP-2). docs/DATA_MODEL.md 와 1:1.
-- 시각=ISO8601 UTC TEXT, bool=INTEGER 0/1, id=UUID TEXT.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS asset (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('agent', 'skill', 'command')),
  name        TEXT NOT NULL,
  scope       TEXT NOT NULL CHECK (scope IN ('project', 'user', 'plugin')),
  source_path TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (kind, name, scope)
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
  scorer     TEXT NOT NULL CHECK (scorer IN ('schema', 'assertion', 'llm_judge')),
  passed     INTEGER NOT NULL CHECK (passed IN (0, 1)),
  score      REAL CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
  detail     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_score_run ON score (run_id);
