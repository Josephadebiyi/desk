# Church AI — Engineering Assessment & Architecture

_Repository inspected: `ziondesk-web/` (2026-10-04). ~10k lines across 37 source files._

---

## 1. Stack

| Layer | What exists |
|---|---|
| Framework | React 19 + TypeScript 6, Vite 8 (SPA), React Router 7 |
| UI | Hand-written CSS with design tokens (`src/index.css`, `src/dashboard/dashboard.css`), framer-motion, lucide icons, three.js/R3F (marketing 3D icons) |
| Libraries | `xlsx` (CSV/Excel import/export), `qrcode`, `html-to-image` (flyer PNG export) |
| Server | **One** Vercel-style function: `api/start-trial.ts` (trial welcome email via Resend). No other server code. |
| Version control | **Not a git repository.** |

## 2. How the application is structured

```
src/App.tsx                 marketing site (landing)
src/pages/Auth.tsx          login / 3-step sign-up / forgot password (UI only)
src/lib/auth.ts             auth boundary (stubs + Google Identity Services)
src/lib/trial.ts            trial start client → /api/start-trial
src/dashboard/
  DashboardLayout.tsx       shell: top pill nav, rail, role switch, trial banner
  store.tsx                 MEMBER store (members, comms, giving per member)
  workspace.tsx             WORKSPACE store (settings, events, campaigns, expenses,
                            anon gifts, designs, design requests, team)
  types.ts                  Member/Role/permission helpers (`can.*`)
  kit.tsx                   shared module UI (Modal, Tabs, PlanGate, AudiencePicker…)
  Overview, Members, Giving, Messaging, Events, DesignStudio,
  Assistant, Reports, Settings, Help
```

## 3. Database architecture — **there is none yet**

All data lives in the browser (`localStorage`) behind two React providers:

* `MemberStoreProvider` → key `ziondesk-members-v2`
* `WorkspaceProvider` → keys `ziondesk-{settings,events,campaigns,expenses,anonGifts,designs,requests,team}-v1`

These providers are the **only** data access layer, which is good: every module already reads/writes through them, so they can be swapped for API calls without touching UI.

The production app at `app.ziondesk.com` has its own backend/database, but **that code is not in this repository** and was not available to inspect.

## 4. Reusable functionality (do not duplicate)

