/**
 * AI Inbox: actionable items derived from real records, prioritised and filtered by role.
 * Item ids include the day/month so a dismissed item can come back when it's relevant again.
 */
import { fmtDate, fmtTime, isoLocal, today } from '../dashboard/kit'
import { getLocale, tr } from '../i18n'
import { can, type Role } from '../dashboard/types'
import { birthdaysWithin, needingFollowUp, reminderVars, tpl, type ToolContext } from './tools'
import type { AgentId } from './types'

export interface InboxItem {
  id: string
  agent: AgentId
  priority: 1 | 2 | 3 // 1 = today
  title: string
  detail: string
  href: string
  state?: unknown
}

/** Ask Ellen a built-in question: shown in the user's language, routed by its canonical key. */
export const askHref = (key: string) => `/dashboard/ai?q=${encodeURIComponent(tr(`ai.q.${key}`))}&k=${key}`

export function buildInbox(ctx: ToolContext, role: Role): InboxItem[] {
  const items: InboxItem[] = []
  const day = today()
  const month = day.slice(0, 7)

  const bdays = birthdaysWithin(ctx.members, 0)
  if (bdays.length)
    items.push({
      id: `bday-${day}`,
      agent: 'memberCare',
      priority: 1,
      title: tr('ai.inbox.bdays', { count: bdays.length }),
      detail: bdays.slice(0, 3).map((b) => b.m.fullName).join(', ') + (bdays.length > 3 ? '…' : ''),
      href: askHref('birthdaysToday'),
    })

  if (can.editMembers(role)) {
    const follow = needingFollowUp(ctx.members)
    if (follow.length)
      items.push({
        id: `follow-${day}`,
        agent: 'followUp',
        priority: 1,
        title: tr('ai.inbox.follow', { count: follow.length }),
        detail: tr('ai.inbox.followDetail'),
        href: askHref('followUp'),
      })

    const soonEnd = new Date()
    soonEnd.setDate(soonEnd.getDate() + 3)
    ctx.events
      .filter((e) => e.date >= day && e.date <= isoLocal(soonEnd))
      .filter((e) => !ctx.campaigns.some((c) => c.body.toLowerCase().includes(e.title.toLowerCase())))
      .forEach((e) =>
        items.push({
          id: `remind-${e.id}`,
          agent: 'events',
          priority: e.date === day ? 1 : 2,
          title: tr('ai.inbox.reminder', { title: e.title, when: e.date === day ? tr('common.today').toLowerCase() : fmtDate(e.date, { weekday: 'long' }) }),
          detail: tr('ai.inbox.reminderDetail', { time: fmtTime(e.start), count: e.invited }),
          href: '/dashboard/messaging',
          state: (() => {
            const vars = reminderVars(e)
            return { draft: tpl('reminder', vars), template: 'reminder', vars }
          })(),
        }),
      )

    const converts = ctx.members.filter((m) => m.stage === 'Convert' && !m.department && m.membershipStatus === 'Active')
    if (converts.length)
      items.push({
        id: `converts-${month}`,
        agent: 'departments',
        priority: 3,
        title: tr('ai.inbox.converts', { count: converts.length }),
        detail: tr('ai.inbox.convertsDetail'),
        href: '/dashboard/members?stage=Convert',
      })

    const inactive = ctx.members.filter((m) => m.membershipStatus === 'Inactive')
    if (inactive.length)
      items.push({
        id: `inactive-${month}`,
        agent: 'memberCare',
        priority: 3,
        title: tr('ai.inbox.inactive', { count: inactive.length }),
        detail: tr('ai.inbox.inactiveDetail'),
        href: askHref('inactive'),
      })

    const incomplete = ctx.members.filter((m) => !m.phone && !m.email)
    if (incomplete.length)
      items.push({
        id: `incomplete-${month}`,
        agent: 'memberCare',
        priority: 3,
        title: tr('ai.inbox.incomplete', { count: incomplete.length }),
        detail: tr('ai.inbox.incompleteDetail'),
        href: '/dashboard/members',
      })
  }

  const designs = ctx.designRequests.filter((r) => r.status !== 'Delivered')
  if (designs.length)
    items.push({
      id: `designs-${designs.length}-${day}`,
      agent: 'designer',
      priority: 2,
      title: tr('ai.inbox.designs', { count: designs.length }),
      detail: designs.map((d) => d.title).slice(0, 2).join(', '),
      href: '/dashboard/design?tab=team',
    })

  if (can.viewGiving(role)) {
    items.push({
      id: `finance-${month}`,
      agent: 'finance',
      priority: 3,
      title: tr('ai.inbox.finance', { month: new Date().toLocaleDateString(getLocale(), { month: 'long' }) }),
      detail: tr('ai.inbox.financeDetail'),
      href: askHref('finance'),
    })
    const claims = ctx.claims?.filter((c) => c.status === 'Pending') ?? []
    if (claims.length)
      items.push({
        id: `transfers-${claims.length}-${day}`,
        agent: 'finance',
        priority: 1,
        title: tr('ai.inbox.transfers', { count: claims.length }),
        detail: tr('ai.inbox.transfersDetail'),
        href: '/dashboard/links',
      })
  }

  return items.sort((a, b) => a.priority - b.priority)
}
