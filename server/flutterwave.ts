/**
 * Flutterwave v3 API (https://developer.flutterwave.com/docs).
 * - Hosted checkout ("Flutterwave Standard"): POST /payments → redirect the payer to data.link
 * - Every payment is re-verified server-side (GET /transactions/:id/verify) before it counts.
 * - Church payouts: each church gets a sub-account; gifts are split so funds settle to the church.
 * - Plan billing: Flutterwave payment plans (monthly subscriptions).
 */
import { configured, env } from './env'
import { HttpError } from './db'


async function flw<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!configured.flutterwave) throw new HttpError(503, 'Online payments are not configured (FLW_SECRET_KEY).')
  const res = await fetch(`${env.flwBaseUrl}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${env.flwSecretKey}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: T }
  if (!res.ok || json.status !== 'success') throw new HttpError(res.status >= 500 ? 502 : 400, json.message || `Flutterwave error ${res.status}`)
  return json.data as T
}

export interface CheckoutInput {
  txRef: string
  amount: number
  currency: string
  redirectUrl: string
  customer: { email: string; name: string; phone?: string }
  title: string
  description: string
  logo?: string
  meta: Record<string, string>
  subaccountId?: string | null
  paymentPlan?: string
  /** e.g. 'card' — subscriptions must be card so Flutterwave can charge again each month. */
  paymentOptions?: string
}

/** Creates a hosted checkout and returns the URL to send the payer to. */
export async function createCheckout(i: CheckoutInput): Promise<string> {
  const data = await flw<{ link: string }>('/payments', {
    body: {
      tx_ref: i.txRef,
      amount: i.amount,
      currency: i.currency,
      redirect_url: i.redirectUrl,
      customer: { email: i.customer.email, name: i.customer.name, phonenumber: i.customer.phone || undefined },
      customizations: { title: i.title, description: i.description, logo: i.logo || `${env.siteUrl}/brand/app-icon.png` },
      meta: i.meta,
      ...(i.subaccountId ? { subaccounts: [{ id: i.subaccountId }] } : {}),
      ...(i.paymentPlan ? { payment_plan: i.paymentPlan } : {}),
      ...(i.paymentOptions ? { payment_options: i.paymentOptions } : {}),
    },
  })
  return data.link
}

export interface VerifiedTx {
  id: number
  tx_ref: string
  status: string
  amount: number
  currency: string
  customer?: { email?: string; name?: string }
  /** Payment-plan id on subscription charges (first and renewals). */
  plan?: number | string | null
  payment_plan?: number | string | null
}

export const verifyTransaction = (id: string | number) => flw<VerifiedTx>(`/transactions/${encodeURIComponent(String(id))}/verify`)
export const verifyByReference = (txRef: string) => flw<VerifiedTx>(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`)

export const listBanks = (country: string) => flw<{ id: number; code: string; name: string }[]>(`/banks/${encodeURIComponent(country)}`)

export const resolveAccount = (accountNumber: string, bankCode: string) =>
  flw<{ account_number: string; account_name: string }>('/accounts/resolve', { body: { account_number: accountNumber, account_bank: bankCode } })

export async function createSubaccount(i: { bankCode: string; accountNumber: string; businessName: string; email: string; phone: string; country: string }) {
  return flw<{ id: number; subaccount_id: string; account_name?: string; bank_name?: string }>('/subaccounts', {
    body: {
      account_bank: i.bankCode,
      account_number: i.accountNumber,
      business_name: i.businessName,
      business_email: i.email,
      business_mobile: i.phone || undefined,
      country: i.country,
      // What ZionDesk keeps from each gift (0 = churches receive everything).
      split_type: 'percentage',
      split_value: env.flwPlatformFee,
    },
  })
}

export const createPaymentPlan = (name: string, amount: number, currency: string) =>
  flw<{ id: number }>('/payment-plans', { body: { name, amount, currency, interval: 'monthly' } })

/** Finds the monthly plan by name (creating it the first time), so no plan IDs need configuring. */
const planCache = new Map<string, string>()
export async function ensurePaymentPlan(name: string, amount: number, currency: string): Promise<string> {
  const key = `${name}|${amount}|${currency}`
  const cached = planCache.get(key)
  if (cached) return cached
  const list = await flw<{ id: number; name: string; amount: number; currency: string; interval: string; status: string }[]>(
    `/payment-plans?interval=monthly&currency=${currency}&status=active`,
  ).catch(() => [])
  const found = list.find((p) => p.name === name && Number(p.amount) === amount)
  const id = String(found?.id ?? (await createPaymentPlan(name, amount, currency)).id)
  planCache.set(key, id)
  return id
}

export interface FlwSubscription {
  id: number
  status: string
  plan: number
  customer?: { customer_email?: string }
}
/** Subscriptions for a payer email (Flutterwave keys subscriptions by customer email). */
export const listSubscriptions = (email: string) => flw<FlwSubscription[]>(`/subscriptions?email=${encodeURIComponent(email)}`).catch(() => [] as FlwSubscription[])
export const cancelSubscription = (id: number) => flw(`/subscriptions/${id}/cancel`, { method: 'PUT', body: {} })
/** Turns a cancelled subscription back on (auto-renew on again). */
export const activateSubscription = (id: number) => flw(`/subscriptions/${id}/activate`, { method: 'PUT', body: {} })
