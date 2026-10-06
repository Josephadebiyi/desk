-- ZionDesk — branch financial reports.
-- Branch leaders (a new team role tied to one branch) declare a monthly report for their branch:
-- income per fund, expenses, attendance and notes. HQ (admin / finance) sees every branch, reviews
-- reports and is told who hasn't submitted. Reminders are emailed by the daily job.

-- 1. New role. Policies below compare role::text so the new enum value can be used in this same script.
alter type app_role add value if not exists 'branch';

alter table church_users add column if not exists branch text;
alter table team_invites add column if not exists branch text;

-- Report settings per church: due day of the month after the reporting month, and reminders on/off.
alter table churches add column if not exists branch_report_due_day int not null default 5;
alter table churches add column if not exists branch_reminders boolean not null default true;
-- Branches that must report (null = every branch except the first, which is usually the main church / HQ).
alter table churches add column if not exists branch_report_branches text[];
alter table churches drop constraint if exists churches_branch_report_due_day_check;
alter table churches add constraint churches_branch_report_due_day_check check (branch_report_due_day between 1 and 28);

-- 2. Invites carry the branch into church_users when accepted.
create or replace function accept_team_invites(uid uuid, mail text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into church_users (church_id, user_id, role, branch)
  select church_id, uid, role, branch from team_invites where lower(email) = lower(mail) and status = 'Invited'
  on conflict do nothing;
  update team_invites set status = 'Accepted' where lower(email) = lower(mail) and status = 'Invited';
end $$;
revoke all on function accept_team_invites(uuid, text) from public, anon, authenticated;

-- 3. Branch leaders are NOT "church members" for data access: they can't read HQ's members, giving,
--    messages, events, links or AI data. They can read the church row (name, funds, currency) and their own link.
create or replace function is_church_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from church_users where church_id = c and user_id = auth.uid() and role::text <> 'branch')
$$;

create or replace function branch_of(c uuid) returns text
language sql stable security definer set search_path = public as $$
  select branch from church_users where church_id = c and user_id = auth.uid() and role::text = 'branch'
$$;

drop policy if exists churches_read_branch on churches;
create policy churches_read_branch on churches for select using (branch_of(id) is not null);
drop policy if exists church_users_self on church_users;
create policy church_users_self on church_users for select using (user_id = auth.uid());

-- 4. Reports. Written only through the API (service role), which checks role, branch and plan.
create table if not exists branch_reports (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  branch text not null,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'), -- reporting month, YYYY-MM
  currency text not null default 'EUR',
  income jsonb not null default '[]',   -- [{ "label": "Tithe", "amount": 1200 }]
  expenses jsonb not null default '[]', -- [{ "label": "Rent", "amount": 300 }]
  income_total numeric(14, 2) not null default 0,
  expense_total numeric(14, 2) not null default 0,
  attendance int check (attendance is null or attendance >= 0),   -- average Sunday attendance
  new_members int check (new_members is null or new_members >= 0),
  notes text not null default '',
  status text not null default 'Submitted' check (status in ('Submitted', 'Reviewed', 'Returned')),
  submitted_by uuid references auth.users on delete set null,
  submitted_by_name text not null default '',
  submitted_at timestamptz not null default now(),
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  unique (church_id, branch, period)
);
create index if not exists branch_reports_church_period on branch_reports (church_id, period);
alter table branch_reports enable row level security;
drop policy if exists branch_reports_hq on branch_reports;
create policy branch_reports_hq on branch_reports for select using (has_church_role(church_id, '{admin,finance}'));
drop policy if exists branch_reports_own on branch_reports;
create policy branch_reports_own on branch_reports for select using (branch = branch_of(church_id));

-- 5. Which reminders went out (so the daily job never sends one twice).
create table if not exists branch_report_notices (
  church_id uuid not null references churches on delete cascade,
  branch text not null,        -- '*' for the HQ summary
  period text not null,
  kind text not null,          -- soon | due | late3 | late7 | hq1 | hq7 | manual:YYYY-MM-DD
  sent_at timestamptz not null default now(),
  primary key (church_id, branch, period, kind)
);
alter table branch_report_notices enable row level security; -- server only

-- 6. Scheduled jobs run inside the web server too: one row per job run so it never runs twice.
create table if not exists job_runs (
  job text not null,
  slot text not null, -- e.g. 2026-10-07 (daily) or 2026-10-07T14 (hourly)
  started_at timestamptz not null default now(),
  primary key (job, slot)
);
alter table job_runs enable row level security; -- server only
