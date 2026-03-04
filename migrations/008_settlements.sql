-- Settlement tables: provider config + settlement records

CREATE TABLE provider_settlement_configs (
  provider_id TEXT PRIMARY KEY REFERENCES providers(id),
  network TEXT NOT NULL CHECK (network IN ('lightning', 'liquid', 'stripe', 'noop')),
  lightning_address TEXT,
  liquid_address TEXT,
  stripe_connect_account_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settlements (
  id TEXT PRIMARY KEY DEFAULT 'stl_' || substr(md5(random()::text), 1, 20),
  billing_event_id TEXT NOT NULL REFERENCES billing_events(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  consumer_id TEXT NOT NULL REFERENCES consumers(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  network TEXT NOT NULL CHECK (network IN ('lightning', 'liquid', 'stripe', 'noop')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'settled', 'failed')),
  gross_amount_cents INTEGER NOT NULL,
  provider_amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  network_fee_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC,
  external_id TEXT,
  external_status TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One settlement per billing event (idempotency)
CREATE UNIQUE INDEX idx_settlements_billing_event ON settlements(billing_event_id);
CREATE INDEX idx_settlements_provider ON settlements(provider_id);
CREATE INDEX idx_settlements_status ON settlements(status);
CREATE INDEX idx_settlements_created ON settlements(created_at);
