/**
 * Branch financial reports: each branch declares a monthly report (income per fund, expenses,
 * attendance, notes); HQ reviews them and is told who hasn't reported. Reminders go out daily.
 *   Reporting month = the previous calendar month; due on `branch_report_due_day` of the next month.
 */
import { asEmailLang, type EmailLang } from '../src/emails/strings'
import type { EmailKind } from '../src/emails/catalog'
import { db, HttpError } from './db'
import { configured, env } from './env'
import { compose, sendEmails } from './mail'

/** Plans that include branch reports (and statuses that still have access). */
export const BRANCH_PLANS = ['plus', 'max']
const ACTIVE = ['trial', 'active', 'cancelled']
const LOCALE: Record<EmailLang, string> = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' }

export interface ChurchBranchSettings {
  id: string
  name: string
  plan: string
  plan_status: string
  currency: string
  funds: string[]
  branches: string[]
  branch_report_branches: string[] | null
  branch_report_due_day: number
  branch_reminders: boolean
}
export const CHURCH_COLUMNS = 'id, name, plan, plan_status, currency, funds, branches, branch_report_branches, branch_report_due_day, branch_reminders'

export const branchesAllowed = (c: Pick<ChurchBranchSettings, 'plan' | 'plan_status'>) => BRANCH_PLANS.includes(c.plan) && ACTIVE.includes(c.plan_status)

/** Branches that must report: the church's choice, else every branch except the first (usually HQ / main campus). */
export const reportingBranches = (c: Pick<ChurchBranchSettings, 'branches' | 'branch_report_branches'>) =>
  (c.branch_report_branches ?? c.branches.slice(1)).filter((b) => c.branches.includes(b))

const iso = (d: Date) => d.toISOString().slice(0, 10)
/** The month being reported on now: last calendar month (UTC). */
export const currentPeriod = (now = new Date()) => iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))).slice(0, 7)
/** Due date (YYYY-MM-DD) for a reporting month: `dueDay` of the following month. */
export const dueDateOf = (period: string, dueDay: number) => {
  const [y, m] = period.split('-').map(Number)
  return iso(new Date(Date.UTC(y, m, dueDay))) // m is 1-based, so this is the next month
}
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

export const periodLabel = (period: string, lang: EmailLang) => new Date(`${period}-01T12:00:00Z`).toLocaleDateString(LOCALE[lang], { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dateLabel = (date: string, lang: EmailLang) => new Date(`${date}T12:00:00Z`).toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'long', timeZone: 'UTC' })

/* ───────── report validation ───────── */

export interface Line {
  label: string
  amount: number
}
/** Cleans income / expense lines from the browser: up to 40 named lines with amounts ≥ 0. */
export function cleanLines(v: unknown): Line[] {
  if (!Array.isArray(v)) return []
  return v
    .slice(0, 40)
    .map((x) => ({ label: String((x as Line)?.label ?? '').trim().slice(0, 60), amount: Math.round(Number((x as Line)?.amount) * 100) / 100 }))
    .filter((x) => x.label && Number.isFinite(x.amount) && x.amount >= 0 && x.amount < 1e12)
}
const optCount = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < 1e7 ? Number(v) : null)

export function validPeriod(p: unknown) {
  const s = String(p ?? '')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw new HttpError(400, 'Choose a month.')
  const now = new Date()
  if (s > iso(now).slice(0, 7)) throw new HttpError(400, 'You can’t report on a future month.')
  return s
}

export function reportRow(body: Record<string, unknown>) {
  const income = cleanLines(body.income)
  const expenses = cleanLines(body.expenses)
  const sum = (l: Line[]) => Math.round(l.reduce((s, x) => s + x.amount, 0) * 100) / 100
  return {
    income,
    expenses,
    income_total: sum(income),
    expense_total: sum(expenses),
    attendance: optCount(body.attendance),
    new_members: optCount(body.newMembers),
    notes: String(body.notes ?? '').trim().slice(0, 2000),
  }
}

/* ───────── who gets the emails ───────── */

interface Person {
  email: string
  name: string
  lang: EmailLang
}
async function people(churchId: string, filter: { roles: string[]; branch?: string }): Promise<Person[]> {
  let q = db().from('church_users').select('role, branch, profiles(full_name, email, comm_language)').eq('church_id', churchId).in('role', filter.roles)
  if (filter.branch !== undefined) q = q.eq('branch', filter.branch)
  const { data } = await q
  return ((data ?? []) as unknown as { profiles: { full_name: string; email: string; comm_language: string } | null }[])
    .map((r) => r.profiles)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.email))
    .map((p) => ({ email: p.email, name: (p.full_name || p.email).split(' ')[0], lang: asEmailLang(p.comm_language) }))
}
export const branchLeaders = (churchId: string, branch: string) => people(churchId, { roles: ['branch'], branch })
export const hqPeople = (churchId: string) => people(churchId, { roles: ['admin', 'finance'] })

