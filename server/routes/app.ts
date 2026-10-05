/**
 * Signed-in endpoints (Supabase session + x-church-id). Each checks the caller's role.
 *   POST /api/campaigns/:id/send     send now (admin, leader)
 *   POST /api/team/invite            invite a teammate by email (admin)
 *   POST /api/claims/:id/confirm     confirm a bank transfer → gift + receipt (admin, finance)
 *   POST /api/claims/:id/decline     (admin, finance)
 */
import { Router } from 'express'
import { asEmailLang } from '../../src/emails/strings'
import { db, HttpError, requireCaller, route } from '../db'
import { configured, env } from '../env'
import { compose, sendEmail } from '../mail'
import { sendCampaign } from '../messaging'
import { ageOn, birthdayPrayers, prayersEnabled } from '../prayers'

export const appRoutes = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLE_NAME: Record<string, Record<string, string>> = {
  en: { admin: 'Administrator', finance: 'Finance', leader: 'Ministry leader' },
  es: { admin: 'Administrador', finance: 'Finanzas', leader: 'Líder de ministerio' },
  fr: { admin: 'Administrateur', finance: 'Finances', leader: 'Responsable de ministère' },
  de: { admin: 'Administrator', finance: 'Finanzen', leader: 'Bereichsleiter' },
  pt: { admin: 'Administrador', finance: 'Finanças', leader: 'Líder de ministério' },
}
const LOCALE: Record<string, string> = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' }

appRoutes.post(
  '/campaigns/:id/send',
  requireCaller(['admin', 'leader']),
  route(async (req, res) => {
    const { data: c } = await db().from('campaigns').select('id, church_id, scheduled_for, status').eq('id', req.params.id).maybeSingle()
    if (!c || c.church_id !== req.caller!.churchId) throw new HttpError(404, 'Message not found')
    if (c.status === 'Sent') throw new HttpError(409, 'This message was already sent')
    // Scheduled messages are sent by the cron job when their time comes.
    if (c.scheduled_for && new Date(c.scheduled_for) > new Date()) return res.json({ scheduled: true })
    res.json(await sendCampaign(c.id, req.caller!.name || 'ZionDesk'))
  }),
)

appRoutes.post(
  '/team/invite',
  requireCaller(['admin']),
  route(async (req, res) => {
    const name = String(req.body?.name ?? '').trim().slice(0, 120)
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const role = ['admin', 'finance', 'leader'].includes(req.body?.role) ? req.body.role : 'leader'
    const lang = asEmailLang(req.body?.language)
    if (!name || !EMAIL_RE.test(email)) throw new HttpError(400, 'Name and a valid email are required')
    const churchId = req.caller!.churchId
    const { data: church } = await db().from('churches').select('name').eq('id', churchId).single()

    await db().from('team_invites').upsert({ church_id: churchId, name, email, role, language: lang, status: 'Invited' }, { onConflict: 'church_id,email' })

    // Existing ZionDesk user → add straight away and send a sign-in link; new user → invite link.
    const { data: existing } = await db().from('profiles').select('id').eq('email', email).maybeSingle()
    let url = `${env.siteUrl}/login`
    if (existing) {
      await db().from('church_users').upsert({ church_id: churchId, user_id: existing.id, role }, { onConflict: 'church_id,user_id' })
      await db().from('team_invites').update({ status: 'Accepted' }).eq('church_id', churchId).eq('email', email)
    } else {
      const { data, error } = await db().auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo: `${env.siteUrl}/reset-password?invite=1`, data: { full_name: name, ui_language: lang, comm_language: lang } },
      })
      if (error) throw new HttpError(400, error.message)
      url = data.properties.action_link
    }
    if (configured.email) {
      await sendEmail(compose('teamInvite', lang, email, { name: name.split(' ')[0], inviter: req.caller!.name || req.caller!.email, church: church?.name ?? '', role: ROLE_NAME[lang][role] }, url))
    }
    res.json({ ok: true, emailed: configured.email })
  }),
)

appRoutes.post(
  '/claims/:id/:action',
  requireCaller(['admin', 'finance']),
  route(async (req, res) => {
    if (!['confirm', 'decline'].includes(String(req.params.action))) throw new HttpError(404, 'Not found')
    const { data: claim } = await db().from('transfer_claims').select('*').eq('id', req.params.id).maybeSingle()
    if (!claim || claim.church_id !== req.caller!.churchId) throw new HttpError(404, 'Transfer not found')
    if (claim.status !== 'Pending') throw new HttpError(409, 'Already handled')
    if (req.params.action === 'decline') {
      await db().from('transfer_claims').update({ status: 'Declined' }).eq('id', claim.id)
      return res.json({ ok: true })
    }
    const { data: member } = claim.email
      ? await db().from('members').select('id').eq('church_id', claim.church_id).ilike('email', claim.email.replace(/[\\%_]/g, '\\$&')).maybeSingle()
      : { data: null }
    await db().from('gifts').insert({ church_id: claim.church_id, member_id: member?.id ?? null, donor: claim.name, date: claim.date, amount: claim.amount, fund: claim.fund, method: 'Transfer' })
    await db().from('transfer_claims').update({ status: 'Confirmed' }).eq('id', claim.id)
    if (claim.email && configured.email) {
      const { data: church } = await db().from('churches').select('name, currency').eq('id', claim.church_id).single()
      const loc = LOCALE[claim.language] ?? 'en-US'
      await sendEmail(
        compose('giftReceipt', claim.language, claim.email, {
          church: church?.name ?? '',
          name: claim.name.split(' ')[0],
          amount: new Intl.NumberFormat(loc, { style: 'currency', currency: church?.currency ?? 'USD' }).format(claim.amount),
          fund: claim.fund,
          date: new Date(claim.date + 'T00:00:00').toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' }),
        }),
      ).catch((e) => console.error('[receipt]', e))
    }
    res.json({ ok: true, memberId: member?.id ?? null })
  }),
)

/** A fresh AI birthday prayer for one member (Overview → Birthdays), to copy or send. */
appRoutes.post(
  '/members/:id/birthday-prayer',
  requireCaller(['admin', 'leader']),
  route(async (req, res) => {
    if (!prayersEnabled()) throw new HttpError(503, 'Birthday prayers need ANTHROPIC_API_KEY on the server.')
    const { data: m } = await db().from('members').select('id, church_id, full_name, dob, gender, department, stage, language').eq('id', req.params.id).maybeSingle()
    if (!m || m.church_id !== req.caller!.churchId) throw new HttpError(404, 'Member not found')
    const { data: church } = await db().from('churches').select('name').eq('id', m.church_id).single()
    const out = await birthdayPrayers(church?.name ?? '', [{ id: m.id, firstName: m.full_name.split(' ')[0], age: m.dob ? ageOn(String(m.dob)) : null, gender: m.gender, department: m.department, stage: m.stage, language: asEmailLang(m.language) }])
    if (!out[m.id]) throw new HttpError(502, 'The prayer could not be written right now. Please try again.')
    res.json({ prayer: out[m.id] })
  }),
)
