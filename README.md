# Desk — ZionDesk church management

ZionDesk is a church management platform: members, giving (Flutterwave + bank transfers), messaging in each member's language, events, a flyer Design Studio, shareable registration/giving links with QR codes, reports, and **Ellen**, the AI assistant. Available in English, Spanish, French, German and Portuguese.

## Run it

```bash
npm install
npm run dev          # web app on http://localhost:5173
npm run server:dev   # API on :8787 (needed once you add backend keys)
```

Without backend keys the app runs in **preview mode** with demo data stored in the browser.

## Backend

Supabase (database, sign-in, storage) · Resend (emails) · Flutterwave (payments) · Render (hosting + scheduled jobs).
Step-by-step setup: [docs/BACKEND_SETUP.md](docs/BACKEND_SETUP.md). Put your keys in `.env` (local) or Render → Environment — see `.env.example`.

## Useful scripts

| Command | What it does |
|---|---|
| `npm run build` | Type-check and build the web app |
| `npm start` | Start the production server (serves the app + API) |
| `npm run i18n:check` | Check every translation exists in all 5 languages |
| `npm run typecheck:server` | Type-check the API server |
| `npm run flw:plans` | Create the monthly Flutterwave plans (run once) |

## Project layout

- `src/` — web app (React + TypeScript + Vite); translations in `src/i18n/locales/<lang>/`
- `server/` — API server for Render (payments, emails, messaging, AI proxy, cron jobs)
- `api/` — AI and trial-email handlers used by the server
- `supabase/migrations/` — database schema and security rules (run in order)
- `render.yaml` — Render blueprint (web service + 2 cron jobs)
