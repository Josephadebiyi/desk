/**
 * ZionDesk server (Render Web Service).
 *   • Serves the built web app (dist/) with SPA fallback
 *   • /api/*  — AI proxy, trial emails, public links, messaging, team, giving, auth email hook, cron
 * Start: npm start   (build first: npm run build)
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import aiHandler from '../api/ai'
import startTrial from '../api/start-trial'
import { asEmailLang } from '../src/emails/strings'
import { admin, db, HttpError, requireCaller, route } from './db'
import { configured, env } from './env'
import { runDaily, runHourly } from './jobs'
import { appRoutes } from './routes/app'
import { accountRoutes } from './routes/account'
import { googleRoutes } from './routes/google'
import { adminRoutes } from './routes/admin'
import { paymentRoutes } from './routes/payments'
import { designRoutes } from './routes/design'
import { authHookRoutes } from './routes/authHook'
import { whatsappRoutes } from './routes/whatsapp'
import { publicRoutes } from './routes/public'
import { validUnsubscribe } from './lifecycle'
import { engageRoutes } from './routes/engage'
import { whatsappTemplateCheck } from './messaging'

const app = express()
app.set('trust proxy', 1) // Render sits behind a proxy; needed for per-IP rate limits
app.disable('x-powered-by')
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})

// The auth hook needs the raw body for its signature, so it's mounted before the JSON parser.
// CORS: the website may be hosted elsewhere (e.g. Hostinger) and call this API cross-origin.
// Auth is a Bearer token (no cookies), so only listed origins are allowed to read responses.
const allowedOrigins = new Set(
  [env.siteUrl, env.adminUrl, ...env.corsOrigins, 'https://ziondesk.com', 'http://localhost:5173', 'http://localhost:5181']
    .filter(Boolean)
    .flatMap((o) => {
      try {
        const u = new URL(o)
        const host = u.host.replace(/^www\./, '')
        return [`${u.protocol}//${host}`, `${u.protocol}//www.${host}`, `${u.protocol}//admin.${host}`]
      } catch {
        return []
      }
    }),
)
// Any https://*.ziondesk.com address is ours (main site, admin domain, future subdomains).
const isOurs = (origin: string) => allowedOrigins.has(origin) || /^https:\/\/([a-z0-9-]+\.)?ziondesk\.com$/i.test(origin)
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && isOurs(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-church-id')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && isOurs(origin) ? 204 : 403)
  next()
})

// www.ziondesk.com → ziondesk.com (one canonical address for links, cookies and SEO).
app.use((req, res, next) => {
  if (req.hostname.startsWith('www.')) return res.redirect(301, `https://${req.hostname.slice(4)}${req.originalUrl}`)
  next()
})
// Staff console domain (admin.*): keep it out of search engines.
app.use((req, res, next) => {
  if (req.hostname.startsWith('admin.')) res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  next()
})
// One line per API request in the Render logs (method, path, status, time). No bodies, tokens or query strings.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') || req.path === '/api/health') return next()
  const start = Date.now()
  res.on('finish', () => console.log(`[api] ${req.method} ${req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id')} ${res.statusCode} ${Date.now() - start}ms`))
  next()
})
app.use('/api/auth', authHookRoutes)
app.use('/api/whatsapp', whatsappRoutes) // raw body for signature checks
app.use(express.json({ limit: '15mb' })) // AI attachments (images) can be a few MB

// Which settings are present (names only — never values), plus the deployed commit.
app.get('/api/health', async (_req, res) =>
  res.json({ ok: true, ...configured, whatsappTemplateCheck: await whatsappTemplateCheck(), commit: (process.env.RENDER_GIT_COMMIT ?? '').slice(0, 7) }),
)

/* AI — signed-in users only; usage is recorded server-side. */
app.get('/api/ai', (req, res) => aiHandler(req, res))
app.post(
  '/api/ai',
  ...(admin ? [requireCaller()] : []), // without a database (local preview) the proxy stays open for testing
  route(async (req, res) => {
    // Never run an open AI proxy in production — it would let anyone spend the provider key.
    if (!admin && (process.env.RENDER || process.env.NODE_ENV === 'production')) throw new HttpError(503, 'AI is unavailable until sign-in is configured.')
    let captured: unknown
    const proxy = {
      status(code: number) {
        res.status(code)
        return proxy
      },
      json(body: unknown) {
        captured = body
        res.json(body)
      },
    }
    await aiHandler(req, proxy)
    const usage = (captured as { usage?: { provider: string; model: string; estCostUsd: number } } | undefined)?.usage
    if (usage && req.caller) {
      await db()
        .from('ai_usage')
        .insert({ church_id: req.caller.churchId, user_id: req.caller.userId, feature: 'requests', units: 1, provider: usage.provider, model: usage.model, est_cost_usd: usage.estCostUsd })
    }
  }),
)

