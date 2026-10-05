-- ZionDesk launch: run ONCE in Supabase → SQL Editor (safe to re-run). = migrations 0004 + 0005

-- ZionDesk — billing lifecycle, profile pictures, legal consent records.

-- 1. Plans can expire (trial ended / payment not renewed / cancelled and the paid month ended).
alter table churches drop constraint if exists churches_plan_status_check;
alter table churches add constraint churches_plan_status_check check (plan_status in ('trial', 'active', 'past_due', 'cancelled', 'expired'));

-- 2. Profile pictures + consent record (GDPR / NDPA / POPIA: keep proof of what each person agreed to).
alter table profiles
  add column if not exists avatar_url text,
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists marketing_opt_in boolean not null default false;

-- Sign-up sends terms_version in the user metadata; store it with the time.
create or replace function record_terms_consent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.raw_user_meta_data ? 'terms_version' then
    update profiles set terms_version = new.raw_user_meta_data->>'terms_version', terms_accepted_at = now() where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_terms on auth.users;
create trigger on_auth_user_terms after insert on auth.users for each row execute function record_terms_consent();

-- 3. Avatars bucket: public read; each person can only write files under their own user id.
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4. AI flyers (in case 0003 was not run yet).
alter table designs add column if not exists svg text;
create index if not exists ai_usage_designs on ai_usage (church_id, feature, at);

-- 5. Right to erasure: deleting a person's account must not be blocked by records they created.
alter table campaigns drop constraint if exists campaigns_created_by_fkey;
alter table campaigns add constraint campaigns_created_by_fkey foreign key (created_by) references auth.users on delete set null;
alter table ai_activity drop constraint if exists ai_activity_user_id_fkey;
alter table ai_activity add constraint ai_activity_user_id_fkey foreign key (user_id) references auth.users on delete set null;
alter table ai_usage drop constraint if exists ai_usage_user_id_fkey;
alter table ai_usage add constraint ai_usage_user_id_fkey foreign key (user_id) references auth.users on delete set null;

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
