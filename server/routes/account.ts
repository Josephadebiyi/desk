/**
 * Data-protection rights (GDPR / UK GDPR, CCPA/CPRA, Nigeria NDPA, South Africa POPIA, Kenya DPA…).
 *   GET  /api/account/export   everything ZionDesk holds about the signed-in person (JSON)
 *   POST /api/account/delete   erase the signed-in person's account
 *   GET  /api/church/export    all of the church's records (admin, JSON)
 *   POST /api/church/delete    delete the church and all its records (admin, type the church name)
 */
import { Router } from 'express'
import { db, HttpError, requireCaller, requireUser, route } from '../db'
import { cancelSubscription, listSubscriptions } from '../flutterwave'
import { profileOf, sendAccountDeleted, sendWelcome } from '../lifecycle'

export const accountRoutes = Router()

const CHURCH_TABLES = ['members', 'communications', 'gifts', 'expenses', 'events', 'campaigns', 'deliveries', 'message_templates', 'share_links', 'transfer_claims', 'designs', 'design_requests', 'design_request_messages', 'online_payments', 'ai_activity', 'ai_usage'] as const

const stamp = () => new Date().toISOString().slice(0, 10)

accountRoutes.get(
  '/account/export',
  requireUser(),
  route(async (req, res) => {
    const id = req.caller!.userId
    const { data: user } = await db().auth.admin.getUserById(id)
    const { data: profile } = await db().from('profiles').select('*').eq('id', id).maybeSingle()
    const { data: churches } = await db().from('church_users').select('role, created_at, churches(id, name)').eq('user_id', id)
    const { data: activity } = await db().from('ai_activity').select('*').eq('user_id', id)
    res.setHeader('Content-Disposition', `attachment; filename="ziondesk-my-data-${stamp()}.json"`)
    res.json({
      exportedAt: new Date().toISOString(),
      account: { id, email: user?.user?.email, createdAt: user?.user?.created_at, lastSignIn: user?.user?.last_sign_in_at, providers: user?.user?.app_metadata?.providers },
      profile,
      churches,
      aiActivity: activity ?? [],
    })
  }),
)

export async function cancelChurchBilling(churchId: string) {
  const { data: c } = await db().from('churches').select('flw_subscription_email').eq('id', churchId).single()
  if (!c?.flw_subscription_email) return
  for (const s of await listSubscriptions(c.flw_subscription_email)) if (s.status === 'active') await cancelSubscription(s.id).catch(() => undefined)
}

export async function deleteChurch(churchId: string) {
  await cancelChurchBilling(churchId)
  const { data: files } = await db().storage.from('logos').list(churchId)
  if (files?.length) await db().storage.from('logos').remove(files.map((f) => `${churchId}/${f.name}`))
  const { error } = await db().from('churches').delete().eq('id', churchId)
  if (error) throw new HttpError(500, error.message)
}

accountRoutes.post(
  '/account/delete',
  requireUser(),
  route(async (req, res) => {
    const id = req.caller!.userId
    const who = await profileOf(id)
    const { data: links } = await db().from('church_users').select('church_id, role').eq('user_id', id)
    const toDelete: string[] = []
    for (const l of links ?? []) {
      if (l.role !== 'admin') continue
      const { data: team } = await db().from('church_users').select('user_id, role').eq('church_id', l.church_id)
      const others = (team ?? []).filter((t) => t.user_id !== id)
      if (!others.length) toDelete.push(l.church_id) // only person in the church → the church goes too
      else if (!others.some((t) => t.role === 'admin')) throw new HttpError(409, 'SOLE_ADMIN')
    }
    for (const c of toDelete) await deleteChurch(c)
    const { data: files } = await db().storage.from('avatars').list(id)
    if (files?.length) await db().storage.from('avatars').remove(files.map((f) => `${id}/${f.name}`))
    const { error } = await db().auth.admin.deleteUser(id)
    if (error) throw new HttpError(500, error.message)
    await sendAccountDeleted({ email: req.caller!.email, name: who?.full_name ?? '', lang: who?.comm_language ?? 'en' })
    res.json({ ok: true, churchesDeleted: toDelete.length })
  }),
)

accountRoutes.get(
  '/church/export',
  requireCaller(['admin']),
  route(async (req, res) => {
    const churchId = req.caller!.churchId
    const { data: church } = await db().from('churches').select('*').eq('id', churchId).single()
    const { data: team } = await db().from('church_users').select('role, created_at, profiles(full_name, email)').eq('church_id', churchId)
    const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), church, team }
    for (const t of CHURCH_TABLES) {
      const { data } = await db().from(t).select('*').eq('church_id', churchId)
      out[t] = data ?? []
    }
    res.setHeader('Content-Disposition', `attachment; filename="ziondesk-church-data-${stamp()}.json"`)
    res.json(out)
  }),
)

accountRoutes.post(
  '/church/delete',
  requireCaller(['admin']),
  route(async (req, res) => {
    const { data: church } = await db().from('churches').select('name').eq('id', req.caller!.churchId).single()
    const typed = String(req.body?.confirm ?? '').trim().toLowerCase()
    if (!church || typed !== church.name.trim().toLowerCase()) throw new HttpError(400, 'Type the church name exactly to confirm.')
    await deleteChurch(req.caller!.churchId)
    res.json({ ok: true })
  }),
)

/** Called by the app right after a church is created: the welcome email goes out at once (once per church). */
accountRoutes.post(
  '/account/welcome',
  requireCaller(['admin']),
  route(async (req, res) => {
    const { data: c } = await db().from('churches').select('created_at').eq('id', req.caller!.churchId).single()
    const fresh = c && Date.now() - new Date(c.created_at).getTime() < 3 * 864e5
    // Promo / referral code from sign-up: recorded once, only if it's a real code.
    const code = String(req.body?.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32)
    if (fresh && code.length >= 3) {
      const { data: promo } = await db().from('promo_codes').select('code').eq('code', code).maybeSingle()
      if (promo) await db().from('churches').update({ signup_code: promo.code }).eq('id', req.caller!.churchId).is('signup_code', null)
    }
    res.json({ sent: fresh ? await sendWelcome(req.caller!.churchId) : false })
  }),
)
