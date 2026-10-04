/**
 * Ellen (the ZionDesk AI assistant) orchestrator.
 *
 * One entry point (`ask`) decides which capability handles a request. With a language
 * model enabled it offers the model only the tools the user's role may use; otherwise the
 * built-in router maps the request to a tool deterministically. Either way, every data
 * access goes through `runTool` (permissions + validation), and answers are built from
 * tool results — the system never invents church statistics.
 */
import { isoLocal } from '../dashboard/kit'
import { STAGES } from '../dashboard/types'
import { pickProvider, remoteComplete, type ProviderStatus } from './providers'
import { reminderVars, runTool, tpl, TOOLS, type ToolContext } from './tools'
import { LANGS, getLang, tr } from '../i18n'
import { AGENTS, type AgentId, type Block, type PendingAction, type ProviderPref, type ToolResult } from './types'

export interface Attachment {
  name: string
  type: string
  size: number
  /** Extracted text for .txt/.csv/.md/.json files. */
  text?: string
  /** Base64 image for vision-capable models. */
  image?: { mediaType: string; data: string }
}

export interface AskOutcome {
  agent: AgentId | 'church-ai'
  blocks: Block[]
  pending?: PendingAction
  provider: string
  usage?: { provider: string; model: string; inputTokens: number; outputTokens: number; estCostUsd: number }
  activity?: string
  entity?: string
  denied?: boolean
}

/* ───────── multilingual understanding ───────── */

/**
 * Maps common Spanish, French, German and Portuguese phrasing onto the English keywords the
 * local router understands, so people can ask in their own language without a language model.
 */
