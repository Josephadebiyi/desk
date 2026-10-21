-- ZionDesk — Design Studio: editable designs made by the multi-agent designer (and edited by hand in the editor).
--   designs_v2          one editable design: the current DesignSpec (JSON), status of the AI job, approval
--   design_versions     every saved version of the spec (AI steps, manual autosaves, restores)
--   design_assets       uploaded logos / portraits / references and generated art (files in the design-assets bucket)
--   design_agent_runs   one row per agent call: model, tokens, cost, latency, outcome (usage + cost tracking)
--   design_preferences  what a church tends to approve (fonts, colours, layouts) — used to plan future designs
-- Members of the church read their own rows; all writes go through the API (service role), except the editor's
-- autosave, which goes through the API too so versions and ownership stay consistent.

create table if not exists designs_v2 (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  created_by uuid references auth.users on delete set null,
  title text not null default '' check (length(title) <= 160),
  format text not null default 'portrait',
  mode text not null default 'original' check (mode in ('replicate', 'inspired', 'original')),
  -- queued → running → ready | failed (AI work); manual edits don't change it
  status text not null default 'queued' check (status in ('queued', 'running', 'ready', 'failed')),
  stage text not null default '', -- which agent is working, for the progress view
  progress jsonb not null default '[]', -- [{at, agent, message}]
  error text,
  spec jsonb not null,
  version int not null default 0,
  preview_path text, -- latest PNG in design-assets
  pending_instruction text, -- conversational edit waiting for the AI
  approved_at timestamptz,
  heartbeat_at timestamptz,
  ai_rounds int not null default 0, -- AI generations + edits used on this design
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists designs_v2_church on designs_v2 (church_id, updated_at desc);
create index if not exists designs_v2_jobs on designs_v2 (status) where status in ('queued', 'running');

create table if not exists design_versions (
  design_id uuid not null references designs_v2 on delete cascade,
  version int not null,
  agent text not null, -- director, reference, typography, image, layout, qc, user (manual), restore
  note text not null default '',
  spec jsonb not null,
  created_at timestamptz not null default now(),
  primary key (design_id, version)
);

create table if not exists design_assets (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  kind text not null check (kind in ('logo', 'portrait', 'reference', 'background', 'decor', 'font')),
  path text not null, -- object path in the design-assets bucket
  mime text not null,
  width int not null default 0,
  height int not null default 0,
  bytes int not null default 0,
  cutout boolean not null default false, -- portrait with the background removed
  name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists design_assets_church on design_assets (church_id, kind, created_at desc);

create table if not exists design_agent_runs (
  id bigserial primary key,
  design_id uuid references designs_v2 on delete cascade,
  church_id uuid references churches on delete cascade,
  agent text not null,
  model text not null default '',
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  ms int not null default 0,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists design_agent_runs_design on design_agent_runs (design_id);
create index if not exists design_agent_runs_church on design_agent_runs (church_id, created_at desc);

create table if not exists design_preferences (
  church_id uuid primary key references churches on delete cascade,
  fonts jsonb not null default '{}', -- family → times approved
  colors jsonb not null default '{}', -- hex → times approved
  archetypes jsonb not null default '{}', -- layout → times approved
  moods jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table designs_v2 enable row level security;
alter table design_versions enable row level security;
alter table design_assets enable row level security;
alter table design_agent_runs enable row level security;
alter table design_preferences enable row level security;

drop policy if exists designs_v2_read on designs_v2;
create policy designs_v2_read on designs_v2 for select using (has_church_role(church_id, '{admin,leader}'));
drop policy if exists design_assets_read on design_assets;
create policy design_assets_read on design_assets for select using (has_church_role(church_id, '{admin,leader}'));
drop policy if exists design_versions_read on design_versions;
create policy design_versions_read on design_versions for select using (exists (select 1 from designs_v2 d where d.id = design_id and has_church_role(d.church_id, '{admin,leader}')));

-- Private bucket: portraits of real people. The API hands out short-lived signed URLs.
insert into storage.buckets (id, name, public) values ('design-assets', 'design-assets', false) on conflict do nothing;
