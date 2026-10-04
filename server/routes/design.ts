/**
 * AI flyers.
 *   GET  /api/design/usage      this month's AI flyers used / limit for the church
 *   POST /api/design/generate   design a flyer with Claude → sanitized SVG (admin, leader)
 * Limits per plan (src/lib/plans.ts): Essentials 7 / month, Ministry Plus 12, Ministry Max unlimited.
 * The flyer is an SVG so every word (names, dates, scripture, any language) is exactly right;
 * the browser turns it into a PNG for download.
 */
import Anthropic from '@anthropic-ai/sdk'
import { Router } from 'express'
import { FLYER_SIZE, flyerLimit, type FlyerFormat } from '../../src/lib/plans'
import { admin, db, HttpError, requireCaller, route } from '../db'
import { configured, env } from '../env'
import { sendEmail } from '../mail'

export const designRoutes = Router()

const LANG_NAME: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese' }
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const caller = admin ? [requireCaller(['admin', 'leader'])] : [] // local preview without a database stays open (dev only)

async function usage(churchId: string) {
  const { data: church } = await db().from('churches').select('plan').eq('id', churchId).single()
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { count } = await db().from('ai_usage').select('id', { count: 'exact', head: true }).eq('church_id', churchId).eq('feature', 'designs').gte('at', start)
  return { used: count ?? 0, limit: flyerLimit(church?.plan ?? 'essentials'), plan: church?.plan ?? 'essentials' }
}

designRoutes.get(
  '/design/usage',
  ...caller,
  route(async (req, res) => {
    if (!req.caller) return res.json({ used: 0, limit: null, plan: 'preview' })
    res.json(await usage(req.caller.churchId))
  }),
)

/** Keeps only safe, self-contained SVG: no scripts, event handlers, external links or embedded HTML. */
export function sanitizeSvg(raw: string): string {
  const m = raw.match(/<svg[\s\S]*<\/svg>/i)
  if (!m) throw new HttpError(502, 'The design could not be created. Please try again.')
  return m[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<(iframe|object|embed|audio|video)[\s\S]*?<\/\1>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(xlink:)?href\s*=\s*("(?!#|data:image\/)[^"]*"|'(?!#|data:image\/)[^']*')/gi, '')
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none')
    .replace(/@import[^;]+;/gi, '')
}

const SYSTEM = `You are a senior graphic designer who creates modern, professional church flyers.
Return ONE complete SVG document and nothing else (no explanation, no markdown fence).

Rules:
- Root: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">.
- Self-contained: no <image>, no external URLs, no <script>, no <foreignObject>, no web fonts.
  Fonts: font-family="'Inter','Helvetica Neue',Arial,sans-serif" for body and "Georgia,'Times New Roman',serif" or bold sans for display.
- Use rich design: gradients, layered geometric shapes, light rays, abstract waves, soft glows, bold typography, clear hierarchy, generous margins (≥ 64px).
- All text must fit inside the canvas — no overflow or overlapping. Break long titles over 2–3 lines with <tspan>. Keep text sizes ≥ 28px.
- Write all wording in {LANG}. Use the event details exactly as given (names, dates, times, places). Don't invent phone numbers, prices or URLs.
- Strong contrast for readability. Tasteful, reverent, joyful — suitable for a church.
- Leave a 220×220 empty, lightly tinted rounded square near a bottom corner only if a QR code is requested.`

designRoutes.post(
  '/design/generate',
  ...caller,
  route(async (req, res) => {
    if (!admin && (process.env.RENDER || process.env.NODE_ENV === 'production')) throw new HttpError(503, 'AI flyers are unavailable until sign-in is configured.')
    if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, 'AI flyers need ANTHROPIC_API_KEY on the server.')
    const b = req.body ?? {}
    const format = (['portrait', 'square', 'story'].includes(b.format) ? b.format : 'portrait') as FlyerFormat
    const { w, h } = FLYER_SIZE[format]
    const lang = LANG_NAME[str(b.language, 5)] ?? 'English'
    const brief = str(b.prompt, 1500)
    const title = str(b.title, 120)
    if (!brief && !title) throw new HttpError(400, 'Describe the flyer or give it a title.')

    // Monthly limit per plan (checked before spending AI credits).
    if (req.caller) {
      const u = await usage(req.caller.churchId)
      if (u.limit !== null && u.used >= u.limit) throw new HttpError(429, `LIMIT:${u.used}:${u.limit}`)
    }

    const details = [
      title && `Title: ${title}`,
      str(b.when) && `Date & time: ${str(b.when)}`,
      str(b.place) && `Place: ${str(b.place)}`,
      str(b.church) && `Church: ${str(b.church)}`,
      str(b.speaker) && `Speaker / ministering: ${str(b.speaker)}`,
      str(b.style) && `Style: ${str(b.style)}`,
      b.qr ? 'Leave space for a QR code.' : '',
      brief && `Brief: ${brief}`,
    ]
      .filter(Boolean)
      .join('\n')

    const client = new Anthropic()
    const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'
    // Streaming: SVG output can be long; .finalMessage() collects it.
    const msg = await client.messages
      .stream({
        model,
        max_tokens: 32000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: SYSTEM.replaceAll('{W}', String(w)).replaceAll('{H}', String(h)).replace('{LANG}', lang),
        messages: [{ role: 'user', content: `Design a ${w}×${h} flyer.\n${details}` }],
      } as never)
      .finalMessage()
    if (msg.stop_reason === 'refusal') throw new HttpError(422, 'This flyer request can’t be designed. Please change the description.')
    if (msg.stop_reason === 'max_tokens') throw new HttpError(502, 'The design was too large. Please try again with a shorter brief.')
    const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
    const svg = sanitizeSvg(text)

    let used: number | null = null
    let limit: number | null = null
    if (req.caller) {
      await db().from('ai_usage').insert({ church_id: req.caller.churchId, user_id: req.caller.userId, feature: 'designs', units: 1, provider: 'claude', model: msg.model, est_cost_usd: 0 })
      const u = await usage(req.caller.churchId)
      used = u.used
      limit = u.limit
    }
    res.json({ svg, width: w, height: h, used, limit })
  }),
)