| Domain | Existing | Gaps for the agents |
|---|---|---|
| Members | Full CRUD, stages (Newcomer/Convert/Member/Worker), status, branch, department, notes, communication history, giving history, CSV/Excel import/export | No follow-up assignments, prayer requests, anniversaries, families, consent flags |
| Attendance | **Event-level only** (`ChurchEvent.attendance` number) | No per-member check-in, no service-type breakdown |
| Finance | Gifts (per member + anonymous), funds, expenses, net, CSV export, giving page setup | No budgets, no branch finance submissions, no audit trail |
| Events | Calendar, create/edit, audience, Google Meet flag, invited count, attendance | No reminders scheduling engine |
| Communication | Campaigns (SMS/WhatsApp/Email), audiences, templates, scheduling, per-member logging | **No real delivery** (no providers), no delivery status, no opt-outs |
| Departments/workers | Department field on members, settings list | No department leaders, tasks, worker applications |
| Branches | Branch field + settings list | No branch admins, branch reports, branch isolation |
| Design | 6 flyer templates, editor, PNG export, saved designs, design-team requests with brief chat | No brand kit, no versions, no AI generation, no credits |
| Assistant | Rule-based Q&A page | Becomes the seed of Church AI (replace, don't duplicate) |
| Media/sermons | **None** | Whole domain new |
| Public page | **None** | New |
| Automations | **None** | New |

## 5. Authentication / authorization

* **No real authentication.** Login/register are UI with stubs (`NotConnectedError`). Google sign-in is wired to Google Identity Services but needs a client ID and server verification.
* **Roles** exist only client-side: `admin | finance | leader` with helpers in `types.ts` (`can.viewGiving`, `can.editMembers`, `can.deleteMembers`, `can.importExport`). A "Viewing as" switch simulates roles.
* Nothing is enforced server-side because there is no server.

## 6. Multi-tenancy

None. One implicit church per browser. No `churchId` anywhere.

## 7. Storage

No file storage. Uploads (logos, inspiration images) are held in memory or down-scaled to data URLs in `localStorage`.

## 8. Communication integrations

None live. `api/start-trial.ts` can send one email through Resend once `RESEND_API_KEY` is set. SMS/WhatsApp/Push are UI only.

## 9. What needs to be added (by phase)

See §18. Headline: **a real backend** (auth, tenancy, database, storage, job queue) is the prerequisite for production AI. The AI layer below is built so its tools move server-side unchanged.

## 10. Database migrations (target schema — Postgres recommended)

```
churches(id, name, slug, country, currency, plan, settings jsonb, created_at)
branches(id, church_id, name, city, country)
users(id, email, name, auth_provider) / memberships(user_id, church_id, role, branch_id null)
members(id, church_id, branch_id, department_id, full_name, phone, whatsapp, email, gender,
        dob, anniversary, address, stage, status, date_joined, notes, consent jsonb, deleted_at)
departments(id, church_id, name, leader_member_id)
follow_ups(id, church_id, member_id, type, assigned_to, status, due_at, attempts jsonb)
prayer_requests(id, church_id, member_id null, name, contact, body_enc, confidential, status, assigned_to)
events(id, church_id, branch_id, title, starts_at, ends_at, mode, location, meet_url, audience jsonb)
attendance(id, church_id, event_id, member_id null, count null, checked_in_at)
gifts(id, church_id, branch_id, member_id null, amount, fund, method, date)
expenses(id, church_id, branch_id, category, amount, date, note)
branch_reports(id, church_id, branch_id, period, kind, submitted_at)
campaigns(id, church_id, channel, audience jsonb, body, status, scheduled_for)
message_deliveries(id, campaign_id, member_id, status, provider_ref, error)
opt_outs(member_id, channel, at)
brand_kits(church_id, logo_url, colors, fonts, socials jsonb, preferences jsonb)
designs(id, church_id, template, data jsonb, version, parent_id, created_by)
sermons(id, church_id, branch_id, title, speaker, date, series, source, video_url, audio_url,
        transcript jsonb, summary, scriptures text[], topics text[], duration, status)
sermon_chunks(id, sermon_id, start_s, end_s, text, embedding vector(1536))
automations(id, church_id, trigger jsonb, actions jsonb, enabled)
ai_activity(id, church_id, user_id, agent, action, entity, result, approval, at)
ai_usage(id, church_id, user_id, feature, provider, model, tokens_in, tokens_out,
         units, est_cost_usd, at)
ai_limits(plan, feature, monthly_limit, credit_cost)   -- admin-editable
inbox_items(id, church_id, kind, entity, status, snoozed_until)
```
Every table carries `church_id`; use Postgres Row-Level Security keyed on the session's church + branch.

## 11. APIs / integrations required

Auth (email + Google OAuth), Resend/Postmark (email), Termii/Twilio (SMS — Termii for Nigeria), WhatsApp Business Cloud API, Web Push, Google Calendar/Meet API, YouTube Data + Live Streaming API (live detection via webhooks/polling of *connected* channels only), Facebook Graph (where permitted), a payments provider (Paystack/Flutterwave for Africa, Stripe for Europe), object storage (S3/R2), transcription (Whisper-class / Deepgram), LLMs (Claude, Gemini, OpenAI), image generation/editing model, embeddings.

## 12. AI provider architecture (implemented in Phase 1)

`src/ai/providers.ts` — a provider registry with capability tags (`chat`, `vision`, `image`, `transcribe`, `embed`). Users pick **AUTO** (recommended) or a configured provider; AUTO routes per task (reasoning → language model, image → image model, etc.). Provider calls go through **one server proxy** (`/api/ai`) so API keys never reach the browser. A built-in **ZionDesk Local** engine answers from real data with deterministic rules and is always available (offline-friendly, zero cost).

## 13. Media architecture

Connected-channel webhooks (YouTube PubSubHubbub / live-status polling for channels the church authorised) → job queue → fetch authorised recording → audio extraction (ffmpeg) → transcription (timestamps + diarization) → LLM passes (sermon boundaries, title, scriptures, summary, chapters, clip candidates) → store in `sermons` + `sermon_chunks` → human review → publish. Clip rendering via ffmpeg workers (vertical crop, burnt-in subtitles). Nothing publishes without approval or an explicit automation.

## 14. Design-generation architecture

Keep the existing **template engine** (deterministic HTML/CSS → PNG) as the layout layer — it guarantees typography/brand quality. The AI designer is conversational: LLM gathers the brief → picks template + direction → fills structured design JSON (`{template, size, text, colors, font, photo}`) → renders. Chat edits patch that JSON ("make the title smaller" → `title.size -= 1`), giving free version history + undo. Image models are used for backgrounds/photo treatment only, never for text. Inspiration images go to a vision model that returns *characteristics* (palette, type style, layout), never pixels.

## 15. Vector / search architecture

`pgvector` inside Postgres (one database, tenant-filtered by `church_id`). Hybrid search: structured filters (speaker, date, scripture) + vector similarity on `sermon_chunks`. Members/events search stays structured SQL via controlled tools — the LLM never queries the DB directly.

## 16. Usage / credit architecture (implemented in Phase 1, client-side for now)

Every AI tool call records `{feature, provider, model, units, estCost}` to `ai_usage`. Limits are rows in `ai_limits` per plan + feature, **editable by the SaaS admin** (not hard-coded). Each action declares a configurable credit cost. UI shows "34 / 50 designs used · resets 1 Nov".

## 17. Security concerns

1. **Critical:** all data, roles and permission checks are client-side today. Anyone can edit `localStorage` or flip the role switch. Phase 1 builds the tool/permission layer so it can move server-side, but **true enforcement requires the backend**.
2. No tenant isolation; no audit trail before this work.
3. Prayer requests / pastoral notes need encryption at rest + restricted roles.
4. GDPR: consent, export, deletion workflows needed (member export exists; deletion is hard delete without audit).
5. LLM prompt-injection from member-entered text — tools must treat model output as untrusted and re-validate inputs.

## 18. Phases

| Phase | Scope | Depends on |
|---|---|---|
| **1 — AI Foundation** (now) | Provider abstraction, Church AI orchestrator, controlled tools with permission checks, confirmation flow, AI activity log, usage tracking + configurable limits, Church AI home, AI Inbox, Today's Attention, contextual "Ask AI" entry points | — |
| 2 — Core operations | Follow-up records & workflows, prayer requests, per-member attendance, real messaging delivery, opt-outs | Backend |
| 3 — Creative AI | Brand kit, design JSON + chat editing + versions, sizes, credits | Phase 1 |
| 4 — Media AI | Channel connections, live detection, ingestion, transcription, sermon library, sermon AI, repurposing, clips | Backend + workers |
| 5 — Operations intelligence | Branch reports & isolation, departments/leaders, budgets, finance anomaly flags, report generation (PDF) | Backend |
| 6 — Public church page | Public site, live embed, sermons, events, prayer form, giving | Phases 4/5 |
| 7 — Automation | Workflow engine, natural-language rules, cross-agent workflows | Backend jobs |

## 19. Files to modify first (Phase 1)

* **New:** `src/ai/{types,providers,tools,orchestrator,inbox}.ts`, `src/ai/store.tsx`, `src/dashboard/ChurchAI.tsx`, `api/ai.ts`
* **Replace:** `src/dashboard/Assistant.tsx` → Church AI (route `/dashboard/ai`, old route redirects)
* **Extend:** `DashboardLayout.tsx` (provider + nav label), `Settings.tsx` (Church AI tab), `workspace.tsx` (AI settings), Members/Giving/Events/Reports/Design (contextual "Ask AI" buttons only)

## 20. Architectural problems to fix before AI goes to production

1. **No backend / database / auth / tenancy** — the biggest blocker. AI tools that act on church data must run server-side with authenticated, tenant-scoped sessions.
2. Not under version control — initialise git before large changes.
3. Member-level attendance, follow-ups and prayer requests don't exist yet, so several agent capabilities must answer "not tracked yet" rather than guess.
4. Messaging has no delivery layer; "send" is queue-only.
5. Roles are too coarse for the agent model (need media, follow-up, department leader, branch admin, super admin + branch/department scoping).
