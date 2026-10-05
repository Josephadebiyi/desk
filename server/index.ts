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

const app = express()
app.set('trust proxy', 1) // Render sits behind a proxy; needed for per-IP rate limits
app.disable('x-powered-by')
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})

// The auth hook needs the raw body for its signature, so it's mounted before the JSON parser.
// CORS: the website may be hosted elsewhere (e.g. Hostinger) and call this API cross-origin.
// Auth is a Bearer token (no cookies), so only listed origins are allowed to read responses.
const allowedOrigins = new Set(
  [env.siteUrl, env.adminUrl, ...env.corsOrigins, 'http://localhost:5173', 'http://localhost:5181']
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
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-church-id')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403)
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
app.use('/api/auth', authHookRoutes)
app.use('/api/whatsapp', whatsappRoutes) // raw body for signature checks
app.use(express.json({ limit: '15mb' })) // AI attachments (images) can be a few MB

// Which settings are present (names only — never values), plus the deployed commit.
const ENV_NAMES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_AUTH_HOOK_SECRET', 'RESEND_API_KEY', 'FLW_SECRET_KEY', 'FLUTTERWAVE_SECRET_KEY', 'FLW_PUBLIC_KEY', 'FLW_WEBHOOK_HASH', 'FLUTTERWAVE_WEBHOOK_SECRET_HASH', 'FLUTTERWAVE_BASE_URL', 'ANTHROPIC_API_KEY', 'CRON_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ADMIN_EMAILS', 'ADMIN_URL', 'SITE_URL', 'API_URL', 'CORS_ORIGINS']
app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    ...configured,
    commit: (process.env.RENDER_GIT_COMMIT ?? '').slice(0, 7),
    env: Object.fromEntries(ENV_NAMES.map((k) => [k, Boolean(process.env[k]?.trim())])),
    unknownKeys: Object.keys(process.env).filter((k) => /SUPABASE|FLW|FLUTTER|ANTHROPIC|RESEND|WHATSAPP|GEMINI|GOOGLE|ADMIN/i.test(k) && !ENV_NAMES.includes(k)),
  }),
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

/* Render Cron Jobs call these with Authorization: Bearer $CRON_SECRET */
const cron = (fn: () => Promise<unknown>) =>
  route(async (req, res) => {
    if (!env.cronSecret || req.headers.authorization !== `Bearer ${env.cronSecret}`) throw new HttpError(401, 'Unauthorized')
    res.json(await fn())
  })
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
