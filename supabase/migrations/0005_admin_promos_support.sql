-- ZionDesk — platform admin console, promo codes, support tickets, Google Meet connection,
-- WhatsApp delivery status, AI birthday prayers. Run in Supabase → SQL Editor (safe to re-run).

-- 1. Promo codes (managed in /admin; redeemed in Settings → Plan).
create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,32}$'),
  description text not null default '',
  -- percent: % off the monthly price (discounted Flutterwave plan)
  -- free_days: free access for N days, no card needed
  kind text not null check (kind in ('percent', 'free_days')),
  percent_off int check (percent_off between 1 and 99),
  duration_months int check (duration_months between 1 and 36), -- percent only; null = for the life of the subscription
  free_days int check (free_days between 1 and 365),
  plans text[] not null default '{}', -- empty = every plan
  max_redemptions int check (max_redemptions > 0), -- null = unlimited
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  check ((kind = 'percent' and percent_off is not null) or (kind = 'free_days' and free_days is not null))
);

create table if not exists promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references promo_codes on delete cascade,
  church_id uuid not null references churches on delete cascade,
  plan text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  percent_off int,
  currency text,
  amount numeric(12, 2),
  redeemed_at timestamptz not null default now(),
  ends_at timestamptz,
  unique (promo_id, church_id)
);
create index if not exists promo_redemptions_church on promo_redemptions (church_id, status);

alter table promo_codes enable row level security;
alter table promo_redemptions enable row level security;
-- No client policies: only the API server (service role) reads or writes promo data.
alter table online_payments add column if not exists promo_code text;

-- 2. Support tickets (Help → Contact support; answered from /admin).
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references churches on delete set null,
  user_id uuid references auth.users on delete set null,
  email text not null,
  name text not null default '',
  subject text not null,
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets on delete cascade,
  author text not null check (author in ('user', 'staff')),
  author_name text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists support_tickets_status on support_tickets (status, updated_at desc);
alter table support_tickets enable row level security;
alter table support_messages enable row level security;
drop policy if exists support_tickets_own on support_tickets;
create policy support_tickets_own on support_tickets for select using (user_id = auth.uid());
drop policy if exists support_messages_own on support_messages;
create policy support_messages_own on support_messages for select using (exists (select 1 from support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));

-- 3. Google Meet: each church connects its own Google account (refresh token, server-only).
create table if not exists google_connections (
  church_id uuid primary key references churches on delete cascade,
  google_email text not null default '',
  refresh_token text not null,
  connected_by uuid references auth.users on delete set null,
  connected_at timestamptz not null default now()
);
alter table google_connections enable row level security; -- no client policies: never readable from the browser
alter table churches add column if not exists google_meet_email text; -- shown in Settings → Integrations
alter table events add column if not exists google_event_id text;

-- 4. Platform-wide switches the admin console can flip.
create table if not exists platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table platform_settings enable row level security;

-- 5. Birthday prayers written by AI (kept so each person gets a fresh one every year).
alter table deliveries add column if not exists body text;
