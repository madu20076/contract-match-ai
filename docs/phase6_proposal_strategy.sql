-- Phase 6: Proposal Strategy
-- One row per (contract × business_profile) — personalised bid/no-bid decision + strategy
-- Run this in the Supabase SQL Editor after phase5_opportunity_briefs.sql

create table if not exists proposal_strategies (
  id                       uuid        primary key default gen_random_uuid(),
  contract_id              uuid        not null references contracts(id)         on delete cascade,
  business_profile_id      uuid        not null references business_profiles(id) on delete cascade,

  -- Core decision
  recommendation           text        not null check (recommendation in ('GO', 'NO-GO', 'CONDITIONAL')),
  confidence_score         integer     not null default 50 check (confidence_score between 0 and 100),

  -- SWOT + docs
  strengths                text[]      not null default '{}',
  weaknesses               text[]      not null default '{}',
  required_documents       text[]      not null default '{}',

  -- Strategy detail
  evaluation_factors       jsonb       not null default '{}',   -- { "Technical": "guidance..." }
  pricing_guidance         text        not null default '',
  teaming_recommendations  text[]      not null default '{}',
  timeline                 jsonb       not null default '{}',   -- { "register": "immediately", ... }
  next_steps               text[]      not null default '{}',

  -- Metadata
  generated_by             text        not null default 'rule-based',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- One strategy per contract per profile (regenerate in place)
  unique (contract_id, business_profile_id)
);

-- Row-level security (same open policy as other tables)
alter table proposal_strategies enable row level security;

create policy "anon_all" on proposal_strategies
  for all using (true) with check (true);

-- Fast look-up: all strategies for a profile, ranked by confidence
create index if not exists proposal_strategies_profile_idx
  on proposal_strategies (business_profile_id, confidence_score desc);

-- Fast look-up: strategy for a specific contract + profile pair
create index if not exists proposal_strategies_contract_profile_idx
  on proposal_strategies (contract_id, business_profile_id);
