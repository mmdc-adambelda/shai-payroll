-- ============================================================
-- S.H.A.I. Payroll — Schema v3
-- Philippine Holiday Management + Payroll Settings + Audit Logs
-- Run this entire file in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. HOLIDAYS
-- ─────────────────────────────────────────────
create table if not exists public.holidays (
  id           uuid default gen_random_uuid() primary key,
  holiday_name text not null,
  holiday_date date not null unique,
  holiday_type text not null default 'REGULAR'
                 check (holiday_type in ('REGULAR', 'SPECIAL', 'SPECIAL_WORKING')),
  is_active    boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists idx_holidays_date       on public.holidays (holiday_date);
create index if not exists idx_holidays_type_active on public.holidays (holiday_type, is_active);

-- ─────────────────────────────────────────────
-- 2. PAYROLL SETTINGS (single-row config)
-- ─────────────────────────────────────────────
create table if not exists public.payroll_settings (
  id                             uuid default gen_random_uuid() primary key,
  default_daily_hours            integer not null default 8,
  special_holiday_paid_if_absent boolean not null default false,
  auto_credit_regular_holiday    boolean not null default true,
  enable_holiday_ot_rules        boolean not null default true,
  updated_by                     uuid references public.profiles(id) on delete set null,
  updated_at                     timestamptz default now()
);

-- Seed one default settings row if not present
insert into public.payroll_settings (
  default_daily_hours,
  special_holiday_paid_if_absent,
  auto_credit_regular_holiday,
  enable_holiday_ot_rules
)
select 8, false, true, true
where not exists (select 1 from public.payroll_settings);

-- ─────────────────────────────────────────────
-- 3. HOLIDAY AUTO-CREDITS (audit)
-- ─────────────────────────────────────────────
create table if not exists public.holiday_auto_credits (
  id             uuid default gen_random_uuid() primary key,
  employee_id    uuid references public.profiles(id) on delete cascade not null,
  holiday_date   date not null,
  credited_hours numeric(4,2) not null default 8,
  system_reason  text,
  payroll_id     uuid references public.payroll_records(id) on delete set null,
  created_at     timestamptz default now()
);

create index if not exists idx_hac_employee on public.holiday_auto_credits (employee_id, holiday_date);

-- ─────────────────────────────────────────────
-- 4. ADMIN AUDIT LOGS
-- ─────────────────────────────────────────────
create table if not exists public.admin_audit_logs (
  id             uuid default gen_random_uuid() primary key,
  admin_user_id  uuid references public.profiles(id) on delete set null not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action         text not null,
  metadata       jsonb,
  ip_address     text,
  created_at     timestamptz default now()
);

create index if not exists idx_aal_admin_time on public.admin_audit_logs (admin_user_id, created_at desc);

-- ─────────────────────────────────────────────
-- 5. ALTER PROFILES — add new columns
-- ─────────────────────────────────────────────
alter table public.profiles
  add column if not exists employment_status text not null default 'active'
    check (employment_status in ('active', 'suspended', 'terminated', 'resigned', 'awol'));

alter table public.profiles
  add column if not exists force_password_change boolean not null default false;

-- ─────────────────────────────────────────────
-- 6. ALTER PAYROLL_RECORDS — add holiday columns
-- ─────────────────────────────────────────────
alter table public.payroll_records
  add column if not exists holiday_pay          numeric(10,2) not null default 0,
  add column if not exists auto_credited_hours  numeric(5,2)  not null default 0,
  add column if not exists payroll_breakdown    jsonb;

-- ─────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

-- holidays: everyone can read active; only super_admin can write
alter table public.holidays enable row level security;

drop policy if exists "holidays_read"        on public.holidays;
drop policy if exists "holidays_superadmin"  on public.holidays;

create policy "holidays_read" on public.holidays
  for select using (true);

create policy "holidays_superadmin" on public.holidays
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );

-- payroll_settings: everyone can read; only super_admin can update
alter table public.payroll_settings enable row level security;

drop policy if exists "psettings_read"       on public.payroll_settings;
drop policy if exists "psettings_superadmin" on public.payroll_settings;

create policy "psettings_read" on public.payroll_settings
  for select using (true);

create policy "psettings_superadmin" on public.payroll_settings
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );

-- holiday_auto_credits: super_admin/manager read, system inserts
alter table public.holiday_auto_credits enable row level security;

drop policy if exists "hac_read"   on public.holiday_auto_credits;
drop policy if exists "hac_insert" on public.holiday_auto_credits;

create policy "hac_read" on public.holiday_auto_credits
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('super_admin', 'manager')
    )
  );

create policy "hac_insert" on public.holiday_auto_credits
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('super_admin', 'manager')
    )
  );

-- admin_audit_logs: super_admin read/insert only
alter table public.admin_audit_logs enable row level security;

drop policy if exists "aal_superadmin" on public.admin_audit_logs;

create policy "aal_superadmin" on public.admin_audit_logs
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );

-- ─────────────────────────────────────────────
-- 8. SEED — Philippine Holidays 2026
-- Official holidays per standard PH proclamation schedule.
-- Super Admin can modify/add/disable any entry.
-- ─────────────────────────────────────────────
insert into public.holidays (holiday_name, holiday_date, holiday_type) values

  -- ── REGULAR HOLIDAYS ──────────────────────
  ('New Year''s Day',                            '2026-01-01', 'REGULAR'),
  ('Maundy Thursday',                            '2026-04-02', 'REGULAR'),
  ('Good Friday',                                '2026-04-03', 'REGULAR'),
  ('Araw ng Kagitingan (Bataan Day)',             '2026-04-09', 'REGULAR'),
  ('Labor Day',                                  '2026-05-01', 'REGULAR'),
  ('Independence Day',                           '2026-06-12', 'REGULAR'),
  ('National Heroes Day',                        '2026-08-31', 'REGULAR'),
  ('Bonifacio Day',                              '2026-11-30', 'REGULAR'),
  ('Christmas Day',                              '2026-12-25', 'REGULAR'),
  ('Rizal Day',                                  '2026-12-30', 'REGULAR'),

  -- ── SPECIAL NON-WORKING HOLIDAYS ──────────
  ('Day After New Year''s Day',                  '2026-01-02', 'SPECIAL'),
  ('Chinese New Year (Year of the Horse)',        '2026-02-17', 'SPECIAL'),
  ('EDSA People Power Revolution Anniversary',   '2026-02-25', 'SPECIAL'),
  ('Black Saturday',                             '2026-04-04', 'SPECIAL'),
  ('Ninoy Aquino Day',                           '2026-08-21', 'SPECIAL'),
  ('All Saints'' Day',                           '2026-11-01', 'SPECIAL'),
  ('All Souls'' Day',                            '2026-11-02', 'SPECIAL'),
  ('Feast of the Immaculate Conception',         '2026-12-08', 'SPECIAL'),
  ('Christmas Eve',                              '2026-12-24', 'SPECIAL'),
  ('Last Day of the Year (New Year''s Eve)',      '2026-12-31', 'SPECIAL')

on conflict (holiday_date) do nothing;

-- ─────────────────────────────────────────────
-- Done. Summary of changes:
--   + public.holidays
--   + public.payroll_settings (1 default row)
--   + public.holiday_auto_credits
--   + public.admin_audit_logs
--   ~ public.profiles (employment_status, force_password_change)
--   ~ public.payroll_records (holiday_pay, auto_credited_hours, payroll_breakdown)
-- ─────────────────────────────────────────────
