-- Phase 7: Proposal Workspace
-- One workspace per (contract × business_profile) — collaborative bid management hub
-- Run in Supabase SQL Editor after phase6_proposal_strategy.sql

-- ── Workspaces ──────────────────────────────────────────────────────────────

create table if not exists proposal_workspaces (
  id                  uuid        primary key default gen_random_uuid(),
  contract_id         uuid        not null references contracts(id)         on delete cascade,
  business_profile_id uuid        not null references business_profiles(id) on delete cascade,
  status              text        not null default 'active'
                      check (status in ('active', 'archived')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (contract_id, business_profile_id)
);
alter table proposal_workspaces enable row level security;
create policy "anon_all" on proposal_workspaces for all using (true) with check (true);
create index if not exists proposal_workspaces_profile_idx on proposal_workspaces (business_profile_id, status);
create index if not exists proposal_workspaces_contract_idx on proposal_workspaces (contract_id);

-- ── Tasks (AI-generated checklist + timeline) ────────────────────────────────

create table if not exists proposal_tasks (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references proposal_workspaces(id) on delete cascade,
  title        text        not null,
  description  text,
  status       text        not null default 'todo'
               check (status in ('todo', 'in_progress', 'done')),
  due_date     date,
  section      text        not null default 'General',
  priority     text        not null default 'medium'
               check (priority in ('low', 'medium', 'high')),
  sort_order   integer     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table proposal_tasks enable row level security;
create policy "anon_all" on proposal_tasks for all using (true) with check (true);
create index if not exists proposal_tasks_workspace_idx on proposal_tasks (workspace_id, sort_order);
create index if not exists proposal_tasks_status_idx    on proposal_tasks (workspace_id, status);

-- ── Documents (Supabase Storage metadata) ────────────────────────────────────

create table if not exists proposal_documents (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references proposal_workspaces(id) on delete cascade,
  name         text        not null,
  file_path    text        not null,
  file_size    bigint,
  mime_type    text,
  uploaded_by  text,
  created_at   timestamptz not null default now()
);
alter table proposal_documents enable row level security;
create policy "anon_all" on proposal_documents for all using (true) with check (true);
create index if not exists proposal_documents_workspace_idx on proposal_documents (workspace_id);

-- ── Notes (one scratchpad per workspace) ─────────────────────────────────────

create table if not exists proposal_notes (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null unique references proposal_workspaces(id) on delete cascade,
  content      text        not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table proposal_notes enable row level security;
create policy "anon_all" on proposal_notes for all using (true) with check (true);

-- ── Storage bucket (run once in SQL or Supabase dashboard) ───────────────────
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values ('proposal-documents', 'proposal-documents', false, 52428800, null)
-- on conflict (id) do nothing;
