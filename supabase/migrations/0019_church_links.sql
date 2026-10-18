-- ZionDesk — connect two separate church accounts (Settings → Connected churches).
-- An admin creates a one-time link code, saying whether their church will be the head or the sub church. The other
-- church's admin enters the code and the link is made: the sub church's parent_church_id points at the head church
-- (the same link branch accounts use, migration 0015). Both sides then see each other's details and summary numbers,
-- never member records. Either admin can disconnect at any time. Codes are server-only: RLS on, no policies.

create table if not exists church_link_codes (
  code text primary key check (code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  church_id uuid not null references churches on delete cascade,
  -- what the church that created the code becomes once the other church joins
  creator_role text not null check (creator_role in ('head', 'sub')),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by_church uuid references churches on delete set null,
  -- set when the code was sent as an email invitation (Settings → Connected churches → Invite by email)
  invited_email text check (invited_email is null or length(invited_email) <= 200)
);
create index if not exists church_link_codes_church on church_link_codes (church_id);
alter table church_link_codes enable row level security;
