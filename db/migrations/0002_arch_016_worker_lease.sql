ALTER TABLE invoice_jobs
  ADD COLUMN IF NOT EXISTS lease_owner TEXT NULL;

ALTER TABLE invoice_jobs
  ADD COLUMN IF NOT EXISTS lease_token TEXT NULL;

ALTER TABLE invoice_jobs
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS invoice_jobs_claim_idx
  ON invoice_jobs (tenant_id, status, next_attempt_at, lease_expires_at, created_at);

CREATE INDEX IF NOT EXISTS invoice_jobs_lease_idx
  ON invoice_jobs (tenant_id, status, lease_expires_at);
