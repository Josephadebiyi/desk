# ZionDesk backend setup — Supabase + Resend + Render

Everything is already built. You only create the accounts, paste keys, and click deploy.
Until the keys are in, the app keeps running in **preview mode** (demo data in the browser).

| Service | What it does in ZionDesk |
|---|---|
| **Supabase** | Database (all church data), login/sign-up (email + Google), file storage (logos, design inspiration) |
| **Resend** | Every email, in the reader's language (trial, confirmations, password reset, invitations, receipts, birthdays, reminders, messages) |
| **Render** | Hosts the website + API server, runs the hourly/daily jobs |
| **Flutterwave** | Online giving (card, bank transfer, mobile money, USSD) paid out to each church's bank, and monthly plan billing |
| **Anthropic** (Claude) | Ellen's free-form writing, translation, attachments. Ellen still answers church questions without it |
| Twilio *(optional)* | SMS and WhatsApp delivery. Without it those messages stay "Queued" |

---

## 1. Supabase (≈10 min)

1. Create a project at supabase.com (pick the region closest to your churches).
2. **SQL Editor → New query** → paste all of `supabase/migrations/0001_init.sql` → **Run**, then do the same with `0002_flutterwave.sql`.
   This creates every table, the security rules (each church only sees its own data; giving is Admin/Finance only) and the storage buckets.
3. **Project Settings → API Keys** — copy:
   - Project URL → `SUPABASE_URL` and `VITE_SUPABASE_URL`
   - **Publishable key** (`sb_publishable_…`) → `VITE_SUPABASE_ANON_KEY`
   - **Secret key** (`sb_secret_…`) → `SUPABASE_SERVICE_ROLE_KEY` (server only — never in the browser)
   - Use these new keys, not the legacy `anon` / `service_role` JWTs: Supabase retires the legacy keys by the end of 2026. The variable names stay the same.
4. **Authentication → URL Configuration**
   - Site URL: your Render address, e.g. `https://ziondesk.onrender.com` (later your domain)
   - Redirect URLs: add `https://YOUR-DOMAIN/**` and `http://localhost:5173/**`
5. **Authentication → Providers → Google** → enable, paste your Google OAuth Client ID + Secret
   (Google Cloud Console → Credentials → OAuth client → Web; authorized redirect URI = the callback URL Supabase shows).
6. **Authentication → Hooks → Send Email hook** (do this after step 3 of Render, once you have the URL)
   - Type: HTTPS · URL: `https://YOUR-DOMAIN/api/auth/email-hook`
   - Generate the secret → copy the whole value (`v1,whsec_…`) into `SUPABASE_AUTH_HOOK_SECRET`
   - This makes sign-up confirmations and password resets go out through Resend **in each user's language**.

## 2. Resend (≈5 min)

1. Create an account at resend.com → **Domains → Add domain** (e.g. `ziondesk.com`) → add the DNS records it shows → wait for "Verified".
2. **API Keys → Create** → `RESEND_API_KEY`.
3. `EMAIL_FROM` = `ZionDesk <hello@ziondesk.com>` (must use the verified domain). Optional `EMAIL_REPLY_TO`.

## 3. Flutterwave (≈10 min)

