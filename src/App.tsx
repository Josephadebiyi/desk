import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  BellRing,
  CalendarDays,
  Check,
  CircleCheck,
  CreditCard,
  Download,
  HandHeart,
  LayoutDashboard,
  MailCheck,
  Landmark,
  Mail,
  MessageSquareText,
  Plus,
  QrCode,
  Search,
  Send,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Nav from './components/Nav'
import DashboardPreview from './dashboard/DashboardPreview'
import { GoogleMeetLogo } from './components/GoogleMeet'
import { startTrial, TRIAL_DAYS, type TrialResult } from './lib/trial'
import { Icon3D, IconCanvas, type IconName } from './components/Icons3D'
import { Flyer, flyerName, flyerSample, FLYER_TEMPLATES, type FlyerId } from './components/Flyers'
import { Reveal } from './components/ui'
import { getLocale, useT } from './i18n'
import { BASE_CURRENCY, formatMoney, guessCurrency, planPrice, priceWithLocal } from './lib/currency'
import type { PlanKey } from './lib/plans'

/** Escape user text before putting it into a translated HTML string. */
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
/** Whole-dollar marketing amounts in the visitor's number format. */
const money = (n: number, digits = 0) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
/** A clock time (24h input) in the visitor's format. */
const clock = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' })

/** Pexels CDN image (free to use under the Pexels license). */
const px = (id: number, w = 1200) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`

const PHOTO = {
  worshipLights: 34328510,
  worshipStage: 34328505,
  worshipHands: 19130852,
  worshipCrowd: 36425621,
  pastor: 8815003,
  bibleStudy: 34683153,
  choir: 7520735,
  volunteers: 6647027,
  volunteers2: 6646987,
  donate: 7345399,
  friends: 3758052,
  worshipWoman: 34625181,
  communion: 38786011,
}

/* ───────────────────────── Decorative shapes ───────────────────────── */

function Sparkle({ className = '' }: { className?: string }) {
  return (
    <svg className={`sparkle ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 0C54 34 66 46 100 50C66 54 54 66 50 100C46 66 34 54 0 50C34 46 46 34 50 0Z" />
    </svg>
  )
}

