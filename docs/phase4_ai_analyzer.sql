-- Phase 4: AI Contract Analyzer
-- Run after supabase_schema.sql and phase2_migration.sql

CREATE TABLE IF NOT EXISTS contract_analyses (
  id                                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id                       UUID        NOT NULL REFERENCES contracts(id)          ON DELETE CASCADE,
  business_profile_id               UUID                 REFERENCES business_profiles(id)  ON DELETE SET NULL,

  -- Scores
  fit_score                         INTEGER     NOT NULL DEFAULT 0 CHECK (fit_score        BETWEEN 0 AND 100),
  win_probability                   INTEGER     NOT NULL DEFAULT 0 CHECK (win_probability  BETWEEN 0 AND 100),
  risk_level                        TEXT        NOT NULL DEFAULT 'medium'
                                    CHECK (risk_level      IN ('low', 'medium', 'high')),
  proposal_effort                   TEXT        NOT NULL DEFAULT 'medium'
                                    CHECK (proposal_effort IN ('low', 'medium', 'high', 'very_high')),

  -- Narrative fields
  executive_summary                 TEXT        NOT NULL DEFAULT '',
  why_it_matches                    TEXT[]      NOT NULL DEFAULT '{}',
  risks                             TEXT[]      NOT NULL DEFAULT '{}',
  missing_requirements              TEXT[]      NOT NULL DEFAULT '{}',
  recommended_next_steps            TEXT[]      NOT NULL DEFAULT '{}',
  questions_for_contracting_officer TEXT[]      NOT NULL DEFAULT '{}',

  -- Meta
  ai_model                          TEXT,
  is_ai_generated                   BOOLEAN     NOT NULL DEFAULT false,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contract_analyses_contract_id ON contract_analyses(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_analyses_profile_id  ON contract_analyses(business_profile_id);
CREATE INDEX IF NOT EXISTS idx_contract_analyses_created_at  ON contract_analyses(created_at DESC);

-- RLS (allow all for MVP; lock down with auth later)
ALTER TABLE contract_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contract_analyses_select" ON contract_analyses;
DROP POLICY IF EXISTS "contract_analyses_insert" ON contract_analyses;

CREATE POLICY "contract_analyses_select" ON contract_analyses FOR SELECT USING (true);
CREATE POLICY "contract_analyses_insert" ON contract_analyses FOR INSERT WITH CHECK (true);
