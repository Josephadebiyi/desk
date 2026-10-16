/**
 * Outreach (staff console): branded invitation emails to churches, sent in safe daily batches and tracked.
 *   Staff:  GET  /api/admin/outreach                       contacts + campaigns + stats
 *           POST /api/admin/outreach/contacts              import [{ email, church_name, contact_name, country }]
 *           PATCH/DELETE /api/admin/outreach/contacts/:id  mark replied, notes / remove
 *           POST/PATCH /api/admin/outreach/campaigns(/:id) create / edit a campaign
 *           GET  /api/admin/outreach/campaigns/:id/preview the email as HTML (sample church)
 *           POST /api/admin/outreach/campaigns/:id/test    send it to yourself
 *           POST /api/admin/outreach/campaigns/:id/send    send to an audience (daily cap, never twice)
 *           POST /api/admin/outreach/contacts/:id/personalise   Ellen reads the church website → opening line
 *           POST /api/admin/outreach/personalise           same, for several contacts that have a website
 *   Public: GET  /api/o/:id.gif     open pixel · GET /api/r/:id/:link   click redirect (video | site | signup)
 *           GET|POST /api/outreach/unsubscribe/:id      one-click unsubscribe
 */
import { Router, type NextFunction, type Request, type Response } from 'express'
import { db, HttpError, requireUser, route } from '../db'
import { configured, env } from '../env'
import { sendEmail, sendEmails, type Outgoing } from '../mail'
import { personalNote } from '../outreachResearch'

export const outreachRoutes = Router()

const staff = [
  requireUser(),
  (req: Request, _res: Response, next: NextFunction) => (env.adminEmails.includes(req.caller!.email.toLowerCase()) ? next() : next(new HttpError(403, 'Staff only.'))),
]
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/
/** Safe daily volume for cold outreach from the main domain (configurable). */
const DAILY_CAP = Number(process.env.OUTREACH_DAILY_CAP || 60)
const VIDEO_URL = process.env.OUTREACH_VIDEO_URL || 'https://youtu.be/4TxzwhzIyQ8'
const THUMB_URL = process.env.OUTREACH_THUMB_URL || 'https://img.youtube.com/vi/4TxzwhzIyQ8/maxresdefault.jpg'
const SITE = (env.siteUrl.includes('localhost') ? 'https://www.ziondesk.com' : env.siteUrl).replace(/\/$/, '')
const API = env.apiUrl.replace(/\/$/, '')
const missingTables = (e: { code?: string } | null) => e && (e.code === '42P01' || e.code === 'PGRST205')
const needTables = () => new HttpError(503, 'Outreach needs its database tables — run the 0018_outreach SQL in Supabase (SQL editor) first.')

// Status order: a contact only moves forward (opened never goes back to sent, etc.).
const RANK: Record<string, number> = { new: 0, sent: 1, opened: 2, clicked: 3, replied: 4, signed_up: 5 }
const advance = (current: string, next: string) => (current === 'unsubscribed' || current === 'bounced' ? current : (RANK[next] ?? 0) > (RANK[current] ?? 0) ? next : current)

export const TEMPLATES = {
  intro: {
    name: 'Introduction',
    subject: 'A simpler way to run {{church_name}}',
    preview: 'Members, first-timers, giving and announcements in one simple app. Watch the walkthrough.',
    body: `My name is Joseph, and I've been building ZionDesk — a simple app that helps churches keep members, first-timers, giving and announcements in one place, instead of notebooks, spreadsheets and scattered WhatsApp groups.

I made a short walkthrough so you can see exactly how it works:`,
  },
  followup: {
    name: 'Follow-up',
    subject: 'Re: A simpler way to run {{church_name}}',
    preview: 'Just following up — the 8-minute walkthrough of ZionDesk.',
    body: `Just following up on my note last week about ZionDesk. If church admin ever feels heavy — tracking first-timers, offerings or announcements — this short walkthrough shows how ZionDesk makes it simpler:`,
  },
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
/** A web address that ended up in the name column (lists with just email + website). */
const looksLikeSite = (v: string) => !!v && !v.includes('@') && !/\s/.test(v) && /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)
const fill = (s: string, church: string) => s.replaceAll('{{church_name}}', church || 'your church')

