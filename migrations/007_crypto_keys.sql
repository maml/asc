-- Crypto identity: secp256k1 public key registration for signature auth.

CREATE TABLE crypto_keys (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('provider', 'consumer')),
  entity_id   TEXT NOT NULL,
  public_key  TEXT NOT NULL,
  key_path    JSONB,
  label       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

-- Only one active key per public key (prevents duplicate registration)
CREATE UNIQUE INDEX idx_crypto_keys_pubkey_active ON crypto_keys(public_key) WHERE status = 'active';

-- Fast lookup by entity for key management
CREATE INDEX idx_crypto_keys_entity ON crypto_keys(entity_type, entity_id);
