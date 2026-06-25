-- ============================================================
-- Contract Match AI — Supabase Database Schema
-- Run this in your Supabase SQL Editor to set up the database.
-- Dashboard: https://supabase.com/dashboard/project/<your-project>/editor
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- Table: business_profiles
-- Created when a user submits the /onboarding form.
-- ============================================================
CREATE TABLE IF NOT EXISTS business_profiles (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name            TEXT NOT NULL,
  industry                 TEXT NOT NULL,
  naics_codes              TEXT[]    NOT NULL DEFAULT '{}',
  city                     TEXT NOT NULL,
  state                    TEXT NOT NULL,
  service_radius           INTEGER   NOT NULL DEFAULT 50,  -- miles
  certifications           TEXT[]    NOT NULL DEFAULT '{}',
  years_in_business        INTEGER   NOT NULL,
  past_government_experience BOOLEAN NOT NULL DEFAULT FALSE,
  email                    TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_business_profiles_email
  ON business_profiles (email);


-- ============================================================
-- Table: contracts
-- Government/public contract opportunities.
-- Seed this table with opportunities (see seed section below).
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                  TEXT NOT NULL,
  agency                 TEXT NOT NULL,
  location               TEXT NOT NULL,
  state                  TEXT NOT NULL,
  due_date               DATE NOT NULL,
  value_min              BIGINT,          -- dollars
  value_max              BIGINT,          -- dollars
  description            TEXT,
  requirements           TEXT[]  NOT NULL DEFAULT '{}',
  naics_codes            TEXT[]  NOT NULL DEFAULT '{}',
  certifications_required TEXT[] NOT NULL DEFAULT '{}',
  solicitation_number    TEXT,
  posted_date            DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for NAICS-based filtering
CREATE INDEX IF NOT EXISTS idx_contracts_naics
  ON contracts USING GIN (naics_codes);

CREATE INDEX IF NOT EXISTS idx_contracts_certifications
  ON contracts USING GIN (certifications_required);

CREATE INDEX IF NOT EXISTS idx_contracts_state
  ON contracts (state);

CREATE INDEX IF NOT EXISTS idx_contracts_due_date
  ON contracts (due_date);


-- ============================================================
-- Table: contract_matches
-- Links a business profile to a contract with a match score.
-- Populated by your matching logic / Edge Function.
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_matches (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id    UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  contract_id            UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  match_score            INTEGER NOT NULL CHECK (match_score BETWEEN 0 AND 100),
  match_reasons          TEXT[]  NOT NULL DEFAULT '{}',
  suggested_next_steps   TEXT[]  NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (business_profile_id, contract_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_matches_profile
  ON contract_matches (business_profile_id, match_score DESC);


-- ============================================================
-- Row-Level Security (RLS)
-- Enables secure per-user data access. Adjust policies as
-- needed when you add authentication.
-- ============================================================
ALTER TABLE business_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_matches    ENABLE ROW LEVEL SECURITY;

-- Contracts are public (anyone can read)
CREATE POLICY "Contracts are publicly readable"
  ON contracts FOR SELECT
  USING (true);

-- Profiles: anyone can insert (no auth yet), no reads without auth
CREATE POLICY "Anyone can create a business profile"
  ON business_profiles FOR INSERT
  WITH CHECK (true);

-- Matches: readable by the owner profile ID passed as a parameter
-- (tighten this policy once you add Supabase Auth)
CREATE POLICY "Matches are readable by matching profile"
  ON contract_matches FOR SELECT
  USING (true);


-- ============================================================
-- Matching Function (optional server-side scoring)
-- Call this after inserting a business_profile to generate matches.
-- Scoring logic: NAICS overlap (50pts) + cert overlap (30pts)
--   + past govt experience (10pts) + years in business (10pts)
-- ============================================================
CREATE OR REPLACE FUNCTION generate_matches_for_profile(profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  profile RECORD;
  contract RECORD;
  score INTEGER;
  naics_overlap INTEGER;
  cert_overlap INTEGER;
  reasons TEXT[];
  steps TEXT[];
BEGIN
  SELECT * INTO profile FROM business_profiles WHERE id = profile_id;

  FOR contract IN SELECT * FROM contracts WHERE due_date >= CURRENT_DATE LOOP
    -- NAICS overlap score (up to 50 points)
    SELECT COUNT(*) INTO naics_overlap
      FROM unnest(profile.naics_codes) AS pn
      JOIN unnest(contract.naics_codes) AS cn ON pn = cn;

    -- Certification overlap score (up to 30 points)
    SELECT COUNT(*) INTO cert_overlap
      FROM unnest(profile.certifications) AS pc
      JOIN unnest(contract.certifications_required) AS cc ON pc = cc;

    score := LEAST(naics_overlap * 25, 50)
           + LEAST(cert_overlap * 15, 30)
           + CASE WHEN profile.past_government_experience THEN 10 ELSE 0 END
           + CASE WHEN profile.years_in_business >= 3 THEN 10 ELSE 5 END;

    -- Only insert meaningful matches (score >= 30)
    IF score >= 30 THEN
      reasons := ARRAY[]::TEXT[];
      IF naics_overlap > 0 THEN
        reasons := array_append(reasons,
          format('Your NAICS code(s) match this contract (%s overlap)', naics_overlap));
      END IF;
      IF cert_overlap > 0 THEN
        reasons := array_append(reasons, 'Your certifications align with set-aside preferences');
      END IF;
      IF profile.past_government_experience THEN
        reasons := array_append(reasons, 'Past government experience is a strong signal');
      END IF;

      steps := ARRAY[
        'Register on SAM.gov if you haven''t already',
        'Download the full solicitation using the solicitation number',
        'Prepare a capability statement tailored to this agency',
        'Contact the contracting officer for any pre-submission Q&A'
      ];

      INSERT INTO contract_matches
        (business_profile_id, contract_id, match_score, match_reasons, suggested_next_steps)
      VALUES
        (profile_id, contract.id, LEAST(score, 100), reasons, steps)
      ON CONFLICT (business_profile_id, contract_id)
      DO UPDATE SET
        match_score = EXCLUDED.match_score,
        match_reasons = EXCLUDED.match_reasons;
    END IF;
  END LOOP;
END;
$$;

-- Usage after a profile is inserted:
--   SELECT generate_matches_for_profile('<profile-uuid>');


-- ============================================================
-- Seed Data — Sample contracts (mirrors lib/mockData.ts)
-- Run this to populate the contracts table for testing.
-- ============================================================
INSERT INTO contracts (title, agency, location, state, due_date, value_min, value_max, description, requirements, naics_codes, certifications_required, solicitation_number, posted_date)
VALUES
(
  'IT Infrastructure Maintenance and Support Services',
  'Department of Veterans Affairs',
  'Washington, DC', 'DC', '2026-08-15', 250000, 500000,
  'Comprehensive IT infrastructure maintenance including server management, network monitoring, and help desk support for VA facilities.',
  ARRAY['Must hold an active SDVOSB or VOSB certification','Minimum 5 years of federal IT service experience','FISMA compliance experience required'],
  ARRAY['541512','541519'], ARRAY['SDVOSB','VOSB'], 'VA-36C10X26R0042', '2026-06-01'
),
(
  'Cybersecurity Assessment and Monitoring Services',
  'Department of Homeland Security',
  'Arlington, VA', 'VA', '2026-07-30', 500000, 2000000,
  'Ongoing cybersecurity assessments, penetration testing, and continuous monitoring services for agency networks.',
  ARRAY['8(a) or small business set-aside eligibility required','CISSP or equivalent certifications for key personnel','Experience with federal SIEM tools'],
  ARRAY['541512','541519','561621'], ARRAY['8(a)','SDB'], 'DHS-26-B-00173', '2026-05-28'
),
(
  'General Construction and Renovation Services',
  'General Services Administration',
  'Atlanta, GA', 'GA', '2026-09-01', 1000000, 5000000,
  'General construction and renovation services for federal office buildings in the Atlanta region.',
  ARRAY['Licensed general contractor in Georgia','Davis-Bacon Act compliance required','HUBZone or WOSB preferred'],
  ARRAY['236220','238210','238220'], ARRAY['HUBZone','WOSB'], 'GS-04P-26-HJ-C-0019', '2026-06-05'
),
(
  'Healthcare Staffing and Workforce Solutions',
  'Department of Health and Human Services',
  'Rockville, MD', 'MD', '2026-08-01', 750000, 3000000,
  'Temporary and permanent healthcare professionals including registered nurses, medical assistants, and administrative staff.',
  ARRAY['Joint Commission accreditation preferred','WOSB or MBE certification preferred'],
  ARRAY['561320','621111','621610'], ARRAY['WOSB','MBE'], 'HHS-2026-NIH-SS-0047', '2026-06-10'
),
(
  'Environmental Site Assessment and Remediation',
  'Environmental Protection Agency',
  'Denver, CO', 'CO', '2026-07-15', 300000, 1200000,
  'Phase I and Phase II site assessments, groundwater monitoring, and remediation at Superfund sites.',
  ARRAY['Licensed Professional Geologist or Environmental Engineer on staff','Experience with CERCLA remediation projects'],
  ARRAY['541620','562910','541380'], ARRAY['DBE','SDB'], 'EPA-R8-26-C-00211', '2026-05-15'
),
(
  'Professional Training and Development Services',
  'Office of Personnel Management',
  'Washington, DC', 'DC', '2026-09-15', 150000, 600000,
  'Leadership development, project management, and technical skills training to federal employees.',
  ARRAY['8(a) or WOSB set-aside eligibility','Certified instructional designers on staff'],
  ARRAY['611430','611699','541611'], ARRAY['8(a)','WOSB'], 'OPM-HR-SOLHQ-26-0033', '2026-06-12'
)
ON CONFLICT DO NOTHING;
