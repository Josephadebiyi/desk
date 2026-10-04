import { ArrowUpRight, Cake, CalendarDays, HandHeart, Plus, QrCode, Sparkles, Upload, UserPlus, Users } from 'lucide-react'
import { GoogleMeetLogo } from '../components/GoogleMeet'
import { fmtDate, fmtTime, money, tEnum, today } from './kit'
import { useT } from '../i18n'
import { useSession } from '../lib/session'
import { useWorkspace } from './workspace'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Initials } from './Members'
import { useMembers } from './store'
import { can, STAGES } from './types'

const TONES = ['purple', 'lavender', 'ink', 'lime', 'white', 'white']
const fmt = (d: string) => fmtDate(d, { month: 'short', day: 'numeric' })

export default function Overview() {
  const { members, role } = useMembers()
  const { events, anonGifts, settings } = useWorkspace()
  const { t, locale } = useT()
  const session = useSession()
  const navigate = useNavigate()
  const upcoming = events.filter((e) => e.date >= today()).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 4)
  const thisMonth = new Date().toISOString().slice(0, 7)

  const newcomers = useMemo(
    () => members.filter((m) => m.stage === 'Newcomer').sort((a, b) => b.dateJoined.localeCompare(a.dateJoined)).slice(0, 6),
    [members],
  )
  const counts = STAGES.map((s) => ({ s, n: members.filter((m) => m.stage === s).length }))
  const giving = members.flatMap((m) => m.giving)
  const givingTotal = giving.reduce((s, g) => s + g.amount, 0) + anonGifts.reduce((s, g) => s + g.amount, 0)
  const birthdays = useMemo(() => {
    const now = new Date()
    return members
      .filter((m) => m.dob)
      .map((m) => {
        const d = new Date(m.dob + 'T00:00:00')
        const next = new Date(now.getFullYear(), d.getMonth(), d.getDate())
        if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1)
        return { m, next, days: Math.round((+next - +now) / 864e5) }
      })
      .filter((x) => x.days <= 30)
      .sort((a, b) => +a.next - +b.next)
      .slice(0, 6)
  }, [members])

  return (
    <div className="d-page">
      <div className="d-head">
        <h1>
          {t('ov.hello')}
          <br />
          {session.remote ? (session.name || session.email).split(' ')[0] : 'Pastor Mike'}
        </h1>
        <div className="d-kpis">
          <div className="d-kpi">
            <span className="d-kpi-ico">
              <Users size={17} />
            </span>
            <div>
              <b>{members.length.toLocaleString(locale)}</b>
              <small>{t('ov.people')}</small>
            </div>
            <span className="d-pill d-pill-lime">
              {t('ov.month', { count: members.filter((m) => m.dateJoined.startsWith(thisMonth)).length })}
            </span>
          </div>
          <div className="d-kpi">
            <span className="d-kpi-ico">
              <UserPlus size={17} />
            </span>
            <div>
              <b>{counts[0].n}</b>
              <small>{t('ov.toFollow')}</small>
            </div>
            <span className="d-pill d-pill-purple">{t('common.today')}</span>
          </div>
          {can.viewGiving(role) && (
            <div className="d-kpi">
              <span className="d-kpi-ico">
                <HandHeart size={17} />
              </span>
              <div>
                <b>{money(givingTotal, settings.currency)}</b>
                <small>{t('ov.giving')}</small>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="d-ov-grid">
        <section className="d-panel d-ov-new">
          <div className="d-panel-head">
            <h2>{t('ov.newcomers')}</h2>
            <div>
              
              <Link to="/dashboard/members" className="d-circle" aria-label={t('ov.openMembers')}>
                <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
          <div className="d-cards">
            {newcomers.map((m, i) => (
              <button
                key={m.id}
                type="button"
                className={`d-mcard t-${TONES[i % TONES.length]}`}
                onClick={() => navigate(`/dashboard/members?id=${m.id}`)}
              >
                <span className="d-mcard-top">
                  <small>{t('ov.joined', { date: fmt(m.dateJoined) })}</small>
                  <span className="d-circle d-circle-sm">
                    <ArrowUpRight size={13} />
                  </span>
                </span>
                <span className="d-mcard-name">{m.fullName}</span>
                <span className="d-mcard-bottom">
                  <b>{m.branch}</b>
                  <Initials name={m.fullName} size={30} tone="w" />
                </span>
              </button>
            ))}
            {!newcomers.length && <p className="d-empty-sm">{t('ov.noNewcomers')}</p>}
          </div>
        </section>

        <section className="d-panel d-ov-funnel">
          <div className="d-panel-head">
            <h2>{t('ov.funnel')}</h2>
          </div>
          <div className="d-funnel-total">
            <b>{members.length}</b>
            <small>{t('ov.journey')}</small>
          </div>
          <div className="d-funnel">
            {counts.map(({ s, n }, i) => (
              <Link
                key={s}
                to="/dashboard/members"
                className="d-funnel-step"
                style={{ width: `${100 - i * 11}%` }}
              >
                <small>{t(`enums.stagePlural.${s}`)}</small>
                <b>{n}</b>
              </Link>
            ))}
          </div>
        </section>

        <section className="d-panel d-ov-bdays">
          <div className="d-panel-head">
            <h2>
              <Cake size={17} /> {t('ov.birthdays')}
            </h2>
          </div>
          <ul className="d-list">
            {birthdays.map(({ m, next, days }) => (
              <li key={m.id}>
                <Initials name={m.fullName} size={34} />
                <div>
                  <b>{m.fullName}</b>
                  <small>{next.toLocaleDateString(locale, { month: 'long', day: 'numeric' })}</small>
                </div>
                <span className={`d-pill ${days <= 7 ? 'd-pill-lime' : ''}`}>{days === 0 ? t('common.today') : t('common.inDays', { count: days })}</span>
              </li>
            ))}
            {!birthdays.length && <p className="d-empty-sm">{t('ov.noBirthdays')}</p>}
          </ul>
        </section>

        <section className="d-panel d-ov-events">
          <div className="d-panel-head">
            <h2>
              <CalendarDays size={17} /> {t('ov.comingUp')}
            </h2>
            <Link to="/dashboard/events" className="d-circle" aria-label={t('ov.openEvents')}>
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <ul className="d-list">
            {upcoming.map((e) => (
              <li key={e.id}>
                <span className="ev-date">{fmt(e.date)}</span>
                <div>
                  <b>{e.title}</b>
                  <small>
                    {fmtTime(e.start)} · {tEnum('mode', e.mode)}
                  </small>
                </div>
                {e.googleMeet && <GoogleMeetLogo size={18} />}
              </li>
            ))}
            {!upcoming.length && <p className="d-empty-sm">{t('ov.noEvents')}</p>}
          </ul>
        </section>

        <section className="d-panel d-ov-quick">
          <div className="d-panel-head">
            <h2>{t('ov.quick')}</h2>
          </div>
          <div className="d-quick">
            <Link to="/dashboard/members?new=1" className="d-quick-btn t-lime">
              <Plus size={18} /> {t('ov.addMember')}
            </Link>
            <Link to="/dashboard/members?import=1" className="d-quick-btn t-ink">
              <Upload size={18} /> {t('ov.import')}
            </Link>
            <Link to="/dashboard/ai" className="d-quick-btn">
              <Sparkles size={18} /> {t('dash.nav.ai')}
            </Link>
            <Link to="/dashboard/links" className="d-quick-btn">
              <QrCode size={18} /> {t('dash.nav.links')}
            </Link>
            <Link to="/dashboard/members" className="d-quick-btn">
              <Users size={18} /> {t('ov.browse')}
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
