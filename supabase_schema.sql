-- ============================================================
-- S.H.A.I. Payroll & Attendance System — Supabase SQL Schema
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. PROFILES (extends auth.users)
-- ─────────────────────────────────────────────
create table public.profiles (
  id           uuid references auth.users(id) on delete cascade primary key,
  full_name    text not null default '',
  employee_id  text unique,
  role         text not null default 'staff'
                 check (role in ('super_admin', 'manager', 'staff')),
  department   text default 'Admin Office Team'
                 check (department in ('Maintenance Team', 'Admin Office Team')),
  position     text,
  phone        text,
  daily_rate   numeric(10,2) default 0,
  created_at   timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────
-- 2. ATTENDANCE RECORDS
-- ─────────────────────────────────────────────
create table public.attendance_records (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references public.profiles(id) on delete cascade not null,
  date          date not null,
  clock_in      timestamptz,
  clock_out     timestamptz,
  hours_worked  numeric(5,2) default 0,
  status        text default 'present'
                  check (status in ('present', 'absent', 'half_day', 'holiday')),
  notes         text,
  created_at    timestamptz default now(),
  unique(user_id, date)
);

-- ─────────────────────────────────────────────
-- 3. TIMESHEETS
-- ─────────────────────────────────────────────
create table public.timesheets (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references public.profiles(id) on delete cascade not null,
  period_month    text not null,   -- e.g. '2025-06'
  period_cutoff   text not null,   -- '1' or '2'
  period_start    date not null,
  period_end      date not null,
  total_hours     numeric(6,2) default 0,
  days_present    integer default 0,
  status          text default 'draft'
                    check (status in ('draft', 'submitted', 'approved', 'rejected', 'processed')),
  approved_by     uuid references public.profiles(id),
  approved_at     timestamptz,
  rejection_reason text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique(user_id, period_month, period_cutoff)
);

-- ─────────────────────────────────────────────
-- 4. LEAVE REQUESTS
-- ─────────────────────────────────────────────
create table public.leave_requests (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references public.profiles(id) on delete cascade not null,
  leave_type      text not null
                    check (leave_type in (
                      'Sick Leave', 'Vacation Leave', 'Emergency Leave',
                      'Maternity/Paternity Leave', 'Unpaid Leave'
                    )),
  start_date      date not null,
  end_date        date not null,
  days_requested  integer not null default 1,
  reason          text not null,
  status          text default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  approved_by     uuid references public.profiles(id),
  approved_at     timestamptz,
  rejection_reason text,
  created_at      timestamptz default now()
);

-- ─────────────────────────────────────────────
-- 5. OVERTIME REQUESTS
-- ─────────────────────────────────────────────
create table public.overtime_requests (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references public.profiles(id) on delete cascade not null,
  date             date not null,
  hours_requested  numeric(4,2) not null,
  reason           text not null,
  status           text default 'pending'
                     check (status in ('pending', 'approved', 'rejected')),
  approved_by      uuid references public.profiles(id),
  approved_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz default now()
);

-- ─────────────────────────────────────────────
-- 6. PAYROLL RECORDS
-- ─────────────────────────────────────────────
create table public.payroll_records (
  id                uuid default gen_random_uuid() primary key,
  user_id           uuid references public.profiles(id) on delete cascade not null,
  timesheet_id      uuid references public.timesheets(id),
  period_month      text not null,
  period_cutoff     text not null,
  period_label      text not null,  -- e.g. 'June 2025 1st Cut-off'
  days_present      integer default 0,
  total_hours       numeric(6,2) default 0,
  overtime_hours    numeric(5,2) default 0,
  daily_rate        numeric(10,2) default 0,
  basic_pay         numeric(10,2) default 0,
  overtime_pay      numeric(10,2) default 0,
  allowances        numeric(10,2) default 0,
  sss               numeric(10,2) default 0,
  philhealth        numeric(10,2) default 0,
  pagibig           numeric(10,2) default 0,
  tax               numeric(10,2) default 0,
  other_deductions  numeric(10,2) default 0,
  net_pay           numeric(10,2) default 0,
  processed_by      uuid references public.profiles(id),
  status            text default 'processed',
  created_at        timestamptz default now(),
  unique(user_id, period_month, period_cutoff)
);

-- ─────────────────────────────────────────────
-- 7. ENABLE ROW LEVEL SECURITY
-- ─────────────────────────────────────────────
alter table public.profiles          enable row level security;
alter table public.attendance_records enable row level security;
alter table public.timesheets        enable row level security;
alter table public.leave_requests    enable row level security;
alter table public.overtime_requests enable row level security;
alter table public.payroll_records   enable row level security;

-- ─────────────────────────────────────────────
-- 8. HELPER: current user role
-- ─────────────────────────────────────────────
create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.get_my_department()
returns text language sql security definer stable as $$
  select department from public.profiles where id = auth.uid()
$$;

-- ─────────────────────────────────────────────
-- 9. RLS POLICIES — PROFILES
-- ─────────────────────────────────────────────
-- Everyone can read all profiles (needed for name display)
create policy "profiles_select_all" on public.profiles
  for select using (auth.role() = 'authenticated');

-- Users update own profile; admins update any
create policy "profiles_update_own" on public.profiles
  for update using (
    auth.uid() = id
    or public.get_my_role() = 'super_admin'
  );

-- ─────────────────────────────────────────────
-- 10. RLS POLICIES — ATTENDANCE
-- ─────────────────────────────────────────────
-- Select: own records, or manager sees dept, or admin sees all
create policy "attendance_select" on public.attendance_records
  for select using (
    auth.uid() = user_id
    or public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() = 'manager'
      and (select department from public.profiles where id = user_id)
        = public.get_my_department()
    )
  );

