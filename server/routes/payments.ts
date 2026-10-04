/**
 * Flutterwave payments.
 *   POST /api/public/give-online        start an online gift (no login) → { link }
 *   GET  /api/payments/return           Flutterwave redirects here after checkout
 *   POST /api/payments/webhook          Flutterwave webhook (verif-hash) — the source of truth
 *   GET  /api/payments/banks?country=   bank list for payouts (admin/finance)
 *   POST /api/payments/resolve          check an account number → account name (admin)
 *   POST /api/payments/payout-account   connect the church's bank (Flutterwave sub-account) (admin)
 *   POST /api/billing/checkout          subscribe/upgrade a plan (admin)
 * A payment only counts after the server re-verifies it with Flutterwave (amount + currency + status).
 */
import { randomUUID } from 'node:crypto'
import { Router, type Request } from 'express'
import { asEmailLang } from '../../src/emails/strings'
import { db, HttpError, requireCaller, route } from '../db'
import { configured, env } from '../env'
import { createCheckout, createSubaccount, listBanks, resolveAccount, verifyByReference, verifyTransaction } from '../flutterwave'
import { compose, sendEmail } from '../mail'

export const paymentRoutes = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const LOCALE: Record<string, string> = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' }
/** Monthly plan prices (USD) — keep in sync with the pricing page. */
export const PLAN_PRICE: Record<string, number> = { essentials: 8, plus: 19.99, max: 39.99 }
const PLAN_NAME: Record<string, string> = { essentials: 'Essentials', plus: 'Ministry Plus', max: 'Ministry Max' }

const hits = new Map<string, number[]>()
function limit(req: Request, perMinute: number) {
  const key = `${req.path}:${req.ip}`
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  hits.set(key, recent)
  if (recent.length > perMinute) throw new HttpError(429, 'Too many requests — please try again in a minute.')
}

/* ───────── giving ───────── */

paymentRoutes.post(
  '/public/give-online',
  route(async (req, res) => {
    limit(req, 10)
    const b = req.body ?? {}
    const { data: church } = await db().from('churches').select('id, name, slug, currency, funds, logo_url, flw_subaccount_id').eq('slug', str(b.slug, 60)).maybeSingle()
    if (!church) throw new HttpError(404, 'Church not found')
    if (!church.flw_subaccount_id) throw new HttpError(409, 'This church has not connected online giving yet.')
    const amount = Math.round(Number(b.amount) * 100) / 100
    const email = str(b.email).toLowerCase()
    const name = str(b.name, 160)
    if (!(amount >= 1 && amount < 10_000_000)) throw new HttpError(400, 'Invalid amount')
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'A valid email is required for your receipt')
    if (!name) throw new HttpError(400, 'Name is required')
    const fund = (church.funds as string[]).includes(str(b.fund)) ? str(b.fund) : (church.funds as string[])[0] ?? 'Offering'
    const language = asEmailLang(b.language)
    const txRef = `zd-gift-${randomUUID()}`

    const { error } = await db().from('online_payments').insert({ church_id: church.id, kind: 'gift', tx_ref: txRef, amount, currency: church.currency, fund, name, email, phone: str(b.phone, 40), language })
    if (error) throw error
    const link = await createCheckout({
      txRef,
      amount,
      currency: church.currency,
      redirectUrl: `${env.siteUrl}/api/payments/return`,
      customer: { email, name, phone: str(b.phone, 40) },
      title: church.name,
      description: fund,
      logo: church.logo_url ?? undefined,
      meta: { kind: 'gift', church: church.id, fund },
      subaccountId: church.flw_subaccount_id,
    })
    res.json({ link })
  }),
)

/* ───────── completing a payment (redirect + webhook share this) ───────── */

