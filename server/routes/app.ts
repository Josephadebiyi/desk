/**
 * Signed-in endpoints (Supabase session + x-church-id). Each checks the caller's role.
 *   POST /api/campaigns/:id/send     send now (admin, leader)
 *   POST /api/team/invite            invite a teammate by email (admin)
 *   POST /api/claims/:id/confirm     confirm a bank transfer → gift + receipt (admin, finance)
 *   POST /api/claims/:id/decline     (admin, finance)
 *   POST /api/members/:id/birthday-send  send one member a birthday message by Email, WhatsApp or SMS (admin, leader)
 */
import { Router } from 'express'
import { asEmailLang } from '../../src/emails/strings'
import { db, HttpError, requireCaller, route } from '../db'
import { configured, env } from '../env'
import { compose, sendEmail, sendEmails } from '../mail'
import { claimDeliveries, personalize, phoneOf, sendCampaign, settleDelivery, smsSenderOf, twilio } from '../messaging'
import { sendWhatsApp } from '../whatsapp'
import { logOutbound } from '../inbox'
import { withChurchName } from '../../src/emails/sender'
import { ageOn, birthdayPrayers, prayersEnabled } from '../prayers'
import { smsUsage } from '../smsQuota'

export const appRoutes = Router()
appRoutes.get('/sms/usage', requireCaller(), route(async (req, res) => { res.json(await smsUsage(req.caller!.churchId)) }))

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLE_NAME: Record<string, Record<string, string>> = {
  en: { admin: 'Administrator', finance: 'Finance', leader: 'Ministry leader', branch: 'Branch leader' },
  es: { admin: 'Administrador', finance: 'Finanzas', leader: 'Líder de ministerio', branch: 'Líder de sede' },
  fr: { admin: 'Administrateur', finance: 'Finances', leader: 'Responsable de ministère', branch: 'Responsable d’antenne' },
  de: { admin: 'Administrator', finance: 'Finanzen', leader: 'Bereichsleiter', branch: 'Standortleiter' },
  pt: { admin: 'Administrador', finance: 'Finanças', leader: 'Líder de ministério', branch: 'Líder de filial' },
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
    const role = ['admin', 'finance', 'leader', 'branch'].includes(req.body?.role) ? req.body.role : 'leader'
    const lang = asEmailLang(req.body?.language)
    if (!name || !EMAIL_RE.test(email)) throw new HttpError(400, 'Name and a valid email are required')
    const churchId = req.caller!.churchId
    const { data: church } = await db().from('churches').select('name, branches').eq('id', churchId).single()
    // A branch leader is tied to one of the church's branches.
    const branch = role === 'branch' ? String(req.body?.branch ?? '').trim() : null
    if (role === 'branch' && !((church?.branches as string[] | null) ?? []).includes(branch!)) throw new HttpError(400, 'Choose one of your branches for this branch leader.')

    await db().from('team_invites').upsert({ church_id: churchId, name, email, role, branch, language: lang, status: 'Invited' }, { onConflict: 'church_id,email' })

    // Existing ZionDesk user → add straight away and send a sign-in link; new user → invite link.
    const { data: existing } = await db().from('profiles').select('id').eq('email', email).maybeSingle()
    let url = `${env.siteUrl}/login`
    if (existing) {
      await db().from('church_users').upsert({ church_id: churchId, user_id: existing.id, role, branch }, { onConflict: 'church_id,user_id' })
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

/**
 * Birthday message to one member, sent by hand (Overview → Birthdays). Once per member, channel and day: a double
 * click or a second teammate gets "already sent", and the automatic greeting skips anyone greeted by hand.
 * A failed attempt can be retried.
 */
appRoutes.post(
  '/members/:id/birthday-send',
  requireCaller(['admin', 'leader']),
  route(async (req, res) => {
    const caller = req.caller!
    const channel = String(req.body?.channel ?? '') as 'Email' | 'WhatsApp' | 'SMS'
    if (!['Email', 'WhatsApp', 'SMS'].includes(channel)) throw new HttpError(400, 'Choose Email, WhatsApp or SMS.')
    const raw = String(req.body?.text ?? '').trim()
    if (raw.length < 2 || raw.length > 1200) throw new HttpError(400, 'Write a message (up to 1,200 characters).')
    const { data: m } = await db().from('members').select('id, church_id, full_name, email, whatsapp, phone, language').eq('id', req.params.id).maybeSingle()
    if (!m || m.church_id !== caller.churchId) throw new HttpError(404, 'Member not found')
    const ready = channel === 'Email' ? configured.email : channel === 'WhatsApp' ? configured.whatsapp : configured.sms
    if (!ready) throw new HttpError(503, `${channel} isn't switched on yet.`)
    const to = channel === 'Email' ? (m.email ?? '').trim() : phoneOf(channel === 'WhatsApp' ? m.whatsapp || m.phone || '' : m.phone || '')
    if (!to) throw new HttpError(400, channel === 'Email' ? 'This member has no email address.' : 'This member has no phone number.')
    const { data: church } = await db().from('churches').select('name, sms_sender').eq('id', m.church_id).single()
    const lang = asEmailLang(m.language)
    const first = m.full_name.split(' ')[0]
    const text = personalize(raw, lang, {}, first, church?.name ?? '')
    const body = channel === 'Email' ? text : withChurchName(text, church?.name ?? '')
    const key = `birthday:${new Date().toISOString().slice(0, 10)}:${m.id}:${channel}`

    // Claim; a failed earlier attempt today is taken over so it can be retried.
    let [claim]: ({ id: string; dedupe_key: string } | undefined)[] = await claimDeliveries([{ church_id: m.church_id, member_id: m.id, channel, language: lang, to_address: to, dedupe_key: key, body }])
    if (!claim) {
      const { data: retry } = await db().from('deliveries').update({ status: 'sending', error: null, to_address: to, body }).eq('dedupe_key', key).eq('status', 'failed').select('id, dedupe_key')
      claim = retry?.[0]
      if (!claim) throw new HttpError(409, `${first} already got a birthday ${channel === 'Email' ? 'email' : `${channel} message`} today.`)
    }
    try {
      let providerId: string | undefined
      if (channel === 'Email') [providerId] = await sendEmails([compose('birthdayPrayer', lang, to, { church: church?.name ?? '', name: first, prayer: text })])
      else if (channel === 'WhatsApp' && configured.whatsappCloud) providerId = await sendWhatsApp(to, body, lang)
      else providerId = await twilio(channel, to, body, { sender: smsSenderOf(church), churchId: m.church_id })
      await settleDelivery(claim.id, { status: 'sent', providerId })
      const byName = caller.name || 'ZionDesk'
      await db().from('communications').insert({ church_id: m.church_id, member_id: m.id, date: new Date().toISOString().slice(0, 10), channel, summary: text.slice(0, 90), by_name: byName })
      if (channel !== 'Email') await logOutbound({ churchId: m.church_id, memberId: m.id, name: m.full_name, to, channel, body, providerId, byName }).catch(() => undefined)
      res.json({ ok: true, channel })
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Sending failed'
      await settleDelivery(claim.id, { status: 'failed', error: reason })
      throw new HttpError(502, reason)
    }
  }),
)
