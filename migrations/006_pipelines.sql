-- Pipeline definitions (immutable)
CREATE TABLE pipelines (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  consumer_id TEXT NOT NULL REFERENCES consumers(id),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  steps       JSONB NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'normal',
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipelines_consumer ON pipelines(consumer_id);

-- Pipeline executions
CREATE TABLE pipeline_executions (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  pipeline_id         TEXT NOT NULL REFERENCES pipelines(id),
  consumer_id         TEXT NOT NULL REFERENCES consumers(id),
  trace_id            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  status              TEXT NOT NULL DEFAULT 'pending',
  input               JSONB,
  output              JSONB,
  error               TEXT,
  failed_step_index   INTEGER,
  current_step_index  INTEGER NOT NULL DEFAULT 0,
  total_steps         INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  metadata            JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_pipeline_executions_pipeline ON pipeline_executions(pipeline_id);
CREATE INDEX idx_pipeline_executions_consumer ON pipeline_executions(consumer_id);

-- Per-step execution tracking
CREATE TABLE pipeline_step_executions (
  id              SERIAL PRIMARY KEY,
  execution_id    TEXT NOT NULL REFERENCES pipeline_executions(id),
  step_index      INTEGER NOT NULL,
  step_name       TEXT NOT NULL,
  agent_id        TEXT NOT NULL REFERENCES agents(id),
  coordination_id TEXT REFERENCES coordinations(id),
  task_id         TEXT REFERENCES tasks(id),
  status          TEXT NOT NULL DEFAULT 'pending',
  input           JSONB,
  output          JSONB,
  error           TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER,
  UNIQUE(execution_id, step_index)
);

-- Pipeline events for observability
CREATE TABLE pipeline_events (
  id            SERIAL PRIMARY KEY,
  execution_id  TEXT NOT NULL REFERENCES pipeline_executions(id),
  trace_id      TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_events_execution ON pipeline_events(execution_id);
