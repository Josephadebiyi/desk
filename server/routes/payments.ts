/**
 * Flutterwave payments.
 *   POST /api/public/give-online        start an online gift (no login) → { link }
 *   GET  /api/payments/return           Flutterwave redirects here after checkout
 *   POST /api/payments/webhook          Flutterwave webhook (verif-hash) — the source of truth
 *   GET  /api/payments/banks?country=   bank list for payouts (admin/finance)
 *   POST /api/payments/resolve          check an account number → account name (admin)
 *   POST /api/payments/payout-account   connect the church's bank (Flutterwave sub-account) (admin)
 *   POST /api/billing/checkout          subscribe/upgrade a plan (admin)
 *   GET  /api/payments/paystack-return  Paystack redirects here after checkout (plans, design extras)
 *   POST /api/payments/paystack-webhook Paystack webhook (x-paystack-signature) — the source of truth
 *   POST /api/payments/stripe-webhook   Stripe webhook (Stripe-Signature) — the source of truth for Stripe
 *   POST /api/billing/portal            Stripe Customer Portal (card, invoices) (admin)
 * Plan billing and paid extras go through Paystack (NGN for Nigerian churches, USD otherwise); subscriptions
 * started on Flutterwave keep renewing there until they end. Online giving still uses Flutterwave sub-accounts.
 * A payment only counts after the server re-verifies it with the provider (amount + currency + status).
 */
import { randomUUID } from 'node:crypto'
import { Router, type Request } from 'express'
import { asEmailLang } from '../../src/emails/strings'
import { db, HttpError, requireCaller, route } from '../db'
import { configured, env } from '../env'
import { cancelSubscription, createCheckout, createSubaccount, ensurePaymentPlan, listBanks, listSubscriptions, resolveAccount, verifyByReference, verifyTransaction, type VerifiedTx, activateSubscription } from '../flutterwave'
import { compose, sendEmail } from '../mail'
import { AFRICAN_CURRENCIES, billingCurrency, chargeCurrency, PAYSTACK_CURRENCIES, PLAN_PRICES, planPrice, type BillingCurrency, type FlwCurrency } from '../../src/lib/currency'
import * as paystack from '../paystack'
import { customerFor, fromStripeAmount, TAX_CODE_DIGITAL_SERVICE, integrationId, periodEnd, planFromPrice, planPriceId, promoCoupon, stripe, toStripeAmount, type Stripe } from '../stripe'
import type { PlanKey } from '../../src/lib/plans'
import { sendBillingEmail } from '../lifecycle'
import { notifyDesigners } from './design'

export const paymentRoutes = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const LOCALE: Record<string, string> = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' }
/** Monthly plan prices in USD (NGN and reference prices: src/lib/currency.ts) — keep in sync with the pricing page. */
export const PLAN_PRICE: Record<string, number> = PLAN_PRICES.USD!
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
    if (!env.onlineGiving) throw new HttpError(403, 'Online giving isn’t available yet — please use the church’s payment details.')
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
  const amount = PLAN_PRICES[currency as BillingCurrency][plan]
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
  const full = PLAN_PRICES[tx.currency as BillingCurrency]?.[plan]
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
  return fulfil(p, { flw_subscription_email: String(p.email).toLowerCase() }, async () => {
    // Upgrade / downgrade: stop any older subscription so the church is never billed twice.
    const newPlanId = String(tx.plan ?? tx.payment_plan ?? '')
    for (const s of await listSubscriptions(p.email)) {
      if (s.status === 'active' && String(s.plan) !== newPlanId) await cancelSubscription(s.id).catch((e) => console.error('[cancel old sub]', e))
    }
    await stopStripeAndPaystack(p.church_id)
  })
}

