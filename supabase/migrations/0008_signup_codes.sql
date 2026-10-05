-- ZionDesk — promo / referral codes at sign-up (PR & partner attribution).
alter table churches add column if not exists signup_code text;
create index if not exists churches_signup_code on churches (signup_code);

-- "Tracking only" codes: no discount, just to see who signed up through a campaign.
alter table promo_codes drop constraint if exists promo_codes_kind_check;
alter table promo_codes add constraint promo_codes_kind_check check (kind in ('percent', 'free_days', 'tracking'));
alter table promo_codes drop constraint if exists promo_codes_check;
alter table promo_codes add constraint promo_codes_check check ((kind = 'percent' and percent_off is not null) or (kind = 'free_days' and free_days is not null) or kind = 'tracking');

-- Only the server records which code a church used.
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
    new.welcome_sent_at := old.welcome_sent_at;
    new.signup_code := old.signup_code;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
