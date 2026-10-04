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
import { paymentRoutes } from './routes/payments'
import { authHookRoutes } from './routes/authHook'
import { publicRoutes } from './routes/public'

const app = express()
app.set('trust proxy', 1) // Render sits behind a proxy; needed for per-IP rate limits
app.disable('x-powered-by')

// The auth hook needs the raw body for its signature, so it's mounted before the JSON parser.
app.use('/api/auth', authHookRoutes)
app.use(express.json({ limit: '15mb' })) // AI attachments (images) can be a few MB

app.get('/api/health', (_req, res) => res.json({ ok: true, ...configured }))

/* AI — signed-in users only; usage is recorded server-side. */
app.get('/api/ai', (req, res) => aiHandler(req, res))
app.post(
  '/api/ai',
  ...(admin ? [requireCaller()] : []), // without a database (local preview) the proxy stays open for testing
  route(async (req, res) => {
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
app.post(
  '/api/start-trial',
  route(async (req, res) => {
    if (admin && typeof req.body?.email === 'string') {
      await admin.from('trial_leads').insert({ email: req.body.email.trim().toLowerCase().slice(0, 200), language: asEmailLang(req.body.lang) })
    }
    await startTrial(req, res)
  }),
)

app.use('/api/public', publicRoutes)
app.use('/api', paymentRoutes)
app.use('/api', appRoutes)

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