/** After a payment is confirmed: record the gift, release the design request, or switch the plan on. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fulfil(p: any, churchBilling: Record<string, unknown>, stopOldSubscriptions: () => Promise<void>) {
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
      .update({ plan: p.plan, plan_status: 'active', plan_renews_at: nextMonth(new Date()).toISOString(), trial_ends_at: null, ...churchBilling })
      .eq('id', p.church_id)
    if (p.promo_code) {
      const { data: r } = await db().from('promo_redemptions').select('id, promo_codes(duration_months)').eq('church_id', p.church_id).eq('status', 'pending').maybeSingle()
      const months = (r?.promo_codes as unknown as { duration_months: number | null } | null)?.duration_months
      const ends = months ? new Date(new Date().setMonth(new Date().getMonth() + months)).toISOString() : null
      if (r) await db().from('promo_redemptions').update({ status: 'active', redeemed_at: new Date().toISOString(), ends_at: ends }).eq('id', r.id)
    }
    await stopOldSubscriptions()
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

/** Moving a church to Flutterwave: end any Stripe or Paystack subscription it had. */
async function stopStripeAndPaystack(churchId: string) {
  const { data: c } = await db().from('churches').select('currency, stripe_subscription_id, paystack_customer_code').eq('id', churchId).single()
  if (c?.stripe_subscription_id && configured.stripe) {
    await stripe().subscriptions.cancel(c.stripe_subscription_id).catch((e) => console.error('[stripe cancel]', e))
    await db().from('churches').update({ stripe_subscription_id: null }).eq('id', churchId)
  }
  if (c?.paystack_customer_code && configured.paystack) {
    const pc = psCurrencyOf(c.currency)
    for (const sub of await paystack.subscriptionsOf(c.paystack_customer_code, pc))
      if (sub.status === 'active' || sub.status === 'attention') await paystack.disableSubscription(sub.subscription_code, sub.email_token, pc).catch((e) => console.error('[paystack disable]', e))
  }
}

/* ───────── Paystack (plans + design extras) ───────── */

/** Paystack monthly plan for a plan in a currency (created on demand, e.g. "ZionDesk Ministry Plus NGN"). */
const psPlanCode = (plan: PlanKey, currency: paystack.PsCurrency) => paystack.ensurePlan(`ZionDesk ${PLAN_NAME[plan]} ${currency}`, PLAN_PRICES[currency][plan], currency)

/**
 * Who bills this church:
 * - African currencies (NGN, GHS, KES, ZAR, UGX, TZS, RWF, XOF, XAF, ZMW) → Flutterwave, in that currency
 *   (Paystack is the alternative for its countries if Flutterwave isn't configured);
 * - EUR / GBP / USD (and everyone else, in USD) → Stripe;
 * - missing providers fall back to whichever is configured.
 */
type Route = { provider: 'flutterwave'; currency: BillingCurrency } | { provider: 'paystack'; currency: paystack.PsCurrency } | { provider: 'stripe'; currency: 'USD' | 'EUR' | 'GBP' }
export function providerFor(churchCurrency: unknown): Route {
  const cur = billingCurrency(churchCurrency)
  const stripeCur = cur === 'EUR' || cur === 'GBP' ? cur : 'USD'
  if (AFRICAN_CURRENCIES.includes(cur)) {
    if (configured.flutterwave) return { provider: 'flutterwave', currency: cur }
    if (PAYSTACK_CURRENCIES.includes(cur) && paystack.canCharge(cur)) return { provider: 'paystack', currency: cur }
    if (configured.stripe) return { provider: 'stripe', currency: 'USD' }
  } else if (configured.stripe) return { provider: 'stripe', currency: stripeCur }
  if (configured.flutterwave) return { provider: 'flutterwave', currency: cur }
  return { provider: 'paystack', currency: cur === 'NGN' ? 'NGN' : 'USD' }
}
/** Paystack account (by currency) that a church's Paystack subscription lives on. */
const psCurrencyOf = (churchCurrency: unknown): string => {
  const cur = billingCurrency(churchCurrency)
  return paystack.canCharge(cur) ? cur : 'NGN'
}

async function psPlanKeyFor(code: string, currency: string): Promise<PlanKey | null> {
  if (!code || !paystack.canCharge(currency)) return null
  for (const key of Object.keys(PLAN_PRICE) as PlanKey[]) if ((await psPlanCode(key, currency).catch(() => '')) === code) return key
  return null
}

/** Stops every other active Paystack subscription of this customer (upgrade/downgrade), and any old Flutterwave one. */
async function stopOtherSubscriptions(churchId: string, customer: string, keepPlanCode: string, currency = 'NGN') {
  if (customer)
    for (const sub of await paystack.subscriptionsOf(customer, currency)) {
      if (['active', 'attention', 'non-renewing'].includes(sub.status) && paystack.subscriptionPlanCode(sub) !== keepPlanCode)
        await paystack.disableSubscription(sub.subscription_code, sub.email_token, currency).catch((e) => console.error('[paystack disable old]', e))
    }
  const { data: c } = await db().from('churches').select('flw_subscription_email').eq('id', churchId).single()
  if (c?.flw_subscription_email && configured.flutterwave) {
    for (const old of await listSubscriptions(c.flw_subscription_email)) if (old.status === 'active') await cancelSubscription(old.id).catch((e) => console.error('[cancel flw sub]', e))
    await db().from('churches').update({ flw_subscription_email: null }).eq('id', churchId)
  }
}

