/**
 * Paystack API (https://paystack.com/docs/api) — plan billing and paid extras.
 * - Hosted checkout: POST /transaction/initialize → redirect the payer to data.authorization_url.
 * - Every payment is re-verified server-side (GET /transaction/verify/:reference) before it counts.
 * - Monthly plans: Paystack Plans + Subscriptions (card or Nigerian direct debit). Amounts are in subunits (×100).
 * - Webhooks are signed: x-paystack-signature = HMAC-SHA512(raw body, secret key).
 * - One Paystack business account per country: Nigeria (NGN + USD), Ghana (GHS), Kenya (KES), South Africa (ZAR),
 *   Côte d'Ivoire (XOF). Each call uses the account for the payment's currency.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError } from './db'
import { env } from './env'

const BASE = 'https://api.paystack.co'

export type PsCurrency = 'NGN' | 'USD' | 'GHS' | 'KES' | 'ZAR' | 'XOF'
/** Secret key of the Paystack account that charges this currency (USD goes through the Nigerian account). */
const keyFor = (currency: string) =>
  ({ NGN: env.paystackSecretKey, USD: env.paystackSecretKey, GHS: env.paystackKeys.GH, KES: env.paystackKeys.KE, ZAR: env.paystackKeys.ZA, XOF: env.paystackKeys.CI })[currency] ?? ''
/** True when a Paystack account for this currency is connected. */
export const canCharge = (currency: string): currency is PsCurrency => Boolean(keyFor(currency))
const allKeys = () => [env.paystackSecretKey, ...Object.values(env.paystackKeys)].filter(Boolean)

async function ps<T = Record<string, unknown>>(currency: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = keyFor(currency)
  if (!key) throw new HttpError(503, `Paystack isn't connected for ${currency}.`)
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T }
  if (!res.ok || json.status !== true) throw new HttpError(res.status >= 500 ? 502 : 400, json.message || `Paystack error ${res.status}`)
  return json.data as T
}

/** 8.99 → 899 (kobo / cents). */
export const toSubunit = (amount: number) => Math.round(amount * 100)
export const fromSubunit = (amount: number) => Math.round(amount) / 100

export interface InitInput {
  reference: string
  email: string
  amount: number
  currency: PsCurrency
  callbackUrl: string
  /** Plan code (PLN_…): Paystack then charges the plan's amount and subscribes the customer. */
  plan?: string
  metadata: Record<string, unknown>
  /** Subscriptions need something Paystack can charge again each month. */
  channels?: string[]
}

/** Starts a hosted checkout and returns the URL to send the payer to. */
export async function initialize(i: InitInput): Promise<string> {
  const data = await ps<{ authorization_url: string }>(i.currency, '/transaction/initialize', {
    body: {
      reference: i.reference,
      email: i.email,
      amount: toSubunit(i.amount),
      currency: i.currency,
      callback_url: i.callbackUrl,
      metadata: i.metadata,
      ...(i.plan ? { plan: i.plan } : {}),
      ...(i.channels ? { channels: i.channels } : {}),
    },
  })
  return data.authorization_url
}

export interface VerifiedTx {
  id: number
  reference: string
  status: string // success | failed | abandoned | …
  amount: number // subunits
  currency: string
  customer?: { email?: string; customer_code?: string; id?: number }
  plan?: string | { plan_code?: string } | null
  plan_object?: { plan_code?: string } | null
  metadata?: Record<string, unknown> | string | null
}
export const verifyTransaction = (reference: string, currency: string) => ps<VerifiedTx>(currency, `/transaction/verify/${encodeURIComponent(reference)}`)
export const planCodeOf = (tx: Pick<VerifiedTx, 'plan' | 'plan_object'>) =>
  (typeof tx.plan === 'string' ? tx.plan : tx.plan?.plan_code) || tx.plan_object?.plan_code || ''

/** Finds the monthly plan by name (creating it the first time), so no plan codes need configuring. */
const planCache = new Map<string, string>()
export async function ensurePlan(name: string, amount: number, currency: PsCurrency): Promise<string> {
  const key = `${name}|${amount}|${currency}`
  const cached = planCache.get(key)
  if (cached) return cached
  for (let page = 1; page <= 5; page++) {
    const list = await ps<{ plan_code: string; name: string; amount: number; currency: string; interval: string; is_deleted?: boolean }[]>(currency, `/plan?perPage=100&page=${page}&interval=monthly`).catch(() => [])
    const found = list.find((p) => p.name === name && p.amount === toSubunit(amount) && p.currency === currency && !p.is_deleted)
    if (found) {
      planCache.set(key, found.plan_code)
      return found.plan_code
    }
    if (list.length < 100) break
  }
  const created = await ps<{ plan_code: string }>(currency, '/plan', { body: { name, amount: toSubunit(amount), currency, interval: 'monthly' } })
  planCache.set(key, created.plan_code)
  return created.plan_code
}

export interface PsSubscription {
  subscription_code: string
  email_token: string
  status: string // active | non-renewing | attention | completed | cancelled
  plan?: { plan_code?: string; name?: string } | number
  next_payment_date?: string | null
}
/** A customer's subscriptions (by email or customer code) on the account for `currency`. */
export async function subscriptionsOf(emailOrCode: string, currency: string): Promise<PsSubscription[]> {
  if (!canCharge(currency)) return []
  const c = await ps<{ subscriptions?: PsSubscription[] }>(currency, `/customer/${encodeURIComponent(emailOrCode)}`).catch(() => null)
  return c?.subscriptions ?? []
}
export const disableSubscription = (code: string, token: string, currency: string) => ps(currency, '/subscription/disable', { body: { code, token } })
export const enableSubscription = (code: string, token: string, currency: string) => ps(currency, '/subscription/enable', { body: { code, token } })
export const subscriptionPlanCode = (s: PsSubscription) => (typeof s.plan === 'object' ? s.plan?.plan_code ?? '' : '')

/** Webhook authenticity: HMAC-SHA512 of the exact raw body with the secret key of one of our accounts. */
export function validSignature(raw: Buffer | undefined, signature: string | undefined) {
  if (!raw || !signature) return false
  const got = Buffer.from(signature)
  return allKeys().some((key) => {
    const want = Buffer.from(createHmac('sha512', key).update(raw).digest('hex'))
    return want.length === got.length && timingSafeEqual(want, got)
  })
}
