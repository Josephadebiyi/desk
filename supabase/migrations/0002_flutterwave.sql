-- ZionDesk — Flutterwave payments (online giving + plan subscriptions)
-- Giving: each church connects a bank account → a Flutterwave sub-account. Gifts are paid on
-- Flutterwave's hosted checkout and settle to the church (minus the optional platform fee).
-- Billing: plan subscriptions use Flutterwave payment plans (monthly).

alter table churches
  add column if not exists flw_subaccount_id text,          -- e.g. RS_XXXXXXXX
  add column if not exists payout_account jsonb not null default '{}', -- { country, bankCode, bankName, accountNumber, accountName } (no secrets)
  add column if not exists plan_status text not null default 'trial' check (plan_status in ('trial', 'active', 'past_due', 'cancelled')),
  add column if not exists plan_renews_at timestamptz,
  add column if not exists flw_subscription_email text;

create table if not exists online_payments (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  kind text not null check (kind in ('gift', 'subscription')),
  tx_ref text not null unique,
  flw_transaction_id bigint unique,
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null,
  fund text,                 -- gifts
  plan plan_id,              -- subscriptions
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  language lang_code not null default 'en',
  status text not null default 'pending' check (status in ('pending', 'successful', 'failed', 'cancelled')),
  gift_id uuid references gifts on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists online_payments_church on online_payments (church_id, created_at desc);

alter table online_payments enable row level security;
-- Finance & admins can see their church's online payments; only the server writes them.
create policy online_payments_read on online_payments for select using (has_church_role(church_id, '{admin,finance}'));

-- Plan changes now come from billing (server), not from the browser.
drop policy if exists churches_update on churches;
create policy churches_update on churches for update using (has_church_role(id, '{admin}')) with check (has_church_role(id, '{admin}'));
create or replace function protect_billing_columns() returns trigger language plpgsql as $$
begin
  -- Browser sessions (role "authenticated") may not change billing fields; the service role can.
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' then
    new.plan := old.plan;
    new.plan_status := old.plan_status;
    new.plan_renews_at := old.plan_renews_at;
    new.trial_ends_at := old.trial_ends_at;
    new.flw_subaccount_id := old.flw_subaccount_id;
    new.payout_account := old.payout_account;
  end if;
  return new;
end $$;
drop trigger if exists churches_protect_billing on churches;
create trigger churches_protect_billing before update on churches for each row execute function protect_billing_columns();
