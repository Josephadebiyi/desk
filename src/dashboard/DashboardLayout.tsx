import {
  BarChart3,
  Bell,
  CalendarDays,
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
import { useEffect, useState, type ReactNode } from 'react'
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
import { LangMenu } from '../i18n/Flags'
import './dashboard.css'

const TRIAL_KEY = 'ziondesk-trial'
const TRIAL_DAYS = 7

const NAV = [
  { to: '/dashboard', key: 'overview', end: true },
  { to: '/dashboard/ai', key: 'ai' },
  { to: '/dashboard/members', key: 'members' },
  { to: '/dashboard/giving', key: 'giving' },
  { to: '/dashboard/messaging', key: 'messaging' },
  { to: '/dashboard/events', key: 'events' },
  { to: '/dashboard/design', key: 'design' },
  { to: '/dashboard/links', key: 'links' },
  { to: '/dashboard/reports', key: 'reports' },
]

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
  const [menu, setMenu] = useState(false)
  return (
    <div className={`dash ${preview ? 'is-preview' : ''}`}>
      {!preview && <TrialBanner />}
      {!preview && <LanguagePopup />}
      <header className="d-top">
        <Link to="/" className="d-brand" aria-label={t('dash.website')}>
          <img src={theme === 'dark' ? '/brand/logo-lime.webp' : '/brand/logo-color.webp'} alt="ZionDesk" />
        </Link>
        <nav className={`d-nav ${menu ? 'is-open' : ''}`}>
          {NAV.map((n) =>
            preview ? (
              <span key={n.to} data-nav={n.key} className={preview.active === n.key ? 'active' : ''}>
                {t(`dash.nav.${n.key}`)}
              </span>
            ) : (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMenu(false)}>
                {t(`dash.nav.${n.key}`)}
              </NavLink>
            ),
          )}
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
        <Rail />
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
