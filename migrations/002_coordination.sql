-- Migration 002: Coordination engine tables

-- Coordinations group a request lifecycle
CREATE TABLE coordinations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  consumer_id TEXT NOT NULL REFERENCES consumers(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  trace_id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  callback_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coordinations_consumer ON coordinations(consumer_id);
CREATE INDEX idx_coordinations_agent ON coordinations(agent_id);

-- Tasks are the unit of work within a coordination
CREATE TABLE tasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  coordination_id TEXT NOT NULL REFERENCES coordinations(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  consumer_id TEXT NOT NULL REFERENCES consumers(id),
  trace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal',
  input JSONB,
  output JSONB,
  error TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  timeout_ms INT NOT NULL DEFAULT 30000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_tasks_coordination ON tasks(coordination_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_agent ON tasks(agent_id);
CREATE INDEX idx_tasks_consumer ON tasks(consumer_id);

-- Coordination events — immutable log of everything that happens
CREATE TABLE coordination_events (
  id SERIAL PRIMARY KEY,
  coordination_id TEXT NOT NULL REFERENCES coordinations(id),
  trace_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_coordination ON coordination_events(coordination_id);
CREATE INDEX idx_events_type ON coordination_events(event_type);
CREATE INDEX idx_events_timestamp ON coordination_events(timestamp);
