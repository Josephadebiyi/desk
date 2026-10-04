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
