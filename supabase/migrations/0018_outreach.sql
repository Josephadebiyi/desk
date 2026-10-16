-- ZionDesk — outreach emails to churches (staff console → Outreach).
-- Contacts are churches we'd like to invite; campaigns are the branded emails; each send is tracked
-- (opened via a pixel, clicked via redirect links, unsubscribed via a one-click link). Staff only: no RLS policies,
-- everything goes through the API with the service role.

create table if not exists outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  church_name text not null default '' check (length(church_name) <= 160),
  contact_name text not null default '' check (length(contact_name) <= 120),
  country text not null default '' check (length(country) <= 60),
  notes text not null default '' check (length(notes) <= 1000),
  website text not null default '' check (length(website) <= 300),
  -- Ellen's personalised opening (written from the church's website; staff can edit before sending)
  personal_note text not null default '' check (length(personal_note) <= 600),
  research_summary text not null default '' check (length(research_summary) <= 600),
  researched_at timestamptz,
  -- new → sent → opened → clicked → replied → signed_up; unsubscribed / bounced stop all sending
  status text not null default 'new' check (status in ('new', 'sent', 'opened', 'clicked', 'replied', 'signed_up', 'unsubscribed', 'bounced')),
  sends int not null default 0,
  last_sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  replied_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists outreach_contacts_email on outreach_contacts (lower(email));
alter table outreach_contacts enable row level security;

create table if not exists outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  kind text not null default 'intro' check (kind in ('intro', 'followup')),
  subject text not null check (length(subject) between 1 and 200),
  preview text not null default '' check (length(preview) <= 200),
  body text not null default '' check (length(body) <= 6000),  -- paragraphs; {{church_name}} is filled in
  from_name text not null default 'Joseph from ZionDesk' check (length(from_name) <= 80),
  reply_to text not null default '',
  ref_code text not null default 'CHURCHMAIL' check (ref_code ~ '^[A-Z0-9_-]{3,32}$'),
  created_by text not null default '',
  created_at timestamptz not null default now()
);
alter table outreach_campaigns enable row level security;

create table if not exists outreach_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references outreach_campaigns on delete cascade,
  contact_id uuid not null references outreach_contacts on delete cascade,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  provider_id text,
  error text,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  clicked_at timestamptz,
  unique (campaign_id, contact_id)   -- a church never gets the same campaign twice
);
create index if not exists outreach_sends_sent on outreach_sends (sent_at desc);
alter table outreach_sends enable row level security;