/* ───────── Ministry Max: tell the design team about requests and messages ───────── */

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

designRoutes.post(
  '/design/requests/:id/notify',
  requireCaller(['admin', 'leader']),
  route(async (req, res) => {
    const { data: r } = await db().from('design_requests').select('*').eq('id', req.params.id).maybeSingle()
    if (!r || r.church_id !== req.caller!.churchId) throw new HttpError(404, 'Request not found')
    const { data: church } = await db().from('churches').select('name, email, phone, plan').eq('id', r.church_id).single()
    if (church?.plan !== 'max') throw new HttpError(403, 'Design-team requests are part of Ministry Max.')
    if (!configured.email) return res.json({ ok: false })
    const message = typeof req.body?.message === 'string' ? req.body.message.slice(0, 4000) : ''
    const brief = Object.entries((r.brief ?? {}) as Record<string, string>)
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`)
      .join('')
    const subject = message ? `New message on "${r.title}" — ${church?.name}` : `New flyer request: "${r.title}" — ${church?.name} (due ${new Date(r.due_at).toUTCString()})`
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">
<h2 style="margin:0 0 8px">${esc(subject)}</h2>
<p><b>Church:</b> ${esc(church?.name)} · ${esc(church?.email)} · ${esc(church?.phone)}<br/><b>Requested by:</b> ${esc(req.caller!.name)} &lt;${esc(req.caller!.email)}&gt;</p>
${message ? `<p style="padding:12px;background:#f4f4f4;border-radius:8px">${esc(message).replace(/\n/g, '<br/>')}</p>` : `<table>${brief}<tr><td style="padding:4px 12px 4px 0;color:#666">Formats</td><td>${esc((r.formats ?? []).join(', '))}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#666">Inspiration</td><td>${(r.inspiration ?? []).length} image(s) attached in ZionDesk</td></tr></table>`}
<p style="color:#666">Reply to this email to answer the church directly. Request ID: ${esc(r.id)}</p></div>`
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    await sendEmail({ to: env.designTeamEmail, subject, html, text, replyTo: req.caller!.email })
    res.json({ ok: true })
  }),
)