/** Automatic monthly charge from Paystack (new reference): match the church by Paystack customer. */
async function recordPaystackRenewal(tx: paystack.VerifiedTx) {
  const customer = tx.customer?.customer_code ?? ''
  if (tx.status !== 'success' || !customer) throw new HttpError(404, 'Unknown payment')
  const { data: church } = await db().from('churches').select('id, plan, plan_renews_at').eq('paystack_customer_code', customer).maybeSingle()
  if (!church) throw new HttpError(404, 'No church for this subscription')
  const plan = (await psPlanKeyFor(paystack.planCodeOf(tx), tx.currency)) ?? (church.plan as PlanKey)
  const { data: promo } = await db().from('promo_redemptions').select('percent_off').eq('church_id', church.id).eq('status', 'active').not('percent_off', 'is', null).maybeSingle()
  const full = PLAN_PRICES[tx.currency as BillingCurrency]?.[plan]
  const price = full && promo?.percent_off ? discounted(full, promo.percent_off, tx.currency) : full
  const amount = paystack.fromSubunit(tx.amount)
  if (!price || amount < price) throw new HttpError(400, 'Renewal amount mismatch')
  const email = (tx.customer?.email ?? '').toLowerCase()
  const { error } = await db().from('online_payments').insert({ church_id: church.id, kind: 'subscription', provider: 'paystack', tx_ref: tx.reference, paystack_transaction_id: tx.id, amount, currency: tx.currency, plan, email, status: 'successful', completed_at: new Date().toISOString() })
  if (error) return { status: 'successful' } // already recorded (webhook retries)
  const base = church.plan_renews_at && new Date(church.plan_renews_at) > new Date() ? new Date(church.plan_renews_at) : new Date()
  const renews = nextMonth(base)
  await db().from('churches').update({ plan, plan_status: 'active', plan_renews_at: renews.toISOString() }).eq('id', church.id)
  await sendBillingEmail('paymentReceipt', church.id, { email, amount, currency: tx.currency, plan, renews })
  return { status: 'successful' }
}

async function completePaystack(reference: string, currency: string) {
  const tx = await paystack.verifyTransaction(reference, currency)
  const { data: p } = await db().from('online_payments').select('*').eq('tx_ref', tx.reference).maybeSingle()
  if (!p) return recordPaystackRenewal(tx)
  if (p.status === 'successful') return p // webhook and redirect both arrive
  const paid = tx.status === 'success' && tx.currency === p.currency && paystack.fromSubunit(tx.amount) >= Number(p.amount)
  if (!paid) {
    if (['failed', 'abandoned', 'reversed'].includes(tx.status))
      await db().from('online_payments').update({ status: tx.status === 'abandoned' ? 'cancelled' : 'failed', paystack_transaction_id: tx.id }).eq('id', p.id).eq('status', 'pending')
    return { ...p, status: 'failed' }
  }
  const { data: claimed } = await db().from('online_payments').update({ status: 'successful', paystack_transaction_id: tx.id, completed_at: new Date().toISOString() }).eq('id', p.id).eq('status', 'pending').select('id')
  if (!claimed?.length) return { ...p, status: 'successful' }
  const customer = tx.customer?.customer_code ?? ''
  return fulfil(p, customer ? { paystack_customer_code: customer } : {}, async () => {
    if (!customer) return
    await stopOtherSubscriptions(p.church_id, customer, paystack.planCodeOf(tx), tx.currency)
    await rememberSubscription(p.church_id, customer, paystack.planCodeOf(tx), tx.currency)
    // Moving to Paystack: stop any Stripe subscription too.
    const { data: c } = await db().from('churches').select('stripe_subscription_id').eq('id', p.church_id).single()
    if (c?.stripe_subscription_id && configured.stripe) {
      await stripe().subscriptions.cancel(c.stripe_subscription_id).catch((e) => console.error('[stripe cancel]', e))
      await db().from('churches').update({ stripe_subscription_id: null }).eq('id', p.church_id)
    }
  })
}

/** Saves the church's current Paystack subscription (needed to switch auto-renew off/on). It may not exist
 *  for a few seconds after the first charge — the subscription.create webhook fills it in then. */
async function rememberSubscription(churchId: string, customer: string, planCode: string, currency: string) {
  const sub = (await paystack.subscriptionsOf(customer, currency)).find((x) => x.status === 'active' && (!planCode || paystack.subscriptionPlanCode(x) === planCode))
  if (sub) await db().from('churches').update({ paystack_subscription_code: sub.subscription_code, paystack_email_token: sub.email_token }).eq('id', churchId)
}

