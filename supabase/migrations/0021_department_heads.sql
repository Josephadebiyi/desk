-- ZionDesk — department heads.
-- A new team role tied to one or more departments (e.g. Choir, Youth). A department head only ever sees the
-- members of their own departments, with two switches set by an administrator:
--   can_edit_members   off = view only · on = add and edit members (and notes) in their departments
--   can_send_messages  send WhatsApp / SMS / email to their departments only
-- They can't see giving, expenses, reports, attendance, the inbox, links, settings or the rest of the church.
-- Same model as branch leaders (0010): NOT a "church member" for data access, then let back in to their slice.

-- 1. Role and per-person settings
alter type app_role add value if not exists 'department';

alter table church_users add column if not exists departments text[];
alter table church_users add column if not exists can_edit_members boolean not null default false;
alter table church_users add column if not exists can_send_messages boolean not null default false;
alter table team_invites add column if not exists departments text[];
alter table team_invites add column if not exists can_edit_members boolean not null default false;
alter table team_invites add column if not exists can_send_messages boolean not null default false;

-- 2. Invites carry departments and switches into church_users when accepted.
create or replace function accept_team_invites(uid uuid, mail text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into church_users (church_id, user_id, role, branch, departments, can_edit_members, can_send_messages)
  select church_id, uid, role, branch, departments, can_edit_members, can_send_messages
  from team_invites where lower(email) = lower(mail) and status = 'Invited'
  on conflict do nothing;
  update team_invites set status = 'Accepted' where lower(email) = lower(mail) and status = 'Invited';
end $$;
revoke all on function accept_team_invites(uuid, text) from public, anon, authenticated;

-- 3. Branch leaders and department heads are not "church members" for church-wide data.
--    (role::text: the new enum value can't be referenced as a literal in the same transaction.)
create or replace function is_church_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from church_users where church_id = c and user_id = auth.uid() and role::text not in ('branch', 'department'))
$$;

/** The caller's departments in this church when they are a department head; null otherwise. */
create or replace function dept_scope(c uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(departments, '{}') from church_users where church_id = c and user_id = auth.uid() and role::text = 'department'
$$;

/** A department head's switch: 'edit' or 'message'. */
create or replace function dept_can(c uuid, what text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case what when 'edit' then can_edit_members when 'message' then can_send_messages else false end
    from church_users where church_id = c and user_id = auth.uid() and role::text = 'department'
  ), false)
$$;

-- 4. Their slice of the church
-- The church row (name, departments, currency), like branch leaders.
drop policy if exists churches_read_department on churches;
create policy churches_read_department on churches for select using (dept_scope(id) is not null);

-- Members of their departments only. Edits keep the member inside their departments.
drop policy if exists members_read_department on members;
create policy members_read_department on members for select using (department = any(dept_scope(church_id)));
drop policy if exists members_insert_department on members;
create policy members_insert_department on members for insert
  with check (dept_can(church_id, 'edit') and department = any(dept_scope(church_id)));
drop policy if exists members_update_department on members;
create policy members_update_department on members for update
  using (dept_can(church_id, 'edit') and department = any(dept_scope(church_id)))
  with check (dept_can(church_id, 'edit') and department = any(dept_scope(church_id)));

-- Contact history / notes of those members.
drop policy if exists comms_read_department on communications;
create policy comms_read_department on communications for select using (
  exists (select 1 from members m where m.id = communications.member_id and m.department = any(dept_scope(communications.church_id)))
);
drop policy if exists comms_write_department on communications;
create policy comms_write_department on communications for insert with check (
  (dept_can(church_id, 'edit') or dept_can(church_id, 'message'))
  and exists (select 1 from members m where m.id = communications.member_id and m.department = any(dept_scope(communications.church_id)))
);

-- Church events (read only).
drop policy if exists events_read_department on events;
create policy events_read_department on events for select using (dept_scope(church_id) is not null);

-- Messages to their own departments: see them, and create them when allowed to send.
drop policy if exists campaigns_read_department on campaigns;
create policy campaigns_read_department on campaigns for select using (
  audience->>'type' = 'department' and audience->>'value' = any(dept_scope(church_id))
);
drop policy if exists campaigns_write_department on campaigns;
create policy campaigns_write_department on campaigns for insert with check (
  dept_can(church_id, 'message') and audience->>'type' = 'department' and audience->>'value' = any(dept_scope(church_id))
);

-- The church's message templates (read only), for writing messages.
drop policy if exists templates_read_department on message_templates;
create policy templates_read_department on message_templates for select using (dept_scope(church_id) is not null);