const PHRASES: [RegExp, string][] = [
  [/cumple(n)? a[nñ]os|cumplea[nñ]os|anniversaires?|geburtstag\w*|anivers[aá]rios?|fazem anos|faz anos/g, ' birthday '],
  [/seguimiento|suivis?\b|nachbetreuung|acompanhamentos?/g, ' follow-up '],
  [/(mi |mon |ma |meine |minha )?atenci[oó]n|(mon |votre )?attention|aufmerksamkeit|aten[cç][aã]o/g, ' need my attention '],
  [/\bde hoy\b|\bdu jour\b|\bdo dia\b|\bhoy\b|aujourd[’']hui|\bheute\b|\bhoje\b/g, ' today '],
  [/\bma[nñ]ana\b|\bdemain\b|\bmorgen\b|\bamanh[aã]\b/g, ' tomorrow '],
  [/este mes|ce mois(-ci)?|diesen monat|dieses monats|este m[eê]s/g, ' this month '],
  [/mes pasado|mois dernier|letzten monat|m[eê]s passado/g, ' last month '],
  [/esta semana|cette semaine|diese woche/g, ' this week '],
  [/resumen financiero|synth[eè]se financi[eè]re|finanz[üu]bersicht|resumo financeiro/g, ' finance summary '],
  [/\bofrendas?\b|\boffrandes?\b|\bdons\b|\bspenden\b|\bofertas?\b|diezmos?|d[îi]mes?|zehnten?|d[ií]zimos?|ingresos|recettes|einnahmen|receitas|finanz\w*|finanzas|finances|finan[cç]as/g, ' giving '],
  [/\bgastos?\b|d[ée]penses?|ausgaben|despesas?/g, ' expense '],
  [/\binforme\b|\brapport\b|\bbericht\b|relat[oó]rio/g, ' report '],
  [/folletos?|carteles?|affiches?|plakat\w*|folhetos?|cartaz(es)?/g, ' flyer '],
  [/\b(crea|crear|cr[ée]e[rz]?|erstelle[n]?|cria[r]?|programa[r]?|planifi\w+|organiza[r]?|organise[rz]?)\b/g, ' create '],
  [/reuni[oó]n|r[ée]union|treffen|reuni[aã]o|encuentro/g, ' meeting '],
  [/\bculto\b|\bculte\b|gottesdienst/g, ' service '],
  [/\b(env[ií]a\w*|envoie\w*|sende\w*|schick\w*|manda\w*)\b/g, ' send '],
  [/recordatorio|rappel|erinnerung|lembrete/g, ' reminder '],
  [/\b(escrib\w*|[ée]cri[st]\w*|schreib\w*|escreve\w*|redacta\w*|r[ée]dige\w*)\b/g, ' write '],
  [/mensajes?|messages?|nachricht\w*|mensage\w*/g, ' message '],
  [/servidores|serviteurs|mitarbeiter\w*|obreiros/g, ' workers '],
  [/reci[eé]n llegados?|nouveaux venus|nouveaux arrivants|neue besucher|rec[eé]m-chegados?|visitantes|visiteurs/g, ' newcomers '],
  [/nuevos convertidos|convertidos|nouveaux convertis|convertis|neubekehrt\w*|novos convertidos|convertidos/g, ' converts '],
  [/\bmiembros\b|\bmembres\b|\bmitglieder\b|\bmembros\b/g, ' members '],
  [/inactiv\w*|inaktiv\w*|inativ\w*/g, ' inactive '],
  [/\beventos?\b|[ée]v[ée]nements?|veranstaltung\w*/g, ' events '],
  [/cu[aá]ntos|combien|wie viele|quantos/g, ' how many '],
  [/departamentos?|d[ée]partements?|bereich\w*|abteilung\w*/g, ' department '],
  [/\bsedes?\b|standort\w*/g, ' branch '],
  [/compara\w*|vergleich\w*/g, ' compare '],
  [/asistencia|pr[ée]sences?|anwesenheit|presen[cç]as?/g, ' attendance '],
  [/bienvenida|bienvenue|willkommen|boas-vindas/g, ' welcome '],
  [/\b(busca\w*|cherche\w*|trouve\w*|finde\w*|such\w*|procura\w*|mostra\w*|muestra\w*|montre\w*|zeig\w*)\b/g, ' show '],
  [/\blunes\b|\blundi\b|\bmontag\b|segunda(-feira)?/g, ' monday '],
  [/\bmartes\b|\bmardi\b|\bdienstag\b|ter[cç]a(-feira)?/g, ' tuesday '],
  [/mi[ée]rcoles|\bmercredi\b|\bmittwoch\b|quarta(-feira)?/g, ' wednesday '],
  [/\bjueves\b|\bjeudi\b|\bdonnerstag\b|quinta(-feira)?/g, ' thursday '],
  [/\bviernes\b|\bvendredi\b|\bfreitag\b|sexta(-feira)?/g, ' friday '],
  [/s[aá]bado|\bsamedi\b|\bsamstag\b/g, ' saturday '],
  [/\bdomingo\b|\bdimanche\b|\bsonntag\b/g, ' sunday '],
  [/\b(?:a las|à|um|às|as)\s+(\d{1,2})(?:\s*(?:h|uhr)\s*(\d{2})?)?/g, ' at $1:$2 '],
  [/\b(\d{1,2})\s*(?:h|uhr)\s*(\d{2})?\b/g, ' $1:$2 '],
]

function normalize(t: string) {
  let out = ` ${t} `
  for (const [re, rep] of PHRASES) out = out.replace(re, rep)
  return out.replace(/:(?=\s)/g, ':00').replace(/\s+/g, ' ').trim()
}

/* ───────── parsing helpers ───────── */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function monthFrom(t: string): string | null {
  const now = new Date()
  const key = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`
  if (/last month/.test(t)) return key(new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear(), new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth())
  if (/this month/.test(t)) return key(now.getFullYear(), now.getMonth())
  const i = MONTHS.findIndex((m) => new RegExp(`\\b${m.slice(0, 3)}(${m.slice(3)})?\\b`).test(t))
  if (i < 0) return null
  const yMatch = t.match(/\b(20\d{2})\b/)
  const y = yMatch ? Number(yMatch[1]) : i > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear()
  return key(y, i)
}

function monthsMentioned(t: string): string[] {
  const out: string[] = []
  MONTHS.forEach((m, i) => {
    if (new RegExp(`\\b${m.slice(0, 3)}(${m.slice(3)})?\\b`).test(t)) {
      const now = new Date()
      const y = i > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear()
      out.push(`${y}-${String(i + 1).padStart(2, '0')}`)
    }
  })
  if (/this month/.test(t)) out.unshift(monthFrom('this month')!)
  if (/last month/.test(t)) out.push(monthFrom('last month')!)
  return out
}

function dateFrom(t: string): string | null {
  const now = new Date()
  if (/\btomorrow\b/.test(t)) return isoLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  if (/\btoday\b|\btonight\b/.test(t)) return isoLocal(now)
  const di = DAYS.findIndex((d) => t.includes(d))
  if (di >= 0) {
    const add = (di - now.getDay() + 7) % 7 || 7
    return isoLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + add + (/next week/.test(t) ? 7 : 0)))
  }
  const m = t.match(/(\d{1,2})(?:st|nd|rd|th)?(?:\s*[–-]\s*\d{1,2})?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/) || t.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/)
  if (m) {
    const [day, mon] = /^\d/.test(m[1]) ? [Number(m[1]), m[2]] : [Number(m[2]), m[1]]
    const mi = MONTHS.findIndex((x) => x.startsWith(mon))
    let d = new Date(now.getFullYear(), mi, day)
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(now.getFullYear() + 1, mi, day)
    return isoLocal(d)
  }
  return null
}

function timeFrom(t: string): string | null {
  const m = t.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) || t.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/) || t.match(/\b(\d{1,2}):(\d{2})\b/)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  const ap = m[3]
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (!ap && h >= 1 && h <= 7) h += 12 // "at 5" → 5 PM for church events
  return h > 23 || min > 59 ? null : `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

const DEPT_ALIASES: Record<string, string> = { choir: 'Worship', singers: 'Worship', ushers: 'Ushering', usher: 'Ushering', media: 'Media', children: 'Children', kids: 'Children', youth: 'Youth', prayer: 'Prayer', welcome: 'Welcome', hospitality: 'Welcome', finance: 'Finance', outreach: 'Outreach', evangelism: 'Outreach' }

function audienceFrom(t: string, ctx: ToolContext): { type: 'all' | 'stage' | 'department' | 'branch'; value: string } {
  // Phrases like “welcome message” describe the message, not the Welcome department.
  t = t.replace(/welcome (message|note|text|sms|email)s?/g, ' ')
  // Match a branch by full name, or by its first word when that word is distinctive
  // ("Lekki" for "Lekki Branch") — never generic words like "main" or "online".
  const branch = ctx.settings.branches.find((b) => {
    const name = b.toLowerCase()
    const first = name.split(' ')[0]
    return t.includes(name) || (first.length > 3 && !['main', 'online'].includes(first) && new RegExp(`\\b${first}\\b`).test(t))
  })
  if (branch) return { type: 'branch', value: branch }
  const dept = ctx.settings.departments.find((d) => new RegExp(`\\b${d.toLowerCase()}\\b`).test(t))
  if (dept) return { type: 'department', value: dept }
  for (const [alias, d] of Object.entries(DEPT_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(t) && ctx.settings.departments.includes(d)) return { type: 'department', value: d }
  }
  if (/\bworkers?\b|\bvolunteers?\b/.test(t)) return { type: 'stage', value: 'Worker' }
  if (/\bnewcomers?\b|\bvisitors?\b|first.?time/.test(t)) return { type: 'stage', value: 'Newcomer' }
  if (/\bconverts?\b/.test(t)) return { type: 'stage', value: 'Convert' }
  return { type: 'all', value: '' }
}

const channelFrom = (t: string) => (/\bemail\b/.test(t) ? 'Email' : /\bsms\b|\btext\b/.test(t) ? 'SMS' : 'WhatsApp')

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

const VERBS = 'create|schedule|crea|crear|cr[ée]e|cr[ée]er|erstelle|erstellen|plane|cria|criar|programa|organiza|organise'
const ARTICLES = 'a|an|the|una|un|une|ein|eine|einen|uma|um|el|la|le'
const STOPS = 'on|for|at|this|next|tomorrow|today|el|para|pour|le|à|am|um|für|no|na|em|às|a las|ce|este|esta|diese|nächsten|prochain|demain|mañana|morgen|amanhã|hoy|heute|hoje|aujourd'

function eventTitleFrom(raw: string): string {
  const m = raw.match(new RegExp(`(?:${VERBS})\\s+(?:(?:${ARTICLES})\\s+)?(.+?)(?:\\s+(?:${STOPS})\\b|\\s+\\d|[.?!]|$)`, 'i'))
  const title = (m?.[1] ?? '').replace(/^(new|nueva?|nouvelle?|neue[sn]?|nova?)\s+/i, '').trim()
  return title.length > 2 ? title.charAt(0).toUpperCase() + title.slice(1) : tr('ai.events.defaultTitle')
}

function flyerTitleFrom(raw: string): string {
  const m = raw.match(/(?:flyer|poster|graphic|design|folleto|cartel|affiche|plakat|folheto|cartaz)\s+(?:for|about|para|pour|f[üu]r|sobre|de)\s+(?:our\s+|the\s+|el\s+|la\s+|le\s+|o\s+|den\s+|nuestro\s+|notre\s+)?(.+?)(?:[.?!]|\s+using\b|\s+with\b|$)/i)
  if (!m) return tr('ai.design.defaultTitle')
  return titleCase(m[1].replace(/['’]s\b/g, '').replace(/\s+/g, ' ').trim()).slice(0, 28)
}

/* ───────── local router ───────── */

function honest(agent: AgentId, text: string, notice?: string): ToolResult {
  return { agent, blocks: [{ type: 'text', text }, ...(notice ? [{ type: 'notice' as const, text: notice }] : [])] }
}

function route(raw: string, ctx: ToolContext): ToolResult & { denied?: boolean; needsModel?: boolean } {
  const t = normalize(raw.toLowerCase())

  // Capabilities that need a language model (writing free-form, translating).
  if (/\btranslate\b|\bin (french|spanish|portuguese|german|italian|dutch|yoruba|igbo|hausa|swahili)\b/.test(t)) {
    return { ...honest('comms', tr('ai.route.translate')), needsModel: true }
  }
  // Not built yet — say so instead of guessing.
  if (/\bsermon|\breels?\b|\bclips?\b|transcri|livestream|\bpreach|\bdevotional\b/.test(t)) {
    return honest('media', tr('ai.route.sermons'), tr('ai.route.sermonsNote'))
  }
  if (/prayer request|counsel/.test(t)) return honest('memberCare', tr('ai.route.prayer'), tr('ai.route.prayerNote'))
  if (/\bevery (day|week|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\bwhen (someone|a visitor|a new)|\bautomat/.test(t)) {
    return honest('automation', tr('ai.route.automation'), tr('ai.route.automationNote'))
  }

  // Briefing / attention
  if (/birthday|celebrant/.test(t)) {
    if (/\bsend\b/.test(t)) return runTool('getBirthdays', { range: 'today' }, ctx)
    return runTool('getBirthdays', { range: /today|celebrat/.test(t) ? 'today' : /month/.test(t) ? 'month' : 'week' }, ctx)
  }
  if (/follow.?up|followed up|been contacted|hasn'?t been contacted|haven'?t been contacted|newcomers from/.test(t)) {
    if (/\bassign\b/.test(t)) return honest('followUp', tr('ai.route.assign'), undefined)
    return runTool('getFollowUps', { days: 7 }, ctx)
  }
  if (/haven'?t attended|not attended|stopped coming|attendance|attended/.test(t)) return runTool('getAttendanceSummary', {}, ctx)
  if (/need(s)? (my )?attention|briefing|overview|what'?s happening|good morning|summary of today|today/.test(t) && !/event|meeting|service/.test(t)) {
    return runTool('getTodayBriefing', {}, ctx)
  }
  if (/needs? care|at risk|incomplete|inactive/.test(t)) return runTool('getNeedsAttention', {}, ctx)

  // Finance
  if (/offering|giving|tithe|income|donation|how much|financ|money|expense/.test(t) && !/\bsend\b|\bmessage\b/.test(t)) {
    if (/expense/.test(t) && !/income|offering|giving/.test(t)) return runTool('getExpenseSummary', {}, ctx)
    if (/branch/.test(t)) return runTool('getBranchSummary', {}, ctx)
    const ms = monthsMentioned(t)
    if (/compare|vs\.?|versus/.test(t) && ms.length >= 2) return runTool('compareMonths', { a: ms[0], b: ms[1] }, ctx)
    if (/compare/.test(t)) return runTool('compareMonths', { a: monthFrom('this month')!, b: monthFrom('last month')! }, ctx)
    return runTool('getFinanceSummary', { period: /sunday/.test(t) ? 'last sunday' : monthFrom(t) ?? 'this month' }, ctx)
  }

  // Reports
  if (/\breport\b/.test(t)) return runTool('generateReport', { month: monthFrom(t) ?? undefined }, ctx)

  // Branches
  if (/\bbranch(es)?\b|compare all/.test(t) || ctx.settings.branches.some((b) => /how many|members|people/.test(t) && t.includes(b.toLowerCase()) && !/^main/.test(b.toLowerCase()))) {
    const b = ctx.settings.branches.find((x) => t.includes(x.toLowerCase()))
    return runTool('getBranchSummary', { branch: /compare|all/.test(t) ? '' : b ?? '' }, ctx)
  }

  // Events
  if (/\b(create|schedule|set up|organi[sz]e|plan)\b.*\b(meeting|event|service|conference|rehearsal|training|vigil|prayer|program|hangout|study|night)\b/.test(t)) {
    const date = dateFrom(t)
    const start = timeFrom(t)
    const aud = audienceFrom(t, ctx)
    return runTool(
      'createEventDraft',
      { title: eventTitleFrom(raw), date: date ?? '', start: start ?? '', mode: /\bonline\b|\bzoom\b|google meet|\bvirtual\b|\bon meet\b/.test(t) ? 'Online' : 'In person', audienceType: aud.type, audienceValue: aud.value },
      ctx,
    )
  }

  // Design
  if (/\bflyer|\bposter|\bgraphic|\bdesign\b|\bbanner\b|\bthumbnail\b/.test(t)) return runTool('startDesign', { title: flyerTitleFrom(raw), when: '' }, ctx)

  // Sending / messaging
  if (/\b(send|tell|remind|notify|message)\b/.test(t) && !/^(write|draft)/.test(t)) {
    const aud = audienceFrom(t, ctx)
    const quoted = raw.match(/["“](.+?)["”]/)?.[1]
    let body = quoted ?? ''
    let template = ''
    let vars: Record<string, string> | undefined
    if (!body) {
      // Built-in templates are sent to each member in their own communication language.
      if (/welcome/.test(t)) template = 'welcome'
      else if (/birthday/.test(t)) template = 'birthday'
      else {
        const tell = raw.match(/\b(?:tell|dile|dites?|sag|diz)\s+(?:the |all |our |a |à |aos? |los |les |den )?\w+(?: members| team)?\s+(?:that\s+|que\s+|dass\s+)?(.+)/i)?.[1]
        const about = raw.match(/\b(?:about|sobre|sur|über|acerca de)\s+(.+)/i)?.[1]
        if (tell || about) body = tr('tpl.announcement', { text: (tell ?? about)!.replace(/[.!?]*$/, '') })
        else {
          const next = ctx.events.filter((e) => e.date >= isoLocal(new Date())).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0]
          template = next ? 'reminder' : 'sunday'
          if (next) vars = reminderVars(next)
        }
      }
    }
    if (template) body = tpl(template, vars)
    return runTool('prepareMessage', { body, channel: channelFrom(t), audienceType: aud.type, audienceValue: aud.value, template, vars }, ctx)
  }
  if (/\b(write|draft|compose)\b/.test(t) && /message|announcement|reminder|text|note/.test(t)) {
    return runTool('draftMessage', { purpose: /welcome|newcomer/.test(t) ? 'welcome' : /birthday/.test(t) ? 'birthday' : /thank/.test(t) ? 'thanks' : 'reminder' }, ctx)
  }

  // Departments
  if (/department|workers?\b|who leads|leader|choir|ushers|media team|protocol/.test(t)) {
    const d = audienceFrom(t, ctx)
    return runTool('getDepartmentSummary', { department: d.type === 'department' ? d.value : '' }, ctx)
  }

  // Events listing
  if (/event|coming up|this week|calendar|schedule|service time/.test(t)) return runTool('getEvents', { days: /month/.test(t) ? 30 : 7 }, ctx)

  // Members / knowledge
  const age = t.match(/aged?\s+(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})/)
  if (age) return runTool('searchMembers', { ageMin: Number(age[1]), ageMax: Number(age[2]) }, ctx)
  if (/joined|new members|who joined/.test(t)) return runTool('searchMembers', { joined: /last month/.test(t) ? 'last month' : 'this month' }, ctx)
  const stage = STAGES.find((s) => new RegExp(`\\b${s.toLowerCase()}s?\\b`).test(t))
  const inBranch = ctx.settings.branches.find((b) => t.includes(b.toLowerCase()))
  if (/how many|total|count/.test(t) && /member|people|church/.test(t)) return runTool('getMembershipStats', {}, ctx)
  if (/\b(find|search|show|who is|look up|lookup)\b/.test(t) || inBranch) {
    const name = raw.replace(/^(find|search( for)?|show( me)?|who is|look ?up)\s+/i, '').replace(/[?.!]+$/, '').trim()
    if (inBranch) return runTool('searchMembers', { branch: inBranch, stage: stage ?? '' }, ctx)
    if (stage) return runTool('searchMembers', { stage }, ctx)
    return runTool('searchMembers', { query: name }, ctx)
  }
  const named = ctx.members.find((m) => t.includes(m.fullName.toLowerCase()))
  if (named) return runTool('searchMembers', { query: named.fullName }, ctx)

  return {
    agent: 'admin',
    needsModel: true,
    blocks: [
      {
        type: 'text',
        text: tr('ai.route.help'),
      },
    ],
  }
}

/* ───────── public entry point ───────── */

const CANONICAL: Record<string, string> = {
  birthdaysToday: 'Show today’s birthdays',
  followUp: 'Who needs follow-up?',
  inactive: 'Who is inactive?',
  finance: 'Give me this month’s finance summary',
  attention: 'What needs my attention today?',
  announcement: 'Write a reminder for our next event',
  report: 'Generate this month’s report',
  birthdaysWeek: 'Whose birthday is this week?',
}

const SYSTEM = `You are Ellen, the AI assistant inside ZionDesk church management software.
Always reply in the language the user writes in. If they ask for content in another language (for example "write this in French"), write that content in the requested language.
Use the provided tools to answer; they return the church's real records. Never invent numbers, names or events — if a tool can't answer, say "I don't have enough information to answer that yet."
Never make spiritual judgments about people (say "attendance follow-up suggested", not "backsliding"). Leadership makes pastoral decisions.
Keep answers short, warm and practical. Use simple language — no technical terms.`

export async function ask(
  text: string,
  ctx: ToolContext,
  opts: { pref: ProviderPref; status: ProviderStatus; history: { role: 'user' | 'assistant'; content: string }[]; routeKey?: string; attachments?: Attachment[] },
): Promise<AskOutcome> {
  // Built-in questions route by their canonical English wording; typed text is normalised in route().
  const local = route(opts.routeKey && CANONICAL[opts.routeKey] ? CANONICAL[opts.routeKey] : text, ctx)
  const files = opts.attachments ?? []
  const images = files.filter((f) => f.image).map((f) => f.image!)
  const wantsModel = local.needsModel || opts.pref !== 'auto' || files.length > 0
  const task = images.length ? 'vision' : local.needsModel && /translat/i.test(text) ? 'translate' : 'write'
  const provider = wantsModel ? pickProvider(task, opts.pref === 'local' ? 'auto' : opts.pref, opts.status) : null
  // Text from attached documents goes inline (trimmed); images go as image blocks.
  const docText = files
    .filter((f) => f.text)
    .map((f) => `--- ${f.name} ---\n${f.text!.slice(0, 20000)}`)
    .join('\n\n')
  const content = docText ? `${text}\n\n${docText}` : text

  if (provider && provider !== 'local') {
    try {
      const allowed = TOOLS.filter((t) => ctx.user && t.allow(ctx.user.role))
      const out = await remoteComplete(
        provider,
        `${SYSTEM}\nChurch: ${ctx.settings.churchName}. The user's app language is ${LANGS.find((l) => l.code === getLang())?.native ?? 'English'}; use it when the message language is unclear.`,
        [...opts.history.slice(-8), { role: 'user', content, images: images.length ? images : undefined }],
        allowed.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })),
      )
      if (out.toolCalls.length) {
        const first = runTool(out.toolCalls[0].name, out.toolCalls[0].input, ctx) // re-validated + permission-checked
        return { ...first, provider, usage: out.usage, blocks: [...(out.text ? [{ type: 'text' as const, text: out.text }] : []), ...first.blocks] }
      }
      return { agent: 'church-ai', provider, usage: out.usage, blocks: [{ type: 'text', text: out.text || tr('ai.notEnough') }] }
    } catch (err) {
      return { ...local, provider: 'local', blocks: [...local.blocks, { type: 'notice', text: tr('ai.route.unreachable', { error: err instanceof Error ? err.message : 'error' }) }] }
    }
  }
  if (files.length) return { ...local, provider: 'local', blocks: [...local.blocks, { type: 'notice', text: tr('ai.attach.needsModel') }] }
  return { ...local, provider: 'local' }
}

export const agentName = (a: AgentId | 'church-ai') => (a === 'church-ai' || !(a in AGENTS) ? 'Ellen' : tr(`ai.agents.${a}`))
