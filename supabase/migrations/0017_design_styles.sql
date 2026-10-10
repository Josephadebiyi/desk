-- ZionDesk — flyer style library.
-- ZionDesk's own designs (uploaded by staff in the admin console) that Ellen uses as style references for AI flyers:
-- she recreates the look (palette, layout, typography, mood) with each church's own wording — never the reference text.
-- Written only through the API (service role, staff only); every signed-in church can read the active ones.

create table if not exists design_styles (
  id uuid primary key default gen_random_uuid(),
  title text not null default '' check (length(title) <= 80),
  tags text[] not null default '{}',          -- worship, youth, conference, prayer, christmas…
  image_url text not null,
  image_path text not null,                   -- path in the design-styles bucket
  width int,
  height int,
  active boolean not null default true,
  uses int not null default 0,                -- how often Ellen used it (helps pick the best styles)
  created_at timestamptz not null default now()
);
create index if not exists design_styles_active on design_styles (active, created_at desc);
alter table design_styles enable row level security;
drop policy if exists design_styles_read on design_styles;
create policy design_styles_read on design_styles for select to authenticated using (active);

insert into storage.buckets (id, name, public) values ('design-styles', 'design-styles', true) on conflict do nothing;