1. Create a business account at flutterwave.com and complete KYC (needed for live payments and payouts).
2. **Settings → API keys** → copy the **Secret key** → `FLW_SECRET_KEY` (use the test key first, then the live key).
3. **Settings → Webhooks** → URL `https://YOUR-DOMAIN/api/payments/webhook`, type any long random **Secret hash** → same value in `FLW_WEBHOOK_HASH`. Tick "Receive webhook for successful/failed payments".
4. Create the three monthly plans once: `FLW_SECRET_KEY=… npm run flw:plans` → copy the printed `FLW_PLAN_ESSENTIALS / PLUS / MAX` lines.
5. Optional: `FLW_PLATFORM_FEE` = what ZionDesk keeps from each gift (e.g. `0.02` = 2%). `0` = churches get everything (minus Flutterwave's own fee).

How it works:
- A church admin opens **Giving → Giving page & QR → ZionDesk Payments**, picks country, bank and account number → it becomes a Flutterwave sub-account, so online gifts settle straight to the church.
- Givers on `/give/<church>` choose **Card / online** → Flutterwave secure checkout → back to a thank-you page. The server re-verifies the payment, records the gift (matched to the member by email) and emails a receipt in the giver's language.
- **Settings → Plan** → choosing a plan opens Flutterwave checkout (USD, monthly). The plan switches only after the payment is verified. Plan changes can't be made from the browser.

## 4. Render (≈10 min)

1. Push this project to GitHub.
2. Render → **New → Blueprint** → choose the repo. It reads `render.yaml` and creates:
   - `ziondesk` web service (website + API)
   - `ziondesk-hourly` cron (scheduled messages, event reminders 24h before)
   - `ziondesk-daily` cron (birthday emails)
3. Fill in the environment variables it asks for (list below). `CRON_SECRET` is generated for you; copy the same `SITE_URL` into both cron jobs.
4. Deploy. Check `https://YOUR-DOMAIN/api/health` → `"supabase":true,"email":true`.
5. Optional: Settings → Custom Domain → `app.ziondesk.com`, then update `SITE_URL` and Supabase's Site URL.

## 5. Gemini (optional, ≈3 min)

1. aistudio.google.com → **Get API key** → create a key in a Google Cloud project → `GEMINI_API_KEY`.
2. In that project, **enable billing**. On the free tier Google may use prompts to improve its products — Ellen's prompts contain member details.
3. `GEMINI_MODEL` = `gemini-3.8-flash` (already set in `render.yaml`).
4. Deploy, then in ZionDesk **Settings → AI** tick **Gemini** (it is off by default). Ellen uses Claude first when both are on; pick Gemini in Ellen's model menu to use it directly.

## 6. Keys checklist

| Variable | Where from | Required |
|---|---|---|
| `SITE_URL` | Your Render/custom URL | ✅ |
| `VITE_SUPABASE_URL`, `SUPABASE_URL` | Supabase → API | ✅ |
| `VITE_SUPABASE_ANON_KEY` | Supabase → API (anon) | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API (service_role) | ✅ |
| `SUPABASE_AUTH_HOOK_SECRET` | Supabase → Auth → Hooks | ✅ for localized auth emails |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend | ✅ |
| `ANTHROPIC_API_KEY` | console.anthropic.com | ✅ for Ellen's writing/translation/attachments |
| `FLW_SECRET_KEY`, `FLW_WEBHOOK_HASH` | Flutterwave → Settings | ✅ for online giving & billing |
| `FLW_PLAN_*` | `npm run flw:plans` | ✅ for plan billing |
| `FLW_PLATFORM_FEE` | your choice | optional |
| `GEMINI_API_KEY` | aistudio.google.com → API keys (turn on billing — free-tier prompts are used by Google to improve its products) | optional |
| `GEMINI_MODEL` | `gemini-3.8-flash` (preset in `render.yaml`) | with Gemini |
| `OPENAI_*` | OpenAI | optional |
| `TWILIO_*` | twilio.com | optional (SMS/WhatsApp) |
| Google OAuth Client ID/Secret | Google Cloud Console → entered in **Supabase**, not Render | for "Continue with Google" |

## 7. Run locally with the real backend

```bash
cp .env.example .env   # fill in the values
npm run server:dev     # API on :8787
npm run dev            # app on :5173 (calls the API through the dev proxy)
```

## What happens where

- **Sign-up** → Supabase account (languages saved on the profile) → church created → you're its Administrator. With email confirmation on, the church is created on first sign-in.
- **Language** → saved on the user's profile; follows them to every device. Members each have a communication language; templates, emails, receipts and reminders go out in it.
- **Links & QR codes** → `/join/<church>` and `/give/<church>` work without login; registrations land in Members, bank-transfer notices land in *Bank transfers* for Finance to confirm (the giver then gets a receipt email).
- **Messaging** → saved, then the server sends each member their own language (Email via Resend; SMS/WhatsApp via Twilio if set). Scheduled messages go out from the hourly job.
- **Team** → Settings → Team & roles → invite by email (invitation in the invitee's language); new people set a password from the link.
- **Ellen** → AI calls go through the server with the user's session; usage is recorded per church.

## Not included yet (needs extra accounts later)

- Google Meet links created automatically — needs Google Calendar API access.
- Sermon/YouTube processing for Ellen.
