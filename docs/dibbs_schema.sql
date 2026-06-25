-- ============================================================
-- DIBBS Integration + Extended Fields Migration
-- Run AFTER supabase_schema.sql AND contracts_import_schema.sql
-- ============================================================

-- ── Extend business_profiles ─────────────────────────────

ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS fsc_codes    TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nsn_interest TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS keywords     TEXT[] NOT NULL DEFAULT '{}';

-- ── Extend contracts ─────────────────────────────────────

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS source_name       TEXT,
  ADD COLUMN IF NOT EXISTS source_url        TEXT,
  ADD COLUMN IF NOT EXISTS fsc_codes         TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nsn               TEXT,
  ADD COLUMN IF NOT EXISTS solicitation_type TEXT;

CREATE INDEX IF NOT EXISTS idx_contracts_fsc
  ON contracts USING GIN (fsc_codes);

CREATE INDEX IF NOT EXISTS idx_contracts_nsn
  ON contracts (nsn);

-- ── Seed DIBBS into contract_sources ─────────────────────

INSERT INTO contract_sources (slug, name, source_type, base_url, config) VALUES
(
  'dibbs',
  'DIBBS',
  'federal',
  'https://www.dibbs.bsm.dla.mil',
  '{"note": "Defense Internet Bid Board System — DLA supply solicitations (FSC/NSN-based)"}'
)
ON CONFLICT (slug) DO UPDATE SET
  name     = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  config   = EXCLUDED.config;

-- Update existing source_name on previously seeded contracts (if any)
UPDATE contracts c
   SET source_name = cs.name
  FROM contract_sources cs
 WHERE c.source_id = cs.id
   AND c.source_name IS NULL;

-- ── Updated matching function ─────────────────────────────
-- Scoring:
--   NAICS overlap  → up to 40 pts  (20 per match)
--   FSC overlap    → up to 25 pts  (13 per match)
--   NSN exact hit  → 15 pts
--   Keyword hits   → up to 10 pts  ( 5 per hit)
--   Cert overlap   → up to 15 pts  ( 8 per match)
--   Past exp       →  5 pts
--   Years (3+)     →  5 pts
--   Cap at 100
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_matches_for_profile(profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  profile       RECORD;
  contract      RECORD;
  score         INTEGER;
  naics_overlap INTEGER;
  fsc_overlap   INTEGER;
  nsn_hit       INTEGER;
  keyword_hits  INTEGER;
  cert_overlap  INTEGER;
  reasons       TEXT[];
  steps         TEXT[];
BEGIN
  SELECT * INTO profile FROM business_profiles WHERE id = profile_id;

  FOR contract IN SELECT * FROM contracts WHERE due_date >= CURRENT_DATE LOOP

    -- NAICS overlap (up to 40 pts)
    SELECT COUNT(*) INTO naics_overlap
      FROM unnest(profile.naics_codes) AS pn
      JOIN unnest(contract.naics_codes) AS cn ON pn = cn;

    -- FSC overlap (up to 25 pts)
    SELECT COUNT(*) INTO fsc_overlap
      FROM unnest(profile.fsc_codes) AS pf
      JOIN unnest(contract.fsc_codes) AS cf ON pf = cf;

    -- NSN exact match (15 pts)
    nsn_hit := 0;
    IF contract.nsn IS NOT NULL
       AND array_length(profile.nsn_interest, 1) > 0
       AND contract.nsn = ANY(profile.nsn_interest) THEN
      nsn_hit := 1;
    END IF;

    -- Keyword hits in title + description (up to 10 pts, 5 per hit)
    keyword_hits := 0;
    IF array_length(profile.keywords, 1) > 0 THEN
      SELECT COUNT(*) INTO keyword_hits
        FROM unnest(profile.keywords) AS kw
       WHERE lower(contract.title)           LIKE '%' || lower(kw) || '%'
          OR lower(COALESCE(contract.description, '')) LIKE '%' || lower(kw) || '%';
    END IF;

    -- Certification overlap (up to 15 pts)
    SELECT COUNT(*) INTO cert_overlap
      FROM unnest(profile.certifications) AS pc
      JOIN unnest(contract.certifications_required) AS cc ON pc = cc;

    score :=
        LEAST(naics_overlap * 20, 40)
      + LEAST(fsc_overlap   * 13, 25)
      + (nsn_hit            * 15)
      + LEAST(keyword_hits  *  5, 10)
      + LEAST(cert_overlap  *  8, 15)
      + CASE WHEN profile.past_government_experience THEN 5 ELSE 0 END
      + CASE WHEN profile.years_in_business >= 3     THEN 5 ELSE 0 END;

    IF score >= 20 THEN
      reasons := ARRAY[]::TEXT[];

      IF naics_overlap > 0 THEN
        reasons := array_append(reasons,
          format('Your NAICS code(s) match this contract (%s overlap)', naics_overlap));
      END IF;
      IF fsc_overlap > 0 THEN
        reasons := array_append(reasons,
          format('Your FSC code(s) align with this supply solicitation (%s match)', fsc_overlap));
      END IF;
      IF nsn_hit > 0 THEN
        reasons := array_append(reasons, 'This contract matches an NSN you track');
      END IF;
      IF keyword_hits > 0 THEN
        reasons := array_append(reasons,
          format('Your keywords appear in this contract (%s match)', keyword_hits));
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
        match_score   = EXCLUDED.match_score,
        match_reasons = EXCLUDED.match_reasons;
    END IF;
  END LOOP;
END;
$$;