interface Campaign {
  id: string
  kind: string
  subject: string
  preview: string
  body: string
  from_name: string
  reply_to: string
  ref_code: string
}
interface Contact {
  id: string
  email: string
  church_name: string
  contact_name: string
  status: string
  personal_note?: string
}

/** The branded email for one church. `sendId` adds tracking (pixel, click links, unsubscribe); without it, plain links. */
export function outreachEmail(c: Campaign, church: string, sendId?: string, note = ''): Pick<Outgoing, 'subject' | 'html' | 'text' | 'headers'> {
  if (looksLikeSite(church)) church = ''
  const ref = c.ref_code || 'CHURCHMAIL'
  const direct = { video: VIDEO_URL, site: `${SITE}/?ref=${ref}`, signup: `${SITE}/register?ref=${ref}` }
  const link = (k: keyof typeof direct) => (sendId ? `${API}/api/r/${sendId}/${k}` : direct[k])
  const unsub = sendId ? `${API}/api/outreach/unsubscribe/${sendId}` : `${SITE}`
  // Ellen's personal opening (from the church website) leads, then the campaign message.
  const opening = c.kind === 'followup' ? note.trim() : `Grace and peace to you.${note.trim() ? ` ${note.trim()}` : ''}`
  const paras = [opening, ...fill(c.body, church).split(/\n\s*\n/).map((p) => p.trim())].filter(Boolean)
  // No church name (e.g. the list had only emails): a warm, general greeting instead of a blank.
  const greet = church ? `Dear ${church} team,` : 'Dear Pastor and church family,'
  const bullet = (b: string, rest: string) => `<tr><td style="padding:6px 20px;font-size:15px;line-height:1.5;"><b style="color:#6c34ff;">&#10003;</b>&nbsp; <b>${b}</b> ${rest}</td></tr>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f4f1ea;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(fill(c.preview, church))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:22px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#111015;">
<tr><td style="padding:28px 32px 8px;"><a href="${link('site')}"><img src="${SITE}/brand/logo-color.png" width="132" alt="ZionDesk" style="display:block;border:0;width:132px;height:auto;"></a></td></tr>
<tr><td style="padding:12px 32px 0;font-size:16px;line-height:1.6;"><p style="margin:0 0 14px;">${esc(greet)}</p>${paras.map((p) => `<p style="margin:0 0 14px;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</td></tr>
<tr><td style="padding:4px 32px 0;"><a href="${link('video')}" style="display:block;text-decoration:none;"><img src="${THUMB_URL}" width="536" alt="Watch the ZionDesk walkthrough" style="display:block;width:100%;height:auto;border:0;border-radius:16px;"></a>
<p style="margin:10px 0 0;font-size:14px;text-align:center;"><a href="${link('video')}" style="color:#6c34ff;font-weight:bold;text-decoration:none;">&#9654; Watch the walkthrough</a></p></td></tr>
${c.kind === 'followup' ? '' : `<tr><td style="padding:24px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ff;border-radius:16px;">
<tr><td style="height:12px"></td></tr>${bullet('Members &amp; first-timers', '— follow-ups so no visitor slips away')}${bullet('Sunday check-in', 'with a QR code — no paper register')}${bullet('Tithes &amp; offerings', 'recorded properly, in your currency')}${bullet('SMS, WhatsApp &amp; email', 'to the whole church, a department or a branch')}${bullet('Flyers in minutes,', 'branch reports and an AI assistant')}<tr><td style="height:12px"></td></tr></table></td></tr>`}
<tr><td align="center" style="padding:26px 32px 6px;"><a href="${link('signup')}" style="display:inline-block;background:#6c34ff;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;padding:15px 30px;border-radius:999px;">Start your free trial</a>
<p style="margin:12px 0 0;font-size:13px;color:#6b6876;">Ready in minutes &middot; works on phone &amp; computer &middot; plans from $8.99/month</p></td></tr>
<tr><td style="padding:22px 32px 28px;font-size:16px;line-height:1.6;"><p style="margin:0 0 14px;">If you have any questions, simply reply to this email — I read every message.</p>
<p style="margin:0;">God bless you,<br><b>Joseph</b><br><span style="color:#6b6876;font-size:14px;">ZionDesk &middot; <a href="${link('site')}" style="color:#6c34ff;text-decoration:none;">ziondesk.com</a></span></p></td></tr>
<tr><td style="padding:16px 32px 22px;background:#faf9f6;font-size:12px;line-height:1.5;color:#8a8794;">You’re receiving this note because your church’s contact address is publicly listed. <a href="${unsub}" style="color:#8a8794;">Unsubscribe</a> and we won’t write again.</td></tr>
</table></td></tr></table>${sendId ? `<img src="${API}/api/o/${sendId}.gif" width="1" height="1" alt="" style="display:block;border:0;">` : ''}</body></html>`
  const text = [
    greet,
    ...paras,
    `Watch: ${link('video')}`,
    c.kind === 'followup' ? '' : '- Members & first-timers, with follow-ups\n- Sunday check-in with a QR code\n- Tithes & offerings, in your currency\n- SMS, WhatsApp & email to the church, a department or a branch\n- Flyers, branch reports and an AI assistant',
    `Start your free trial: ${link('signup')}`,
    'If you have any questions, simply reply — I read every message.\n\nGod bless you,\nJoseph\nZionDesk · ziondesk.com',
    `Unsubscribe: ${unsub}`,
  ].filter(Boolean).join('\n\n')
  const headers = sendId ? { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined
  return { subject: fill(c.subject, church), html, text, ...(headers ? { headers } : {}) }
}

/** Emails of people who already have a ZionDesk account (contact signed up), lower-cased. */
async function signedUpEmails(emails: string[]) {
  if (!emails.length) return new Set<string>()
  const lower = [...new Set(emails.map((e) => e.toLowerCase()))]
  const found = new Set<string>()
  for (let i = 0; i < lower.length; i += 200) {
    const chunk = lower.slice(i, i + 200)
    const [{ data: p }, { data: c }] = await Promise.all([db().from('profiles').select('email').in('email', chunk), db().from('churches').select('email').in('email', chunk)])
    for (const r of [...(p ?? []), ...(c ?? [])]) if (r.email) found.add(String(r.email).toLowerCase())
  }
  return found
}

/* ───────── staff ───────── */

outreachRoutes.get(
  '/admin/outreach',
  ...staff,
  route(async (_req, res) => {
    const [{ data: contacts, error }, { data: campaigns }, { data: sends }] = await Promise.all([
      db().from('outreach_contacts').select('*').order('created_at', { ascending: false }).limit(5000),
      db().from('outreach_campaigns').select('*').order('created_at', { ascending: false }),
      db().from('outreach_sends').select('campaign_id, contact_id, status, sent_at, opened_at, clicked_at').limit(20000),
    ])
    if (missingTables(error)) throw needTables()
    if (error) throw new HttpError(500, error.message)
    // Signed up = an account now exists with this email (checked live, then remembered).
    const joined = await signedUpEmails((contacts ?? []).map((c) => c.email))
    const promote = (contacts ?? []).filter((c) => joined.has(c.email.toLowerCase()) && c.status !== 'signed_up' && c.status !== 'unsubscribed')
    if (promote.length) await db().from('outreach_contacts').update({ status: 'signed_up' }).in('id', promote.map((c) => c.id))
    const list = (contacts ?? []).map((c) => (promote.some((p) => p.id === c.id) ? { ...c, status: 'signed_up' } : c))
    const byId = new Map(list.map((c) => [c.id, c]))
    const stats = (campaigns ?? []).map((cp) => {
      const s = (sends ?? []).filter((x) => x.campaign_id === cp.id && x.status === 'sent')
      return { id: cp.id, sent: s.length, opened: s.filter((x) => x.opened_at).length, clicked: s.filter((x) => x.clicked_at).length, signed_up: s.filter((x) => byId.get(x.contact_id)?.status === 'signed_up').length }
    })
    const since = Date.now() - 864e5
    const sentToday = (sends ?? []).filter((x) => x.status !== 'failed' && new Date(x.sent_at).getTime() > since).length
    res.json({ contacts: list, campaigns: campaigns ?? [], stats, dailyCap: DAILY_CAP, sentToday, templates: TEMPLATES, emailReady: configured.email })
  }),
)

/** Import / update contacts. Rows: { email, church_name?, contact_name?, country? }. Unsubscribed contacts stay unsubscribed. */
outreachRoutes.post(
  '/admin/outreach/contacts',
  ...staff,
  route(async (req, res) => {
    const rows = (Array.isArray(req.body?.rows) ? req.body.rows : []).slice(0, 2000)
    const seen = new Set<string>()
    const clean: { email: string; church_name: string; contact_name: string; country: string; website: string }[] = []
    let invalid = 0
    for (const r of rows) {
      const email = str(r?.email, 200).toLowerCase()
      if (!EMAIL.test(email)) { invalid++; continue }
      if (seen.has(email)) continue
      seen.add(email)
      clean.push({ email, church_name: str(r?.church_name, 160), contact_name: str(r?.contact_name, 120), country: str(r?.country, 60), website: str(r?.website, 300) })
    }
    if (!clean.length) throw new HttpError(400, invalid ? 'No valid email addresses found.' : 'Add at least one contact.')
    const { data: existing, error } = await db().from('outreach_contacts').select('id, email').in('email', clean.map((c) => c.email))
    if (missingTables(error)) throw needTables()
    const have = new Map((existing ?? []).map((e) => [e.email.toLowerCase(), e.id]))
    const fresh = clean.filter((c) => !have.has(c.email))
    if (fresh.length) {
      const { error: e2 } = await db().from('outreach_contacts').insert(fresh)
      if (e2) throw new HttpError(400, e2.message)
    }
    let updated = 0
    for (const c of clean.filter((c) => have.has(c.email))) {
      const patch = Object.fromEntries(Object.entries({ church_name: c.church_name, contact_name: c.contact_name, country: c.country, website: c.website }).filter(([, v]) => v))
      if (Object.keys(patch).length) {
        await db().from('outreach_contacts').update(patch).eq('id', have.get(c.email)!)
        updated++
      }
    }
    res.json({ added: fresh.length, updated, invalid, duplicates: rows.length - clean.length - invalid })
  }),
)

outreachRoutes.patch(
  '/admin/outreach/contacts/:id',
  ...staff,
  route(async (req, res) => {
    const patch: Record<string, unknown> = {}
    if (typeof req.body?.notes === 'string') patch.notes = str(req.body.notes, 1000)
    if (typeof req.body?.church_name === 'string') patch.church_name = str(req.body.church_name, 160)
    if (typeof req.body?.website === 'string') patch.website = str(req.body.website, 300)
    if (typeof req.body?.personal_note === 'string') patch.personal_note = str(req.body.personal_note, 600)
    if (req.body?.status === 'replied') Object.assign(patch, { status: 'replied', replied_at: new Date().toISOString() })
    if (req.body?.status === 'unsubscribed') Object.assign(patch, { status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    const { data, error } = await db().from('outreach_contacts').update(patch).eq('id', String(req.params.id)).select('*').single()
    if (error) throw new HttpError(400, error.message)
    res.json({ contact: data })
  }),
)

outreachRoutes.delete(
  '/admin/outreach/contacts/:id',
  ...staff,
  route(async (req, res) => {
    await db().from('outreach_contacts').delete().eq('id', String(req.params.id))
    res.json({ ok: true })
  }),
)

/** Ellen reads one church's website and writes its personal opening (saved for review). */
async function personalise(id: string) {
  const { data: c } = await db().from('outreach_contacts').select('id, church_name, website').eq('id', id).maybeSingle()
  if (!c) throw new HttpError(404, 'Contact not found')
  // Repair imports where the website landed in the name column.
  const misplaced = looksLikeSite(c.church_name)
  const website = c.website || (misplaced ? c.church_name : '')
  if (!website) throw new HttpError(400, 'Add the church’s website first.')
  const r = await personalNote(misplaced ? '' : c.church_name, website)
  // The list may have had only an email + website: Ellen also fills in the church's name from the site.
  const patch: Record<string, string> = { personal_note: r.note, research_summary: r.summary, researched_at: new Date().toISOString() }
  if (misplaced) Object.assign(patch, { website, church_name: '' })
  if ((!c.church_name || misplaced) && r.name) patch.church_name = r.name
  const { data } = await db().from('outreach_contacts').update(patch).eq('id', id).select('*').single()
  return data
}

outreachRoutes.post(
  '/admin/outreach/contacts/:id/personalise',
  ...staff,
  route(async (req, res) => {
    res.json({ contact: await personalise(String(req.params.id)) })
  }),
)

/** Several at once (up to 8 per call, one after another), for contacts with a website and no note yet. */
outreachRoutes.post(
  '/admin/outreach/personalise',
  ...staff,
  route(async (req, res) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).slice(0, 8)
    let q = db().from('outreach_contacts').select('id').or('website.neq.,church_name.like.%.%').eq('personal_note', '').not('status', 'in', '(unsubscribed,bounced,signed_up)').limit(8)
    if (ids.length) q = db().from('outreach_contacts').select('id').in('id', ids)
    const { data, error } = await q
    if (missingTables(error)) throw needTables()
    const done: unknown[] = []
    const failed: { id: string; error: string }[] = []
    for (const r of data ?? []) {
      try {
        done.push(await personalise(r.id))
      } catch (e) {
        failed.push({ id: r.id, error: e instanceof Error ? e.message : 'failed' })
      }
    }
    res.json({ contacts: done, failed })
  }),
)

const campaignInput = (b: Record<string, unknown>) => ({
  name: str(b?.name, 120) || 'Campaign',
  kind: b?.kind === 'followup' ? 'followup' : 'intro',
  subject: str(b?.subject, 200),
  preview: str(b?.preview, 200),
  body: str(b?.body, 6000),
  from_name: str(b?.from_name, 80) || 'Joseph from ZionDesk',
  reply_to: EMAIL.test(str(b?.reply_to, 200)) ? str(b?.reply_to, 200) : '',
  ref_code: (str(b?.ref_code, 32).toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'CHURCHMAIL').padEnd(3, 'X'),
})

outreachRoutes.post(
  '/admin/outreach/campaigns',
  ...staff,
  route(async (req, res) => {
    const c = campaignInput(req.body)
    if (!c.subject || !c.body) throw new HttpError(400, 'Add a subject and a message.')
    const { data, error } = await db().from('outreach_campaigns').insert({ ...c, created_by: req.caller!.email }).select('*').single()
    if (missingTables(error)) throw needTables()
    if (error) throw new HttpError(400, error.message)
    res.json({ campaign: data })
  }),
)

outreachRoutes.patch(
  '/admin/outreach/campaigns/:id',
  ...staff,
  route(async (req, res) => {
    const c = campaignInput(req.body)
    if (!c.subject || !c.body) throw new HttpError(400, 'Add a subject and a message.')
    const { data, error } = await db().from('outreach_campaigns').update(c).eq('id', String(req.params.id)).select('*').single()
    if (error) throw new HttpError(400, error.message)
    res.json({ campaign: data })
  }),
)

async function campaignOf(id: string): Promise<Campaign> {
  const { data, error } = await db().from('outreach_campaigns').select('*').eq('id', id).maybeSingle()
  if (missingTables(error)) throw needTables()
  if (!data) throw new HttpError(404, 'Campaign not found')
  return data as Campaign
}

outreachRoutes.get(
  '/admin/outreach/campaigns/:id/preview',
  ...staff,
  route(async (req, res) => {
    const c = await campaignOf(String(req.params.id))
    const m = outreachEmail(c, str(req.query.church, 160) || 'Grace Chapel', undefined, str(req.query.note, 600))
    res.json({ subject: m.subject, html: m.html })
  }),
)

outreachRoutes.post(
  '/admin/outreach/campaigns/:id/test',
  ...staff,
  route(async (req, res) => {
    if (!configured.email) throw new HttpError(503, 'Email is not configured on the server (RESEND_API_KEY).')
    const c = await campaignOf(String(req.params.id))
    const to = EMAIL.test(str(req.body?.to, 200)) ? str(req.body?.to, 200) : req.caller!.email
    const m = outreachEmail(c, str(req.body?.church, 160) || 'Grace Chapel')
    await sendEmail({ to, ...m, subject: `[TEST] ${m.subject}`, fromName: c.from_name, replyTo: c.reply_to || undefined })
    res.json({ ok: true, to })
  }),
)

const AUDIENCES = ['new', 'not_opened', 'opened_not_clicked', 'all_active', 'selected'] as const

/**
 * Sends a campaign to an audience, within the daily cap. Each contact is claimed first (unique campaign+contact),
 * so a double click or a second staff member can never send the same campaign twice to anyone.
 */
outreachRoutes.post(
  '/admin/outreach/campaigns/:id/send',
  ...staff,
  route(async (req, res) => {
    if (!configured.email) throw new HttpError(503, 'Email is not configured on the server (RESEND_API_KEY).')
    const c = await campaignOf(String(req.params.id))
    const audience = AUDIENCES.includes(req.body?.audience) ? (req.body.audience as (typeof AUDIENCES)[number]) : 'new'
    const want = Math.max(1, Math.min(100, Number(req.body?.limit) || 50))
    const { data: recent } = await db().from('outreach_sends').select('id').neq('status', 'failed').gte('sent_at', new Date(Date.now() - 864e5).toISOString())
    const left = Math.max(0, DAILY_CAP - (recent ?? []).length)
    if (!left) throw new HttpError(429, `Daily limit reached (${DAILY_CAP} in 24 hours). This protects your email reputation — continue tomorrow.`)

    const [{ data: contacts }, { data: already }] = await Promise.all([
      db().from('outreach_contacts').select('id, email, church_name, contact_name, status, personal_note').not('status', 'in', '(unsubscribed,bounced,signed_up)').order('created_at').limit(5000),
      db().from('outreach_sends').select('contact_id').eq('campaign_id', c.id),
    ])
    const done = new Set((already ?? []).map((s) => s.contact_id))
    let pool = ((contacts ?? []) as Contact[]).filter((x) => !done.has(x.id))
    if (audience === 'new') pool = pool.filter((x) => x.status === 'new')
    if (audience === 'not_opened') pool = pool.filter((x) => x.status === 'sent')
    if (audience === 'opened_not_clicked') pool = pool.filter((x) => x.status === 'opened')
    if (audience === 'selected') {
      const ids = new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String))
      pool = pool.filter((x) => ids.has(x.id))
    }
    const batch = pool.slice(0, Math.min(want, left))
    if (!batch.length) return res.json({ sent: 0, failed: 0, left, eligible: 0 })

    // Claim, then send.
    const { data: claimed, error } = await db()
      .from('outreach_sends')
      .upsert(batch.map((x) => ({ campaign_id: c.id, contact_id: x.id })), { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true })
      .select('id, contact_id')
    if (error) throw new HttpError(500, error.message)
    const sendOf = new Map((claimed ?? []).map((s) => [s.contact_id, s.id]))
    const go = batch.filter((x) => sendOf.has(x.id))
    let ids: (string | undefined)[] = []
    let failure = ''
    try {
      ids = await sendEmails(go.map((x) => ({ to: x.email, ...outreachEmail(c, x.church_name, sendOf.get(x.id), x.personal_note ?? ''), fromName: c.from_name, replyTo: c.reply_to || undefined })))
    } catch (e) {
      failure = e instanceof Error ? e.message : 'send failed'
    }
    const now = new Date().toISOString()
    await Promise.all(
      go.map((x, i) =>
        failure
          ? db().from('outreach_sends').update({ status: 'failed', error: failure }).eq('id', sendOf.get(x.id)!)
          : Promise.all([
              db().from('outreach_sends').update({ status: 'sent', provider_id: ids[i] ?? null }).eq('id', sendOf.get(x.id)!),
              db().from('outreach_contacts').update({ status: advance(x.status, 'sent'), last_sent_at: now }).eq('id', x.id),
            ]),
      ),
    )
    if (failure) throw new HttpError(502, failure)
    res.json({ sent: go.length, failed: 0, left: left - go.length, eligible: pool.length - go.length })
  }),
)

/* ───────── public tracking ───────── */

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function track(sendId: string, what: 'opened' | 'clicked') {
  if (!UUID.test(sendId)) return null
  const { data: s } = await db().from('outreach_sends').select('id, contact_id, campaign_id, opened_at, clicked_at').eq('id', sendId).maybeSingle()
  if (!s) return null
  const now = new Date().toISOString()
  const patch: Record<string, string> = {}
  if (!s.opened_at) patch.opened_at = now // a click also proves the email was opened
  if (what === 'clicked' && !s.clicked_at) patch.clicked_at = now
  if (Object.keys(patch).length) await db().from('outreach_sends').update(patch).eq('id', s.id)
  const { data: c } = await db().from('outreach_contacts').select('status, opened_at, clicked_at').eq('id', s.contact_id).maybeSingle()
  if (c) {
    const cp: Record<string, string> = { status: advance(c.status, what) }
    if (!c.opened_at) cp.opened_at = now
    if (what === 'clicked' && !c.clicked_at) cp.clicked_at = now
    await db().from('outreach_contacts').update(cp).eq('id', s.contact_id)
  }
  return s
}

outreachRoutes.get('/o/:file', async (req, res) => {
  const id = String(req.params.file).replace(/\.gif$/, '')
  void track(id, 'opened').catch(() => undefined)
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' }).send(PIXEL)
})

outreachRoutes.get(
  '/r/:id/:link',
  route(async (req, res) => {
    const s = await track(String(req.params.id), 'clicked').catch(() => null)
    let ref = 'CHURCHMAIL'
    if (s) {
      const { data: cp } = await db().from('outreach_campaigns').select('ref_code').eq('id', s.campaign_id).maybeSingle()
      ref = cp?.ref_code || ref
    }
    // Only our own destinations (never an open redirect).
    const to = { video: VIDEO_URL, site: `${SITE}/?ref=${ref}`, signup: `${SITE}/register?ref=${ref}` }[String(req.params.link)] ?? SITE
    res.redirect(302, to)
  }),
)

const unsubPage = (msg: string) =>
  `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><title>ZionDesk</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f1fa;font-family:Arial,Helvetica,sans-serif;color:#111015"><div style="max-width:440px;margin:24px;padding:32px;background:#fff;border-radius:24px"><img src="${SITE}/brand/logo-color.png" alt="ZionDesk" height="32"/><p style="font-size:17px;line-height:1.6;margin:20px 0 0">${msg}</p></div></body></html>`

const unsubscribe = route(async (req, res) => {
  const id = String(req.params.id)
  const { data: s } = UUID.test(id) ? await db().from('outreach_sends').select('contact_id').eq('id', id).maybeSingle() : { data: null }
  if (s) await db().from('outreach_contacts').update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }).eq('id', s.contact_id)
  if (req.method === 'POST') return res.json({ ok: true })
  res.type('html').send(unsubPage(s ? 'You’re unsubscribed. We won’t email you again. God bless!' : 'This link is no longer valid.'))
})
outreachRoutes.get('/outreach/unsubscribe/:id', unsubscribe)
outreachRoutes.post('/outreach/unsubscribe/:id', unsubscribe)