paymentRoutes.get(
  '/payments/paystack-return',
  route(async (req, res) => {
    const reference = str(req.query.reference ?? req.query.trxref, 100)
    const { data: p } = await db().from('online_payments').select('kind, design_request_id, currency').eq('tx_ref', reference).maybeSingle()
    let ok = false
    if (p) {
      try {
        ok = (await completePaystack(reference, p.currency)).status === 'successful'
      } catch (e) {
        console.error('[paystack return]', e)
      }
    }
    if (p?.kind === 'design_request') return res.redirect(`${env.siteUrl}/dashboard/design?tab=team&request=${p.design_request_id ?? ''}&paid=${ok ? 1 : 0}`)
    res.redirect(`${env.siteUrl}/dashboard/settings?tab=plan&billing=${ok ? 'success' : 'failed'}`)
  }),
)

paymentRoutes.post(
  '/payments/paystack-webhook',
  route(async (req, res) => {
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody
    if (!paystack.validSignature(raw, req.header('x-paystack-signature'))) throw new HttpError(401, 'Invalid signature')
    res.json({ ok: true }) // answer quickly; Paystack retries on non-200
    const { event, data } = (req.body ?? {}) as { event?: string; data?: Record<string, unknown> }
    const customer = ((data?.customer as { customer_code?: string } | undefined)?.customer_code ?? '') as string
    try {
      if (event === 'charge.success' && typeof data?.reference === 'string') await completePaystack(data.reference, String(data.currency ?? 'NGN'))
      else if (event === 'subscription.create' && customer) {
        // Remember the new subscription so auto-renew can be switched off / on later. If it arrives before
        // charge.success linked the customer, find the church from its pending Paystack plan payment.
        const set = { paystack_subscription_code: data!.subscription_code, paystack_email_token: data!.email_token }
        const { data: hit } = await db().from('churches').update(set).eq('paystack_customer_code', customer).select('id')
        const email = String((data!.customer as { email?: string } | undefined)?.email ?? '').toLowerCase()
        if (!hit?.length && email) {
          const { data: pay } = await db().from('online_payments').select('church_id').eq('provider', 'paystack').eq('kind', 'subscription').ilike('email', email).order('created_at', { ascending: false }).limit(1).maybeSingle()
          if (pay) await db().from('churches').update({ ...set, paystack_customer_code: customer }).eq('id', pay.church_id)
        }
      } else if ((event === 'subscription.not_renew' || event === 'subscription.disable') && typeof data?.subscription_code === 'string') {
        await db().from('churches').update({ plan_status: 'cancelled' }).eq('paystack_subscription_code', data.subscription_code).eq('plan_status', 'active')
      } else if (event === 'invoice.payment_failed' && customer) {
        await db().from('churches').update({ plan_status: 'past_due' }).eq('paystack_customer_code', customer).eq('plan_status', 'active')
      }
      console.log(`[paystack] ${event}`)
    } catch (e) {
      console.error('[paystack webhook]', event, e)
    }
  }),
)

/** Starts a Paystack checkout for a one-off ZionDesk charge (design extras) or a plan (with planCode). */
/** Set when Paystack refuses USD (USD not enabled on the account yet): charge naira instead for a while. */
let usdRefusedAt = 0
const usdRefused = () => Date.now() - usdRefusedAt < 60 * 60_000

type CheckoutArgs = { churchId: string; kind: 'subscription' | 'design_request'; amount: number; currency: paystack.PsCurrency; email: string; name: string; plan?: PlanKey; planCode?: string; promoCode?: string | null; designRequestId?: string; language?: string; metadata: Record<string, unknown> }
/**
 * Paystack checkout. `inNaira` gives the naira amount (and plan) for the same purchase: used when the account
 * can't take USD yet, so non-Nigerian churches are charged the naira equivalent and their bank converts.
 */
export async function paystackCheckout(i: CheckoutArgs, inNaira?: () => Promise<{ amount: number; planCode?: string }>): Promise<string> {
  if (i.currency === 'USD' && inNaira && usdRefused()) return paystackCheckout({ ...i, currency: 'NGN', ...(await inNaira()) })
  try {
    return await startPaystackCheckout(i)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (i.currency !== 'USD' || !inNaira || !/currency/i.test(msg)) throw e
    usdRefusedAt = Date.now()
    console.warn('[paystack] USD refused (' + msg + ') — charging the naira equivalent. Enable USD on the Paystack account to bill in dollars.')
    return paystackCheckout({ ...i, currency: 'NGN', ...(await inNaira()) })
  }
}

