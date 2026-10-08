-- ZionDesk — plan billing moves from Flutterwave to Paystack (NGN for Nigerian churches, USD for everyone else).
-- Existing Flutterwave subscriptions keep working until they end (flw_subscription_email stays).
alter table churches add column if not exists paystack_customer_code text;      -- CUS_…
alter table churches add column if not exists paystack_subscription_code text;  -- SUB_… (current plan)
alter table churches add column if not exists paystack_email_token text;        -- needed to disable / enable that subscription
create index if not exists churches_paystack_customer on churches (paystack_customer_code);

alter table online_payments add column if not exists provider text not null default 'flutterwave';
alter table online_payments drop constraint if exists online_payments_provider_check;
alter table online_payments add constraint online_payments_provider_check check (provider in ('flutterwave', 'paystack'));
alter table online_payments add column if not exists paystack_transaction_id bigint unique;

