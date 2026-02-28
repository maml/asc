-- Migration 003: Observability + Compliance tables (traces, spans, SLA, quality gates)

-- Distributed traces tied to coordinations
CREATE TABLE traces (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  coordination_id TEXT NOT NULL REFERENCES coordinations(id),
  root_span_id TEXT,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_traces_coordination ON traces(coordination_id);

-- Individual spans within a trace
CREATE TABLE spans (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
  parent_span_id TEXT REFERENCES spans(id),
  operation_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'error', 'timeout')),
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  duration_ms INT,
  attributes JSONB NOT NULL DEFAULT '{}',
  events JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_spans_trace ON spans(trace_id);
CREATE INDEX idx_spans_parent ON spans(parent_span_id);

-- SLA rules define thresholds per agent/provider pair
CREATE TABLE sla_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  metric_type TEXT NOT NULL
    CHECK (metric_type IN ('latency', 'uptime', 'error_rate', 'throughput')),
  threshold NUMERIC NOT NULL,
  window_minutes INT NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sla_rules_agent ON sla_rules(agent_id);

-- Periodic compliance evaluations against SLA rules
CREATE TABLE sla_compliance_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  rule_id TEXT NOT NULL REFERENCES sla_rules(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL
    CHECK (status IN ('compliant', 'warning', 'violated')),
  current_value NUMERIC NOT NULL,
  threshold NUMERIC NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sla_compliance_rule ON sla_compliance_records(rule_id);
CREATE INDEX idx_sla_compliance_agent ON sla_compliance_records(agent_id);
CREATE INDEX idx_sla_compliance_evaluated ON sla_compliance_records(evaluated_at);

-- Quality gates define automated checks for agent output
CREATE TABLE quality_gates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  check_config JSONB NOT NULL,
  required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quality_gates_agent ON quality_gates(agent_id);

-- Results of quality gate evaluations per task
CREATE TABLE quality_check_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  gate_id TEXT NOT NULL REFERENCES quality_gates(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  result TEXT NOT NULL
    CHECK (result IN ('pass', 'fail', 'skip', 'error')),
  message TEXT,
  duration_ms INT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quality_checks_gate ON quality_check_records(gate_id);
CREATE INDEX idx_quality_checks_task ON quality_check_records(task_id);
