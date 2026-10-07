import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  HelpCircle,
  LayoutGrid,
  MessageSquareText,
  Palette,
  Plus,
  QrCode,
  Search,
  Settings,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { NotificationsMenu, ProfileMenu } from './TopMenus'
import { useSession } from '../lib/session'
import { useWorkspace, WorkspaceProvider } from './workspace'
import { initials } from './types'
import { ThemeToggle, useTheme } from '../theme'
import { MemberStoreProvider, useMembers } from './store'
import { AiProvider } from '../ai/store'
import { type Role } from './types'
import { useT } from '../i18n'
import { LanguagePopup } from '../i18n/LanguagePopup'
import { ConfirmHost } from './confirm'
import { LangMenu } from '../i18n/Flags'
import './dashboard.css'
import { apiUrl } from '../lib/api'
import { useInboxUnread } from './Inbox'

const TRIAL_KEY = 'ziondesk-trial'
const TRIAL_DAYS = 7

const NAV = [
  { to: '/dashboard', key: 'overview', end: true },
  { to: '/dashboard/ai', key: 'ai' },
  { to: '/dashboard/members', key: 'members' },
  { to: '/dashboard/attendance', key: 'attendance' },
  { to: '/dashboard/giving', key: 'giving' },
  { to: '/dashboard/messaging', key: 'messaging' },
  { to: '/dashboard/events', key: 'events' },
  { to: '/dashboard/design', key: 'design' },
  { to: '/dashboard/links', key: 'links' },
  { to: '/dashboard/reports', key: 'reports' },
  { to: '/dashboard/branches', key: 'branches' },
]
/** Menu items per role: branch leaders only see their branch reports; ministry leaders don't see branch finance. */
const navFor = (role: Role | null) => (role === 'branch' ? NAV.filter((n) => n.key === 'branches') : role === 'leader' ? NAV.filter((n) => n.key !== 'branches') : NAV)
/** The top menu groups related pages so it stays short (6 entries instead of 11). */
const GROUPS: { key: string; items: string[] }[] = [
  { key: 'overview', items: ['overview'] },
  { key: 'ai', items: ['ai'] },
  { key: 'people', items: ['members', 'attendance'] },
  { key: 'finance', items: ['giving', 'branches'] },
  { key: 'outreach', items: ['messaging', 'events', 'design', 'links'] },
  { key: 'reports', items: ['reports'] },
]
type NavItem = (typeof NAV)[number]

/** One menu entry: a link, or a group button with a dropdown of its pages. */
function NavGroup({ group, items, unread, onGo, previewActive }: { group: string; items: NavItem[]; unread: number; onGo: () => void; previewActive?: string }) {
  const { t } = useT()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', esc))
  }, [open])
  const link = (n: NavItem, label = t(`dash.nav.${n.key}`)) => (
    <NavLink key={n.to} to={n.key === 'messaging' && unread ? `${n.to}?tab=inbox` : n.to} end={'end' in n ? n.end : undefined} onClick={onGo}>
      {label}
      {n.key === 'messaging' && unread > 0 && <i className="m-badge">{unread}</i>}
    </NavLink>
  )
  if (previewActive !== undefined) {
    const active = items.some((n) => n.key === previewActive)
    return (
      <span data-nav={group} className={active ? 'active' : ''}>
        {items.length === 1 ? t(`dash.nav.${items[0].key}`) : t(`dash.nav.${group}`)}
      </span>
    )
  }
  if (items.length === 1) return link(items[0])
  const active = items.some((n) => pathname.startsWith(n.to))
  const badge = items.some((n) => n.key === 'messaging') ? unread : 0
  return (
    <div className={`d-navgroup ${open ? 'is-open' : ''}`} ref={ref}>
      <button type="button" className={active ? 'active' : ''} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {t(`dash.nav.${group}`)}
        {badge > 0 && <i className="m-badge">{badge}</i>}
        <ChevronDown size={14} />
      </button>
      <div className="d-navdrop" role="menu">
        <small className="d-navhead">{t(`dash.nav.${group}`)}</small>
        {items.map((n) => link(n))}
      </div>
    </div>
  )
}

function useTrial() {
  const [params] = useSearchParams()
  const { live, trialEndsAt, settings } = useWorkspace()
  const [trial, setTrial] = useState<{ email: string; started: number } | null>(() => {
    try {
      const raw = localStorage.getItem(TRIAL_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  useEffect(() => {
    if (params.get('trial') !== '1' || trial) return
    const t = { email: params.get('email') ?? '', started: Date.now() }
    setTrial(t)
    try {
      localStorage.setItem(TRIAL_KEY, JSON.stringify(t))
    } catch {
      /* ignore */
    }
  }, [params, trial])
  if (live) {
    // Live: the trial clock comes from the church record.
    if (!trialEndsAt || settings.planStatus !== 'trial') return null
    const leftLive = Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 864e5))
    return leftLive > 0 ? { email: settings.email, started: 0, left: leftLive } : null
  }
  if (!trial) return null
  const left = Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - trial.started) / 864e5))
  return { ...trial, left }
}