async function startPaystackCheckout(i: CheckoutArgs) {
  const reference = `zd-${i.kind === 'subscription' ? 'sub' : 'design'}-${randomUUID()}`
  const { error } = await db().from('online_payments').insert({
    church_id: i.churchId, kind: i.kind, provider: 'paystack', tx_ref: reference, amount: i.amount, currency: i.currency, plan: i.plan ?? null,
    promo_code: i.promoCode ?? null, design_request_id: i.designRequestId ?? null, name: i.name, email: i.email, language: i.language ?? 'en',
  })
  if (error) throw error
  return paystack.initialize({
    reference, email: i.email, amount: i.amount, currency: i.currency, plan: i.planCode,
    callbackUrl: `${env.apiUrl}/api/payments/paystack-return`, metadata: { ...i.metadata, kind: i.kind, church: i.churchId },
    // Subscriptions need a card Paystack can charge each month.
    channels: i.planCode ? ['card'] : undefined,
  })
}

/* ───────── Stripe (Europe, UK, US and everywhere Paystack doesn't cover) ───────── */

/** Stops the church's other subscriptions (other Stripe subs, Paystack, Flutterwave) so it's never billed twice. */
async function stopOtherBilling(churchId: string, customer: string, keepSubscription: string) {
  const subs = await stripe().subscriptions.list({ customer, status: 'active', limit: 20 })
  for (const sub of subs.data) if (sub.id !== keepSubscription) await stripe().subscriptions.cancel(sub.id).catch((e) => console.error('[stripe cancel old]', e))
  const { data: c } = await db().from('churches').select('paystack_customer_code, currency').eq('id', churchId).single()
  if (c?.paystack_customer_code && configured.paystack) {
    const pc = psCurrencyOf(c.currency)
    for (const sub of await paystack.subscriptionsOf(c.paystack_customer_code, pc))
      if (sub.status === 'active' || sub.status === 'attention') await paystack.disableSubscription(sub.subscription_code, sub.email_token, pc).catch((e) => console.error('[paystack disable]', e))
  }
  await stopOtherSubscriptions(churchId, '', '').catch(() => undefined) // Flutterwave leftovers (no Paystack customer passed)
}

/** Hosted Stripe Checkout for a plan (mode: subscription) or a one-off extra (mode: payment). */
export async function stripeCheckout(i: { churchId: string; kind: 'subscription' | 'design_request'; currency: BillingCurrency; email: string; name: string; plan?: PlanKey; amount: number; promo?: Promo | null; designRequestId?: string; title?: string; language?: string }) {
  const { data: church } = await db().from('churches').select('id, name, stripe_customer_id').eq('id', i.churchId).single()
  const customer = await customerFor(church!, i.email)
  if (!church!.stripe_customer_id) await db().from('churches').update({ stripe_customer_id: customer }).eq('id', i.churchId)
  const reference = `zd-stripe-${i.kind === 'subscription' ? 'sub' : 'design'}-${randomUUID()}`
  const metadata = { ref: reference, church: i.churchId, kind: i.kind, ...(i.plan ? { plan: i.plan } : {}), ...(i.designRequestId ? { request: i.designRequestId } : {}) }
  const back = i.kind === 'subscription' ? `${env.siteUrl}/dashboard/settings?tab=plan` : `${env.siteUrl}/dashboard/design?tab=team&request=${i.designRequestId ?? ''}`
  const session = await stripe().checkout.sessions.create({
    customer,
    client_reference_id: i.churchId,
    metadata,
    integration_identifier: integrationId(i.kind === 'subscription' ? 'plans' : 'design'),
    ...(i.kind === 'subscription'
      ? {
          mode: 'subscription' as const,
          line_items: [{ price: await planPriceId(i.plan!, i.currency), quantity: 1 }],
          subscription_data: { metadata },
          ...(i.promo?.kind === 'percent' ? { discounts: [{ coupon: await promoCoupon(i.promo.code, i.promo.percent_off!, i.promo.duration_months) }] } : {}),
        }
      : {
          mode: 'payment' as const,
          line_items: [{ quantity: 1, price_data: { currency: i.currency.toLowerCase(), unit_amount: toStripeAmount(i.amount, i.currency), product_data: { name: `Extra flyer request${i.title ? `: ${i.title.slice(0, 80)}` : ''}`, tax_code: TAX_CODE_DIGITAL_SERVICE } } }],
          payment_intent_data: { metadata },
          // No invoice_creation: with Managed Payments Stripe is merchant of record and sends the receipt/invoice itself.
        }),
    // Fulfilment happens in the webhook; these pages only show the result.
    success_url: `${back}${back.includes('?') ? '&' : '?'}${i.kind === 'subscription' ? 'billing=success' : 'paid=1'}`,
    cancel_url: `${back}${back.includes('?') ? '&' : '?'}${i.kind === 'subscription' ? 'billing=failed' : 'paid=0'}`,
  })
  const { error } = await db().from('online_payments').insert({
    church_id: i.churchId, kind: i.kind, provider: 'stripe', tx_ref: reference, stripe_session_id: session.id, amount: i.amount, currency: i.currency,
    plan: i.plan ?? null, promo_code: i.promo?.code ?? null, design_request_id: i.designRequestId ?? null, name: i.name, email: i.email, language: i.language ?? 'en',
  })
  if (error) throw error
  return session.url!
}

