-- ZionDesk full database setup (0001_init + 0002_flutterwave).
-- Paste everything into Supabase → SQL Editor → New query → Run. Run it once.

-- ZionDesk — initial schema
-- Multi-tenant: every row belongs to a church; Row Level Security (RLS) limits each signed-in
-- user to the churches they belong to, and giving/finance tables to Administrators + Finance.
-- Public pages (registration, giving) never touch tables directly: they go through the API
-- server, which uses the service-role key and validates every input.

create extension if not exists pgcrypto;

-- ───────── enums ─────────
create type app_role as enum ('admin', 'finance', 'leader');
create type plan_id as enum ('essentials', 'plus', 'max');
create type lang_code as enum ('en', 'es', 'fr', 'de', 'pt');
create type member_stage as enum ('Newcomer', 'Convert', 'Member', 'Worker');
create type member_status as enum ('Active', 'Inactive', 'Transferred');

-- ───────── churches & people who use ZionDesk ─────────
create table churches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  location text not null default '',
  phone text not null default '',
  email text not null default '',
  denomination text not null default '',
  currency char(3) not null default 'USD',
  plan plan_id not null default 'essentials',
  trial_ends_at timestamptz default (now() + interval '7 days'),
  logo_url text,
  branches text[] not null default array['Main Campus'],
  departments text[] not null default array['Worship','Ushering','Media','Children','Youth','Prayer','Welcome','Finance','Outreach'],
  funds text[] not null default array['Tithe','Offering','Building','Missions'],
  -- { method, bankName, accountName, accountNumber, routing, instructions }
  payout jsonb not null default '{"method":"none","bankName":"","accountName":"","accountNumber":"","routing":"","instructions":""}',
  ai_settings jsonb not null default '{}',
  default_language lang_code not null default 'en',
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  email text not null default '',
  ui_language lang_code not null default 'en',
  comm_language lang_code not null default 'en',
  language_chosen boolean not null default false,
  created_at timestamptz not null default now()
);

create table church_users (
  church_id uuid not null references churches on delete cascade,
  -- references profiles (not auth.users) so the API can embed names: church_users → profiles
  user_id uuid not null references profiles (id) on delete cascade,
  role app_role not null default 'leader',
  created_at timestamptz not null default now(),
  primary key (church_id, user_id)
);
create index on church_users (user_id);

create table team_invites (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  name text not null,
  email text not null,
  role app_role not null default 'leader',
  language lang_code not null default 'en',
  status text not null default 'Invited' check (status in ('Invited', 'Accepted', 'Revoked')),
  created_at timestamptz not null default now(),
  unique (church_id, email)
);

-- ───────── permission helpers (security definer so policies can call them) ─────────
create or replace function is_church_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from church_users where church_id = c and user_id = auth.uid())
$$;

create or replace function has_church_role(c uuid, roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from church_users where church_id = c and user_id = auth.uid() and role = any(roles))
$$;

-- ───────── church records ─────────
create table members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  full_name text not null check (length(full_name) between 1 and 160),
  phone text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  gender text not null default '' check (gender in ('', 'Female', 'Male')),
  dob date,
  address text not null default '',
  branch text not null default '',
  department text not null default '',
  membership_status member_status not null default 'Active',
  date_joined date not null default current_date,
  stage member_stage not null default 'Newcomer',
  notes text not null default '',
  language lang_code not null default 'en',
  source text not null default 'manual', -- manual | import | link
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on members (church_id, stage);
create index on members (church_id, full_name);

create table communications (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  member_id uuid not null references members on delete cascade,
  date date not null default current_date,
  channel text not null check (channel in ('Call', 'SMS', 'WhatsApp', 'Email', 'Visit', 'Note')),
  summary text not null,
  by_name text not null default '',
  created_at timestamptz not null default now()
);
create index on communications (member_id, date desc);

-- Gifts: member gifts (member_id set) and anonymous / basket gifts (member_id null, donor text).
create table gifts (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  member_id uuid references members on delete set null,
  donor text not null default '',
  date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  fund text not null,
  method text not null default 'Cash',
  created_at timestamptz not null default now()
);
create index on gifts (church_id, date desc);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  date date not null default current_date,
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  title text not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  mode text not null default 'In person' check (mode in ('In person', 'Online', 'Hybrid')),
  location text not null default '',
  google_meet boolean not null default false,
  meet_link text,
  audience jsonb not null default '{"type":"all","value":""}',
  invited int not null default 0,
  attendance int,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index on events (church_id, date);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  channel text not null check (channel in ('SMS', 'WhatsApp', 'Email')),
  audience jsonb not null,
  recipients int not null default 0,
  subject text not null default '',
  body text not null default '',
  template text,
  vars jsonb,
  languages jsonb, -- { "en": 40, "fr": 5 }
  scheduled_for timestamptz,
  status text not null default 'Queued' check (status in ('Queued', 'Scheduled', 'Sending', 'Sent', 'Failed')),
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);