async function complete(ref: { id?: string; txRef?: string }) {
  const tx = ref.id ? await verifyTransaction(ref.id) : await verifyByReference(ref.txRef!)
  const { data: p } = await db().from('online_payments').select('*').eq('tx_ref', tx.tx_ref).maybeSingle()
  if (!p) throw new HttpError(404, 'Unknown payment')
  if (p.status === 'successful') return p // already processed (webhook and redirect both arrive)
  const paid = tx.status === 'successful' && tx.currency === p.currency && Number(tx.amount) >= Number(p.amount)
  if (!paid) {
    await db().from('online_payments').update({ status: tx.status === 'cancelled' ? 'cancelled' : 'failed', flw_transaction_id: tx.id }).eq('id', p.id).eq('status', 'pending')
    return { ...p, status: 'failed' }
  }
  // Claim the row atomically so a parallel webhook/redirect can't record the gift twice.
  const { data: claimed } = await db().from('online_payments').update({ status: 'successful', flw_transaction_id: tx.id, completed_at: new Date().toISOString() }).eq('id', p.id).eq('status', 'pending').select('id')
  if (!claimed?.length) return { ...p, status: 'successful' }

  const { data: church } = await db().from('churches').select('id, name, slug, currency').eq('id', p.church_id).single()
  if (p.kind === 'gift') {
    const { data: member } = await db().from('members').select('id').eq('church_id', p.church_id).ilike('email', p.email).maybeSingle()
    const { data: gift } = await db()
      .from('gifts')
      .insert({ church_id: p.church_id, member_id: member?.id ?? null, donor: p.name, date: new Date().toISOString().slice(0, 10), amount: p.amount, fund: p.fund, method: 'Card' })
      .select('id')
      .single()
    await db().from('online_payments').update({ gift_id: gift?.id }).eq('id', p.id)
    if (configured.email && p.email) {
      const loc = LOCALE[p.language] ?? 'en-US'
      await sendEmail(
        compose('giftReceipt', p.language, p.email, {
          church: church?.name ?? '',
          name: p.name.split(' ')[0],
          amount: new Intl.NumberFormat(loc, { style: 'currency', currency: p.currency }).format(p.amount),
          fund: p.fund ?? '',
          date: new Date().toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' }),
        }),
      ).catch((e) => console.error('[receipt]', e))
    }
  } else {
    const renews = new Date()
    renews.setMonth(renews.getMonth() + 1)
    await db().from('churches').update({ plan: p.plan, plan_status: 'active', plan_renews_at: renews.toISOString(), trial_ends_at: null, flw_subscription_email: p.email }).eq('id', p.church_id)
  }
  return { ...p, status: 'successful', slug: church?.slug }
}

paymentRoutes.get(
  '/payments/return',
  route(async (req, res) => {
    const txRef = str(req.query.tx_ref, 80)
    const id = str(req.query.transaction_id, 40)
    const { data: p } = await db().from('online_payments').select('kind, church_id').eq('tx_ref', txRef).maybeSingle()
    const { data: church } = p ? await db().from('churches').select('slug').eq('id', p.church_id).maybeSingle() : { data: null }
    let ok = false
    if (p && req.query.status !== 'cancelled') {
      try {
        ok = (await complete(id ? { id } : { txRef })).status === 'successful'
      } catch (e) {
        console.error('[payment return]', e)
      }
    }
    if (p?.kind === 'subscription') return res.redirect(`/dashboard/settings?tab=plan&billing=${ok ? 'success' : 'failed'}`)
    res.redirect(`/give/${church?.slug ?? ''}?paid=${ok ? 1 : 0}`)
  }),
)

paymentRoutes.post(
  '/payments/webhook',
  route(async (req, res) => {
    if (!env.flwWebhookHash || req.headers['verif-hash'] !== env.flwWebhookHash) throw new HttpError(401, 'Invalid signature')
    const { event, data } = (req.body ?? {}) as { event?: string; data?: { id?: number; tx_ref?: string; customer?: { email?: string } } }
    if (event === 'charge.completed' && data?.id) {
      await complete({ id: String(data.id) }).catch((e) => console.error('[webhook]', e))
    } else if (event === 'subscription.cancelled' && data?.customer?.email) {
      await db().from('churches').update({ plan_status: 'cancelled' }).eq('flw_subscription_email', data.customer.email.toLowerCase())
    }
    res.json({ ok: true }) // always 200 so Flutterwave doesn't retry forever
  }),
)

