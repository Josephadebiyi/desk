-- ZionDesk update: promo codes at sign-up (0008) + check-ins, inbox, design requests (0009). Safe to run more than once.
-- ZionDesk — promo / referral codes at sign-up (PR & partner attribution).
alter table churches add column if not exists signup_code text;
create index if not exists churches_signup_code on churches (signup_code);

-- "Tracking only" codes: no discount, just to see who signed up through a campaign.
alter table promo_codes drop constraint if exists promo_codes_kind_check;
alter table promo_codes add constraint promo_codes_kind_check check (kind in ('percent', 'free_days', 'tracking'));
alter table promo_codes drop constraint if exists promo_codes_check;
alter table promo_codes add constraint promo_codes_check check ((kind = 'percent' and percent_off is not null) or (kind = 'free_days' and free_days is not null) or kind = 'tracking');

-- Only the server records which code a church used.
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
    new.signup_code := old.signup_code;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

-- ZionDesk — Sunday check-ins (QR) with optional follow-ups, WhatsApp/SMS inbox, designer deliveries.
-- Safe to run more than once.

-- 1. Check-in QR links + attendance.
alter table share_links drop constraint if exists share_links_type_check;
alter table share_links add constraint share_links_type_check check (type in ('member', 'newcomer', 'convert', 'giving', 'checkin'));
insert into share_links (church_id, type, label)
select c.id, 'checkin', '' from churches c
where not exists (select 1 from share_links l where l.church_id = c.id and l.type = 'checkin');

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  member_id uuid not null references members on delete cascade,
  service_date date not null,
  checked_in_at timestamptz not null default now(),
  method text not null default 'qr' check (method in ('qr', 'manual')),
  by_name text not null default '',
  unique (member_id, service_date)
);
create index if not exists attendance_church_date on attendance (church_id, service_date desc);
alter table attendance enable row level security;
drop policy if exists attendance_read on attendance;
create policy attendance_read on attendance for select using (has_church_role(church_id, '{admin,leader}'));

-- Follow-ups after missed Sundays: OFF by default; churches switch it on in Attendance.
alter table churches
  add column if not exists followup_enabled boolean not null default false,
  add column if not exists followup_missed int not null default 2,
  add column if not exists followup_message text not null default '';
alter table churches drop constraint if exists churches_followup_missed_check;
alter table churches add constraint churches_followup_missed_check check (followup_missed between 2 and 6);
alter table members add column if not exists last_followup_at timestamptz;

-- 2. Inbox: WhatsApp / SMS conversations with members (replies land here).
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  member_id uuid references members on delete set null,
  phone text not null,
  channel text not null check (channel in ('WhatsApp', 'SMS')),
  name text not null default '',
  last_message text not null default '',
  last_message_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  unread int not null default 0,
  created_at timestamptz not null default now(),
  unique (church_id, phone, channel)
);
create index if not exists conversations_church on conversations (church_id, last_message_at desc);
create index if not exists conversations_phone on conversations (phone, last_message_at desc);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations on delete cascade,
  church_id uuid not null references churches on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  body text not null,
  status text not null default 'sent',
  provider_id text,
  by_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists conversation_messages_conv on conversation_messages (conversation_id, created_at);
alter table conversations enable row level security;
alter table conversation_messages enable row level security;
drop policy if exists conversations_read on conversations;
create policy conversations_read on conversations for select using (has_church_role(church_id, '{admin,leader}'));
drop policy if exists conversation_messages_read on conversation_messages;
create policy conversation_messages_read on conversation_messages for select using (has_church_role(church_id, '{admin,leader}'));

-- 3. Designer deliveries for Ministry Max flyer requests.
alter table design_requests add column if not exists deliverables jsonb not null default '[]'; -- [{ name, url }]
insert into storage.buckets (id, name, public) values ('deliverables', 'deliverables', true) on conflict do nothing;

-- Only the server changes follow-up settings (plan-gated) and the welcome / code fields.
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
    new.signup_code := old.signup_code;
    new.followup_enabled := old.followup_enabled;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