-- Per-recipient delivery log (written by the server when it actually sends).
create table deliveries (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  campaign_id uuid references campaigns on delete cascade,
  member_id uuid references members on delete set null,
  channel text not null,
  language lang_code not null,
  to_address text not null,
  status text not null default 'queued',
  provider_id text,
  error text,
  created_at timestamptz not null default now()
);

create table message_templates (
  church_id uuid not null references churches on delete cascade,
  key text not null,
  lang lang_code not null,
  text text not null,
  primary key (church_id, key, lang)
);

create table share_links (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  type text not null check (type in ('member', 'newcomer', 'convert', 'giving')),
  label text not null default '',
  branch text not null default '',
  fund text not null default '',
  created_at timestamptz not null default now()
);

create table transfer_claims (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  date date not null default current_date,
  name text not null,
  email text not null default '',
  phone text not null default '',
  amount numeric(12,2) not null check (amount > 0),
  fund text not null,
  reference text not null default '',
  language lang_code not null default 'en',
  status text not null default 'Pending' check (status in ('Pending', 'Confirmed', 'Declined')),
  created_at timestamptz not null default now()
);

create table designs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  template text not null,
  title text not null,
  when_text text not null default '',
  created_at timestamptz not null default now()
);

create table design_requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  title text not null,
  brief jsonb not null default '{}',
  formats text[] not null default '{}',
  inspiration jsonb not null default '[]', -- [{ name, path }] in the "inspiration" storage bucket
  status text not null default 'Submitted' check (status in ('Submitted', 'In design', 'Review', 'Delivered')),
  due_at timestamptz not null default (now() + interval '48 hours'),
  created_at timestamptz not null default now()
);

create table design_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references design_requests on delete cascade,
  church_id uuid not null references churches on delete cascade,
  sender text not null check (sender in ('you', 'system', 'designer')),
  text text not null,
  at timestamptz not null default now()
);

create table ai_activity (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  user_id uuid references auth.users,
  user_name text not null default '',
  agent text not null,
  action text not null,
  entity text,
  result text not null default 'success',
  approval text not null default 'not required',
  at timestamptz not null default now()
);

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  user_id uuid references auth.users,
  feature text not null,
  units numeric not null default 1,
  provider text not null,
  model text not null,
  est_cost_usd numeric(10,5) not null default 0,
  at timestamptz not null default now()
);
create index on ai_usage (church_id, at);

-- Leads from the marketing site's "start free trial" form.
create table trial_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  language lang_code not null default 'en',
  created_at timestamptz not null default now()
);

-- ───────── updated_at ─────────
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger members_touch before update on members for each row execute function touch_updated_at();

-- ───────── RLS ─────────
alter table churches enable row level security;
alter table profiles enable row level security;
alter table church_users enable row level security;
alter table team_invites enable row level security;
alter table members enable row level security;
alter table communications enable row level security;
alter table gifts enable row level security;
alter table expenses enable row level security;
alter table events enable row level security;
alter table campaigns enable row level security;
alter table deliveries enable row level security;
alter table message_templates enable row level security;
alter table share_links enable row level security;
alter table transfer_claims enable row level security;
alter table designs enable row level security;
alter table design_requests enable row level security;
alter table design_request_messages enable row level security;
alter table ai_activity enable row level security;
alter table ai_usage enable row level security;
alter table trial_leads enable row level security; -- server only (no policies)

-- churches: members read; admins update. Creation goes through create_church().
create policy churches_read on churches for select using (is_church_member(id));
create policy churches_update on churches for update using (has_church_role(id, '{admin}')) with check (has_church_role(id, '{admin}'));

-- profiles: each user manages their own.
create policy profiles_self on profiles for all using (id = auth.uid()) with check (id = auth.uid());
-- teammates can see each other's names.
create policy profiles_team on profiles for select using (
  exists (select 1 from church_users a join church_users b on a.church_id = b.church_id where a.user_id = auth.uid() and b.user_id = profiles.id)
);

create policy church_users_read on church_users for select using (is_church_member(church_id));
create policy church_users_admin on church_users for all using (has_church_role(church_id, '{admin}')) with check (has_church_role(church_id, '{admin}'));

create policy invites_admin on team_invites for all using (has_church_role(church_id, '{admin}')) with check (has_church_role(church_id, '{admin}'));

-- members: everyone in the church reads; admins + leaders write; only admins delete.
create policy members_read on members for select using (is_church_member(church_id));
create policy members_insert on members for insert with check (has_church_role(church_id, '{admin,leader}'));
create policy members_update on members for update using (has_church_role(church_id, '{admin,leader}')) with check (has_church_role(church_id, '{admin,leader}'));
create policy members_delete on members for delete using (has_church_role(church_id, '{admin}'));

create policy comms_read on communications for select using (is_church_member(church_id));
create policy comms_write on communications for insert with check (has_church_role(church_id, '{admin,leader}'));

