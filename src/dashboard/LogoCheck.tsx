/**
 * Church logo check before saving: reports problems (busy background, too small, odd shape), removes a plain
 * background in the browser, and previews the result on light and dark backgrounds.
 */
import { AlertTriangle, CheckCircle2, Eraser, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useT } from '../i18n'
import { analyzeLogo, coverage, loadLogo, removeBackground, toPngFile, trim, type LogoReport } from '../lib/logoTools'
import { Modal } from './kit'

export function LogoCheck({ file, onCancel, onUse }: { file: File; onCancel: () => void; onUse: (f: File) => void }) {
  const { t } = useT()
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null)
  const [report, setReport] = useState<LogoReport | null>(null)
  const [remove, setRemove] = useState(false)
  const [strength, setStrength] = useState(45)
  const [inside, setInside] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadLogo(file)
      .then((c) => {
        const r = analyzeLogo(c)
        setSrc(c)
        setReport(r)
        setRemove(r.plainBackground) // flat background → removed by default
      })
      .catch(() => setError(t('settings.logoCheck.readError')))
  }, [file, t])

  const result = useMemo(() => {
    if (!src || !report) return null
    return remove && !report.transparent ? removeBackground(src, report.bg, strength, inside) : report.transparent ? trim(src) : src
  }, [src, report, remove, strength, inside])
  const preview = useMemo(() => result?.toDataURL('image/png') ?? '', [result])
  const emptied = result ? coverage(result) < 0.01 : false

  const checks: { ok: 'good' | 'warn' | 'bad'; text: string }[] = []
  if (report) {
    if (report.transparent) checks.push({ ok: 'good', text: t('settings.logoCheck.transparent') })
    else if (report.plainBackground) checks.push({ ok: remove ? 'good' : 'warn', text: remove ? t('settings.logoCheck.bgRemoved') : t('settings.logoCheck.bgPlain') })
    else if (report.busyBackground) checks.push({ ok: 'bad', text: t('settings.logoCheck.bgBusy') })
    else checks.push({ ok: 'warn', text: t('settings.logoCheck.bgMixed') })
    if (report.verySmall) checks.push({ ok: 'bad', text: t('settings.logoCheck.verySmall', { size: `${report.width}×${report.height}` }) })
    else if (report.tooSmall) checks.push({ ok: 'warn', text: t('settings.logoCheck.small', { size: `${report.width}×${report.height}` }) })
    else checks.push({ ok: 'good', text: t('settings.logoCheck.sharp', { size: `${report.width}×${report.height}` }) })
    if (report.oddShape) checks.push({ ok: 'warn', text: t('settings.logoCheck.oddShape') })
    if (emptied) checks.push({ ok: 'bad', text: t('settings.logoCheck.emptied') })
  }
  const icon = (ok: string) => (ok === 'good' ? <CheckCircle2 size={16} className="lc-good" /> : ok === 'warn' ? <AlertTriangle size={16} className="lc-warn" /> : <XCircle size={16} className="lc-bad" />)

  const use = async () => {
    if (!result || emptied) return
    setBusy(true)
    try {
      onUse(remove || report?.transparent ? await toPngFile(result, file.name) : file)
    } catch {
      setError(t('settings.logoCheck.readError'))
      setBusy(false)
    }
  }

  return (
    <Modal title={t('settings.logoCheck.title')} onClose={onCancel} wide>
      {error && <p className="d-errors">{error}</p>}
      {!report ? (
        !error && <p className="d-muted">{t('common.loading')}</p>
      ) : (
        <div className="lc">
          <div className="lc-previews">
            <figure className="lc-tile lc-light">{preview && <img src={preview} alt="" />}</figure>
            <figure className="lc-tile lc-dark">{preview && <img src={preview} alt="" />}</figure>
          </div>
          <div className="lc-side">
            <ul className="lc-checks">
              {checks.map((c) => (
                <li key={c.text}>
                  {icon(c.ok)} <span>{c.text}</span>
                </li>
              ))}
            </ul>
            {!report.transparent && (
              <div className="lc-tools">
                <label className="d-inline-check">
                  <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} /> <Eraser size={15} /> {t('settings.logoCheck.remove')}
                </label>
                {remove && (
                  <>
                    <label className="d-field">
                      <span>{t('settings.logoCheck.strength')}</span>
                      <input type="range" min={0} max={100} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
                    </label>
                    <label className="d-inline-check">
                      <input type="checkbox" checked={inside} onChange={(e) => setInside(e.target.checked)} /> {t('settings.logoCheck.inside')}
                    </label>
                  </>
                )}
                {report.busyBackground && <p className="d-hint-box">{t('settings.logoCheck.busyTip')}</p>}
              </div>
            )}
            <div className="d-form-actions">
              <button type="button" className="d-btn" onClick={onCancel}>
                {t('common.cancel')}
              </button>
              <button type="button" className="d-btn d-btn-ink" disabled={busy || emptied} onClick={use}>
                {busy ? t('common.loading') : t('settings.logoCheck.use')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
