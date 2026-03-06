CREATE TABLE IF NOT EXISTS payment_webhook_audits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  raw_body TEXT NOT NULL,
  headers JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  event_id TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('processed', 'duplicate', 'rejected')),
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_webhook_audits_provider_event_idx
  ON payment_webhook_audits (provider, event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_webhook_audits_status_created_idx
  ON payment_webhook_audits (status, created_at DESC);
