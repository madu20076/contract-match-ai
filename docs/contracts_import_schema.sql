-- ============================================================
-- Contract Import Architecture — run AFTER supabase_schema.sql
-- ============================================================

-- ============================================================
-- Table: contract_sources
-- One row per procurement data source.
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  source_type  TEXT NOT NULL CHECK (source_type IN ('federal','state','city','county')),
  base_url     TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  config       JSONB NOT NULL DEFAULT '{}',  -- env var names, pagination hints, etc.
  last_run_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Table: contracts_import_jobs
-- One row per import run per source.
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts_import_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id           UUID NOT NULL REFERENCES contract_sources(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','running','completed','failed')),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  contracts_found     INTEGER NOT NULL DEFAULT 0,
  contracts_inserted  INTEGER NOT NULL DEFAULT 0,
  contracts_updated   INTEGER NOT NULL DEFAULT 0,
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_source
  ON contracts_import_jobs (source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status
  ON contracts_import_jobs (status, created_at DESC);

-- ============================================================
-- Alter contracts table — add import tracking columns
-- Safe to run multiple times (IF NOT EXISTS guards).
-- ============================================================
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS source_id      UUID REFERENCES contract_sources(id),
  ADD COLUMN IF NOT EXISTS import_job_id  UUID REFERENCES contracts_import_jobs(id),
  ADD COLUMN IF NOT EXISTS external_id    TEXT,
  ADD COLUMN IF NOT EXISTS raw_data       JSONB;

-- Unique per-source external ID (prevents duplicate ingestion)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_contracts_source_external'
  ) THEN
    ALTER TABLE contracts
      ADD CONSTRAINT uq_contracts_source_external UNIQUE (source_id, external_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contracts_source
  ON contracts (source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contracts_external_id
  ON contracts (external_id);

-- ============================================================
-- RLS policies for new tables
-- ============================================================
ALTER TABLE contract_sources      ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts_import_jobs ENABLE ROW LEVEL SECURITY;

-- Sources: public read, service-role write
CREATE POLICY "contract_sources_read"
  ON contract_sources FOR SELECT USING (true);

-- Jobs: public read
CREATE POLICY "import_jobs_read"
  ON contracts_import_jobs FOR SELECT USING (true);

-- Allow inserts/updates for server-side import (use service role key)
CREATE POLICY "import_jobs_insert"
  ON contracts_import_jobs FOR INSERT WITH CHECK (true);

CREATE POLICY "import_jobs_update"
  ON contracts_import_jobs FOR UPDATE USING (true);

-- Allow server to insert new contracts
CREATE POLICY "contracts_insert"
  ON contracts FOR INSERT WITH CHECK (true);

CREATE POLICY "contracts_update"
  ON contracts FOR UPDATE USING (true);

-- ============================================================
-- Seed: contract_sources
-- ============================================================
INSERT INTO contract_sources (slug, name, source_type, base_url, config) VALUES
(
  'samgov',
  'SAM.gov',
  'federal',
  'https://api.sam.gov/opportunities/v2/search',
  '{"api_key_env": "SAMGOV_API_KEY", "max_records": 1000}'
),
(
  'texas',
  'Texas ESBD',
  'state',
  'https://www.txsmartbuy.com/esbd',
  '{"api_key_env": "TEXAS_ESBD_API_KEY", "note": "Electronic State Business Daily"}'
),
(
  'houston',
  'City of Houston Purchasing',
  'city',
  'https://purchasing.houstontx.gov',
  '{"note": "No public API — use webhook or CSV upload"}'
),
(
  'harris-county',
  'Harris County Purchasing',
  'county',
  'https://harriscounty.bonfirehub.com',
  '{"note": "Bonfire platform — no public API"}'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  config = EXCLUDED.config;
