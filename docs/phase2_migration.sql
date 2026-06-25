-- ============================================================
-- Contract Match AI — Phase 2: Real Contract Sources
-- Canonical migration. Safe to run multiple times.
-- Run AFTER docs/supabase_schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 0. Extend business_profiles
--    Adds DIBBS / defense-supply matching fields.
-- ============================================================
ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS fsc_codes    TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nsn_interest TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS keywords     TEXT[] NOT NULL DEFAULT '{}';

-- ============================================================
-- 1. contract_sources
--    One row per procurement platform. The "slug" column is
--    the machine identifier used by TypeScript connectors
--    (e.g. 'dibbs', 'samgov'). Not shown in the UI.
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_sources (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        UNIQUE NOT NULL,
  name        TEXT        NOT NULL,
  source_type TEXT        NOT NULL
                CHECK (source_type IN ('federal', 'state', 'city', 'county')),
  enabled     BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. contract_import_runs
--    One row per import execution per source.
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_import_runs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          UUID        NOT NULL REFERENCES contract_sources(id) ON DELETE CASCADE,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  status             TEXT        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  contracts_imported INTEGER     NOT NULL DEFAULT 0,
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. Extend contracts
--    All guarded with IF NOT EXISTS — safe on existing DBs.
-- ============================================================
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS source_name        TEXT,
  ADD COLUMN IF NOT EXISTS source_url         TEXT,
  ADD COLUMN IF NOT EXISTS source_contract_id TEXT,
  ADD COLUMN IF NOT EXISTS fsc_codes          TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nsn                TEXT,
  ADD COLUMN IF NOT EXISTS solicitation_type  TEXT,
  ADD COLUMN IF NOT EXISTS set_aside          TEXT,
  ADD COLUMN IF NOT EXISTS last_imported_at   TIMESTAMPTZ;

-- ============================================================
-- 4. Indexes
-- ============================================================

-- contract_import_runs
CREATE INDEX IF NOT EXISTS idx_import_runs_source
  ON contract_import_runs (source_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_runs_status
  ON contract_import_runs (status, started_at DESC);

-- contracts — new Phase 2 indexes
CREATE INDEX IF NOT EXISTS idx_contracts_source_name
  ON contracts (source_name);

CREATE INDEX IF NOT EXISTS idx_contracts_nsn
  ON contracts (nsn);

CREATE INDEX IF NOT EXISTS idx_contracts_fsc_codes
  ON contracts USING GIN (fsc_codes);

CREATE INDEX IF NOT EXISTS idx_contracts_solicitation_number
  ON contracts (solicitation_number);

-- Unique: one DB row per (source_name, source_contract_id) pair.
-- Prevents duplicate ingestion without requiring a source_id FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'uq_contracts_source_contract_id'
  ) THEN
    ALTER TABLE contracts
      ADD CONSTRAINT uq_contracts_source_contract_id
      UNIQUE (source_name, source_contract_id);
  END IF;
END $$;

-- ============================================================
-- 5. Row-Level Security
-- ============================================================
ALTER TABLE contract_sources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_import_runs ENABLE ROW LEVEL SECURITY;

-- contract_sources — public read, service-role write
DROP POLICY IF EXISTS "contract_sources_select" ON contract_sources;
CREATE POLICY "contract_sources_select"
  ON contract_sources FOR SELECT USING (true);

-- contract_import_runs — public read
DROP POLICY IF EXISTS "import_runs_select" ON contract_import_runs;
CREATE POLICY "import_runs_select"
  ON contract_import_runs FOR SELECT USING (true);

-- contract_import_runs — server-side insert / update (uses service role key)
DROP POLICY IF EXISTS "import_runs_insert" ON contract_import_runs;
CREATE POLICY "import_runs_insert"
  ON contract_import_runs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "import_runs_update" ON contract_import_runs;
CREATE POLICY "import_runs_update"
  ON contract_import_runs FOR UPDATE USING (true);

-- contracts — server-side insert / update
DROP POLICY IF EXISTS "contracts_insert" ON contracts;
CREATE POLICY "contracts_insert"
  ON contracts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "contracts_update" ON contracts;
CREATE POLICY "contracts_update"
  ON contracts FOR UPDATE USING (true);

-- ============================================================
-- 6. Seed: contract_sources
-- ============================================================
INSERT INTO contract_sources (slug, name, source_type, enabled) VALUES
  ('dibbs',         'DIBBS',           'federal', true),
  ('samgov',        'SAM.gov',         'federal', true),
  ('texas',         'Texas SmartBuy',  'state',   true),
  ('harris-county', 'Harris County',   'county',  true),
  ('houston',       'City of Houston', 'city',    true)
ON CONFLICT (slug) DO UPDATE
  SET name    = EXCLUDED.name,
      enabled = EXCLUDED.enabled;
