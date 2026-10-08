import { ArrowRightLeft, Bell, Check, HelpCircle, Languages, LogOut, Settings as SettingsIcon, Sparkles, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { buildInbox } from '../ai/inbox'
import { agentName } from '../ai/orchestrator'
import { useAi } from '../ai/store'
import type { ToolContext } from '../ai/tools'
import { useT } from '../i18n'
import { useSession } from '../lib/session'
import { tEnum } from './kit'
import { useBranchNotices } from './Branches'
import { useMembers } from './store'
import { initials } from './types'
import { useWorkspace } from './workspace'

/** Closes a popover on outside click / Escape. */
function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', out)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return { open, setOpen, ref }
}

const SEEN_KEY = 'ziondesk-notifications-seen'
const readSeen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
  } catch {
    return []
  }
}

/** Bell: today's real items (birthdays, follow-ups, reminders, transfers…) from church records. */
export function NotificationsMenu() {
  const { t, locale } = useT()
  const m = useMembers()
  const ws = useWorkspace()
  const ai = useAi()
  const navigate = useNavigate()
  const { open, setOpen, ref } = usePopover()
  const [seen, setSeen] = useState<string[]>(readSeen)
  const branchNotices = useBranchNotices()

  const built = useMemo(() => {
    const ctx = {
      user: { name: '', role: m.role },
      churchId: null,
      members: m.members,
      settings: ws.settings,
      events: ws.events,
      campaigns: ws.campaigns,
      expenses: ws.expenses,
      anonGifts: ws.anonGifts,
      designRequests: ws.requests,
      claims: ws.claims,
      messageCost: ai.settings.messageCost,
      actions: { addCampaign: ws.addCampaign, logCommunicationMany: m.logCommunicationMany, saveEvent: ws.saveEvent },
    } as ToolContext
    const now = new Date().toISOString()
    return buildInbox(ctx, m.role).filter((it) => {
      const s = ai.inbox[it.id]
      return !s || (s.status === 'snoozed' && !!s.until && s.until < now)
    })
    // locale: rebuild translated text when the language changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.members, m.role, ws.settings, ws.events, ws.campaigns, ws.requests, ws.claims, ai.inbox, locale])
  const items = useMemo(() => {
    const now = new Date().toISOString()
    const extra = branchNotices.filter((it) => {
      const s = ai.inbox[it.id]
      return !s || (s.status === 'snoozed' && !!s.until && s.until < now)
    })
    return [...extra, ...built]
  }, [branchNotices, built, ai.inbox])

  const unread = items.filter((i) => !seen.includes(i.id)).length
  const markSeen = () => {
    const next = [...new Set([...seen, ...items.map((i) => i.id)])].slice(-300)
    setSeen(next)
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="tm" ref={ref}>
      <button
        type="button"
        className="d-icon-btn"
        aria-label={t('dash.notif.title')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
          if (!open) markSeen()
        }}
      >
        <Bell size={17} />
        {unread > 0 && <i className="d-dot" aria-label={t('dash.notif.unread', { count: unread })} />}
      </button>
      {open && (
        <div className="tm-pop tm-notif" role="dialog" aria-label={t('dash.notif.title')}>
          <div className="tm-head">
            <b>{t('dash.notif.title')}</b>
            <span className="d-pill">{items.length}</span>
          </div>
          {items.length ? (
            <ul>
              {items.slice(0, 8).map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    className="tm-item"
                    onClick={() => {
                      setOpen(false)
                      navigate(it.href, { state: it.state })
                    }}
                  >
                    <span className={`ai-prio p${it.priority}`} />
                    <span>
                      <b>{it.title}</b>
                      <small>
                        {agentName(it.agent)} · {it.detail}
                      </small>
                    </span>
                  </button>
                  <button type="button" className="d-circle d-circle-sm" title={t('ai.page.markDone')} aria-label={t('ai.page.markDone')} onClick={() => ai.setInbox(it.id, { status: 'done' })}>
                    <Check size={12} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tm-empty">{t('ai.page.caughtUp')}</p>
          )}
          <Link to="/dashboard/ai" className="tm-foot" onClick={() => setOpen(false)}>
            <Sparkles size={14} /> {t('dash.notif.all')}
          </Link>
        </div>
      )}
    </div>
  )
}

function Row({ to, icon, children, onClick }: { to?: string; icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return to ? (
    <Link to={to} className="tm-row" onClick={onClick}>
      {icon} {children}
    </Link>
  ) : (
    <button type="button" className="tm-row" onClick={onClick}>
      {icon} {children}
    </button>
  )
}

/** Avatar: who you are, quick links, sign out. */
export function ProfileMenu() {
  const { t } = useT()
  const session = useSession()
  const { role } = useMembers()
  const { settings } = useWorkspace()
  const navigate = useNavigate()
  const { open, setOpen, ref } = usePopover()
  const name = session.remote ? session.name || session.email : 'Pastor Mike'
  const email = session.remote ? session.email : settings.email
  const close = () => setOpen(false)
  const face = session.avatarUrl ? <img src={session.avatarUrl} alt="" /> : initials(name) || '•'

  return (
    <div className="tm" ref={ref}>
      <button type="button" className="d-me" aria-haspopup="menu" aria-expanded={open} aria-label={t('dash.signedInAs', { name })} title={name} onClick={() => setOpen((o) => !o)}>
        {face}
      </button>
      {open && (
        <div className="tm-pop tm-profile" role="menu">
          <div className="tm-who">
            <span className="d-me is-lg" aria-hidden="true">
              {face}
            </span>
            <span>
              <b>{name}</b>
              <small>{email}</small>
              <small>
                {tEnum('role', role)} · {settings.churchName}
              </small>
            </span>
          </div>
          {!session.remote && <p className="tm-note">{t('dash.profile.preview')}</p>}
          {/* Several accounts (e.g. HQ as branch leader + the branch's own ZionDesk): switch between them. */}
          {session.churches.length > 1 && (
            <div className="tm-switch">
              <small>{t('dash.profile.switch')}</small>
              {session.churches
                .filter((c) => c.id !== session.church?.id)
                .map((c) => (
                  <Row
                    key={c.id}
                    icon={<ArrowRightLeft size={16} />}
                    onClick={() => {
                      close()
                      session.selectChurch(c.id)
                      navigate('/dashboard')
                    }}
                  >
                    <span className="tm-switch-name">
                      {c.name}
                      <small>{c.role === 'branch' && c.branch ? `${tEnum('role', c.role)} · ${c.branch}` : tEnum('role', c.role)}</small>
                    </span>
                  </Row>
                ))}
            </div>
          )}
          <Row to="/dashboard/settings?tab=account" icon={<UserRound size={16} />} onClick={close}>
            {t('settings.account.title')}
          </Row>
          <Row to="/dashboard/settings?tab=language" icon={<Languages size={16} />} onClick={close}>
            {t('lang.title')}
          </Row>
          {role === 'admin' && (
            <Row to="/dashboard/settings" icon={<SettingsIcon size={16} />} onClick={close}>
              {t('dash.nav.settings')}
            </Row>
          )}
          <Row to="/dashboard/help" icon={<HelpCircle size={16} />} onClick={close}>
            {t('dash.nav.help')}
          </Row>
          {session.remote ? (
            <Row
              icon={<LogOut size={16} />}
              onClick={async () => {
                close()
                await session.signOut()
                navigate('/login')
              }}
            >
              {t('dash.signOut')}
            </Row>
          ) : (
            <Row to="/" icon={<X size={16} />} onClick={close}>
              {t('dash.profile.exitPreview')}
            </Row>
          )}
        </div>
      )}
    </div>
  )
}