-- New churches also get a check-in link.
create or replace function create_church(
  p_name text, p_slug text, p_location text, p_phone text, p_denomination text,
  p_currency text, p_plan plan_id, p_language lang_code
) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; s text; n int := 1; owned int; today int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then
    raise exception 'Please confirm your email address first.';
  end if;
  select count(*) into owned from church_users where user_id = auth.uid() and role = 'admin';
  if owned >= 5 then raise exception 'You can create up to 5 churches. Contact support to add more.'; end if;
  select count(*) into today from church_users where user_id = auth.uid() and role = 'admin' and created_at > now() - interval '1 day';
  if today >= 3 then raise exception 'Too many churches created today. Please try again tomorrow.'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if length(p_name) < 2 or length(p_name) > 120 then raise exception 'Please enter your church name.'; end if;
  s := left(regexp_replace(lower(coalesce(p_slug, '')), '[^a-z0-9-]', '', 'g'), 50);
  if length(s) < 3 then s := 'church'; end if;
  p_slug := s;
  while exists (select 1 from churches where slug = s) loop n := n + 1; s := p_slug || '-' || n; end loop;
  insert into churches (name, slug, location, phone, denomination, currency, plan, default_language)
  values (p_name, s, left(coalesce(p_location, ''), 200), left(coalesce(p_phone, ''), 40), left(coalesce(p_denomination, ''), 120),
          coalesce(nullif(upper(left(p_currency, 3)), ''), 'USD'), coalesce(p_plan, 'essentials'), coalesce(p_language, 'en'))
  returning id into cid;
  insert into church_users (church_id, user_id, role) values (cid, auth.uid(), 'admin');
  insert into share_links (church_id, type, fund) values (cid, 'member', ''), (cid, 'newcomer', ''), (cid, 'convert', ''), (cid, 'giving', 'Offering'), (cid, 'checkin', '');
  return cid;
end $$;
revoke all on function create_church(text, text, text, text, text, text, plan_id, lang_code) from public, anon;
grant execute on function create_church(text, text, text, text, text, text, plan_id, lang_code) to authenticated;

-- Digits-only phone numbers so check-ins and incoming replies can be matched to members.
alter table members add column if not exists phone_digits text generated always as (regexp_replace(phone, '\D', '', 'g')) stored;
alter table members add column if not exists whatsapp_digits text generated always as (regexp_replace(whatsapp, '\D', '', 'g')) stored;
create index if not exists members_phone_digits on members (church_id, phone_digits);
create index if not exists members_whatsapp_digits on members (church_id, whatsapp_digits);

-- 4. Ministry Max: 8 designer requests a month included; extra requests are €10 each (tracked as payments).
alter table design_requests drop constraint if exists design_requests_status_check;
alter table design_requests add constraint design_requests_status_check check (status in ('Awaiting payment', 'Submitted', 'In design', 'Review', 'Delivered'));
alter table design_requests add column if not exists extra boolean not null default false;
alter table online_payments drop constraint if exists online_payments_kind_check;
alter table online_payments add constraint online_payments_kind_check check (kind in ('gift', 'subscription', 'design_request'));
alter table online_payments add column if not exists design_request_id uuid references design_requests on delete set null;

-- Requests are created through the server (allowance + payment checks); churches can read them and
-- post their own messages, but can't change status or pose as the designer.
drop policy if exists requests_all on design_requests;
drop policy if exists requests_read on design_requests;
create policy requests_read on design_requests for select using (has_church_role(church_id, '{admin,leader}'));
drop policy if exists request_msgs_all on design_request_messages;
drop policy if exists request_msgs_read on design_request_messages;
drop policy if exists request_msgs_write on design_request_messages;
create policy request_msgs_read on design_request_messages for select using (has_church_role(church_id, '{admin,leader}'));
create policy request_msgs_write on design_request_messages for insert with check (has_church_role(church_id, '{admin,leader}') and sender = 'you');