const pageUrl = () => `${env.siteUrl}/dashboard/branches`

async function mail(kind: EmailKind, to: Person[], vars: (p: Person) => Record<string, string>) {
  if (!to.length || !configured.email) return 0
  await sendEmails(to.map((p) => compose(kind, p.lang, p.email, { name: p.name, ...vars(p) }, pageUrl())))
  return to.length
}

/** Reminder to one branch's leaders (before / on / after the due date). Returns how many people were emailed. */
export async function remindBranch(c: ChurchBranchSettings, branch: string, period: string, overdue: boolean) {
  const due = dueDateOf(period, c.branch_report_due_day)
  return mail(overdue ? 'branchOverdue' : 'branchReminder', await branchLeaders(c.id, branch), (p) => ({ church: c.name, branch, period: periodLabel(period, p.lang), date: dateLabel(due, p.lang) }))
}

export async function notifySubmitted(c: Pick<ChurchBranchSettings, 'id' | 'name'>, branch: string, period: string) {
  return mail('branchSubmitted', await hqPeople(c.id), (p) => ({ church: c.name, branch, period: periodLabel(period, p.lang) })).catch((e) => (console.error('[branch submitted email]', e), 0))
}

export async function notifyReturned(c: Pick<ChurchBranchSettings, 'id' | 'name'>, branch: string, period: string, note: string) {
  return mail('branchReturned', await branchLeaders(c.id, branch), (p) => ({ church: c.name, branch, period: periodLabel(period, p.lang), note })).catch((e) => (console.error('[branch returned email]', e), 0))
}

/** Branches that haven't sent an accepted report for the month (Returned counts as not sent). */
export async function missingBranches(c: ChurchBranchSettings, period: string) {
  const { data } = await db().from('branch_reports').select('branch, status').eq('church_id', c.id).eq('period', period)
  const done = new Set((data ?? []).filter((r) => r.status !== 'Returned').map((r) => r.branch as string))
  return reportingBranches(c).filter((b) => !done.has(b))
}

/** Records a notice; false when it was already sent (so nothing is sent twice). */
async function claimNotice(churchId: string, branch: string, period: string, kind: string) {
  const { error } = await db().from('branch_report_notices').insert({ church_id: churchId, branch, period, kind })
  if (!error) return true
  if (error.code === '23505') return false
  throw error
}

/**
 * Daily: reminders to branch leaders 3 days before, on, and 3 / 7 days after the due date;
 * an HQ summary of missing branches 1 and 7 days after the due date.
 */
export async function runBranchReminders(now = new Date()) {
  const { data } = await db().from('churches').select(CHURCH_COLUMNS).in('plan', BRANCH_PLANS).in('plan_status', ACTIVE)
  const period = currentPeriod(now)
  const today = iso(now)
  let reminders = 0
  let summaries = 0
  for (const c of (data ?? []) as ChurchBranchSettings[]) {
    try {
      if (!reportingBranches(c).length) continue
      const due = dueDateOf(period, c.branch_report_due_day)
      const d = daysBetween(due, today) // < 0 before the due date
      const missing = await missingBranches(c, period)
      if (!missing.length) continue

      // Only the latest step that applies, once (a church that turns reminders on late doesn't get every step at once).
      const step = d >= 7 ? 'late7' : d >= 3 ? 'late3' : d >= 0 ? 'due' : d >= -3 ? 'soon' : null
      if (c.branch_reminders && step)
        for (const b of missing) if (await claimNotice(c.id, b, period, step)) reminders += await remindBranch(c, b, period, d > 0)

      const hq = d >= 7 ? 'hq7' : d >= 1 ? 'hq1' : null
      if (hq && (await claimNotice(c.id, '*', period, hq))) {
        summaries += await mail('branchMissing', await hqPeople(c.id), (p) => ({ church: c.name, period: periodLabel(period, p.lang), date: dateLabel(due, p.lang), branches: missing.join(', ') }))
      }
    } catch (e) {
      console.error('[branch reminders]', c.id, e)
    }
  }
  return { period, reminders, summaries }
}

/** "Remind now" from HQ: at most once a day per branch. */
export async function remindNow(c: ChurchBranchSettings, period: string, only?: string) {
  const missing = (await missingBranches(c, period)).filter((b) => !only || b === only)
  const today = iso(new Date())
  const overdue = today > dueDateOf(period, c.branch_report_due_day)
  let emailed = 0
  const noLeader: string[] = []
  const already: string[] = []
  for (const b of missing) {
    if (!(await branchLeaders(c.id, b)).length) {
      noLeader.push(b)
      continue
    }
    if (!(await claimNotice(c.id, b, period, `manual:${today}`))) {
      already.push(b)
      continue
    }
    emailed += await remindBranch(c, b, period, overdue)
  }
  return { emailed, noLeader, already }
}
