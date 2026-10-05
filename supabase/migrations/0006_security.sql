-- ZionDesk — security hardening before launch. Safe to run more than once.

-- 1. profiles.email always mirrors the verified sign-in email. Before this, a user could edit their own
--    profile email to someone else's and be added to a church when that person was invited.
create or replace function protect_profile_columns() returns trigger language plpgsql as $$
begin
  -- Direct browser writes run as the "authenticated" role; trusted functions and the server don't.
  if current_user in ('authenticated', 'anon') then
    new.id := old.id;
    new.email := old.email;
    -- Accepting the Terms is recorded with the database clock, not a time sent by the browser.
    new.terms_accepted_at := case when new.terms_version is distinct from old.terms_version then now() else old.terms_accepted_at end;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect on profiles;
create trigger profiles_protect before update on profiles for each row execute function protect_profile_columns();

-- Profiles are created by the sign-up trigger only (never from the browser).
drop policy if exists profiles_self on profiles;
drop policy if exists profiles_self_read on profiles;
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_read on profiles for select using (id = auth.uid());
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- 2. Team invites are accepted only once the email is verified (confirmed sign-up, Google, or invite link).
--    Before this, anyone could sign up (unconfirmed) with an invited email and be attached to that church.
create or replace function accept_team_invites(uid uuid, mail text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into church_users (church_id, user_id, role)
  select church_id, uid, role from team_invites where lower(email) = lower(mail) and status = 'Invited'
  on conflict do nothing;
  update team_invites set status = 'Accepted' where lower(email) = lower(mail) and status = 'Invited';
end $$;
revoke all on function accept_team_invites(uuid, text) from public, anon, authenticated;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, ui_language, comm_language, language_chosen)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), 120),
    coalesce(new.email, ''),
    as_lang(new.raw_user_meta_data->>'ui_language'),
    as_lang(coalesce(new.raw_user_meta_data->>'comm_language', new.raw_user_meta_data->>'ui_language')),
    (new.raw_user_meta_data ? 'ui_language')
  )
  on conflict (id) do nothing;
  if new.email_confirmed_at is not null then perform accept_team_invites(new.id, new.email); end if;
  return new;
end $$;

-- Email confirmed later, or email address changed: accept invites and keep profiles.email in sync.
create or replace function handle_user_updated() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  if new.email_confirmed_at is not null and (old.email_confirmed_at is null or new.email is distinct from old.email) then
    perform accept_team_invites(new.id, new.email);
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email, email_confirmed_at on auth.users for each row execute function handle_user_updated();

-- Undo invites that were accepted by accounts that never verified their email (they're re-accepted on confirmation).
update team_invites ti set status = 'Invited' from auth.users u
where ti.status = 'Accepted' and lower(ti.email) = lower(u.email) and u.email_confirmed_at is null;
delete from church_users cu using auth.users u
where cu.user_id = u.id and u.email_confirmed_at is null and cu.role <> 'admin';

-- 3. Church creation: signed-in, verified users only; at most 5 churches each and 3 per day (stops trial farming / spam).
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
  insert into share_links (church_id, type, fund) values (cid, 'member', ''), (cid, 'newcomer', ''), (cid, 'convert', ''), (cid, 'giving', 'Offering');
  return cid;
end $$;
revoke all on function create_church(text, text, text, text, text, text, plan_id, lang_code) from public, anon;
grant execute on function create_church(text, text, text, text, text, text, plan_id, lang_code) to authenticated;

-- 4. Billing and integration fields can only be changed by the server.
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
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

-- 5. Team: an admin can't remove or demote the last admin of a church (no locked-out churches).
create or replace function keep_one_admin() returns trigger language plpgsql as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.church_id := old.church_id;
    new.user_id := old.user_id;
  end if;
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin')
     and not exists (select 1 from church_users where church_id = old.church_id and role = 'admin' and user_id <> old.user_id) then
    raise exception 'A church needs at least one admin.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists church_users_keep_admin on church_users;
create trigger church_users_keep_admin before update or delete on church_users for each row execute function keep_one_admin();

-- Admins add people through invites (server checks the email); the browser can't attach arbitrary user ids.
drop policy if exists church_users_admin on church_users;
drop policy if exists church_users_admin_update on church_users;
drop policy if exists church_users_admin_delete on church_users;
create policy church_users_admin_update on church_users for update using (has_church_role(church_id, '{admin}')) with check (has_church_role(church_id, '{admin}'));
create policy church_users_admin_delete on church_users for delete using (has_church_role(church_id, '{admin}') or user_id = auth.uid());

-- 6. Server-only tables: make sure the browser can never read them, even if a policy is added by mistake.
revoke all on table google_connections, platform_settings, promo_codes, promo_redemptions, trial_leads from anon, authenticated;
