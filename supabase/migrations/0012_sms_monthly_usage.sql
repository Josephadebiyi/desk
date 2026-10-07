-- Included segments: Essentials 10, Plus 20, Max 30.
create table if not exists public.sms_monthly_usage (
  church_id uuid not null references public.churches(id) on delete cascade,
  month date not null,
  used integer not null default 0 check (used >= 0),
  primary key (church_id, month)
);
alter table public.sms_monthly_usage enable row level security;
-- Only the server's service role can read or reserve usage.
revoke all on public.sms_monthly_usage from anon, authenticated;
grant all on public.sms_monthly_usage to service_role;

create or replace function public.reserve_sms_segments(p_church uuid, p_segments integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  allowance integer;
  period date := date_trunc('month', now() at time zone 'UTC')::date;
  changed integer;
begin
  if p_segments is null or p_segments < 1 then raise exception 'Invalid SMS segment count'; end if;
  select case plan when 'plus' then 20 when 'max' then 30 else 10 end
    into allowance from public.churches where id = p_church;
  if allowance is null then raise exception 'Church not found'; end if;
  insert into public.sms_monthly_usage(church_id, month, used)
    values(p_church, period, 0) on conflict do nothing;
  update public.sms_monthly_usage set used = used + p_segments
    where church_id = p_church and month = period and used + p_segments <= allowance;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.reserve_sms_segments(uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_sms_segments(uuid, integer) to service_role;
