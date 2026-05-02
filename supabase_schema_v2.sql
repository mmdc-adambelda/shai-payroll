-- ============================================================
-- S.H.A.I. v2.0 — Schema Additions
-- Run this in Supabase SQL Editor AFTER the original schema.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. PROFILES — add username, auth_email, late/attendance fields
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists username     text unique,
  add column if not exists auth_email   text,          -- mirrors auth.users.email for username lookup
  add column if not exists leave_sick      integer default 15,
  add column if not exists leave_vacation  integer default 15,
  add column if not exists leave_emergency integer default 3,
  add column if not exists leave_maternity integer default 60,
  add column if not exists shift_start  time default '08:00:00',
  add column if not exists shift_end    time default '17:00:00';

-- Auto-sync auth_email when a user is created
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, auth_email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update set auth_email = new.email;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. ATTENDANCE RECORDS — add face/method tracking
-- ─────────────────────────────────────────────────────────────
alter table public.attendance_records
  add column if not exists clock_in_method   text default 'manual'
    check (clock_in_method in ('manual', 'face')),
  add column if not exists clock_out_method  text default 'manual'
    check (clock_out_method in ('manual', 'face')),
  add column if not exists is_late           boolean default false,
  add column if not exists minutes_late      integer default 0;

-- ─────────────────────────────────────────────────────────────
-- 3. FACE ENROLLMENTS
-- Stores averaged 128-d face descriptors per employee.
-- Each row = one employee with an array of 3 descriptors (front/left/right).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.face_enrollments (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references public.profiles(id) on delete cascade not null unique,
  descriptors   jsonb not null,                    -- array of float arrays [[128 floats], ...]
  sample_count  integer default 3,
  enrolled_at   timestamptz default now(),
  enrolled_by   uuid references public.profiles(id),
  updated_at    timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- 4. BIOMETRIC AUDIT LOGS
-- Full audit trail for all face recognition events.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.biometric_audit_logs (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references public.profiles(id) on delete set null,
  action      text not null,
    -- 'face_enrolled' | 'face_clock_in' | 'face_clock_out'
    -- 'face_login_attempt' | 'face_login_success' | 'face_login_failed'
    -- 'face_spoof_detected'
  metadata    jsonb default '{}',
  ip_address  text,
  user_agent  text,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- 5. FACE LOGIN TOKENS
-- Short-lived one-time tokens for face-verified login flow.
-- Generated server-side, consumed once, expire in 30 seconds.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.face_login_tokens (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  token       text not null unique,
  created_at  timestamptz default now(),
  expires_at  timestamptz default (now() + interval '30 seconds'),
  used        boolean default false
);

-- ─────────────────────────────────────────────────────────────
-- 6. RLS FOR NEW TABLES
-- ─────────────────────────────────────────────────────────────
alter table public.face_enrollments    enable row level security;
alter table public.biometric_audit_logs enable row level security;
alter table public.face_login_tokens   enable row level security;

-- Face enrollments: anyone authenticated can read (needed for matching)
-- Only super_admin/manager can write
create policy "face_enroll_select" on public.face_enrollments
  for select using (auth.role() = 'authenticated');

create policy "face_enroll_insert" on public.face_enrollments
  for insert with check (
    public.get_my_role() in ('super_admin', 'manager')
    or auth.uid() = user_id   -- allow self-enrollment via admin UI
  );

create policy "face_enroll_update" on public.face_enrollments
  for update using (
    public.get_my_role() in ('super_admin', 'manager')
    or auth.uid() = user_id
  );

-- Biometric logs: admins/managers read all, users see own
create policy "bio_log_select" on public.biometric_audit_logs
  for select using (
    auth.uid() = user_id
    or public.get_my_role() in ('super_admin', 'manager')
  );

create policy "bio_log_insert" on public.biometric_audit_logs
  for insert with check (auth.role() = 'authenticated');

-- Login tokens: users can only see and operate on their own
create policy "face_token_select" on public.face_login_tokens
  for select using (auth.uid() = user_id);

create policy "face_token_insert" on public.face_login_tokens
  for insert with check (auth.uid() = user_id);

create policy "face_token_update" on public.face_login_tokens
  for update using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 7. FACE LOGIN TOKEN RPCs
-- These two functions implement a secure one-time token exchange
-- for face-verified login without exposing passwords.
-- ─────────────────────────────────────────────────────────────

-- Step 1: Client calls this after face match. Returns a short-lived token.
create or replace function public.request_face_login_token(p_user_id uuid)
returns json language plpgsql security definer as $$
declare
  v_token text;
  v_now   timestamptz := now();
begin
  -- Rate limit: max 5 face login attempts per user per minute
  if (
    select count(*) from public.face_login_tokens
    where user_id = p_user_id and created_at > v_now - interval '1 minute'
  ) >= 5 then
    raise exception 'Too many face login attempts. Please wait.';
  end if;

  -- Clean up old tokens for this user
  delete from public.face_login_tokens
  where user_id = p_user_id and (expires_at < v_now or used = true);

  -- Generate a random 64-char token
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.face_login_tokens (user_id, token, expires_at)
  values (p_user_id, v_token, v_now + interval '30 seconds');

  -- Log the attempt
  insert into public.biometric_audit_logs (user_id, action, metadata)
  values (p_user_id, 'face_login_attempt', json_build_object('timestamp', v_now));

  return json_build_object('token', v_token);
end;
$$;

-- Step 2: Client calls this to exchange token for a session.
-- Returns access + refresh tokens if valid, null if expired/used.
create or replace function public.verify_face_login_token(p_token text, p_user_id uuid)
returns json language plpgsql security definer as $$
declare
  v_record public.face_login_tokens%rowtype;
  v_session record;
begin
  -- Find and validate the token
  select * into v_record
  from public.face_login_tokens
  where token = p_token
    and user_id = p_user_id
    and used = false
    and expires_at > now()
  limit 1;

  if not found then
    -- Log failed attempt
    insert into public.biometric_audit_logs (user_id, action, metadata)
    values (p_user_id, 'face_login_failed', json_build_object('reason', 'invalid_or_expired_token'));
    return null;
  end if;

  -- Mark as used (one-time only)
  update public.face_login_tokens set used = true where id = v_record.id;

  -- Log success
  insert into public.biometric_audit_logs (user_id, action, metadata)
  values (p_user_id, 'face_login_success', json_build_object('timestamp', now()));

  -- NOTE: Supabase does not expose auth.sessions directly via SQL.
  -- The actual session creation happens via a Supabase Edge Function (see below).
  -- This function returns a confirmation that the token was valid;
  -- the Edge Function will then call admin.generateLink() to get a real session.
  return json_build_object(
    'verified', true,
    'user_id', p_user_id,
    'token_id', v_record.id
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 8. USERNAME UNIQUENESS CONSTRAINT
-- ─────────────────────────────────────────────────────────────
create unique index if not exists idx_profiles_username_lower
  on public.profiles (lower(username))
  where username is not null;

-- ─────────────────────────────────────────────────────────────
-- 9. INDEXES FOR PERFORMANCE
-- ─────────────────────────────────────────────────────────────
create index if not exists idx_face_enrollments_user on public.face_enrollments(user_id);
create index if not exists idx_bio_logs_user_time on public.biometric_audit_logs(user_id, created_at desc);
create index if not exists idx_attendance_method on public.attendance_records(clock_in_method);
create index if not exists idx_profiles_auth_email on public.profiles(lower(auth_email));

-- ─────────────────────────────────────────────────────────────
-- 10. SET username FOR EXISTING USERS
-- Run for each existing employee (replace values as needed):
--
--   update public.profiles
--   set username = 'jdelacruz',
--       auth_email = 'juan@shai.com'
--   where id = '<uuid>';
--
-- Or auto-generate usernames from names:
--   update public.profiles
--   set username = lower(regexp_replace(
--     split_part(full_name, ' ', 2) || split_part(full_name, ' ', 1),
--     '[^a-z]', '', 'g'
--   ))
--   where username is null;
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- EDGE FUNCTION NOTE (for face login)
-- ─────────────────────────────────────────────────────────────
-- Because Supabase SQL cannot directly create auth sessions,
-- face login requires a tiny Edge Function.
-- See /supabase/functions/face-login/index.ts in the repo.
-- Deploy with: supabase functions deploy face-login
-- ─────────────────────────────────────────────────────────────
