# ZionDesk QA — 7 October 2026

## Scope and result

Build, server type checking, lint, translation consistency, existing security tests, new messaging unit tests, isolated HTTP smoke tests and local burst load tests completed. This is a partial application QA: authenticated UI journeys, database integrity under real concurrency, external provider delivery and sustained production capacity have not been validated. No production writes or messages were made. Tests run against the current checkout, which differs from the deployed commit observed earlier.

## Checks

- `npm run build`: passed. Main JS bundle approximately 2.19 MB (622 KB gzip); missing optional Ciscela font assets; ineffective dynamic import warning.
- `npm run typecheck:server`: passed, including after the parser fix.
- `npm run lint`: exit 0 with existing warnings including render purity, effects setting state and identical comparisons.
- `npm run i18n:check`: 2,028 keys across five languages consistent; some English-identical values flagged for review.
- Existing `tests/google-security.test.ts`: both tests passed, covering WhatsApp signature validation and Google Meet pending-conference / token failure behavior with mocked integrations.
- New `tests/messaging-qa.test.ts`: both tests passed. Checks international phone formatting, personalization, rejection before provider submission of missing country codes, SMS service / number selection, delivery callback URL, WhatsApp template variables and freeform replies, Meta template language selection, Twilio error interpretation, and 1,000 concurrent simulated SMS submissions. Mocked provider success does not establish real delivery.
- `node scripts/qa-stress.mjs`: all 13 HTTP smoke checks passed after fix. Health, unknown endpoints, unauthenticated campaign/team/transfer requests, cron authentication, unsigned provider callbacks, CORS preflight, invalid unsubscribe and invalid trial email were checked.

## Local burst results

Each stage sends 10,000 mixed requests to health, nonexistent API and unauthenticated campaign-send endpoints. Expected responses are 200, 404 and 401 respectively. API runs in a temporary working directory with no .env, database credentials or provider credentials.

| Concurrent requests | Requests | Requests/second | p95 latency | p99 latency | Unexpected responses / transport errors |
| --- | --- | --- | --- | --- | --- |
| 10 | 10,000 | 5,745 | 4.38 ms | 8.71 ms | 0 / 0 |
| 50 | 10,000 | 7,378 | 12.34 ms | 23.51 ms | 0 / 0 |
| 100 | 10,000 | 9,713 | 15.55 ms | 19.67 ms | 0 / 0 |

These short local bursts measure lightweight request handling and rejection paths. They are not production capacity estimates or sustained soak tests and do not exercise authenticated database operations, real messaging rate limits, or multiple application instances. Raw results: `qa-stress-results.json`.

## Confirmed defect fixed locally

Malformed JSON produced 500 because the error middleware recognized only HttpError. The middleware now maps Express JSON parse failures to 400 and oversized-body errors to 413 with generic messages. Malformed JSON was reproduced before the change and verified as 400 afterward. Oversized-body mapping was added but not independently exercised. Change is not deployed.

## Remaining findings from code review

1. **High — duplicate campaign sends under concurrency.** `server/routes/app.ts` checks only Sent before calling sendCampaign. `server/messaging.ts` reads the campaign and later updates Sending without an atomic claim. Two requests or a manual send overlapping a scheduler run can both submit messages. Partial-failure retries also process the full recipient list. Recommended: atomic database claim plus per-recipient idempotency and retry only unsuccessful recipients. This is a code-review finding, not a measured production incident.
2. **High — duplicate transfer confirmation.** `server/routes/app.ts` separately reads Pending, inserts a gift, and updates Confirmed. Concurrent confirmations can both insert gifts; database mutation errors are not checked. Recommended: a database transaction with a unique claim-to-gift reference and a conditional state transition.
3. **High — early delivery callback can be lost.** `server/messaging.ts` persists delivery rows after submitting the entire campaign, while recordDeliveryStatus only updates existing provider IDs. A callback arriving before insertion finds no matching row. Large campaigns increase the exposure. Recommended: durable delivery records before submission and persisted unmatched callbacks for reconciliation.
4. **Medium — incomplete delivery status propagation.** Twilio callbacks update deliveries and campaigns but do not update conversation_messages. Inbox messages may remain marked sent after failure.
5. **Medium — provider requests lack explicit timeouts.** Twilio and Meta sending calls use fetch without AbortSignal deadlines. Campaigns submit recipients sequentially; a stalled provider response can delay completion substantially. Recommended: bounded deadlines, durable background processing, and controlled retries respecting provider limits.
6. **Medium — reporting persistence failures can be ignored.** Campaign delivery/communication insert results and campaign status update results are not checked. A provider submission can succeed while the audit record fails silently.
7. **Medium — rate-limit memory retention.** The start-trial IP map prunes timestamps only on requests from the same IP, never deleting inactive keys. A large variety of IPs can grow the map. Recommended: expiry eviction and a shared limiter for multi-instance deployments.
8. **Performance — large client entry bundle.** The build warns about the main JS bundle size. Review lazy loading of dashboard features and heavy dependencies and measure actual browser loading before setting a performance budget.

## Delivery blockers observed earlier

Production health reported SMS disabled and WhatsApp template church_message pending approval. Local load tests do not resolve those external configuration blockers. No Render/Twilio administrative access or authenticated staging database was available in this session.

## Next validation needed

Use a staging database and test users for authenticated membership, roles, cross-church isolation, finance, campaign concurrency, scheduling and inbox workflows; run browser journeys and a sustained load/soak test against that environment. Verify a small real SMS/WhatsApp delivery test after sender configuration and template approval, then compare provider status with campaign and inbox records.