/** checkout.session.completed / async_payment_succeeded: activate the plan or release the design request. */
async function completeStripeSession(session: Stripe.Checkout.Session) {
  if (session.payment_status === 'unpaid') return // delayed methods: wait for async_payment_succeeded
  const ref = session.metadata?.ref
  const { data: p } = ref ? await db().from('online_payments').select('*').eq('tx_ref', ref).maybeSingle() : { data: null }
  if (!p || p.status === 'successful') return
  const { data: claimed } = await db().from('online_payments').update({ status: 'successful', completed_at: new Date().toISOString() }).eq('id', p.id).eq('status', 'pending').select('id')
  if (!claimed?.length) return
  const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? ''
  const subscription = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? ''
  await fulfil(p, subscription ? { stripe_customer_id: customer, stripe_subscription_id: subscription } : {}, async () => {
    if (subscription) await stopOtherBilling(p.church_id, customer, subscription)
  })
  if (subscription) {
    // The real renewal date comes from Stripe (fulfil set one month from now).
    const end = periodEnd(await stripe().subscriptions.retrieve(subscription))
    if (end) await db().from('churches').update({ plan_renews_at: end.toISOString() }).eq('id', p.church_id)
  }
}

const subscriptionOfInvoice = (inv: Stripe.Invoice) => {
  const sub = inv.parent?.subscription_details?.subscription
  return typeof sub === 'string' ? sub : sub?.id ?? ''
}

/** Monthly renewal paid (not the first invoice, which checkout.session.completed already handled). */
async function recordStripeRenewal(inv: Stripe.Invoice) {
  if (inv.billing_reason !== 'subscription_cycle') return
  const subId = subscriptionOfInvoice(inv)
  const { data: church } = await db().from('churches').select('id, plan').eq('stripe_subscription_id', subId).maybeSingle()
  if (!church) return
  const sub = await stripe().subscriptions.retrieve(subId)
  const plan = planFromPrice(sub.items.data[0]?.price) ?? (church.plan as PlanKey)
  const renews = periodEnd(sub) ?? nextMonth(new Date())
  const amount = fromStripeAmount(inv.amount_paid, inv.currency)
  const email = (inv.customer_email ?? '').toLowerCase()
  const { error } = await db().from('online_payments').insert({ church_id: church.id, kind: 'subscription', provider: 'stripe', tx_ref: inv.id, amount: amount || 0.01, currency: inv.currency.toUpperCase(), plan, email, status: 'successful', completed_at: new Date().toISOString() })
  if (error) return // webhook retry
  await db().from('churches').update({ plan, plan_status: 'active', plan_renews_at: renews.toISOString() }).eq('id', church.id)
  await sendBillingEmail('paymentReceipt', church.id, { email, amount, currency: inv.currency.toUpperCase(), plan, renews })
}

/** Subscription changed in Stripe (portal, cancel at period end, plan change, failed renewals…). */
async function syncStripeSubscription(sub: Stripe.Subscription, deleted = false) {
  const { data: church } = await db().from('churches').select('id').eq('stripe_subscription_id', sub.id).maybeSingle()
  if (!church) return
  const end = periodEnd(sub)
  const status = deleted || sub.cancel_at_period_end || sub.status === 'canceled' ? 'cancelled' : sub.status === 'active' || sub.status === 'trialing' ? 'active' : sub.status === 'past_due' || sub.status === 'unpaid' ? 'past_due' : null
  const plan = planFromPrice(sub.items.data[0]?.price)
  await db()
    .from('churches')
    .update({ ...(status ? { plan_status: status } : {}), ...(plan ? { plan } : {}), ...(end ? { plan_renews_at: end.toISOString() } : {}) })
    .eq('id', church.id)
}

