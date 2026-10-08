/**
 * Paystack API (https://paystack.com/docs/api) — plan billing and paid extras.
 * - Hosted checkout: POST /transaction/initialize → redirect the payer to data.authorization_url.
 * - Every payment is re-verified server-side (GET /transaction/verify/:reference) before it counts.
 * - Monthly plans: Paystack Plans + Subscriptions (card or Nigerian direct debit). Amounts are in subunits (×100).
 * - Webhooks are signed: x-paystack-signature = HMAC-SHA512(raw body, secret key).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError } from './db'
import { configured, env } from './env'

const BASE = 'https://api.paystack.co'

async function ps<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!configured.paystack) throw new HttpError(503, 'Online payments are not configured (PAYSTACK_SECRET_KEY).')
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${env.paystackSecretKey}`, 'Content-Type': 'application/json' },
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
  currency: 'NGN' | 'USD'
  callbackUrl: string
  /** Plan code (PLN_…): Paystack then charges the plan's amount and subscribes the customer. */
  plan?: string
  metadata: Record<string, unknown>
  /** Subscriptions need something Paystack can charge again each month. */
  channels?: string[]
}

/** Starts a hosted checkout and returns the URL to send the payer to. */
export async function initialize(i: InitInput): Promise<string> {
  const data = await ps<{ authorization_url: string }>('/transaction/initialize', {
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
export const verifyTransaction = (reference: string) => ps<VerifiedTx>(`/transaction/verify/${encodeURIComponent(reference)}`)
export const planCodeOf = (tx: Pick<VerifiedTx, 'plan' | 'plan_object'>) =>
  (typeof tx.plan === 'string' ? tx.plan : tx.plan?.plan_code) || tx.plan_object?.plan_code || ''

/** Finds the monthly plan by name (creating it the first time), so no plan codes need configuring. */
const planCache = new Map<string, string>()
export async function ensurePlan(name: string, amount: number, currency: 'NGN' | 'USD'): Promise<string> {
  const key = `${name}|${amount}|${currency}`
  const cached = planCache.get(key)
  if (cached) return cached
  for (let page = 1; page <= 5; page++) {
    const list = await ps<{ plan_code: string; name: string; amount: number; currency: string; interval: string; is_deleted?: boolean }[]>(`/plan?perPage=100&page=${page}&interval=monthly`).catch(() => [])
    const found = list.find((p) => p.name === name && p.amount === toSubunit(amount) && p.currency === currency && !p.is_deleted)
    if (found) {
      planCache.set(key, found.plan_code)
      return found.plan_code
    }
    if (list.length < 100) break
  }
  const created = await ps<{ plan_code: string }>('/plan', { body: { name, amount: toSubunit(amount), currency, interval: 'monthly' } })
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
/** A customer's subscriptions (by email or customer code). */
export async function subscriptionsOf(emailOrCode: string): Promise<PsSubscription[]> {
  const c = await ps<{ subscriptions?: PsSubscription[] }>(`/customer/${encodeURIComponent(emailOrCode)}`).catch(() => null)
  return c?.subscriptions ?? []
}
export const disableSubscription = (code: string, token: string) => ps('/subscription/disable', { body: { code, token } })
export const enableSubscription = (code: string, token: string) => ps('/subscription/enable', { body: { code, token } })
export const subscriptionPlanCode = (s: PsSubscription) => (typeof s.plan === 'object' ? s.plan?.plan_code ?? '' : '')

/** Webhook authenticity: HMAC-SHA512 of the exact raw body with the secret key. */
export function validSignature(raw: Buffer | undefined, signature: string | undefined) {
  if (!env.paystackSecretKey || !raw || !signature) return false
  const want = Buffer.from(createHmac('sha512', env.paystackSecretKey).update(raw).digest('hex'))
  const got = Buffer.from(signature)
  return want.length === got.length && timingSafeEqual(want, got)
}
