-- Migration 004: Billing tables (billing events, invoices)

-- Every billable action generates a billing event
CREATE TABLE billing_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_id TEXT REFERENCES tasks(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  consumer_id TEXT NOT NULL REFERENCES consumers(id),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('invocation', 'streaming_session', 'adjustment', 'refund')),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  pricing_snapshot JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_billing_events_consumer ON billing_events(consumer_id);
CREATE INDEX idx_billing_events_agent ON billing_events(agent_id);
CREATE INDEX idx_billing_events_provider ON billing_events(provider_id);
CREATE INDEX idx_billing_events_occurred ON billing_events(occurred_at);

-- Periodic invoices rolled up from billing events
CREATE TABLE invoices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  consumer_id TEXT NOT NULL REFERENCES consumers(id),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_amount_cents INTEGER NOT NULL DEFAULT 0,
  total_currency TEXT NOT NULL DEFAULT 'USD',
  line_item_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'paid', 'overdue')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_consumer ON invoices(consumer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
