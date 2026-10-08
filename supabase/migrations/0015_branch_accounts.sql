-- ZionDesk — branches with their own ZionDesk account, still connected to HQ.
-- A branch leader (role 'branch' in HQ's church) can start a separate church account for their branch, with its
-- own plan, members, messaging and flyer requests. HQ's flyers stay with HQ. The new account records which church
-- and branch it belongs to, and the leader keeps their HQ link, so monthly branch reports still go to HQ.

alter table churches add column if not exists parent_church_id uuid references churches on delete set null;
alter table churches add column if not exists parent_branch text;
create index if not exists churches_parent on churches (parent_church_id) where parent_church_id is not null;
alter table churches drop constraint if exists churches_parent_not_self;
alter table churches add constraint churches_parent_not_self check (parent_church_id is null or parent_church_id <> id);

-- Only the server sets the HQ link and billing references (a church admin can't point their account at another
-- church, or at someone else's Stripe / Paystack customer).
create or replace function protect_billing_columns() returns trigger language plpgsql as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' then
    new.id := old.id;
    new.plan := old.plan;
    new.plan_status := old.plan_status;
    new.plan_renews_at := old.plan_renews_at;
    new.trial_ends_at := old.trial_ends_at;
    new.flw_subaccount_id := old.flw_subaccount_id;
    new.flw_subscription_email := old.flw_subscription_email;
    new.payout_account := old.payout_account;
    new.google_meet_email := old.google_meet_email;
    new.welcome_sent_at := old.welcome_sent_at;
    new.signup_code := old.signup_code;
    new.followup_enabled := old.followup_enabled;
    new.paystack_customer_code := old.paystack_customer_code;
    new.paystack_subscription_code := old.paystack_subscription_code;
    new.paystack_email_token := old.paystack_email_token;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.parent_church_id := old.parent_church_id;
    new.parent_branch := old.parent_branch;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