/** Platform announcement set by ZionDesk staff in /admin → Settings (dismissible per message). */
function MeetErrorNotice() {
  const [error, setError] = useState('')
  useEffect(() => {
    const onError = (event: Event) => setError(String((event as CustomEvent).detail))
    window.addEventListener('ziondesk:meet-error', onError)
    return () => window.removeEventListener('ziondesk:meet-error', onError)
  }, [])
  return error ? <div className="d-errors" role="alert">{error} <button type="button" onClick={() => setError('')}>×</button></div> : null
}

function AnnouncementBar() {
  const [a, setA] = useState<{ text: string; tone: string; link: string; at?: string } | null>(null)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    fetch(apiUrl('/announcement'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        try {
          if (localStorage.getItem('ziondesk-announcement-hidden') === d.at) return
        } catch {
          /* ignore */
        }
        setA(d)
      })
      .catch(() => {})
  }, [])
  if (!a || hidden) return null
  return (
    <div className={`d-announce is-${a.tone}`}>
      <span>{a.text}</span>
      {a.link && (
        <a href={a.link} className="d-trial-cta">
          →
        </a>
      )}
      <button
        type="button"
        aria-label="Hide"
        onClick={() => {
          setHidden(true)
          try {
            localStorage.setItem('ziondesk-announcement-hidden', a.at ?? '')
          } catch {
            /* ignore */
          }
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

function TrialBanner() {
  const trial = useTrial()
  const { live, settings } = useWorkspace()
  const { t } = useT()
  const [hidden, setHidden] = useState(false)
  if (live && settings.planStatus === 'past_due')
    return (
      <div className="d-trial is-warn">
        <span className="d-trial-tag">{t('dash.billing.tag')}</span>
        <span>{t('dash.billing.pastDue')}</span>
        <Link to="/dashboard/settings?tab=plan" className="d-trial-cta">
          {t('dash.billing.fix')}
        </Link>
      </div>
    )
  if (!trial || hidden) return null
  return (
    <div className="d-trial">
      <span className="d-trial-tag">{t('dash.trial.tag')}</span>
      <span>
        <b>{t('dash.trial.left', { count: trial.left })}</b> {t('dash.trial.rest')}
      </span>
      <Link to={live ? '/dashboard/settings?tab=plan' : `/register?trial=1&email=${encodeURIComponent(trial.email)}`} className="d-trial-cta">
        {live ? t('dash.billing.choose') : t('dash.trial.finish')}
      </Link>
      <button type="button" aria-label={t('dash.trial.hide')} onClick={() => setHidden(true)}>
        <X size={14} />
      </button>
    </div>
  )
}

function RoleSwitch() {
  const { role, setRole } = useMembers()
  const { t } = useT()
  return (
    <label className="d-role" title={t('dash.viewingAsHint')}>
      <span>{t('dash.viewingAs')}</span>
      <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
        {(['admin', 'finance', 'leader'] as Role[]).map((r) => (
          <option key={r} value={r}>
            {t(`enums.role.${r}`)}
          </option>
        ))}
      </select>
    </label>
  )
}

function Rail() {
  const navigate = useNavigate()
  const { t } = useT()
  const items = [
    { icon: Search, label: t('dash.rail.search'), go: '/dashboard/members?focus=search' },
    { icon: Plus, label: t('dash.rail.addMember'), go: '/dashboard/members?new=1' },
    { icon: Upload, label: t('dash.rail.import'), go: '/dashboard/members?import=1' },
    { icon: Users, label: t('dash.nav.members'), go: '/dashboard/members' },
    { icon: MessageSquareText, label: t('dash.nav.messaging'), go: '/dashboard/messaging' },
    { icon: CalendarDays, label: t('dash.nav.events'), go: '/dashboard/events' },
    { icon: Palette, label: t('dash.nav.design'), go: '/dashboard/design' },
    { icon: Sparkles, label: t('dash.nav.ai'), go: '/dashboard/ai' },
    { icon: QrCode, label: t('dash.nav.links'), go: '/dashboard/links' },
    { icon: BarChart3, label: t('dash.nav.reports'), go: '/dashboard/reports' },
    { icon: Settings, label: t('dash.nav.settings'), go: '/dashboard/settings' },
    { icon: HelpCircle, label: t('dash.nav.help'), go: '/dashboard/help' },
  ]
  return (
    <nav className="d-rail" aria-label={t('dash.rail.label')}>
      <button type="button" className="d-rail-home" aria-label={t('dash.nav.overview')} onClick={() => navigate('/dashboard')}>
        <LayoutGrid size={18} />
      </button>
      {items.map((it) => (
        <button key={it.label} type="button" aria-label={it.label} title={it.label} onClick={() => navigate(it.go)}>
          <it.icon size={17} />
        </button>
      ))}
    </nav>
  )
}

/**
 * Dashboard chrome (top bar, pill nav, rail). In `preview` mode it renders static
 * nav with a forced active item so it can be embedded on the marketing site.
 */
export function DashboardFrame({ children, preview }: { children: ReactNode; preview?: { active: string } }) {
  const { theme } = useTheme()
  const session = useSession()
  const me = session.remote ? session.name || session.email : 'Pastor Mike'
  const { t } = useT()
  const unread = useInboxUnread(!preview && Boolean(session.session && session.church))
  const [menu, setMenu] = useState(false)
  return (
    <div className={`dash ${preview ? 'is-preview' : ''}`}>
      {!preview && <><AnnouncementBar /><MeetErrorNotice /></>}
      {!preview && <TrialBanner />}
      {!preview && <LanguagePopup />}
      {!preview && <ConfirmHost />}
      <header className="d-top">
        <Link to="/" className="d-brand" aria-label={t('dash.website')}>
          <img src={theme === 'dark' ? '/brand/logo-lime.webp' : '/brand/logo-color.webp'} alt="ZionDesk" />
        </Link>
        <nav className={`d-nav ${menu ? 'is-open' : ''}`}>
          {(() => {
            const allowed = preview ? NAV : navFor(session.remote ? session.role : null)
            return GROUPS.map((g) => {
              const items = g.items.map((k) => allowed.find((n) => n.key === k)).filter((n): n is NavItem => Boolean(n))
              return items.length ? <NavGroup key={g.key} group={g.key} items={items} unread={unread} onGo={() => setMenu(false)} previewActive={preview?.active} /> : null
            })
          })()}
        </nav>
        <div className="d-top-end">
          {!session.remote && <RoleSwitch />}
          {!preview && <LangMenu />}
          <ThemeToggle />
          {preview ? (
            <>
              {/* Static picture on the marketing site */}
              <span className="d-icon-btn" aria-hidden="true">
                <Bell size={17} />
                <i className="d-dot" />
              </span>
              <span className="d-me" aria-hidden="true">
                {initials(me) || '•'}
              </span>
            </>
          ) : (
            <>
              <NotificationsMenu />
              <ProfileMenu />
            </>
          )}
          <button type="button" className="d-icon-btn d-menu-btn" aria-label={t('common.menu')} onClick={() => setMenu((m) => !m)}>
            {menu ? <X size={17} /> : <LayoutGrid size={17} />}
          </button>
        </div>
      </header>
      <div className="d-body">
        {session.role !== 'branch' && <Rail />}
        <main className="d-main">{children}</main>
      </div>
    </div>
  )
}

/** Live: when the trial or paid plan has ended, only Settings (plan, account, data export) and Help stay open. */
function Paywall() {
  const { t } = useT()
  const { role } = useMembers()
  return (
    <div className="d-page">
      <section className="d-panel d-paywall">
        <h1>{t('dash.billing.expiredTitle')}</h1>
        <p>{t('dash.billing.expiredText')}</p>
        {role === 'admin' ? (
          <Link to="/dashboard/settings?tab=plan" className="d-btn d-btn-ink">
            {t('dash.billing.choose')}
          </Link>
        ) : (
          <p className="d-muted">{t('dash.billing.askAdmin')}</p>
        )}
        <Link to="/dashboard/settings?tab=account" className="d-link">
          {t('dash.billing.export')}
        </Link>
      </section>
    </div>
  )
}

function Shell() {
  const { loading, live, settings } = useWorkspace()
  const { pathname } = useLocation()
  const { t } = useT()
  const session = useSession()
  // Branch leaders only use Branch reports (and Help).
  if (session.remote && session.role === 'branch' && !/^\/dashboard\/(branches|help)/.test(pathname)) return <Navigate to="/dashboard/branches" replace />
  if (loading)
    return (
      <div className="d-loading" role="status">
        <span className="spinner dark" /> {t('common.loading')}
      </div>
    )
  return (
    <DashboardFrame>
      {live && settings.planStatus === 'expired' && !/\/dashboard\/(settings|help)/.test(pathname) ? <Paywall /> : <Outlet />}
    </DashboardFrame>
  )
}

export default function DashboardLayout() {
  const session = useSession()
  const { t } = useT()
  // Connected to Supabase: you must be signed in and belong to a church.
  if (session.remote) {
    if (session.loading)
      return (
        <div className="d-loading" role="status">
          <span className="spinner dark" /> {t('common.loading')}
        </div>
      )
    if (!session.session) return <Navigate to="/login" replace />
    if (!session.church) return <Navigate to="/register?step=church" replace />
  }
  return (
    <MemberStoreProvider>
      <WorkspaceProvider>
        <AiProvider>
          <Shell />
        </AiProvider>
      </WorkspaceProvider>
    </MemberStoreProvider>
  )
}
