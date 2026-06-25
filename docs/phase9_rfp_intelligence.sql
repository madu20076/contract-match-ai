-- Phase 9: RFP Intelligence & Compliance Engine
-- Run in Supabase SQL Editor after phase8_proposal_sections.sql

-- ── rfp_documents ─────────────────────────────────────────────
-- One uploaded solicitation per workspace

create table if not exists rfp_documents (
  id             uuid        primary key default gen_random_uuid(),
  workspace_id   uuid        not null references proposal_workspaces(id) on delete cascade,
  file_name      text        not null,
  file_path      text        not null,
  file_size      integer,
  mime_type      text,
  extracted_text text,
  parsed_at      timestamptz,
  created_at     timestamptz not null default now(),
  unique (workspace_id)
);

alter table rfp_documents enable row level security;
create policy "anon_all" on rfp_documents for all using (true) with check (true);

-- ── rfp_requirements ──────────────────────────────────────────
-- Extracted requirements, evaluation factors, deliverables, etc.

create table if not exists rfp_requirements (
  id               uuid        primary key default gen_random_uuid(),
  rfp_document_id  uuid        not null references rfp_documents(id) on delete cascade,
  workspace_id     uuid        not null references proposal_workspaces(id) on delete cascade,
  requirement_type text        not null check (requirement_type in (
    'mandatory', 'evaluation_factor', 'deliverable', 'certification',
    'clin', 'attachment', 'date_milestone', 'technical', 'management'
  )),
  text             text        not null,
  source_section   text,
  priority         text        not null default 'medium'
                   check (priority in ('critical', 'high', 'medium', 'low')),
  is_compliant     boolean,
  sort_order       integer     not null default 0,
  created_at       timestamptz not null default now()
);

alter table rfp_requirements enable row level security;
create policy "anon_all" on rfp_requirements for all using (true) with check (true);
create index if not exists rfp_requirements_workspace_idx on rfp_requirements (workspace_id);
create index if not exists rfp_requirements_doc_idx      on rfp_requirements (rfp_document_id);

-- ── compliance_matrix ─────────────────────────────────────────
-- Maps rfp requirements → proposal sections

create table if not exists compliance_matrix (
  id                    uuid        primary key default gen_random_uuid(),
  workspace_id          uuid        not null references proposal_workspaces(id) on delete cascade,
  rfp_requirement_id    uuid        references rfp_requirements(id) on delete cascade,
  proposal_section_id   uuid        references proposal_sections(id) on delete set null,
  section_type          text,
  requirement_text      text        not null,
  compliance_status     text        not null default 'not_addressed'
                        check (compliance_status in ('compliant', 'partial', 'not_addressed', 'exception')),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table compliance_matrix enable row level security;
create policy "anon_all" on compliance_matrix for all using (true) with check (true);
create index if not exists compliance_matrix_workspace_idx on compliance_matrix (workspace_id);

-- ── proposal_readiness ────────────────────────────────────────
-- Aggregated proposal readiness score per workspace

create table if not exists proposal_readiness (
  id                 uuid        primary key default gen_random_uuid(),
  workspace_id       uuid        not null references proposal_workspaces(id) on delete cascade,
  overall_score      integer     not null default 0  check (overall_score between 0 and 100),
  sections_score     integer     not null default 0  check (sections_score between 0 and 100),
  compliance_score   integer     not null default 0  check (compliance_score between 0 and 100),
  completeness_score integer     not null default 0  check (completeness_score between 0 and 100),
  risk_level         text        not null default 'critical'
                     check (risk_level in ('low', 'medium', 'high', 'critical')),
  red_flags          text[]      not null default '{}',
  action_items       text[]      not null default '{}',
  generated_at       timestamptz not null default now(),
  unique (workspace_id)
);

alter table proposal_readiness enable row level security;
create policy "anon_all" on proposal_readiness for all using (true) with check (true);
create index if not exists proposal_readiness_workspace_idx on proposal_readiness (workspace_id);

-- ── rfp_amendments ────────────────────────────────────────────
-- Amendment / modification tracking for solicitations

create table if not exists rfp_amendments (
  id               uuid        primary key default gen_random_uuid(),
  rfp_document_id  uuid        not null references rfp_documents(id) on delete cascade,
  workspace_id     uuid        not null references proposal_workspaces(id) on delete cascade,
  amendment_number text        not null,
  issued_date      date,
  due_date_change  text,
  changes          text[]      not null default '{}',
  created_at       timestamptz not null default now()
);

alter table rfp_amendments enable row level security;
create policy "anon_all" on rfp_amendments for all using (true) with check (true);
create index if not exists rfp_amendments_workspace_idx on rfp_amendments (workspace_id);