function Burst({ className = '', points = 14 }: { className?: string; points?: number }) {
  const d = Array.from({ length: points * 2 }, (_, i) => {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? 34 : 50
    return `${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`
  }).join(' ')
  return (
    <svg className={`burst ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points={d} />
    </svg>
  )
}

/** Inline word set in a coloured pill, like the reference headlines. */
function Pill({ children, tone = 'lime' }: { children: ReactNode; tone?: 'lime' | 'purple' | 'ink' }) {
  return <span className={`hl hl-${tone}`}>{children}</span>
}

function EmailCapture({ cta, dark = false }: { cta?: string; dark?: boolean }) {
  const { t, commLang } = useT()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<TrialResult | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setState('error')
      setError(t('site.capture.invalid'))
      return
    }
    setState('loading')
    try {
      setResult(await startTrial(email, commLang))
      setState('idle')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : t('common.somethingWrong'))
    }
  }

  if (result)
    return (
      <motion.div
        className={`trial-done ${dark ? 'on-dark' : ''}`}
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        role="status"
      >
        <span className="trial-ico">
          <MailCheck size={20} />
        </span>
        <div>
          {result.status === 'sent' ? (
            <>
              <b>{t('site.capture.checkInbox')}</b>
              <p dangerouslySetInnerHTML={{ __html: t('site.capture.sent', { days: TRIAL_DAYS, email: esc(email) }) }} />
            </>
          ) : (
            <>
              <b>{t('site.capture.ready')}</b>
              <p dangerouslySetInnerHTML={{ __html: t('site.capture.preview', { email: esc(email) }) }} />
            </>
          )}
          <div className="trial-links">
            <Link className="btn btn-lime btn-sm" to={result.dashboardUrl}>
              {t('site.capture.openDash')}
            </Link>
            <Link className="btn btn-outline btn-sm" to={result.signupUrl}>
              {t('site.capture.finish')}
            </Link>
            {result.status === 'preview' && (
              <Link className="trial-preview" to={`/email-preview?email=${encodeURIComponent(email)}`}>
                {t('site.capture.seeEmail')}
              </Link>
            )}
          </div>
        </div>
      </motion.div>
    )

  return (
    <form className={`capture ${dark ? 'capture-dark' : ''}`} onSubmit={submit} noValidate>
      <input
        type="email"
        placeholder={t('site.capture.placeholder')}
        aria-label={t('common.emailAddress')}
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          if (state === 'error') setState('idle')
        }}
        aria-invalid={state === 'error'}
      />
      <button className="btn btn-lime" type="submit" disabled={state === 'loading'}>
        {state === 'loading' ? t('site.capture.starting') : cta ?? t('site.capture.cta')}
      </button>
      {state === 'error' && <span className="capture-error">{error}</span>}
    </form>
  )
}

/* ───────────────────────── Hero (glass dashboard) ───────────────────────── */

/** Glass browser frame showing the real ZionDesk dashboard (demo data, animated walkthrough). */
function DashboardShot() {
  return (
    <div className="browser glass-browser">
      <div className="browser-bar">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        <span className="url">app.ziondesk.com/dashboard</span>
      </div>
      <DashboardPreview />
    </div>
  )
}

function Hero() {
  const { t } = useT()
  const ease = [0.22, 1, 0.36, 1] as const
  return (
    <section className="hero2" id="top">
      <div className="hero2-glow" aria-hidden="true" />
      <div className="container hero2-inner">
        <motion.span
          className="badge"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <i /> {t('site.hero.badge')}
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8, ease }}
        >
          {t('site.hero.h1a')} <br />
          <span className="hero2-accent">{t('site.hero.h1b')}</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          {t('site.hero.sub')}
        </motion.p>
        <motion.div
          className="btn-row center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <Link className="btn btn-ink" to="/register">
            {t('site.hero.cta')}
          </Link>
          <a className="btn btn-white" href="#ministries">
            {t('site.hero.see')}
          </a>
        </motion.div>
        <motion.div
          className="hero2-meta"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <span>
            <CircleCheck size={15} /> {t('site.hero.trial', { days: TRIAL_DAYS })}
          </span>
          <span>
            <CircleCheck size={15} /> {t('site.hero.essentials')}
          </span>
        </motion.div>
        <motion.div
          className="hero2-shot"
          initial={{ opacity: 0, y: 60, rotateX: 14 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ delay: 0.55, duration: 1.1, ease }}
        >
          <DashboardShot />
        </motion.div>
      </div>
    </section>
  )
}

/* ───────────────────────── Hero ───────────────────────── */

function PhotoBanner() {
  const { t } = useT()
  const ease = [0.22, 1, 0.36, 1] as const
  return (
    <section className="hero container">
      <motion.div
        className="hero-frame"
        initial={{ opacity: 0, scale: 0.98 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.9, ease }}
      >
        <motion.img
          src={px(PHOTO.worshipWoman, 2000)}
          alt={t('site.banner.alt')}
          initial={{ scale: 1.12 }}
          whileInView={{ scale: 1 }}
          transition={{ duration: 1.8, ease }}
        />
        <div className="hero-shade" />

        <div className="hero-copy">
          <motion.span
            className="kicker"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {t('site.banner.kicker')}
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8, ease }}
          >
            {t('site.banner.h2a')} <br />
            {t('site.banner.h2b')} <span className="lime-text">{t('site.banner.h2c')}</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
          >
            {t('site.banner.sub')}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <p className="hero-note">
              <CircleCheck size={15} /> <span dangerouslySetInnerHTML={{ __html: t('site.banner.note', { days: TRIAL_DAYS }) }} />
            </p>
            <EmailCapture />
          </motion.div>
        </div>

        <div className="hero-chats" aria-hidden="true">
          <motion.div
            className="chat-card"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.0, ease }}
          >
            <div className="chat-who">
              <span className="chat-av">
                <Sparkles size={12} />
              </span>
              Ellen
            </div>
            <p>{t('site.banner.chat1')}</p>
          </motion.div>
          <motion.div
            className="chat-card"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.4, ease }}
          >
            <p dangerouslySetInnerHTML={{ __html: t('site.banner.chat2', { amount: money(4820) }) }} />
          </motion.div>
        </div>
      </motion.div>
    </section>
  )
}

/* ───────────────────────── Logo strip ───────────────────────── */

function Trust() {
  const { t } = useT()
  // Church traditions ZionDesk is built for (no customer logos are shown without written permission).
  const names = t('site.trustTypes').split('|')
  return (
    <section className="trust container">
      <p>{t('site.trust')}</p>
      <div className="trust-row">
        {names.map((n, i) => (
          <span key={n} className="trust-logo">
            <i className={`tl tl-${i % 3}`} />
            {n}
          </span>
        ))}
      </div>
    </section>
  )
}

/* ───────────────────────── Timeline (Zendesk-style) ───────────────────────── */

function Timeline() {
  const { t } = useT()
  const steps = [
    {
      title: t('site.timeline.s1t'),
      text: t('site.timeline.s1x'),
      ui: (
        <div className="snip">
          <div className="snip-row">
            <i className="av av-p">GO</i>
            <div>
              <b>Grace Okafor</b>
              <small>{t('site.timeline.guest')}</small>
            </div>
            <span className="pill pill-lime">{t('site.timeline.new')}</span>
          </div>
          <div className="snip-card">
            <span>{t('site.timeline.assigned')}</span>
            <b>{t('site.timeline.team')}</b>
            <span className="pill pill-ink">{t('site.timeline.callThu')}</span>
          </div>
        </div>
      ),
    },
    {
      title: t('site.timeline.s2t'),
      text: t('site.timeline.s2x'),
      ui: (
        <div className="snip">
          <div className="snip-card">
            <span>{t('site.timeline.offering')}</span>
            <b className="snip-big">{money(4820, 2)}</b>
            <div className="snip-bars">
              {[35, 52, 44, 68, 60, 92].map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="snip-row">
            <span className="pill pill-lime">{t('site.timeline.receipts')}</span>
            <span className="pill pill-soft">{t('site.timeline.vsLast')}</span>
          </div>
        </div>
      ),
    },
    {
      title: t('site.timeline.s3t'),
      text: t('site.timeline.s3x'),
      ui: (
        <div className="snip">
          <div className="snip-card">
            <span>
              <GoogleMeetLogo size={15} /> {t('site.timeline.meetWhen')}
            </span>
            <b>{t('site.timeline.study')}</b>
            <div className="snip-avs">
              {['JS', 'PM', 'EJ', 'SC', 'GO'].map((a, i) => (
                <i key={a} className={`av ${i % 2 ? 'av-l' : 'av-p'}`}>
                  {a}
                </i>
              ))}
              <small>{t('site.timeline.invited')}</small>
            </div>
          </div>
          <div className="snip-row">
            <span className="pill pill-ink">
              <Send size={11} /> {t('site.timeline.invites')}
            </span>
          </div>
        </div>
      ),
    },
  ]
  return (
    <section className="section container" id="platform">
      <Reveal className="center-head">
        <h2>
          {t('site.timeline.h2a')} <span className="accent-text">{t('site.timeline.h2b')}</span>
        </h2>
        <p>
          {t('site.timeline.sub')}
        </p>
        <a className="btn btn-lime" href="#bento">
          {t('site.timeline.cta')}
        </a>
      </Reveal>
      <div className="timeline">
        <span className="timeline-line" aria-hidden="true" />
        {steps.map((s, i) => (
          <Reveal key={s.title} delay={0.05}>
            <div className="tl-node" aria-hidden="true">
              {i + 1}
            </div>
            <div className="tl-card">
              <div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
              {s.ui}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ───────────────────────── Stats ───────────────────────── */

function Counter({ to, prefix = '', suffix = '', decimals = 0 }: {
  to: number
  prefix?: string
  suffix?: string
  decimals?: number
}) {
  const [n, setN] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const start = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / 1500)
        setN(to * (1 - Math.pow(1 - p, 3)))
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [to])
  return (
    <span ref={ref}>
      {prefix}
      {n.toFixed(decimals)}
      {suffix}
    </span>
  )
}

function Stats() {
  const { t } = useT()
  return (
    <section className="section-tight container">
      <Reveal className="center-head small">
        <h2>{t('site.stats.h2')}</h2>
      </Reveal>
      <div className="stats">
        <div className="stat">
          <b>
            <Counter to={5} />
          </b>
          <span>{t('site.stats.churches')}</span>
        </div>
        <div className="stat">
          <b>
            <Counter to={48} suffix="h" />
          </b>
          <span>{t('site.stats.rating')}</span>
        </div>
        <div className="stat">
          <b>
            <Counter to={7} />
          </b>
          <span>{t('site.stats.trial')}</span>
        </div>
        <div className="stat">
          <b>
            <Counter to={8} prefix="$" />
          </b>
          <span>{t('site.stats.perMonth')}</span>
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── Bento (reference #1) ───────────────────────── */

const TILES: { icon: IconName; plus?: boolean; meet?: boolean }[] = [
  { icon: 'church' },
  { icon: 'finance' },
  { icon: 'messaging' },
  { icon: 'email' },
  { icon: 'events', meet: true },
  { icon: 'community' },
  { icon: 'design', plus: true },
  { icon: 'giving', plus: true },
  { icon: 'qr', plus: true },
]

function Bento() {
  const { t } = useT()
  return (
    <section className="section container" id="bento">
      <div className="split-head">
        <Reveal>
          <h2>
            {t('site.bento.h2a')} <Pill>{t('site.bento.pill')}</Pill>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p>
            {t('site.bento.sub')}
          </p>
        </Reveal>
      </div>
      <div className="bento">
        <div className="tiles">
          {TILES.map((tile, i) => (
            <Reveal key={tile.icon} delay={(i % 3) * 0.06}>
              <div className={`tile ${i === 0 ? 'tile-lime' : ''}`}>
                {tile.plus && <span className="tile-plus">{t('site.bento.plus')}</span>}
                {tile.meet && (
                  <span className="tile-meet" title={t('site.bento.meetTitle')}>
                    <GoogleMeetLogo size={16} />
                  </span>
                )}
                <Icon3D name={tile.icon} className="tile-icon" />
                <span>{t(`site.bento.tiles.${tile.icon}`)}</span>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.15} className="bento-cta-wrap">
          <a className="bento-cta" href="#ministries">
            <Burst className="bento-burst" />
            <h3>
              {t('site.bento.cta1')}
              <br />
              {t('site.bento.cta2')}
              <br />
              {t('site.bento.cta3')}
            </h3>
            <span className="arrow-box">
              <ArrowUpRight size={34} />
            </span>
          </a>
        </Reveal>
      </div>
    </section>
  )
}

/* ───────────────────────── Product (dark band + dashboard) ───────────────────────── */

const VIEWS = [
  { id: 'members', icon: Users },
  { id: 'giving', icon: HandHeart },
  { id: 'messages', icon: MessageSquareText },
  { id: 'events', icon: CalendarDays },
  { id: 'assistant', icon: Sparkles },
] as const
type ViewId = (typeof VIEWS)[number]['id']

function DashView({ id }: { id: ViewId }) {
  const { t } = useT()
  if (id === 'members')
    return (
      <>
        <div className="dash-top">
          <div>
            <h4>{t('site.product.m.h')}</h4>
            <small>{t('site.product.m.sub')}</small>
          </div>
          <span className="dash-btn">
            <UserPlus size={13} /> {t('site.product.m.add')}
          </span>
        </div>
        <div className="dash-table">
          {[
            ['GO', 'Grace Okafor', 'worship', 'newGuest', 'lime'],
            ['JS', 'John Smith', 'ushering', 'active', 'soft'],
            ['SC', 'Sarah Collins', 'admin', 'active', 'soft'],
            ['EJ', 'Elder John', 'elders', 'followUp', 'ink'],
            ['MK', 'Mary Kalu', 'youth', 'active', 'soft'],
          ].map(([a, n, team, st, tone], i) => (
            <div key={n} className="dash-row">
              <i className={`av ${i % 2 ? 'av-l' : 'av-p'}`}>{a}</i>
              <b>{n}</b>
              <span>{t(`site.product.m.${team}`)}</span>
              <span className={`pill pill-${tone}`}>{t(`site.product.m.${st}`)}</span>
            </div>
          ))}
        </div>
      </>
    )
  if (id === 'giving')
    return (
      <>
        <div className="dash-top">
          <div>
            <h4>{t('site.product.g.h')}</h4>
            <small>{t('site.product.g.sub')}</small>
          </div>
          <span className="dash-btn">
            <Download size={13} /> {t('site.product.g.export')}
          </span>
        </div>
        <div className="dash-kpis">
          <div className="kpi kpi-lime">
            <small>{t('site.product.g.month')}</small>
            <b>{money(18240)}</b>
          </div>
          <div className="kpi">
            <small>{t('site.product.g.givers')}</small>
            <b>312</b>
          </div>
          <div className="kpi">
            <small>{t('site.product.g.recurring')}</small>
            <b>41%</b>
          </div>
        </div>
        <svg className="dash-chart" viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="dash-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#c4ec62" stopOpacity="0.55" />
              <stop offset="1" stopColor="#c4ec62" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 80 L30 70 L60 74 L90 55 L120 60 L150 42 L180 48 L210 30 L240 36 L270 18 L300 22 L300 100 L0 100Z" fill="url(#dash-fill)" />
          <path d="M0 80 L30 70 L60 74 L90 55 L120 60 L150 42 L180 48 L210 30 L240 36 L270 18 L300 22" fill="none" stroke="#6c34ff" strokeWidth="2.5" />
        </svg>
      </>
    )
  if (id === 'messages')
    return (
      <>
        <div className="dash-top">
          <div>
            <h4>{t('site.product.msg.h')}</h4>
            <small>{t('site.product.msg.to')}</small>
          </div>
          <span className="dash-btn">
            <Send size={13} /> {t('site.product.msg.send')}
          </span>
        </div>
        <div className="dash-msgs">
          <div className="msg out">{t('site.product.msg.m1')}</div>
          <div className="msg in">{t('site.product.msg.m2')}</div>
          <div className="msg in">{t('site.product.msg.m3')}</div>
          <div className="msg out">{t('site.product.msg.m4')}</div>
        </div>
      </>
    )
  if (id === 'events')
    return (
      <>
        <div className="dash-top">
          <div>
            <h4>{t('site.product.ev.h')}</h4>
            <small>{t('site.product.ev.sub')}</small>
          </div>
          <span className="dash-btn">
            <Plus size={13} /> {t('site.product.ev.new')}
          </span>
        </div>
        <div className="dash-events">
          {[
            [t('site.product.ev.sun'), clock(9), t('site.product.ev.e1'), t('site.product.ev.inPerson'), t('site.product.ev.going')],
            [t('site.product.ev.wed'), clock(19), t('site.product.ev.e2'), 'Google Meet', t('site.product.ev.invited')],
            [t('site.product.ev.fri'), clock(19), t('site.product.ev.e3'), t('site.product.ev.inPerson'), t('site.product.ev.flyer')],
          ].map(([d, time, n, where, meta]) => (
            <div key={n} className="dash-event">
              <span className="ev-date">{d}</span>
              <div>
                <b>{n}</b>
                <small>
                  {time} · {where === 'Google Meet' ? (
                    <span className="meet">
                      <GoogleMeetLogo size={13} /> Google Meet
                    </span>
                  ) : (
                    where
                  )}
                </small>
              </div>
              <span className="pill pill-soft">{meta}</span>
            </div>
          ))}
        </div>
      </>
    )
  return (
    <>
      <div className="dash-top">
        <div>
          <h4>{t('site.product.ai.h')}</h4>
          <small>{t('site.product.ai.sub')}</small>
        </div>
      </div>
      <div className="dash-msgs">
        <div className="msg out">{t('site.product.ai.m1')}</div>
        <div className="msg in ai">
          <Sparkles size={13} /> {t('site.product.ai.m2')}
        </div>
        <div className="msg out">{t('site.product.ai.m3')}</div>
      </div>
    </>
  )
}

const APP_NAV = [
  { icon: LayoutDashboard, label: 'dashboard' },
  { icon: Users, label: 'members', id: 'members' },
  { icon: HandHeart, label: 'giving', id: 'giving' },
  { icon: MessageSquareText, label: 'messages', id: 'messages' },
  { icon: CalendarDays, label: 'events', id: 'events' },
  { icon: Sparkles, label: 'assistant', id: 'assistant' },
  { icon: BarChart3, label: 'reports' },
]

/** Browser-framed mock of the ZionDesk app. */
function AppWindow({ active, onSelect, className = '' }: {
  active: ViewId
  onSelect: (id: ViewId) => void
  className?: string
}) {
  const nav = APP_NAV
  const { t } = useT()
  return (
    <div className={`browser ${className}`}>
      <div className="browser-bar">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        <span className="url">app.ziondesk.com</span>
      </div>
      <div className="app">
        <aside className="app-side">
          <img src="/brand/app-icon.png" alt="" className="app-side-logo" />
          {nav.map((n) => (
            <button
              key={n.label}
              type="button"
              tabIndex={-1}
              className={n.id === active ? 'is-on' : ''}
              onClick={() => n.id && onSelect(n.id as ViewId)}
            >
              <n.icon size={15} /> <span>{t(`site.product.nav.${n.label}`)}</span>
            </button>
          ))}
        </aside>
        <div className="app-main">
          <div className="app-head">
            <span className="app-search">
              <Search size={13} /> {t('site.product.search')}
            </span>
            <span className="app-bell">
              <BellRing size={14} />
            </span>
            <i className="av av-p">PM</i>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              className="app-view"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <DashView id={active} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function Product() {
  const { t } = useT()
  const [active, setActive] = useState<ViewId>('members')
  return (
    <section className="product" id="ministries">
      <div className="container">
        <Reveal className="center-head on-dark">
          <h2>{t('site.product.h2')}</h2>
          <p>{t('site.product.sub')}</p>
          <div className="btn-row">
            <Link className="btn btn-lime" to="/register">
              {t('site.product.cta')}
            </Link>
            <a className="btn btn-outline-light" href="#pricing">
              {t('site.product.pricing')}
            </a>
          </div>
        </Reveal>

        <div className="product-grid">
          <div className="product-tabs" role="tablist">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={active === v.id}
                className={active === v.id ? 'is-on' : ''}
                onClick={() => setActive(v.id)}
              >
                <v.icon size={18} />
                <span>
                  <b>{t(`site.product.views.${v.id}.t`)}</b>
                  <small>{t(`site.product.views.${v.id}.x`)}</small>
                </span>
              </button>
            ))}
          </div>

          <Reveal delay={0.1}>
            <AppWindow active={active} onSelect={setActive} />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── Programs-style cards (reference #4) ───────────────────────── */

const ROLES = [
  { id: 'pastors', tone: 'lime', photo: PHOTO.pastor },
  { id: 'admins', tone: 'cream', photo: PHOTO.bibleStudy },
  { id: 'leaders', tone: 'lavender', photo: PHOTO.choir },
  { id: 'finance', tone: 'purple', photo: PHOTO.donate },
  { id: 'outreach', tone: 'cream', photo: PHOTO.volunteers },
]

function Roles() {
  const { t } = useT()
  const track = useRef<HTMLDivElement>(null)
  const scroll = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * 340, behavior: 'smooth' })
  return (
    <section className="section container">
      <div className="roles-head">
        <Reveal>
          <span className="kicker dark">{t('site.roles.kicker')}</span>
          <h2>{t('site.roles.h2')}</h2>
        </Reveal>
        <div className="round-btns">
          <button type="button" aria-label={t('site.roles.prev')} onClick={() => scroll(-1)}>
            <ArrowLeft size={18} />
          </button>
          <button type="button" aria-label={t('site.roles.next')} onClick={() => scroll(1)}>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
      <div className="roles" ref={track}>
        {ROLES.map((r, i) => (
          <Reveal key={r.id} delay={i * 0.06} className="role-wrap">
            <article className={`role role-${r.tone}`}>
              <div className="role-top">
                <div className="role-tags">
                  {t(`site.roles.${r.id}.tags`).split('|').map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <h3>{t(`site.roles.${r.id}.t`)}</h3>
                <p>{t(`site.roles.${r.id}.x`)}</p>
              </div>
              <div className="role-photo">
                <img src={px(r.photo, 700)} alt="" loading="lazy" />
                <Link to="/register" className="role-more">
                  {t('site.roles.more')} <span><ArrowRight size={14} /></span>
                </Link>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ───────────────────────── Design Studio (reference #3) ───────────────────────── */

function useQr(text: string, dark = '#17112e') {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(text || ' ', { margin: 1, width: 512, color: { dark, light: '#ffffff' } })
      .then((u) => alive && setUrl(u))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [text, dark])
  return url
}

function DesignStudio() {
  const { t, lang } = useT()
  const [tpl, setTpl] = useState<FlyerId>('duotone')
  const [title, setTitle] = useState(t('site.studio.defTitle'))
  const [when, setWhen] = useState(t('site.studio.defWhen'))
  // Swap the sample text when the visitor changes language (unless they've typed their own).
  const [shownLang, setShownLang] = useState(lang)
  if (shownLang !== lang) {
    setShownLang(lang)
    setTitle(t('site.studio.defTitle'))
    setWhen(t('site.studio.defWhen'))
  }
  const [church, setChurch] = useState('Grace Chapel')
  const qr = useQr('https://ziondesk.com/events/worship-night')
  return (
    <section className="studio-band" id="design">
      <Burst className="studio-burst b1" />
      <Burst className="studio-burst b2" points={10} />
      <div className="container studio">
        <Reveal className="studio-copy">
          <span className="kicker dark">{t('site.studio.kicker')}</span>
          <h2>
            {t('site.studio.h2a')} <Pill tone="purple">{t('site.studio.pill1')}</Pill> {t('site.studio.h2b')} <Pill tone="ink">{t('site.studio.pill2')}</Pill>
          </h2>
          <p>
            {t('site.studio.sub')}
          </p>
          <div className="studio-panel">
            <div className="studio-fields">
              <label>
                <span>{t('site.studio.title')}</span>
                <input value={title} maxLength={28} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label>
                <span>{t('site.studio.when')}</span>
                <input value={when} maxLength={24} onChange={(e) => setWhen(e.target.value)} />
              </label>
              <label className="span-2">
                <span>{t('site.studio.church')}</span>
                <input value={church} maxLength={28} onChange={(e) => setChurch(e.target.value)} />
              </label>
            </div>
            <a href="#pricing" className="max-callout">
              <span className="max-tag">Ministry Max</span>
              <span>
                <b>{t('site.studio.maxB')}</b> {t('site.studio.maxText')}
              </span>
              <ArrowUpRight size={18} />
            </a>
            <div className="tpl-grid" role="radiogroup" aria-label={t('site.studio.tplLabel')}>
              {FLYER_TEMPLATES.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={tpl === x.id}
                  className={`tpl ${tpl === x.id ? 'is-on' : ''}`}
                  onClick={() => setTpl(x.id)}
                >
                  <Flyer template={x.id} title={title || flyerSample(x.id)} when={when} church={church} />
                  <span>{flyerName(x.id)}</span>
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="studio-stage">
          <Icon3D name="design" className="studio-icon" />
          <AnimatePresence mode="wait">
            <motion.div
              key={tpl}
              className="poster"
              initial={{ rotate: 6, opacity: 0, y: 30 }}
              animate={{ rotate: -3, opacity: 1, y: 0 }}
              exit={{ rotate: -10, opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <Flyer template={tpl} title={title || t('site.studio.your')} when={when} church={church} qr={qr} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── Giving (reference #2) ───────────────────────── */

function Giving() {
  const { t } = useT()
  const [link, setLink] = useState('https://ziondesk.com/give/grace-chapel')
  const [amount, setAmount] = useState<number | null>(25)
  const target = amount ? `${link}${link.includes('?') ? '&' : '?'}amount=${amount}` : link
  const qr = useQr(target)
  return (
    <section className="section container" id="giving">
      <div className="give-frame">
        <div className="give-head">
          <Reveal>
            <span className="kicker dark">{t('site.give.kicker')}</span>
            <h2>
              {t('site.give.h2a')} <span className="accent-text">{t('site.give.h2b')}</span>
            </h2>
          </Reveal>
          <div className="give-deco" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="give-grid">
          <Reveal className="g-card g-dark">
            <span className="g-label">{t('site.give.payTag')}</span>
            <h3>{t('site.give.payH')}</h3>
            <p>{t('site.give.payX')}</p>
            <div className="g-icons">
              <span>
                <CreditCard size={18} />
              </span>
              <span>
                <Banknote size={18} />
              </span>
              <span>
                <Mail size={18} />
              </span>
              <span>
                <BarChart3 size={18} />
              </span>
            </div>
          </Reveal>

          <Reveal delay={0.08} className="g-card g-qr">
            <div className="qr-box">
              {qr && (
                <motion.img
                  key={qr}
                  src={qr}
                  alt={t('site.give.qrAlt')}
                  initial={{ opacity: 0.4, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                />
              )}
            </div>
            <div className="qr-ctrls">
              <b>
                <QrCode size={16} /> {t('site.give.qrGen')}
              </b>
              <input value={link} onChange={(e) => setLink(e.target.value)} aria-label={t('site.give.linkLabel')} />
              <div className="chips">
                {[10, 25, 50, 100].map((a) => (
                  <button key={a} type="button" className={`chip ${amount === a ? 'is-on' : ''}`} onClick={() => setAmount(a)}>
                    {money(a)}
                  </button>
                ))}
                <button type="button" className={`chip ${amount === null ? 'is-on' : ''}`} onClick={() => setAmount(null)}>
                  {t('site.give.any')}
                </button>
              </div>
              <a className="btn btn-ink btn-sm" href={qr} download="ziondesk-giving-qr.png">
                <Download size={14} /> {t('site.give.download')}
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.16} className="g-card g-dark">
            <span className="g-label">{t('site.give.bankTag')}</span>
            <h3>{t('site.give.bankH')}</h3>
            <p>{t('site.give.bankX')}</p>
            <div className="g-bank">
              <Landmark size={18} />
              <div>
                <small>{t('site.give.bankAcct')}</small>
                <b>•••• 4321</b>
              </div>
              <span className="pill pill-lime">{t('site.give.connected')}</span>
            </div>
          </Reveal>
        </div>
        <div className="give-tags">
          {t('site.give.tags').split('|').map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <small className="give-note">{t('site.give.note')}</small>
      </div>
    </section>
  )
}

/* ───────────────────────── Testimonials (reference #1 circles) ───────────────────────── */

const QUOTES = [
  { q: 'q1', r: 'r1' },
  { q: 'q2', r: 'r2' },
  { q: 'q3', r: 'r3' },
]

function Testimonials() {
  const { t } = useT()
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % QUOTES.length), 6000)
    return () => clearInterval(id)
  }, [])
  const q = QUOTES[i]
  return (
    <section className="section container" id="stories">
      <div className="people">
        <Reveal className="circles">
          {[PHOTO.pastor, PHOTO.worshipWoman, PHOTO.friends, PHOTO.choir].map((p, k) => (
            <div key={p} className={`circle c${k}`}>
              <img src={px(p, 500)} alt="" loading="lazy" />
            </div>
          ))}
          <Sparkle className="circles-star" />
        </Reveal>
        <Reveal delay={0.1} className="people-copy">
          <h2>{t('site.quotes.h2')}</h2>
          <div className="people-stat">
            <span className="stat-pill">5</span>
            <span>{t('site.quotes.stat')}</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.blockquote
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
            >
              <p>{t(`site.quotes.${q.q}`)}</p>
              <footer>
                <b>{t(`site.quotes.${q.r}`)}</b>
              </footer>
            </motion.blockquote>
          </AnimatePresence>
          <Link className="btn btn-outline btn-arrow" to="/register">
            {t('site.quotes.join')} <ArrowUpRight size={18} />
          </Link>
        </Reveal>
      </div>
    </section>
  )
}

/* ───────────────────────── Pricing (reference #1 calculator) ───────────────────────── */

const PLANS = [
  { id: 'essentials', name: 'Essentials', price: '8', cents: '', tone: 'plain' },
  { id: 'plus', name: 'Ministry Plus', price: '19', cents: '99', tone: 'lime' },
  { id: 'max', name: 'Ministry Max', price: '39', cents: '99', tone: 'dark' },
] as const

function Pricing() {
  const { t, locale } = useT()
  // Prices are in US dollars; visitors from other regions also see a guide price in their own currency.
  const [visitorCurrency] = useState(guessCurrency)
  const localLine = (id: PlanKey) => {
    const l = priceWithLocal(id, visitorCurrency).local
    return l ? t('site.pricing.local', { amount: formatMoney(l.amount, l.currency, locale) }) : ''
  }
  const priceParts = (id: PlanKey) => {
    const { amount, currency } = planPrice(id, BASE_CURRENCY)
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: amount % 1 ? 2 : 0 }).formatToParts(amount)
    const pick = (types: string[]) => parts.filter((x) => types.includes(x.type)).map((x) => x.value).join('')
    return { symbol: pick(['currency']), whole: pick(['integer', 'group']), cents: amount % 1 ? pick(['decimal', 'fraction']) : '' }
  }
  return (
    <section className="pricing-band" id="pricing">
      <div className="container">
        <Reveal className="center-head on-dark">
          <span className="kicker">{t('site.pricing.kicker')}</span>
          <h2>{t('site.pricing.h2')}</h2>
          <p>{t('site.pricing.sub', { days: TRIAL_DAYS })}</p>
        </Reveal>
        <div className="plans">
          {PLANS.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.1}>
              <div className={`plan plan-${p.tone}`}>
                <div className="plan-head">
                  <div>
                    <h3>{p.name}</h3>
                    <p>{t(`site.pricing.${p.id}.blurb`)}</p>
                  </div>
                  {t(`site.pricing.${p.id}.badge`) && <span className="pill plan-badge">{t(`site.pricing.${p.id}.badge`)}</span>}
                </div>
                <div className={`plan-price ${priceParts(p.id).whole.length > 4 ? 'is-long' : ''}`}>
                  <sup>{priceParts(p.id).symbol}</sup>
                  <b>{priceParts(p.id).whole}</b>
                  {priceParts(p.id).cents && <em>{priceParts(p.id).cents}</em>}
                  <span>{t('site.pricing.perMonth')}</span>
                </div>
                {localLine(p.id) && <p className="plan-local">{localLine(p.id)}</p>}
                <ul>
                  {t(`site.pricing.${p.id}.f`).split('|').map((f) => (
                    <li key={f}>
                      <Check size={15} strokeWidth={3} /> {f}
                    </li>
                  ))}
                </ul>
                <Link className={`btn btn-block ${p.tone === 'plain' ? 'btn-ink' : 'btn-lime'}`} to={`/register?plan=${p.id}`}>
                  {t('site.pricing.cta')}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── FAQ ───────────────────────── */

const FAQS = [1, 2, 3, 4, 5, 6]

function FAQ() {
  const { t } = useT()
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section className="section container" id="faq">
      <div className="faq">
        <Reveal>
          <h2>{t('site.faq.h2')}</h2>
          <p className="faq-sub">{t('site.faq.sub')}</p>
        </Reveal>
        <div className="faq-list">
          {FAQS.map((n, i) => {
            const isOpen = open === i
            return (
              <div key={n} className={`faq-item ${isOpen ? 'is-open' : ''}`}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
                  <span>{t(`site.faq.q${n}`)}</span>
                  <motion.span className="faq-plus" animate={{ rotate: isOpen ? 45 : 0 }}>
                    <Plus size={18} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      className="faq-a"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <p>{t(`site.faq.a${n}`, { days: TRIAL_DAYS })}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── Final CTA + footer ───────────────────────── */

function FinalCTA() {
  const { t } = useT()
  return (
    <section className="final">
      <div className="container final-inner">
        <Sparkle className="final-star" />
        <Reveal>
          <h2>{t('site.final.h2', { days: TRIAL_DAYS })}</h2>
          <p className="final-sub">{t('site.final.sub')}</p>
          <EmailCapture dark />
        </Reveal>
        <Icon3D name="giving" className="final-icon" />
      </div>
    </section>
  )
}

function Footer() {
  const navigate = useNavigate()
  const { t } = useT()
  const cols = [
    { h: 'platform', links: [['hub', '#bento'], ['design', '#design'], ['giving', '#giving'], ['pricing', '#pricing']] },
    { h: 'ministries', links: [['pastors', '#ministries'], ['admins', '#ministries'], ['finance', '#ministries']] },
    { h: 'company', links: [['stories', '#stories'], ['faq', '#faq'], ['privacy', '/privacy'], ['terms', '/terms'], ['cookies', '/cookies'], ['legal', '/legal']] },
  ]
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <img src="/brand/logo-lime.webp" alt="ZionDesk" className="footer-logo" />
            <p>{t('site.footer.tagline')}</p>
            <form
              className="footer-sub"
              onSubmit={(e) => {
                e.preventDefault()
                const email = new FormData(e.currentTarget).get('email')?.toString().trim() ?? ''
                navigate(email ? `/register?email=${encodeURIComponent(email)}` : '/register')
              }}
            >
              <input type="email" name="email" placeholder={t('site.footer.sub')} aria-label={t('common.emailAddress')} />
              <button className="btn btn-lime btn-sm" type="submit">
                {t('site.footer.subscribe')}
              </button>
            </form>
          </div>
          {cols.map((c) => (
            <div key={c.h}>
              <h4>{t(`site.footer.${c.h}`)}</h4>
              {c.links.map(([label, href]) => (
                <a key={label} href={href}>
                  {t(`site.footer.${label}`)}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="footer-help">
          <h3>
            {t('site.footer.help')} <a href="mailto:hello@ziondesk.com">{t('site.footer.contact')}</a>
          </h3>
        </div>
        <div className="footer-base">
          <span>{t('site.footer.rights', { year: new Date().getFullYear() })}</span>
          <span>
            {t('site.footer.photos')}{' '}
            <a href="https://www.pexels.com" target="_blank" rel="noreferrer">
              Pexels
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Trust />
        <PhotoBanner />
        <Timeline />
        <Stats />
        <Bento />
        <Product />
        <Roles />
        <DesignStudio />
        <Giving />
        <Testimonials />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <IconCanvas />
    </>
  )
}
