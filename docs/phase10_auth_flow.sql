-- Phase 10: Auth Flow
-- Run in Supabase SQL editor

-- 1. Add user_id to business_profiles (nullable so existing rows keep working)
alter table business_profiles
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists business_profiles_user_id_idx on business_profiles(user_id);

-- 2. RLS: let users read/write only their own profile
-- Enable RLS if not already on
alter table business_profiles enable row level security;

-- Drop existing catch-all if present, then create user-scoped policies
drop policy if exists "Allow all" on business_profiles;
drop policy if exists "Users can read own profile" on business_profiles;
drop policy if exists "Users can insert own profile" on business_profiles;
drop policy if exists "Users can update own profile" on business_profiles;
drop policy if exists "Service role bypass" on business_profiles;

create policy "Users can read own profile"
  on business_profiles for select
  using (user_id = auth.uid() or user_id is null);

create policy "Users can insert own profile"
  on business_profiles for insert
  with check (user_id = auth.uid());

create policy "Users can update own profile"
  on business_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Service role bypasses RLS automatically — no extra policy needed