paymentRoutes.post(
  '/payments/stripe-webhook',
  route(async (req, res) => {
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody
    let event: Stripe.Event
    try {
      if (!env.stripeWebhookSecret || !raw) throw new Error('missing')
      event = stripe().webhooks.constructEvent(raw, req.header('stripe-signature') ?? '', env.stripeWebhookSecret)
    } catch {
      throw new HttpError(400, 'Invalid signature')
    }
    try {
      const o = event.data.object as unknown
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
          await completeStripeSession(o as Stripe.Checkout.Session)
          break
        case 'checkout.session.async_payment_failed':
        case 'checkout.session.expired': {
          const ref = (o as Stripe.Checkout.Session).metadata?.ref
          if (ref) await db().from('online_payments').update({ status: event.type === 'checkout.session.expired' ? 'cancelled' : 'failed' }).eq('tx_ref', ref).eq('status', 'pending')
          break
        }
        case 'invoice.paid':
          await recordStripeRenewal(o as Stripe.Invoice)
          break
        case 'invoice.payment_failed': {
          const subId = subscriptionOfInvoice(o as Stripe.Invoice)
          if (subId) await db().from('churches').update({ plan_status: 'past_due' }).eq('stripe_subscription_id', subId).eq('plan_status', 'active')
          break
        }
        case 'customer.subscription.updated':
          await syncStripeSubscription(o as Stripe.Subscription)
          break
        case 'customer.subscription.deleted':
          await syncStripeSubscription(o as Stripe.Subscription, true)
          break
      }
      console.log(`[stripe] ${event.type}`)
    } catch (e) {
      // Let Stripe retry: it resends on non-2xx for up to 3 days.
      console.error('[stripe webhook]', event.type, e)
      throw new HttpError(500, 'Webhook handling failed')
    }
    res.json({ received: true })
  }),
)

