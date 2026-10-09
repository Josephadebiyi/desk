-- ZionDesk — nothing is created or sent twice.
-- 1. create_church: the app could call it twice at the same moment on first sign-in (two auth events), which made
--    two identical churches and two welcome emails. Calls for the same user are now serialised, and a repeat call
--    for a church with the same name created in the last 10 minutes returns that church instead of a new one.
-- 2. deliveries.dedupe_key: automatic and manual one-off messages (birthdays, event reminders) claim their key
--    before sending; a second run, a retry or a double-click finds the key taken and sends nothing.

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
  p_name := btrim(coalesce(p_name, ''));
  if length(p_name) < 2 or length(p_name) > 120 then raise exception 'Please enter your church name.'; end if;
  -- One create at a time per user; a duplicate call gets the church that was just made.
  perform pg_advisory_xact_lock(hashtextextended('create_church:' || auth.uid()::text, 0));
  select c.id into cid from churches c join church_users u on u.church_id = c.id
   where u.user_id = auth.uid() and u.role = 'admin' and lower(c.name) = lower(p_name) and c.created_at > now() - interval '10 minutes'
   order by c.created_at limit 1;
  if cid is not null then return cid; end if;
  select count(*) into owned from church_users where user_id = auth.uid() and role = 'admin';
  if owned >= 5 then raise exception 'You can create up to 5 churches. Contact support to add more.'; end if;
  select count(*) into today from church_users where user_id = auth.uid() and role = 'admin' and created_at > now() - interval '1 day';
  if today >= 3 then raise exception 'Too many churches created today. Please try again tomorrow.'; end if;
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

alter table deliveries add column if not exists dedupe_key text;
create unique index if not exists deliveries_dedupe_key on deliveries (dedupe_key);
