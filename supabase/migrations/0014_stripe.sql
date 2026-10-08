-- ZionDesk — Stripe for churches outside Nigeria (USD). Nigerian churches stay on Paystack (NGN).
alter table churches add column if not exists stripe_customer_id text;
alter table churches add column if not exists stripe_subscription_id text;
create index if not exists churches_stripe_customer on churches (stripe_customer_id);
create index if not exists churches_stripe_subscription on churches (stripe_subscription_id);

alter table online_payments drop constraint if exists online_payments_provider_check;
alter table online_payments add constraint online_payments_provider_check check (provider in ('flutterwave', 'paystack', 'stripe'));
alter table online_payments add column if not exists stripe_session_id text unique;