/** Stripe Customer Portal: update the card, see and download invoices, change or cancel the plan. */
paymentRoutes.post(
  '/billing/portal',
  requireCaller(['admin']),
  route(async (req, res) => {
    const { data: church } = await db().from('churches').select('stripe_customer_id').eq('id', req.caller!.churchId).single()
    if (!church?.stripe_customer_id) throw new HttpError(409, 'No card billing account yet — subscribe to a plan first.')
    const session = await stripe().billingPortal.sessions.create({ customer: church.stripe_customer_id, return_url: `${env.siteUrl}/dashboard/settings?tab=plan` })
    res.json({ link: session.url })
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
    const { data: prof } = await db().from('profiles').select('full_name, comm_language').eq('id', req.caller!.userId).maybeSingle()
    const route = providerFor(church?.currency)
    if (route.provider === 'stripe') {
      const cur = route.currency
      if (promo?.kind === 'percent') {
        await db().from('promo_redemptions').delete().eq('church_id', church!.id).eq('status', 'pending')
        await db().from('promo_redemptions').insert({ promo_id: promo.id, church_id: church!.id, plan, status: 'pending', percent_off: promo.percent_off, currency: cur, amount: discounted(PLAN_PRICES[cur][plan], promo.percent_off!, cur) })
      }
      const link = await stripeCheckout({ churchId: church!.id, kind: 'subscription', currency: cur, email: req.caller!.email, name: prof?.full_name ?? '', plan, amount: PLAN_PRICES[cur][plan], promo, language: prof?.comm_language ?? 'en' })
      return res.json({ link })
    }
    if (route.provider === 'paystack') {
      const cur = route.currency
      let psAmount = PLAN_PRICES[cur][plan]
      let planCode = await psPlanCode(plan, cur)
      if (promo?.kind === 'percent') {
        psAmount = discounted(psAmount, promo.percent_off!, cur)
        planCode = await paystack.ensurePlan(`ZionDesk ${PLAN_NAME[plan]} ${cur} ${promo.percent_off}% off`, psAmount, cur)
        await db().from('promo_redemptions').delete().eq('church_id', church!.id).eq('status', 'pending')
        await db().from('promo_redemptions').insert({ promo_id: promo.id, church_id: church!.id, plan, status: 'pending', percent_off: promo.percent_off, currency: cur, amount: psAmount })
      }
      const link = await paystackCheckout(
        {
          churchId: church!.id, kind: 'subscription', amount: psAmount, currency: cur, email: req.caller!.email, name: prof?.full_name ?? '',
          plan, planCode, promoCode: promo?.code ?? null, language: prof?.comm_language ?? 'en', metadata: { plan },
        },
        async () => {
          const ngn = promo?.kind === 'percent' ? discounted(PLAN_PRICES.NGN[plan], promo.percent_off!, 'NGN') : PLAN_PRICES.NGN[plan]
          const code = promo?.kind === 'percent' ? await paystack.ensurePlan(`ZionDesk ${PLAN_NAME[plan]} NGN ${promo.percent_off}% off`, ngn, 'NGN') : await psPlanCode(plan, 'NGN')
          return { amount: ngn, planCode: code }
        },
      )
      return res.json({ link })
    }
    if (promo?.kind === 'percent') {
      amount = discounted(base.amount, promo.percent_off!, currency)
      planId = await ensurePaymentPlan(`ZionDesk ${PLAN_NAME[plan]} ${currency} ${promo.percent_off}% off`, amount, currency)
      await db().from('promo_redemptions').delete().eq('church_id', church!.id).eq('status', 'pending')
      await db().from('promo_redemptions').insert({ promo_id: promo.id, church_id: church!.id, plan, status: 'pending', percent_off: promo.percent_off, currency, amount })
    } else planId = await flwPlanId(plan, currency)
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
    const { data: church } = await db().from('churches').select('id, currency, flw_subscription_email, paystack_customer_code, paystack_subscription_code, paystack_email_token, stripe_subscription_id, plan_renews_at').eq('id', req.caller!.churchId).single()
    if (church?.stripe_subscription_id && configured.stripe) {
      // Stripe: stop renewing at the end of the paid month (access continues until then).
      const sub = await stripe().subscriptions.update(church.stripe_subscription_id, { cancel_at_period_end: true })
      const end = periodEnd(sub)
      await db().from('churches').update({ plan_status: 'cancelled', ...(end ? { plan_renews_at: end.toISOString() } : {}) }).eq('id', church.id)
      return res.json({ ok: true, accessUntil: end?.toISOString() ?? church.plan_renews_at })
    }
    if (!church?.flw_subscription_email && !church?.paystack_customer_code) throw new HttpError(409, 'There is no active subscription to cancel.')
    if (church.paystack_customer_code) {
      // The current subscription (saved from the webhook), else every active one of this customer.
      const pc = psCurrencyOf(church.currency)
      const subs = church.paystack_subscription_code && church.paystack_email_token
        ? [{ subscription_code: church.paystack_subscription_code, email_token: church.paystack_email_token, status: 'active' }]
        : await paystack.subscriptionsOf(church.paystack_customer_code, pc)
      for (const sub of subs) if (sub.status === 'active' || sub.status === 'attention') await paystack.disableSubscription(sub.subscription_code, sub.email_token, pc)
    }
    if (church.flw_subscription_email) {
      for (const s of await listSubscriptions(church.flw_subscription_email)) {
        if (s.status === 'active') await cancelSubscription(s.id)
      }
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
    const { data: church } = await db().from('churches').select('id, plan, currency, plan_status, plan_renews_at, flw_subscription_email, paystack_customer_code, paystack_subscription_code, paystack_email_token, stripe_subscription_id').eq('id', req.caller!.churchId).single()
    if (church?.stripe_subscription_id && configured.stripe && church.plan_status === 'cancelled') {
      const sub = await stripe().subscriptions.retrieve(church.stripe_subscription_id)
      if (sub.status === 'canceled') throw new HttpError(409, 'Your plan has ended — choose a plan to subscribe again.')
      await stripe().subscriptions.update(sub.id, { cancel_at_period_end: false })
      await db().from('churches').update({ plan_status: 'active' }).eq('id', church.id)
      return res.json({ ok: true })
    }
    if ((!church?.flw_subscription_email && !church?.paystack_customer_code) || church.plan_status !== 'cancelled') throw new HttpError(409, 'There is no subscription to turn back on.')
    if (!church.plan_renews_at || new Date(church.plan_renews_at) < new Date()) throw new HttpError(409, 'Your plan has ended — choose a plan to subscribe again.')
    if (church.paystack_customer_code) {
      const pc = psCurrencyOf(church.currency)
      const subs = await paystack.subscriptionsOf(church.paystack_customer_code, pc)
      const wanted = church.paystack_subscription_code
        ? subs.find((x) => x.subscription_code === church.paystack_subscription_code)
        : subs.find((x) => x.status === 'non-renewing' || x.status === 'cancelled')
      if (!wanted) throw new HttpError(409, 'We couldn’t find your subscription — choose a plan to subscribe again.')
      if (wanted.status !== 'active') await paystack.enableSubscription(wanted.subscription_code, wanted.email_token, pc)
      await db().from('churches').update({ plan_status: 'active' }).eq('id', church.id)
      return res.json({ ok: true })
    }
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