-- giving & finance: Administrators and Finance only.
create policy gifts_all on gifts for all using (has_church_role(church_id, '{admin,finance}')) with check (has_church_role(church_id, '{admin,finance}'));
create policy expenses_all on expenses for all using (has_church_role(church_id, '{admin,finance}')) with check (has_church_role(church_id, '{admin,finance}'));
create policy claims_all on transfer_claims for all using (has_church_role(church_id, '{admin,finance}')) with check (has_church_role(church_id, '{admin,finance}'));

create policy events_read on events for select using (is_church_member(church_id));
create policy events_write on events for all using (has_church_role(church_id, '{admin,leader}')) with check (has_church_role(church_id, '{admin,leader}'));

create policy campaigns_read on campaigns for select using (is_church_member(church_id));
create policy campaigns_write on campaigns for insert with check (has_church_role(church_id, '{admin,leader}'));
create policy deliveries_read on deliveries for select using (has_church_role(church_id, '{admin,leader}'));

create policy templates_read on message_templates for select using (is_church_member(church_id));
create policy templates_write on message_templates for all using (has_church_role(church_id, '{admin}')) with check (has_church_role(church_id, '{admin}'));

create policy links_read on share_links for select using (is_church_member(church_id));
create policy links_write on share_links for all using (has_church_role(church_id, '{admin,leader,finance}')) with check (
  has_church_role(church_id, '{admin,finance}') or (type <> 'giving' and has_church_role(church_id, '{leader}'))
);

create policy designs_all on designs for all using (has_church_role(church_id, '{admin,leader}')) with check (has_church_role(church_id, '{admin,leader}'));
create policy requests_all on design_requests for all using (has_church_role(church_id, '{admin,leader}')) with check (has_church_role(church_id, '{admin,leader}'));
create policy request_msgs_all on design_request_messages for all using (has_church_role(church_id, '{admin,leader}')) with check (has_church_role(church_id, '{admin,leader}') and sender = 'you');

create policy ai_activity_read on ai_activity for select using (is_church_member(church_id));
create policy ai_activity_write on ai_activity for insert with check (is_church_member(church_id) and user_id = auth.uid());
create policy ai_usage_read on ai_usage for select using (is_church_member(church_id));
create policy ai_usage_write on ai_usage for insert with check (is_church_member(church_id) and user_id = auth.uid());

-- ───────── sign-up: create a church and make the caller its admin ─────────
create or replace function create_church(
  p_name text, p_slug text, p_location text, p_phone text, p_denomination text,
  p_currency text, p_plan plan_id, p_language lang_code
) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; s text := p_slug; n int := 1;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- unique slug: grace-chapel, grace-chapel-2, …
  while exists (select 1 from churches where slug = s) loop n := n + 1; s := p_slug || '-' || n; end loop;
  insert into churches (name, slug, location, phone, denomination, currency, plan, default_language)
  values (p_name, s, coalesce(p_location, ''), coalesce(p_phone, ''), coalesce(p_denomination, ''), coalesce(nullif(p_currency, ''), 'USD'), coalesce(p_plan, 'essentials'), coalesce(p_language, 'en'))
  returning id into cid;
  insert into church_users (church_id, user_id, role) values (cid, auth.uid(), 'admin');
  -- Ready-made registration and giving links (with QR codes in the app).
  insert into share_links (church_id, type, fund) values (cid, 'member', ''), (cid, 'newcomer', ''), (cid, 'convert', ''), (cid, 'giving', 'Offering');
  return cid;
end $$;

create or replace function as_lang(v text) returns lang_code language sql immutable as $$
  select case when v in ('en','es','fr','de','pt') then v::lang_code else 'en'::lang_code end
$$;

-- New auth users get a profile (language comes from sign-up metadata).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, ui_language, comm_language, language_chosen)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.email, ''),
    as_lang(new.raw_user_meta_data->>'ui_language'),
    as_lang(coalesce(new.raw_user_meta_data->>'comm_language', new.raw_user_meta_data->>'ui_language')),
    (new.raw_user_meta_data ? 'ui_language')
  )
  on conflict (id) do nothing;
  -- Accept pending team invites for this email.
  insert into church_users (church_id, user_id, role)
  select church_id, new.id, role from team_invites where lower(email) = lower(new.email) and status = 'Invited'
  on conflict do nothing;
  update team_invites set status = 'Accepted' where lower(email) = lower(new.email) and status = 'Invited';
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ───────── storage buckets ─────────
insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('inspiration', 'inspiration', false) on conflict do nothing;
-- Files live under <church_id>/… ; only that church's users can read/write them.
create policy logos_rw on storage.objects for all
  using (bucket_id = 'logos' and is_church_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'logos' and has_church_role(((storage.foldername(name))[1])::uuid, '{admin}'));
create policy inspiration_rw on storage.objects for all
  using (bucket_id = 'inspiration' and is_church_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'inspiration' and has_church_role(((storage.foldername(name))[1])::uuid, '{admin,leader}'));

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