/* Marketing-site trial form: store the lead, send the welcome email in the visitor's language. */
const trialHits = new Map<string, number[]>()
app.post(
  '/api/start-trial',
  route(async (req, res) => {
    // Per-IP limit so the form can't be used to spam inboxes from our sending domain.
    const now = Date.now()
    const recent = (trialHits.get(req.ip ?? '') ?? []).filter((t) => now - t < 10 * 60_000)
    if (recent.length >= 5) throw new HttpError(429, 'Too many requests — please try again later.')
    trialHits.set(req.ip ?? '', [...recent, now])
    if (admin && typeof req.body?.email === 'string') {
      await admin.from('trial_leads').insert({ email: req.body.email.trim().toLowerCase().slice(0, 200), language: asEmailLang(req.body.lang) })
    }
    await startTrial(req, res)
  }),
)

app.use('/api/public', publicRoutes)
app.use('/api', paymentRoutes)
app.use('/api', designRoutes)
app.use('/api', appRoutes)
app.use('/api', accountRoutes)
app.use('/api', googleRoutes)
app.use('/api', adminRoutes)
app.use('/api', engageRoutes)

/* Render Cron Jobs call these with Authorization: Bearer $CRON_SECRET */
const cron = (fn: () => Promise<unknown>) =>
  route(async (req, res) => {
    if (!env.cronSecret || req.headers.authorization !== `Bearer ${env.cronSecret}`) throw new HttpError(401, 'Unauthorized')
    res.json(await fn())
  })
// One-click unsubscribe from newsletters and sign-up reminders (link in the email + List-Unsubscribe header).
const unsubscribe = route(async (req, res) => {
  const u = String(req.query.u ?? '')
  const s = String(req.query.s ?? '')
  if (!validUnsubscribe(u, s)) return res.status(400).type('html').send(unsubPage('This unsubscribe link is not valid.'))
  await db().from('profiles').update({ newsletter_opt_out: true }).eq('id', u)
  if (req.method === 'POST') return res.json({ ok: true })
  res.type('html').send(unsubPage('You’re unsubscribed. You won’t get ZionDesk newsletters or reminders any more. Account emails (like receipts and password resets) still arrive.'))
})
const unsubPage = (msg: string) =>
  `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><title>ZionDesk</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f1fa;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#111015"><div style="max-width:440px;margin:24px;padding:32px;background:#fff;border-radius:24px;box-shadow:0 8px 30px rgba(60,30,140,.08)"><img src="${env.siteUrl}/brand/logo-color.png" alt="ZionDesk" height="32"/><p style="font-size:17px;line-height:1.6;margin:20px 0 24px">${msg}</p><a href="${env.siteUrl}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#6c34ff;color:#fff;text-decoration:none;font-weight:600">Go to ZionDesk →</a></div></body></html>`
app.get('/api/email/unsubscribe', unsubscribe)
app.post('/api/email/unsubscribe', unsubscribe)

app.post('/api/cron/hourly', cron(runHourly))
app.post('/api/cron/daily', cron(runDaily))

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')))

/* Web app */
const dist = join(process.cwd(), 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, path) => /assets\//.test(path) && res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') }))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')))
}

/* Errors → JSON (never leak stack traces) */
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next
  const status = err instanceof HttpError ? err.status : 500
  if (status >= 500) console.error('[api]', err)
  res.status(status).json({ error: err instanceof HttpError ? err.message : 'Something went wrong. Please try again.' })
})

app.listen(env.port, () => {
  console.log(`ZionDesk server on :${env.port} — supabase:${configured.supabase} email:${configured.email} sms:${configured.sms} whatsapp:${configured.whatsapp}`)
})