/* ───────── church payouts (sub-account) ───────── */

paymentRoutes.get(
  '/payments/banks',
  requireCaller(['admin', 'finance']),
  route(async (req, res) => {
    const country = str(req.query.country, 2).toUpperCase() || 'NG'
    const banks = await listBanks(country)
    res.json(banks.map((b) => ({ code: b.code, name: b.name })).sort((a, b) => a.name.localeCompare(b.name)))
  }),
)

paymentRoutes.post(
  '/payments/resolve',
  requireCaller(['admin']),
  route(async (req, res) => {
    const r = await resolveAccount(str(req.body?.accountNumber, 20), str(req.body?.bankCode, 20))
    res.json({ accountName: r.account_name })
  }),
)

paymentRoutes.post(
  '/payments/payout-account',
  requireCaller(['admin']),
  route(async (req, res) => {
    const b = req.body ?? {}
    const country = str(b.country, 2).toUpperCase()
    const bankCode = str(b.bankCode, 20)
    const accountNumber = str(b.accountNumber, 30).replace(/\s/g, '')
    if (!country || !bankCode || !accountNumber) throw new HttpError(400, 'Country, bank and account number are required')
    const { data: church } = await db().from('churches').select('id, name, email, phone, payout').eq('id', req.caller!.churchId).single()
    const sub = await createSubaccount({ bankCode, accountNumber, businessName: church!.name, email: church!.email || req.caller!.email, phone: church!.phone, country })
    const account = { country, bankCode, bankName: str(b.bankName, 120) || sub.bank_name || '', accountNumber: `••••${accountNumber.slice(-4)}`, accountName: sub.account_name ?? '' }
    await db()
      .from('churches')
      .update({ flw_subaccount_id: sub.subaccount_id, payout_account: account, payout: { ...(church!.payout as object), method: 'ziondesk' } })
      .eq('id', church!.id)
    res.json({ ok: true, account })
  }),
)

/* ───────── plan billing ───────── */

paymentRoutes.post(
  '/billing/checkout',
  requireCaller(['admin']),
  route(async (req, res) => {
    const plan = str(req.body?.plan) as keyof typeof PLAN_PRICE
    if (!PLAN_PRICE[plan]) throw new HttpError(400, 'Unknown plan')
    const planId = env.flwPlans[plan]
    if (!planId) throw new HttpError(503, `Billing for ${PLAN_NAME[plan]} is not set up (FLW_PLAN_${plan.toUpperCase()}).`)
    const { data: church } = await db().from('churches').select('id, name, logo_url').eq('id', req.caller!.churchId).single()
    const { data: prof } = await db().from('profiles').select('full_name, comm_language').eq('id', req.caller!.userId).maybeSingle()
    const txRef = `zd-sub-${randomUUID()}`
    await db().from('online_payments').insert({ church_id: church!.id, kind: 'subscription', tx_ref: txRef, amount: PLAN_PRICE[plan], currency: 'USD', plan, name: prof?.full_name ?? '', email: req.caller!.email, language: prof?.comm_language ?? 'en' })
    const link = await createCheckout({
      txRef,
      amount: PLAN_PRICE[plan],
      currency: 'USD',
      redirectUrl: `${env.siteUrl}/api/payments/return`,
      customer: { email: req.caller!.email, name: prof?.full_name || church!.name },
      title: `ZionDesk ${PLAN_NAME[plan]}`,
      description: church!.name,
      meta: { kind: 'subscription', church: church!.id, plan },
      paymentPlan: planId,
    })
    res.json({ link })
  }),
)
