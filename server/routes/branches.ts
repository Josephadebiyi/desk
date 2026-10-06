/**
 * Branch reports API.
 *   GET  /api/branches/overview?period=YYYY-MM   settings, reports and who's missing (HQ: all branches; branch leader: own)
 *   GET  /api/branches/history?branch=…           one branch's past reports (HQ)
 *   PUT  /api/branches/report                     submit / update a report (branch leader: own branch; HQ: any)
 *   POST /api/branches/report/:id/review          HQ: mark reviewed, or send back with a note
 *   PUT  /api/branches/settings                   admin: due day, reminders on/off, which branches report
 *   POST /api/branches/remind                     HQ: remind missing branches now
 */
import { Router } from 'express'
import { db, HttpError, requireCaller, route } from '../db'
import {
  branchesAllowed,
  CHURCH_COLUMNS,
  currentPeriod,
  dueDateOf,
  missingBranches,
  notifyReturned,
  notifySubmitted,
  remindNow,
  reportingBranches,
  reportRow,
  validPeriod,
  type ChurchBranchSettings,
} from '../branches'

export const branchRoutes = Router()

const HQ = ['admin', 'finance'] as const
const ANY = ['admin', 'finance', 'branch'] as const

async function churchOf(id: string) {
  const { data, error } = await db().from('churches').select(CHURCH_COLUMNS).eq('id', id).single()
  if (error || !data) throw new HttpError(404, 'Church not found')
  return data as ChurchBranchSettings
}
function requirePlan(c: ChurchBranchSettings) {
  if (!branchesAllowed(c)) throw new HttpError(403, 'Branch reports are part of Ministry Plus and Ministry Max.')
}

const out = (r: Record<string, unknown>) => ({
  id: r.id,
  branch: r.branch,
  period: r.period,
  currency: r.currency,
  income: r.income,
  expenses: r.expenses,
  incomeTotal: Number(r.income_total),
  expenseTotal: Number(r.expense_total),
  attendance: r.attendance,
  newMembers: r.new_members,
  notes: r.notes,
  status: r.status,
  submittedBy: r.submitted_by_name,
  submittedAt: r.submitted_at,
  reviewedBy: r.reviewed_by_name,
  reviewedAt: r.reviewed_at,
  reviewNote: r.review_note,
})

branchRoutes.get(
  '/branches/overview',
  requireCaller([...ANY]),
  route(async (req, res) => {
    const caller = req.caller!
    const c = await churchOf(caller.churchId)
    const now = currentPeriod()
    const period = req.query.period ? validPeriod(req.query.period) : now
    const base = {
      allowed: branchesAllowed(c),
      role: caller.role,
      myBranch: caller.branch,
      period,
      currentPeriod: now,
      due: dueDateOf(period, c.branch_report_due_day),
      dueDay: c.branch_report_due_day,
      reminders: c.branch_reminders,
      branches: c.branches,
      reporting: reportingBranches(c),
      reportingIsDefault: c.branch_report_branches === null,
      funds: c.funds,
      currency: c.currency,
    }
    if (!base.allowed) return res.json({ ...base, reports: [], missing: [], leaders: {} })

    if (caller.role === 'branch') {
      if (!caller.branch) throw new HttpError(403, 'Your account isn’t linked to a branch yet. Ask your church admin.')
      const { data } = await db().from('branch_reports').select('*').eq('church_id', c.id).eq('branch', caller.branch).order('period', { ascending: false }).limit(24)
      return res.json({ ...base, reports: (data ?? []).map(out), missing: [], leaders: {} })
    }

    const [{ data }, missing, { data: leaders }] = await Promise.all([
      db().from('branch_reports').select('*').eq('church_id', c.id).eq('period', period),
      missingBranches(c, period),
      db().from('church_users').select('branch, profiles(full_name)').eq('church_id', c.id).eq('role', 'branch'),
    ])
    // Branch → names of its leaders (so HQ sees which branches have nobody to remind).
    const byBranch: Record<string, string[]> = {}
    for (const l of (leaders ?? []) as unknown as { branch: string | null; profiles: { full_name: string } | null }[])
      if (l.branch) (byBranch[l.branch] ??= []).push(l.profiles?.full_name || '—')
    res.json({ ...base, reports: (data ?? []).map(out), missing, leaders: byBranch })
  }),
)

