-- Phase 5: AI Opportunity Briefs
-- Run after supabase_schema.sql, phase2_migration.sql, phase4_ai_analyzer.sql

-- ── Opportunity Briefs ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS opportunity_briefs (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id              UUID        NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,

  -- Narrative
  summary                  TEXT        NOT NULL DEFAULT '',
  opportunity_type         TEXT        NOT NULL DEFAULT '',
  estimated_contract_size  TEXT        NOT NULL DEFAULT '',

  -- Scores
  fit_score                INTEGER     NOT NULL DEFAULT 0 CHECK (fit_score BETWEEN 0 AND 100),
  win_probability          INTEGER     NOT NULL DEFAULT 0 CHECK (win_probability BETWEEN 0 AND 100),
  proposal_complexity      TEXT        NOT NULL DEFAULT 'medium'
                           CHECK (proposal_complexity IN ('low', 'medium', 'high', 'very_high')),
  competition_level        TEXT        NOT NULL DEFAULT 'medium'
                           CHECK (competition_level  IN ('low', 'medium', 'high')),

  -- Lists
  required_certifications  TEXT[]      NOT NULL DEFAULT '{}',
  required_documents       TEXT[]      NOT NULL DEFAULT '{}',
  key_requirements         TEXT[]      NOT NULL DEFAULT '{}',
  risks                    TEXT[]      NOT NULL DEFAULT '{}',
  recommended_actions      TEXT[]      NOT NULL DEFAULT '{}',

  -- JSON timeline
  timeline                 JSONB       NOT NULL DEFAULT '{}',

  -- Meta
  generated_by             TEXT        NOT NULL DEFAULT 'rule-based',
  generated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (contract_id)
);

CREATE INDEX IF NOT EXISTS idx_opportunity_briefs_contract_id  ON opportunity_briefs(contract_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_briefs_fit_score    ON opportunity_briefs(fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_briefs_generated_at ON opportunity_briefs(generated_at DESC);

ALTER TABLE opportunity_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opportunity_briefs_select" ON opportunity_briefs;
DROP POLICY IF EXISTS "opportunity_briefs_insert" ON opportunity_briefs;
DROP POLICY IF EXISTS "opportunity_briefs_update" ON opportunity_briefs;

CREATE POLICY "opportunity_briefs_select" ON opportunity_briefs FOR SELECT USING (true);
CREATE POLICY "opportunity_briefs_insert" ON opportunity_briefs FOR INSERT WITH CHECK (true);
CREATE POLICY "opportunity_briefs_update" ON opportunity_briefs FOR UPDATE USING (true);

-- ── Brief Job Queue ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS opportunity_brief_jobs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID        NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  UNIQUE (contract_id)
);

CREATE INDEX IF NOT EXISTS idx_brief_jobs_status     ON opportunity_brief_jobs(status);
CREATE INDEX IF NOT EXISTS idx_brief_jobs_created_at ON opportunity_brief_jobs(created_at);

ALTER TABLE opportunity_brief_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brief_jobs_select" ON opportunity_brief_jobs;
DROP POLICY IF EXISTS "brief_jobs_insert" ON opportunity_brief_jobs;
DROP POLICY IF EXISTS "brief_jobs_update" ON opportunity_brief_jobs;

CREATE POLICY "brief_jobs_select" ON opportunity_brief_jobs FOR SELECT USING (true);
CREATE POLICY "brief_jobs_insert" ON opportunity_brief_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "brief_jobs_update" ON opportunity_brief_jobs FOR UPDATE USING (true);
