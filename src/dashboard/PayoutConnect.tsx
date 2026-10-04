import { BadgeCheck, Landmark, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useT } from '../i18n'
import { useWorkspace } from './workspace'

/** Countries where Flutterwave can pay out to local bank accounts. */
const COUNTRIES = ['NG', 'GH', 'KE', 'ZA', 'UG', 'TZ', 'RW', 'ZM', 'CM', 'CI', 'SN', 'GB', 'US']

/**
 * Connects the church's bank account to Flutterwave (a sub-account) so online gifts settle
 * straight to the church. Admin only; the account number is never stored in full.
 */
export function PayoutConnect() {
  const { t, locale } = useT()
  const { settings, live, reload } = useWorkspace()
  const [country, setCountry] = useState(settings.payoutAccount?.country ?? 'NG')
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([])
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [busy, setBusy] = useState<'' | 'banks' | 'verify' | 'save'>('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(!settings.onlineGiving)
  const region = (c: string) => {
    try {
      return new Intl.DisplayNames([locale], { type: 'region' }).of(c) ?? c
    } catch {
      return c
    }
  }

  useEffect(() => {
    if (!live || !editing) return
    setBusy('banks')
    setBankCode('')
    api<{ code: string; name: string }[]>(`/payments/banks?country=${country}`)
      .then(setBanks)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(''))
  }, [country, live, editing])

  if (!live) return <p className="d-hint-box">{t('giving.flw.preview')}</p>

  if (settings.onlineGiving && settings.payoutAccount && !editing)
    return (
      <div className="pc-connected">
        <BadgeCheck size={20} />
        <div>
          <b>{t('giving.flw.connected')}</b>
          <small>
            {settings.payoutAccount.bankName} · {settings.payoutAccount.accountNumber}
            {settings.payoutAccount.accountName ? ` · ${settings.payoutAccount.accountName}` : ''}
          </small>
        </div>
        <button type="button" className="d-link" onClick={() => setEditing(true)}>
          {t('giving.flw.change')}
        </button>
      </div>
    )

  const verify = async () => {
    setError('')
    setBusy('verify')
    try {
      const r = await api<{ accountName: string }>('/payments/resolve', { bankCode, accountNumber })
      setAccountName(r.accountName)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const connect = async () => {
    setError('')
    setBusy('save')
    try {
      await api('/payments/payout-account', { country, bankCode, accountNumber, bankName: banks.find((b) => b.code === bankCode)?.name })
      await reload()
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="pc-form">
      <p className="d-muted">
        <Landmark size={14} /> {t('giving.flw.intro')}
      </p>
      <div className="d-grid">
        <label className="d-field">
          <span>{t('giving.flw.country')}</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {region(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="d-field">
          <span>{t('links.bank.bankName')}</span>
          <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} disabled={busy === 'banks'}>
            <option value="">{busy === 'banks' ? t('common.loading') : '—'}</option>
            {banks.map((b) => (
              <option key={`${b.code}-${b.name}`} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="d-field">
          <span>{t('links.bank.accountNumber')}</span>
          <input
            inputMode="numeric"
            value={accountNumber}
            onChange={(e) => {
              setAccountNumber(e.target.value)
              setAccountName('')
            }}
          />
        </label>
        <div className="d-field">
          <span>{t('links.bank.accountName')}</span>
          {accountName ? (
            <b className="pc-name">
              <BadgeCheck size={14} /> {accountName}
            </b>
          ) : (
            <button type="button" className="d-btn" disabled={!bankCode || accountNumber.length < 6 || busy !== ''} onClick={verify}>
              {busy === 'verify' ? <Loader2 size={14} className="spin" /> : null} {t('giving.flw.verify')}
            </button>
          )}
        </div>
      </div>
      {error && <p className="d-errors">{error}</p>}
      <small className="d-muted">{t('giving.flw.fee')}</small>
      <div className="d-form-actions">
        {settings.onlineGiving && (
          <button type="button" className="d-btn" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </button>
        )}
        <button type="button" className="d-btn d-btn-ink" disabled={!bankCode || !accountNumber || busy !== ''} onClick={connect}>
          {busy === 'save' ? <Loader2 size={14} className="spin" /> : null} {t('giving.flw.connect')}
        </button>
      </div>
    </div>
  )
}
