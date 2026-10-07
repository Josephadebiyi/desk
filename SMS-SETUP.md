# Church SMS senders and monthly allowances

Apply `supabase/migrations/0012_sms_monthly_usage.sql` in the Supabase SQL editor before deploying this change. Migration 0011 supplies each church's optional SMS sender name. No production migration or deployment was performed by this task.

Each church gets its own monthly allowance: Essentials 10, Plus 20, Max 30 SMS segments. Unknown plans use Essentials. Usage resets automatically with the UTC calendar month; unused allowance does not carry forward. Existing messages before activation are not backfilled.

Campaigns, inbox replies and attendance follow-ups all reserve segments before sending. Reservation is an atomic conditional update in PostgreSQL, accessible only to the service role. If the database reservation fails or the allowance is exhausted, the provider is not called. An accepted send attempt stays counted even if it subsequently fails, because provider failures can be ambiguous or chargeable. A sender-name fallback uses the original reservation. GSM-7 extended characters and Unicode affect segment counts. Twilio's final segmentation can differ when account encoding transformations are enabled.

Messages use the current church's saved sender name, or a name derived from its church name, across campaigns, inbox replies and follow-ups. Sender names still require destination-country support and any applicable Twilio registration. Unsupported destinations use the configured shared number, with the church name in the body. Names cannot be guaranteed on every carrier.

The Messaging page reads `/api/sms/usage` for the selected church and displays used and remaining segments. A campaign exceeding the remaining allowance may partially send: each recipient is checked individually, and subsequent recipients receive a quota failure once the allowance runs out. Repeated manual sends remain subject to the existing campaign idempotency risks documented in QA-REPORT.md.

Checks: client build, server type check and messaging tests pass. Tests cover plan allowances, GSM and Unicode segment boundaries, missing church context, exhausted quota and database failure blocking submission, provider payloads and simulated concurrency. PostgreSQL migration execution and real concurrent database reservations were not tested because no staging database connection was available.

If allowances change, update both `src/lib/smsUsage.ts` and the database reservation function through a new migration.
