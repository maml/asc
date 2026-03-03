-- Migration 005: Indexes on api_key_hash for auth lookups

CREATE INDEX IF NOT EXISTS idx_providers_api_key_hash ON providers (api_key_hash);
CREATE INDEX IF NOT EXISTS idx_consumers_api_key_hash ON consumers (api_key_hash);
