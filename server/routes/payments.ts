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
import { cancelSubscription, createCheckout, createSubaccount, ensurePaymentPlan, listBanks, listSubscriptions, resolveAccount, verifyByReference, verifyTransaction, type VerifiedTx, activateSubscription } from '../flutterwave'
import { compose, sendEmail } from '../mail'
import { billingCurrency, chargeCurrency, PLAN_PRICES, planPrice, type FlwCurrency } from '../../src/lib/currency'
import type { PlanKey } from '../../src/lib/plans'
import { sendBillingEmail } from '../lifecycle'
import { notifyDesigners } from './design'

export const paymentRoutes = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const LOCALE: Record<string, string> = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' }
/** Monthly plan prices in USD (local prices: src/lib/currency.ts) — keep in sync with the pricing page. */
export const PLAN_PRICE: Record<string, number> = PLAN_PRICES.EUR!
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
    // Collected in the church's currency when Flutterwave supports it, else USD.
    const currency = chargeCurrency(church.currency)

    const { error } = await db().from('online_payments').insert({ church_id: church.id, kind: 'gift', tx_ref: txRef, amount, currency, fund, name, email, phone: str(b.phone, 40), language })
    if (error) throw error
    const link = await createCheckout({
      txRef,
      amount,
      currency,
      redirectUrl: `${env.apiUrl}/api/payments/return`,
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

/** Flutterwave monthly payment plan for a plan in a currency (created on demand, e.g. "ZionDesk Essentials NGN"). */
async function flwPlanId(plan: PlanKey, currency: FlwCurrency) {
  const amount = PLAN_PRICES[currency]![plan]
  return ensurePaymentPlan(`ZionDesk ${PLAN_NAME[plan]}${currency === 'USD' ? '' : ` ${currency}`}`, amount, currency)
}

/** Flutterwave payment-plan id → our plan key (plans are created on demand, so resolve by id). */
async function planKeyFor(planId: string | number | null | undefined, currency: string): Promise<PlanKey | null> {
  if (!planId) return null
  const cur = billingCurrency(currency)
  for (const key of Object.keys(PLAN_PRICE) as PlanKey[]) {
    const id = await flwPlanId(key, cur).catch(() => '')
    if (String(id) === String(planId)) return key
  }
  return null
}

const nextMonth = (from: Date) => {
  const d = new Date(from)
  d.setMonth(d.getMonth() + 1)
  return d
}

/** Automatic monthly charge from Flutterwave: new reference, so match the church by plan + payer email. */
async function recordRenewal(tx: VerifiedTx) {
  const email = (tx.customer?.email ?? '').toLowerCase()
  if (tx.status !== 'successful' || !email) throw new HttpError(404, 'Unknown payment')
  const { data: church } = await db().from('churches').select('id, plan, plan_renews_at').eq('flw_subscription_email', email).maybeSingle()
  if (!church) throw new HttpError(404, 'No church for this subscription')
  // Discounted (promo) plans are per-discount Flutterwave plans, so fall back to the church's plan.
  const plan = (await planKeyFor(tx.plan ?? tx.payment_plan, tx.currency)) ?? (church.plan as PlanKey)
  const { data: promo } = await db().from('promo_redemptions').select('percent_off').eq('church_id', church.id).eq('status', 'active').not('percent_off', 'is', null).maybeSingle()
  const full = PLAN_PRICES[tx.currency as FlwCurrency]?.[plan]
  const price = full && promo?.percent_off ? discounted(full, promo.percent_off, tx.currency) : full
  // Subscriptions started on the older USD plans (FLW_PLAN_*) keep renewing at their original price.
  const legacy = Object.values(env.flwPlans).filter(Boolean).includes(String(tx.plan ?? tx.payment_plan ?? ''))
  if (!legacy && (!price || Number(tx.amount) < price)) throw new HttpError(400, 'Renewal amount mismatch')
  const { error } = await db().from('online_payments').insert({ church_id: church.id, kind: 'subscription', tx_ref: tx.tx_ref, flw_transaction_id: tx.id, amount: tx.amount, currency: tx.currency, plan, email, status: 'successful', completed_at: new Date().toISOString() })
  if (error) return { status: 'successful' } // already recorded (webhook retries)
  const base = church.plan_renews_at && new Date(church.plan_renews_at) > new Date() ? new Date(church.plan_renews_at) : new Date()
  const renews = nextMonth(base)
  await db().from('churches').update({ plan, plan_status: 'active', plan_renews_at: renews.toISOString() }).eq('id', church.id)
  await sendBillingEmail('paymentReceipt', church.id, { email, amount: Number(tx.amount), currency: tx.currency, plan, renews })
  return { status: 'successful' }
}

async function complete(ref: { id?: string; txRef?: string }) {
  const tx = ref.id ? await verifyTransaction(ref.id) : await verifyByReference(ref.txRef!)
  const { data: p } = await db().from('online_payments').select('*').eq('tx_ref', tx.tx_ref).maybeSingle()
  if (!p) return recordRenewal(tx)
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
    const { data: member } = await db().from('members').select('id').eq('church_id', p.church_id).ilike('email', String(p.email).replace(/[\\%_]/g, '\\$&')).maybeSingle()
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
  } else if (p.kind === 'design_request') {
    // Paid extra flyer request → straight to the designers, due 48 hours from now.
    await db().from('design_requests').update({ status: 'Submitted', due_at: new Date(Date.now() + 48 * 3600e3).toISOString() }).eq('id', p.design_request_id).eq('status', 'Awaiting payment')
    await db().from('design_request_messages').insert({ request_id: p.design_request_id, church_id: p.church_id, sender: 'system', text: '__received__' })
    await notifyDesigners(p.design_request_id, '', { name: p.name, email: p.email })
  } else {
    await db()
      .from('churches')
      .update({ plan: p.plan, plan_status: 'active', plan_renews_at: nextMonth(new Date()).toISOString(), trial_ends_at: null, flw_subscription_email: p.email.toLowerCase() })
      .eq('id', p.church_id)
    if (p.promo_code) {
      const { data: r } = await db().from('promo_redemptions').select('id, promo_codes(duration_months)').eq('church_id', p.church_id).eq('status', 'pending').maybeSingle()
      const months = (r?.promo_codes as unknown as { duration_months: number | null } | null)?.duration_months
      const ends = months ? new Date(new Date().setMonth(new Date().getMonth() + months)).toISOString() : null
      if (r) await db().from('promo_redemptions').update({ status: 'active', redeemed_at: new Date().toISOString(), ends_at: ends }).eq('id', r.id)
    }
    // Upgrade / downgrade: stop any older subscription so the church is never billed twice.
    const newPlanId = String(tx.plan ?? tx.payment_plan ?? '')
    for (const s of await listSubscriptions(p.email)) {
      if (s.status === 'active' && String(s.plan) !== newPlanId) await cancelSubscription(s.id).catch((e) => console.error('[cancel old sub]', e))
    }
    await sendBillingEmail('subscriptionConfirmed', p.church_id, { email: p.email, amount: Number(p.amount), currency: p.currency, plan: p.plan, renews: nextMonth(new Date()) })
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
    if (p?.kind === 'subscription') return res.redirect(`${env.siteUrl}/dashboard/settings?tab=plan&billing=${ok ? 'success' : 'failed'}`)
    if (p?.kind === 'design_request') {
      const { data: d } = await db().from('online_payments').select('design_request_id').eq('tx_ref', txRef).maybeSingle()
      return res.redirect(`${env.siteUrl}/dashboard/design?tab=team&request=${d?.design_request_id ?? ''}&paid=${ok ? 1 : 0}`)
    }
    res.redirect(`${env.siteUrl}/give/${church?.slug ?? ''}?paid=${ok ? 1 : 0}`)
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

const ZERO_DECIMAL = new Set(['NGN', 'UGX', 'TZS', 'RWF', 'XOF', 'XAF', 'KES', 'MWK'])
/** Price after a % discount, rounded the way that currency is normally written. */
const discounted = (amount: number, pct: number, currency: string) => {
  const v = amount * (1 - pct / 100)
  return ZERO_DECIMAL.has(currency) ? Math.round(v) : Math.round(v * 100) / 100
}

interface Promo {
  id: string
  code: string
  kind: 'percent' | 'free_days'
  percent_off: number | null
  duration_months: number | null
  free_days: number | null
}

/** Validates a promo code for this church and plan; throws a clear message when it can't be used. */
async function findPromo(raw: string, plan: string, churchId: string): Promise<Promo> {
  const code = raw.trim().toUpperCase()
  const { data: p } = await db().from('promo_codes').select('*').eq('code', code).maybeSingle()
  const now = Date.now()
  if (!p || !p.active || p.kind === 'tracking' || new Date(p.starts_at).getTime() > now) throw new HttpError(404, 'PROMO_INVALID')
  if (p.expires_at && new Date(p.expires_at).getTime() < now) throw new HttpError(410, 'PROMO_EXPIRED')
  if (p.plans?.length && !p.plans.includes(plan)) throw new HttpError(400, 'PROMO_PLAN')
  const { data: used } = await db().from('promo_redemptions').select('id').eq('promo_id', p.id).eq('church_id', churchId).neq('status', 'pending').maybeSingle()
  if (used) throw new HttpError(409, 'PROMO_USED')
  if (p.max_redemptions) {
    const { count } = await db().from('promo_redemptions').select('id', { count: 'exact', head: true }).eq('promo_id', p.id).neq('status', 'pending')
    if ((count ?? 0) >= p.max_redemptions) throw new HttpError(410, 'PROMO_FULL')
  }
  return p as Promo
}

paymentRoutes.post(
  '/billing/promo',
  requireCaller(['admin']),
  route(async (req, res) => {
    limit(req, 20)
    const plan = str(req.body?.plan) as PlanKey
    if (!PLAN_PRICE[plan]) throw new HttpError(400, 'Unknown plan')
    const { data: church } = await db().from('churches').select('id, currency').eq('id', req.caller!.churchId).single()
    const p = await findPromo(str(req.body?.code, 40), plan, church!.id)
    const base = planPrice(plan, church?.currency)
    res.json({
      code: p.code,
      kind: p.kind,
      percentOff: p.percent_off,
      durationMonths: p.duration_months,
      freeDays: p.free_days,
      currency: base.currency,
      price: base.amount,
      discounted: p.kind === 'percent' ? discounted(base.amount, p.percent_off!, base.currency) : 0,
    })
  }),
)

paymentRoutes.post(
  '/billing/checkout',
  requireCaller(['admin']),
  route(async (req, res) => {
    const plan = str(req.body?.plan) as PlanKey
    if (!PLAN_PRICE[plan]) throw new HttpError(400, 'Unknown plan')
    const { data: church } = await db().from('churches').select('id, name, logo_url, currency').eq('id', req.caller!.churchId).single()
    // Billed in the church's currency when we have a local price for it; otherwise USD.
    const base = planPrice(plan, church?.currency)
    const currency = base.currency
    let amount = base.amount
    let planId: string
    const promo = str(req.body?.promo) ? await findPromo(str(req.body.promo), plan, church!.id) : null
    if (promo?.kind === 'free_days') {
      // Free access, no card: the church gets the plan now and subscribes when the free days end.
      const ends = new Date(Date.now() + promo.free_days! * 864e5).toISOString()
      await db().from('promo_redemptions').insert({ promo_id: promo.id, church_id: church!.id, plan, status: 'active', ends_at: ends })
      await db().from('churches').update({ plan, plan_status: 'active', plan_renews_at: ends, trial_ends_at: null }).eq('id', church!.id)
      return res.json({ redeemed: true, until: ends })
    }
    if (promo?.kind === 'percent') {
      amount = discounted(base.amount, promo.percent_off!, currency)
      planId = await ensurePaymentPlan(`ZionDesk ${PLAN_NAME[plan]} ${currency} ${promo.percent_off}% off`, amount, currency)
      await db().from('promo_redemptions').delete().eq('church_id', church!.id).eq('status', 'pending')
      await db().from('promo_redemptions').insert({ promo_id: promo.id, church_id: church!.id, plan, status: 'pending', percent_off: promo.percent_off, currency, amount })
    } else planId = await flwPlanId(plan, currency)
    const { data: prof } = await db().from('profiles').select('full_name, comm_language').eq('id', req.caller!.userId).maybeSingle()
    const txRef = `zd-sub-${randomUUID()}`
    await db().from('online_payments').insert({ church_id: church!.id, kind: 'subscription', tx_ref: txRef, amount, currency, plan, promo_code: promo?.code ?? null, name: prof?.full_name ?? '', email: req.caller!.email, language: prof?.comm_language ?? 'en' })
    const link = await createCheckout({
      txRef,
      amount,
      currency,
      redirectUrl: `${env.apiUrl}/api/payments/return`,
      customer: { email: req.caller!.email, name: prof?.full_name || church!.name },
      title: `ZionDesk ${PLAN_NAME[plan]}`,
      description: church!.name,
      meta: { kind: 'subscription', church: church!.id, plan },
      paymentPlan: planId,
      paymentOptions: 'card', // recurring billing needs a card Flutterwave can charge monthly
    })
    res.json({ link })
  }),
)

/* Cancel: stops future monthly charges; the plan stays active until the paid month ends. */
paymentRoutes.post(
  '/billing/cancel',
  requireCaller(['admin']),
  route(async (req, res) => {
    const { data: church } = await db().from('churches').select('id, flw_subscription_email, plan_renews_at').eq('id', req.caller!.churchId).single()
    if (!church?.flw_subscription_email) throw new HttpError(409, 'There is no active subscription to cancel.')
    for (const s of await listSubscriptions(church.flw_subscription_email)) {
      if (s.status === 'active') await cancelSubscription(s.id)
    }
    await db().from('churches').update({ plan_status: 'cancelled' }).eq('id', church.id)
    res.json({ ok: true, accessUntil: church.plan_renews_at })
  }),
)

/** Auto-renew back on: reactivates the church's cancelled subscription while the paid month is still running. */
paymentRoutes.post(
  '/billing/resume',
  requireCaller(['admin']),
  route(async (req, res) => {
    const { data: church } = await db().from('churches').select('id, plan, currency, plan_status, plan_renews_at, flw_subscription_email').eq('id', req.caller!.churchId).single()
    if (!church?.flw_subscription_email || church.plan_status !== 'cancelled') throw new HttpError(409, 'There is no subscription to turn back on.')
    if (!church.plan_renews_at || new Date(church.plan_renews_at) < new Date()) throw new HttpError(409, 'Your plan has ended — choose a plan to subscribe again.')
    const subs = await listSubscriptions(church.flw_subscription_email)
    if (subs.some((s) => s.status === 'active')) {
      await db().from('churches').update({ plan_status: 'active' }).eq('id', church.id)
      return res.json({ ok: true })
    }
    // The subscription for the church's current plan (fall back to the most recent one).
    const wanted = String(await flwPlanId(church.plan as PlanKey, billingCurrency(church.currency)).catch(() => ''))
    const target = subs.filter((s) => s.status === 'cancelled').sort((a, b) => b.id - a.id).find((s) => String(s.plan) === wanted) ?? subs.filter((s) => s.status === 'cancelled').sort((a, b) => b.id - a.id)[0]
    if (!target) throw new HttpError(409, 'We couldn’t find your subscription — choose a plan to subscribe again.')
    await activateSubscription(target.id)
    await db().from('churches').update({ plan_status: 'active' }).eq('id', church.id)
    res.json({ ok: true })
  }),
)
