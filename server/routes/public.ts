/**
 * Public (no login) endpoints behind the shareable links and QR codes:
 *   GET  /api/public/church/:slug     church name, branches, funds, bank details for giving
 *   POST /api/public/register         member / newcomer / new-convert self-registration
 *   POST /api/public/give-claim       "I've sent my gift" bank-transfer notice
 * Everything is validated here; the database is written with the service role.
 */
import { chargeCurrency } from '../../src/lib/currency'
import { Router, type Request } from 'express'
import { asEmailLang } from '../../src/emails/strings'
import { db, HttpError, route } from '../db'
import { configured, env } from '../env'
import { compose, sendEmail, sendEmails } from '../mail'

export const publicRoutes = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/* Small in-memory rate limit per IP (use a shared store such as Redis when you run several instances). */
const hits = new Map<string, number[]>()
function limit(req: Request, perMinute: number) {
  const key = `${req.path}:${req.ip}`
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  hits.set(key, recent)
  if (recent.length > perMinute) throw new HttpError(429, 'Too many requests — please try again in a minute.')
}

async function churchBySlug(slug: string) {
  const { data } = await db().from('churches').select('id, name, slug, location, currency, branches, departments, funds, payout, logo_url, flw_subaccount_id').eq('slug', slug).maybeSingle()
  if (!data) throw new HttpError(404, 'Church not found')
  return data
}

const money = (n: number, currency: string, lang: string) =>
  new Intl.NumberFormat({ en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' }[lang] ?? 'en-US', { style: 'currency', currency }).format(n)

publicRoutes.get(
  '/church/:slug',
  route(async (req, res) => {
    const c = await churchBySlug(str(req.params.slug, 60))
    const p = (c.payout ?? {}) as Record<string, string>
    res.json({
      name: c.name,
      slug: c.slug,
      location: c.location,
      currency: c.currency,
      // Online card/mobile-money gifts are collected in this currency (USD when Flutterwave can't collect the church's).
      onlineCurrency: chargeCurrency(c.currency),
      branches: c.branches,
      departments: c.departments,
      funds: c.funds,
      logoUrl: c.logo_url,
      // Online giving needs a connected payout account, and the church can switch it off.
      onlineGiving: env.onlineGiving && Boolean(c.flw_subaccount_id) && (p as Record<string, unknown>).online !== false,
      // Only what a giver needs to make a transfer.
      payout: {
        method: p.method ?? 'none',
        bankName: p.bankName ?? '',
        accountName: p.accountName ?? '',
        accountNumber: p.accountNumber ?? '',
        routing: p.routing ?? '',
        instructions: p.instructions ?? '',
        manual: (Array.isArray((p as Record<string, unknown>).manual) ? ((p as Record<string, unknown>).manual as { id: string; type: string; fields: Record<string, string> }[]) : [])
          .slice(0, 12)
          .map((m) => ({ id: String(m.id).slice(0, 40), type: String(m.type).slice(0, 20), fields: Object.fromEntries(Object.entries(m.fields ?? {}).slice(0, 8).map(([k, v]) => [k.slice(0, 30), String(v).slice(0, 120)])) })),
      },
    })
  }),
)

publicRoutes.post(
  '/register',
  route(async (req, res) => {
    limit(req, 10)
    const b = req.body ?? {}
    const church = await churchBySlug(str(b.slug, 60))
    const type = ['member', 'newcomer', 'convert'].includes(b.type) ? (b.type as string) : 'member'
    const fullName = str(b.fullName, 160)
    const email = str(b.email, 200).toLowerCase()
    const phone = str(b.phone, 40)
    const language = asEmailLang(b.language)
    if (!fullName) throw new HttpError(400, 'Name is required')
    if (!email && !phone) throw new HttpError(400, 'Phone or email is required')
    if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Invalid email')
    if (b.consent !== true) throw new HttpError(400, 'Consent is required')
    const dob = /^\d{4}-\d{2}-\d{2}$/.test(str(b.dob)) ? str(b.dob) : null
    const branch = (church.branches as string[]).includes(str(b.branch)) ? str(b.branch) : (church.branches as string[])[0] ?? ''
    const department = type === 'member' && (church.departments as string[]).includes(str(b.department)) ? str(b.department) : ''

    const { data: member, error } = await db()
      .from('members')
      .insert({
        church_id: church.id,
        full_name: fullName,
        phone,
        whatsapp: str(b.whatsapp, 40) || phone,
        email,
        gender: ['Female', 'Male'].includes(b.gender) ? b.gender : '',
        dob,
        address: str(b.address, 300),
        branch,
        department,
        stage: { member: 'Member', newcomer: 'Newcomer', convert: 'Convert' }[type],
        notes: str(b.notes, 2000),
        language,
        source: 'link',
      })
      .select('id')
      .single()
    if (error) throw error
    await db().from('communications').insert({ church_id: church.id, member_id: member.id, channel: 'Note', summary: `__selfreg:${type}:${language}`, by_name: 'ZionDesk' })

    if (email && configured.email) {
      await sendEmail(compose('registered', language, email, { church: church.name, name: fullName.split(' ')[0] })).catch((e) => console.error('[register email]', e))
    }
    res.json({ ok: true })
  }),
)

publicRoutes.post(
  '/give-claim',
  route(async (req, res) => {
    limit(req, 10)
    const b = req.body ?? {}
    const church = await churchBySlug(str(b.slug, 60))
    const name = str(b.name, 160)
    const email = str(b.email, 200).toLowerCase()
    const amount = Math.round(Number(b.amount) * 100) / 100
    const fund = (church.funds as string[]).includes(str(b.fund)) ? str(b.fund) : (church.funds as string[])[0] ?? 'Offering'
    const language = asEmailLang(b.language)
    if (!name) throw new HttpError(400, 'Name is required')
    if (!(amount > 0 && amount < 10_000_000)) throw new HttpError(400, 'Invalid amount')
    if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Invalid email')
    const reference = str(b.reference, 60)

    const { error } = await db().from('transfer_claims').insert({ church_id: church.id, name, email, phone: str(b.phone, 40), amount, fund, reference, language })
    if (error) throw error

    if (configured.email) {
      const mails = []
      if (email) mails.push(compose('claimReceived', language, email, { church: church.name, name: name.split(' ')[0], amount: money(amount, church.currency, language), fund, reference }))
      // Tell the church's Administrators and Finance team, each in their own language.
      const { data: team } = await db().from('church_users').select('user_id, role').eq('church_id', church.id).in('role', ['admin', 'finance'])
      const ids = (team ?? []).map((t) => t.user_id)
      if (ids.length) {
        const { data: people } = await db().from('profiles').select('email, comm_language').in('id', ids)
        for (const p of people ?? []) {
          if (!p.email) continue
          mails.push(compose('claimAlert', p.comm_language, p.email, { name, amount: money(amount, church.currency, p.comm_language), fund, reference }, `${env.siteUrl}/dashboard/links`))
        }
      }
      if (mails.length) await sendEmails(mails).catch((e) => console.error('[claim emails]', e))
    }
    res.json({ ok: true })
  }),
)
