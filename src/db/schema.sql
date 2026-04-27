-- Flow Image Production Tool schema.
-- All tables use TEXT ids generated in the Node layer; timestamps are ISO 8601 UTC strings.

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS references_images (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label        TEXT NOT NULL DEFAULT '',
  filename     TEXT NOT NULL,        -- stored filename inside data/references/<project_id>/
  original_name TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_references_project ON references_images(project_id);

CREATE TABLE IF NOT EXISTS prompts (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL,
  negative     TEXT DEFAULT '',
  style        TEXT DEFAULT '',
  extras_json  TEXT DEFAULT '{}',    -- free-form bag for future builder fields
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project_id);

CREATE TABLE IF NOT EXISTS jobs (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt_id        TEXT REFERENCES prompts(id) ON DELETE SET NULL,
  prompt_snapshot  TEXT NOT NULL,                -- captured prompt body at enqueue time
  reference_ids    TEXT NOT NULL DEFAULT '[]',   -- JSON array of references_images.id
  status           TEXT NOT NULL DEFAULT 'queued',
  -- status: queued | running | success | failed | manual_review | cancelled
  error_message    TEXT DEFAULT NULL,
  error_screenshot TEXT DEFAULT NULL,            -- relative path under data/screenshots/
  attempts         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  started_at       TEXT DEFAULT NULL,
  finished_at      TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status  ON jobs(status);

CREATE TABLE IF NOT EXISTS outputs (
  id           TEXT PRIMARY KEY,
  job_id       TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,         -- stored under data/outputs/<project_id>/
  source       TEXT NOT NULL DEFAULT 'automation', -- automation | manual
  width        INTEGER DEFAULT NULL,
  height       INTEGER DEFAULT NULL,
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outputs_job     ON outputs(job_id);
CREATE INDEX IF NOT EXISTS idx_outputs_project ON outputs(project_id);

CREATE TABLE IF NOT EXISTS job_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  level      TEXT NOT NULL DEFAULT 'info', -- info | warn | error
  message    TEXT NOT NULL,
  meta_json  TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id);
