/**
 * Stripe (Lithuanian account) — plan billing and paid extras for churches outside Nigeria (USD).
 * Nigerian churches stay on Paystack (NGN). See server/routes/payments.ts for the routes.
 * - Catalog: one Product per plan, each with a monthly USD Price found by lookup key (created on first use).
 * - Checkout Sessions (hosted) for subscriptions and one-off extras; dynamic payment methods (cards, Apple Pay,
 *   Google Pay, Link…) — payment_method_types is intentionally never set.
 * - Customer Portal for card updates and invoices. Webhooks (signed) drive every state change.
 */
import Stripe from 'stripe'
import { randomBytes } from 'node:crypto'
import { HttpError } from './db'
import { configured, env } from './env'
import { PLAN_PRICES, type BillingCurrency } from '../src/lib/currency'
import type { PlanKey } from '../src/lib/plans'

let client: Stripe | null = null
/** One StripeClient instance (API version pinned by the SDK). Prefer a restricted key (rk_…). */
export function stripe() {
  if (!configured.stripe) throw new HttpError(503, 'Stripe is not configured (STRIPE_SECRET_KEY).')
  client ??= new Stripe(env.stripeSecretKey, { appInfo: { name: 'ZionDesk', url: 'https://ziondesk.com' } })
  return client
}

export const PLAN_NAME: Record<PlanKey, string> = { essentials: 'ZionDesk Essentials', plus: 'ZionDesk Ministry Plus', max: 'ZionDesk Ministry Max' }
/** Stripe charges EUR, GBP and USD (all two-decimal currencies). */
export const toStripeAmount = (amount: number, _currency?: string) => Math.round(amount * 100)
export const fromStripeAmount = (amount: number, _currency?: string) => amount / 100
const lookupKey = (plan: PlanKey, currency: BillingCurrency) => `zd_${plan}_${currency.toLowerCase()}_monthly_${toStripeAmount(PLAN_PRICES[currency][plan])}`

/** Product for a plan (one Product per plan — Stripe best practice; prices per currency hang off it). */
async function productFor(plan: PlanKey): Promise<string> {
  const found = await stripe().products.search({ query: `metadata['zd_plan']:'${plan}' AND active:'true'`, limit: 1 }).catch(() => null)
  if (found?.data[0]) return found.data[0].id
  return (await stripe().products.create({ name: PLAN_NAME[plan], metadata: { zd_plan: plan } }, { idempotencyKey: `zd-product-${plan}` })).id
}

/** Monthly Price for a plan in EUR / GBP / USD, found by lookup key and created the first time. */
const priceCache = new Map<string, string>()
export async function planPriceId(plan: PlanKey, currency: BillingCurrency): Promise<string> {
  const key = lookupKey(plan, currency)
  const cached = priceCache.get(key)
  if (cached) return cached
  const found = await stripe().prices.list({ lookup_keys: [key], active: true, limit: 1 })
  let id = found.data[0]?.id
  if (!id) {
    const price = await stripe().prices.create(
      { product: await productFor(plan), currency: currency.toLowerCase(), unit_amount: toStripeAmount(PLAN_PRICES[currency][plan]), recurring: { interval: 'month' }, lookup_key: key, metadata: { zd_plan: plan } },
      { idempotencyKey: `zd-price-${key}` },
    )
    id = price.id
  }
  priceCache.set(key, id)
  return id
}

/** Our plan key from a Stripe Price (metadata set when we create prices; falls back to the lookup key). */
export function planFromPrice(price: Stripe.Price | string | null | undefined): PlanKey | null {
  if (!price || typeof price === 'string') return null
  const m = price.metadata?.zd_plan ?? price.lookup_key?.match(/^zd_(essentials|plus|max)_/)?.[1]
  return m === 'essentials' || m === 'plus' || m === 'max' ? m : null
}

/** A promo (% off for N months, or forever) as a reusable Stripe coupon. */
export async function promoCoupon(code: string, percentOff: number, months: number | null): Promise<string> {
  const id = `zd-${code}-${percentOff}-${months ?? 'forever'}`.toUpperCase().replace(/[^A-Z0-9_-]/g, '')
  try {
    return (await stripe().coupons.retrieve(id)).id
  } catch {
    const c = await stripe().coupons.create({ id, name: `${code} (${percentOff}% off)`, percent_off: percentOff, duration: months ? 'repeating' : 'forever', ...(months ? { duration_in_months: months } : {}) })
    return c.id
  }
}

/** Stripe customer for a church (reused so invoices and cards stay together). */
export async function customerFor(c: { id: string; name: string; stripe_customer_id?: string | null }, email: string): Promise<string> {
  if (c.stripe_customer_id) return c.stripe_customer_id
  const cust = await stripe().customers.create({ email, name: c.name, metadata: { church: c.id } }, { idempotencyKey: `zd-customer-${c.id}` })
  return cust.id
}

/** Label for comparing checkout flows in the Dashboard (with an 8-letter random suffix). */
export const integrationId = (flow: string) => `zd-${flow}-${Array.from(randomBytes(8), (b) => String.fromCharCode(97 + (b % 26))).join('')}`

/** Period end of a subscription (lives on its items in current API versions). */
export const periodEnd = (s: Stripe.Subscription) => {
  const end = s.items?.data?.[0]?.current_period_end
  return end ? new Date(end * 1000) : null
}

export type { Stripe }