branchRoutes.get(
  '/branches/history',
  requireCaller([...HQ]),
  route(async (req, res) => {
    const c = await churchOf(req.caller!.churchId)
    requirePlan(c)
    const branch = String(req.query.branch ?? '')
    if (!c.branches.includes(branch)) throw new HttpError(404, 'Branch not found')
    const { data } = await db().from('branch_reports').select('*').eq('church_id', c.id).eq('branch', branch).order('period', { ascending: false }).limit(36)
    res.json({ reports: (data ?? []).map(out) })
  }),
)

branchRoutes.put(
  '/branches/report',
  requireCaller([...ANY]),
  route(async (req, res) => {
    const caller = req.caller!
    const c = await churchOf(caller.churchId)
    requirePlan(c)
    const branch = caller.role === 'branch' ? caller.branch ?? '' : String(req.body?.branch ?? '')
    if (!c.branches.includes(branch)) throw new HttpError(400, caller.role === 'branch' ? 'Your branch no longer exists. Ask your church admin.' : 'Choose a branch.')
    const period = validPeriod(req.body?.period)
    const row = reportRow(req.body ?? {})
    if (!row.income.length && !row.expenses.length && row.attendance === null) throw new HttpError(400, 'Add at least one amount or the attendance.')

    const { data: existing } = await db().from('branch_reports').select('id, status').eq('church_id', c.id).eq('branch', branch).eq('period', period).maybeSingle()
    if (existing?.status === 'Reviewed' && caller.role === 'branch') throw new HttpError(409, 'HQ has already reviewed this report. Ask them to send it back if something needs to change.')

    const { data, error } = await db()
      .from('branch_reports')
      .upsert(
        {
          church_id: c.id,
          branch,
          period,
          currency: c.currency,
          ...row,
          status: 'Submitted',
          submitted_by: caller.userId,
          submitted_by_name: caller.name || caller.email,
          submitted_at: new Date().toISOString(),
          reviewed_by_name: null,
          reviewed_at: null,
          review_note: null,
        },
        { onConflict: 'church_id,branch,period' },
      )
      .select('*')
      .single()
    if (error) throw error
    console.log(`[branch report] ${c.id} ${branch} ${period} by ${caller.role}`)
    // HQ hears about reports the branches send themselves.
    if (caller.role === 'branch') void notifySubmitted(c, branch, period)
    res.json({ report: out(data) })
  }),
)

branchRoutes.post(
  '/branches/report/:id/review',
  requireCaller([...HQ]),
  route(async (req, res) => {
    const caller = req.caller!
    const c = await churchOf(caller.churchId)
    requirePlan(c)
    const action = req.body?.action === 'return' ? 'return' : 'review'
    const note = String(req.body?.note ?? '').trim().slice(0, 1000)
    if (action === 'return' && !note) throw new HttpError(400, 'Say what needs to change.')
    const { data: r } = await db().from('branch_reports').select('id, branch, period').eq('id', req.params.id).eq('church_id', c.id).maybeSingle()
    if (!r) throw new HttpError(404, 'Report not found')
    const { data, error } = await db()
      .from('branch_reports')
      .update({ status: action === 'return' ? 'Returned' : 'Reviewed', reviewed_by_name: caller.name || caller.email, reviewed_at: new Date().toISOString(), review_note: note || null })
      .eq('id', r.id)
      .select('*')
      .single()
    if (error) throw error
    if (action === 'return') void notifyReturned(c, r.branch, r.period, note)
    res.json({ report: out(data) })
  }),
)

branchRoutes.put(
  '/branches/settings',
  requireCaller(['admin']),
  route(async (req, res) => {
    const c = await churchOf(req.caller!.churchId)
    requirePlan(c)
    const dueDay = Number(req.body?.dueDay)
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) throw new HttpError(400, 'The due day must be between 1 and 28.')
    const reporting = Array.isArray(req.body?.reporting) ? [...new Set((req.body.reporting as unknown[]).map(String))].filter((b) => c.branches.includes(b)) : null
    const { error } = await db()
      .from('churches')
      .update({ branch_report_due_day: dueDay, branch_reminders: req.body?.reminders !== false, branch_report_branches: reporting })
      .eq('id', c.id)
    if (error) throw error
    res.json({ ok: true })
  }),
)

branchRoutes.post(
  '/branches/remind',
  requireCaller([...HQ]),
  route(async (req, res) => {
    const c = await churchOf(req.caller!.churchId)
    requirePlan(c)
    const period = validPeriod(req.body?.period)
    const only = req.body?.branch ? String(req.body.branch) : undefined
    res.json(await remindNow(c, period, only))
  }),
)
