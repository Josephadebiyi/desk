# Google Meet troubleshooting and security review — 5 October 2026

Scope: source review of the Express API, authentication, tenant authorization, Supabase migrations, public forms, integrations, browser storage and dependency tree; read-only live API health check. This is not a penetration test. Production database policies, provider dashboards, deployed environment values and authenticated browser behavior were not verified. No secrets were printed or changed. Local changes are not deployed.

## Google Meet findings and repairs

The live API at https://desk-noae.onrender.com/api/health reported Google client credentials present, at commit 9613122. This confirms presence only, not validity or Google Cloud configuration. The exact failure experienced by the user cannot be confirmed without the failing request or a signed-in consent flow.

* Calendar conference creation is asynchronous. The original code required an immediate hangoutLink, which Google does not guarantee, and discarded the resulting error in the browser. The repaired route saves the Calendar event ID before polling, accepts video entry points, polls for completion, and shows actionable errors in the dashboard. See [Google's create-events guide](https://developers.google.com/workspace/calendar/api/guides/create-events).
* Retries previously created duplicate calendar events. The route now uses a stable Google-compatible event ID, recovers insert conflicts, and retrieves already saved Calendar events.
* Any token refresh failure previously deleted the church's connection. Only invalid_grant now clears revoked consent; outages and configuration failures preserve it.
* OAuth connection database writes were unchecked, allowing a false success redirect. Failed connection persistence now redirects to failure.
* Event time zone and start/end ordering are validated. Google requests have a ten-second timeout each. Existing Calendar events are reused; editing a linked ZionDesk event still does not synchronize its schedule into Google Calendar.

Deployment verification:

1. Google Cloud must have the Calendar API enabled on the OAuth client's project.
2. The OAuth client's authorized redirect URI must exactly match https://desk-noae.onrender.com/api/google/callback, unless API_URL changes the API host. This URI differs from Supabase's Google sign-in callback.
3. Ensure the consent screen permits the organizer: test users while the Google OAuth app is in Testing, or an appropriate published/internal configuration. Check requested calendar.events consent. Google Testing consent can expire; reconnect when Google reports invalid_grant.
4. Deploy frontend and API changes, then connect via Settings → Integrations. Save an online event with Google Meet selected and no manual link. Confirm the link appears and saving again does not create another Calendar event.
5. If this still fails, capture the displayed error and the API response, without sharing tokens or authorization headers.

## Security findings

| Priority | Finding | Status |
| --- | --- | --- |
| High, conditional on Meta webhook use | WhatsApp accepted unsigned payloads when WHATSAPP_APP_SECRET was absent, allowing forged inbound messages and delivery status updates. | Fixed: fail closed; Render blueprint now includes the secret. Meta webhook use requires that secret. Live health reported Cloud WhatsApp disabled and Twilio enabled. |
| High for development tooling | npm audit found seven affected packages in Puppeteer's dependency tree, including ZIP symlink traversal and FTP parser denial of service. | Fixed: puppeteer-core upgraded from 24.43.1 to 25.12.0. Installer audit reports zero vulnerabilities. These packages were development dependencies. Promo/browser scripts were not rendered as part of verification. |
| High, requires production verification | API rejects suspended and unconfirmed users, but browser database access uses Supabase RLS helpers that check church membership/role only. A suspended user's still-valid JWT can potentially retain direct database access. | Remaining: verify live policies and enforce suspension/confirmation within RLS permission helpers or revoke access through a coordinated database migration. The current API check alone does not protect direct Supabase calls. |
| Medium | OAuth state is signed and expires, but is not bound to the initiating browser and has no one-time server-side nonce. A disclosed valid state can potentially be used to associate a different Google account before expiry. | Remaining: add persisted single-use OAuth attempts and browser binding/PKCE. Removed the predictable development signing fallback and rejected non-finite expiry values. |
| Medium | AI rate limiting trusts x-forwarded-for directly and uses process-local memory; no per-church spending budget is enforced here. | Remaining: derive trusted caller/IP at the Express boundary and enforce shared user/church quotas. Express deployment authenticates requests; api/ai.ts should not be deployed independently without its authentication wrapper. |
| Low | Public health exposed environment variable names/presence, unknown key names and staff count. | Fixed: removed environment diagnostics and staff count. Capability flags retained because integration settings consume them. |
| Low | Express HTML lacked an explicit anti-framing header. | Fixed: X-Frame-Options DENY. Hostinger hosting needs equivalent headers in its own server configuration. |
| Low | Auth-hook timestamp validation accepted nonnumeric timestamps past the freshness check. A correct HMAC was still required. | Fixed: require a finite numeric timestamp. |

Other observations: the service-role client bypasses RLS, so server ownership checks remain mandatory; inspected Meet and team/staff routes enforce membership or staff access. Google refresh tokens are in a server-only RLS table, with browser grants revoked by migration 0006; verify that migration is applied in production. Tokens are not application-encrypted, so database-level access and backups remain sensitive. Environment files are ignored and not tracked. Public registration/giving forms have input limits and process-local IP limits. CORS allows all ZionDesk subdomains, which should be revisited if any subdomain is delegated to an untrusted party. No enforced Content Security Policy was added; it needs an asset/provider inventory and staged validation.

## Validation

* npm run build: passed; existing missing Ciscela font and bundle-size warnings remain.
* npm run typecheck:server: passed.
* node --import tsx --test tests/google-security.test.ts: mocked API regression tests for pending conferences, saved-event reuse, transient refresh failure, revoked consent and WhatsApp signature rejection. No Google or Supabase network writes are made by these tests.
* Scoped lint (src, server, api, tests): no errors; pre-existing warnings remain. Whole-repository lint also scans pre-existing untracked exported bundles and produces extensive generated-code diagnostics.
* npm install audit after patch: zero known vulnerabilities. Registry audits do not guarantee absence of undisclosed vulnerabilities or fully cover remotely hosted packages such as SheetJS.

Remaining findings require follow-up before treating this app as fully audited for production. Live Google consent and production RLS behavior remain unverified.
