-- ZionDesk — lifecycle emails: welcome (once per church), sign-up reminders, newsletter + unsubscribe.
alter table churches add column if not exists welcome_sent_at timestamptz;
-- Churches that already exist are treated as welcomed (no surprise welcome emails).
update churches set welcome_sent_at = created_at where welcome_sent_at is null and created_at < now() - interval '3 days';

alter table profiles
  add column if not exists newsletter_opt_out boolean not null default false,
  add column if not exists signup_reminders int not null default 0,
  add column if not exists signup_reminded_at timestamptz;

create table if not exists newsletters (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  audience text not null default 'all',
  sent_count int not null default 0,
  created_by text not null default '',
  created_at timestamptz not null default now()
);
alter table newsletters enable row level security;
revoke all on table newsletters from anon, authenticated;

-- Reminder counters and the welcome flag are set by the server only.
create or replace function protect_profile_columns() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.id := old.id;
    new.email := old.email;
    new.terms_accepted_at := case when new.terms_version is distinct from old.terms_version then now() else old.terms_accepted_at end;
    new.created_at := old.created_at;
    new.signup_reminders := old.signup_reminders;
    new.signup_reminded_at := old.signup_reminded_at;
  end if;
  return new;
end $$;

create or replace function protect_billing_columns() returns trigger language plpgsql as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' then
    new.id := old.id;
    new.plan := old.plan;
    new.plan_status := old.plan_status;
    new.plan_renews_at := old.plan_renews_at;
    new.trial_ends_at := old.trial_ends_at;
    new.flw_subaccount_id := old.flw_subaccount_id;
    new.payout_account := old.payout_account;
    new.google_meet_email := old.google_meet_email;
    new.welcome_sent_at := old.welcome_sent_at;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
