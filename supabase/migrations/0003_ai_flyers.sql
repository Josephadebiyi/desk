-- ZionDesk — AI flyers: keep the generated design with the saved flyer.
alter table designs add column if not exists svg text;
create index if not exists ai_usage_designs on ai_usage (church_id, feature, at);