-- Insert own records
create policy "attendance_insert" on public.attendance_records
  for insert with check (auth.uid() = user_id);

-- Update own records (clock out), or admin
create policy "attendance_update" on public.attendance_records
  for update using (
    auth.uid() = user_id
    or public.get_my_role() = 'super_admin'
  );

-- ─────────────────────────────────────────────
-- 11. RLS POLICIES — TIMESHEETS
-- ─────────────────────────────────────────────
create policy "timesheets_select" on public.timesheets
  for select using (
    auth.uid() = user_id
    or public.get_my_role() in ('super_admin', 'manager')
  );

create policy "timesheets_insert" on public.timesheets
  for insert with check (auth.uid() = user_id);

create policy "timesheets_update" on public.timesheets
  for update using (
    auth.uid() = user_id
    or public.get_my_role() in ('super_admin', 'manager')
  );

-- ─────────────────────────────────────────────
-- 12. RLS POLICIES — LEAVE REQUESTS
-- ─────────────────────────────────────────────
create policy "leave_select" on public.leave_requests
  for select using (
    auth.uid() = user_id
    or public.get_my_role() in ('super_admin', 'manager')
  );

create policy "leave_insert" on public.leave_requests
  for insert with check (auth.uid() = user_id);

create policy "leave_update" on public.leave_requests
  for update using (
    auth.uid() = user_id
    or public.get_my_role() in ('super_admin', 'manager')
  );

-- ─────────────────────────────────────────────
-- 13. RLS POLICIES — OVERTIME REQUESTS
-- ─────────────────────────────────────────────
create policy "overtime_select" on public.overtime_requests
  for select using (
    auth.uid() = user_id
    or public.get_my_role() in ('super_admin', 'manager')
  );

create policy "overtime_insert" on public.overtime_requests
  for insert with check (auth.uid() = user_id);

create policy "overtime_update" on public.overtime_requests
  for update using (
    auth.uid() = user_id
    or public.get_my_role() in ('super_admin', 'manager')
  );

-- ─────────────────────────────────────────────
-- 14. RLS POLICIES — PAYROLL RECORDS
-- ─────────────────────────────────────────────
create policy "payroll_select" on public.payroll_records
  for select using (
    auth.uid() = user_id
    or public.get_my_role() in ('super_admin', 'manager')
  );

create policy "payroll_insert" on public.payroll_records
  for insert with check (
    public.get_my_role() in ('super_admin', 'manager')
  );

create policy "payroll_update" on public.payroll_records
  for update using (
    public.get_my_role() = 'super_admin'
  );

-- ─────────────────────────────────────────────
-- 15. USEFUL INDEXES
-- ─────────────────────────────────────────────
create index idx_attendance_user_date on public.attendance_records(user_id, date);
create index idx_timesheets_user_period on public.timesheets(user_id, period_month, period_cutoff);
create index idx_leave_user on public.leave_requests(user_id, status);
create index idx_overtime_user on public.overtime_requests(user_id, status);
create index idx_payroll_period on public.payroll_records(period_month, period_cutoff);

-- ─────────────────────────────────────────────
-- DONE! Next steps:
-- 1. Go to Authentication > Users > Add User in Supabase
-- 2. After creating a user, run:
--    update public.profiles
--    set full_name = 'Name Here',
--        role = 'super_admin',  -- or 'manager' / 'staff'
--        department = 'Admin Office Team',
--        employee_id = 'SHAI-001'
--    where id = '<paste-user-uuid-here>';
-- ─────────────────────────────────────────────
