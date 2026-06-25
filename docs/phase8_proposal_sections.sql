-- Phase 8: Proposal Section Generator
-- One row per (workspace × section_type) — editable AI-generated proposal sections
-- Run in Supabase SQL Editor after phase7_proposal_workspace.sql

create table if not exists proposal_sections (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references proposal_workspaces(id) on delete cascade,
  section_type  text        not null check (section_type in (
    'executive_summary', 'technical_approach', 'management_plan', 'staffing_plan',
    'quality_control', 'past_performance', 'pricing_narrative', 'cover_letter',
    'compliance_matrix'
  )),
  title         text        not null,
  content       text        not null default '',
  status        text        not null default 'draft'
                check (status in ('draft', 'review', 'final')),
  generated_by  text        not null default 'template',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, section_type)
);

alter table proposal_sections enable row level security;
create policy "anon_all" on proposal_sections for all using (true) with check (true);

create index if not exists proposal_sections_workspace_idx on proposal_sections (workspace_id);
create index if not exists proposal_sections_type_idx     on proposal_sections (workspace_id, section_type);
