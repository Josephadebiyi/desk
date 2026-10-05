/**
 * Renders any catalog email into { subject, html, text } in the recipient's language.
 * Table-based HTML with inline styles for Gmail, Outlook and Apple Mail, in the website's colours:
 * white header with the full-colour logo, purple title band, lime accents.
 */
import { CATALOG, type EmailKind } from './catalog'
import { EMAIL, fill, type EmailLang } from './strings'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
/** Escape values, then allow only <b> in copy that is ours. */
const safeVars = (vars: Record<string, string | number>) => Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(String(v))]))
const stripTags = (s: string) => s.replace(/<[^>]+>/g, '')
/** Free text (church messages, newsletters): keep line breaks and make links clickable. */
const richText = (escaped: string) =>
  escaped.replace(/\n/g, '<br />').replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" style="color:#6c34ff;font-weight:600;">$1</a>')

const UNSUBSCRIBE: Record<EmailLang, string> = { en: 'Unsubscribe', es: 'Darse de baja', fr: 'Se désabonner', de: 'Abmelden', pt: 'Cancelar subscrição' }

const PURPLE = '#6c34ff'
const LIME = '#c4ec62'
const INK = '#111015'

export interface RenderInput {
  kind: EmailKind
  lang: EmailLang
  vars: Record<string, string | number>
  /** Main button target. */
  url?: string
  siteUrl: string
  /** Adds an unsubscribe link (newsletters, sign-up reminders). */
  unsubscribeUrl?: string
}

export function renderEmail({ kind, lang, vars, url, siteUrl, unsubscribeUrl }: RenderInput) {
  const c = CATALOG[lang][kind]
  const v = safeVars(vars)
  if (v.text) v.text = richText(v.text)
  const subject = stripTags(fill(c.subject, vars))
  const title = fill(c.title, v)
  const body = c.body.map((p) => fill(p, v))
  const note = c.note ? fill(c.note, v) : ''
  const footer = EMAIL[lang].common.footer
  const preheader = stripTags(body[body.length > 1 ? 1 : 0] ?? '').slice(0, 140)

  const html = `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light" /><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f1fa;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${INK};">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1fa;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 30px rgba(60,30,140,.08);">
  <tr><td style="padding:22px 32px;background:#ffffff;border-bottom:1px solid #efedf6;">
    <img src="${esc(siteUrl)}/brand/logo-color.png" alt="ZionDesk" height="34" style="display:block;height:34px;border:0;" />
  </td></tr>
  <tr><td style="background:${PURPLE};background-image:linear-gradient(135deg,#7b45ff 0%,#5a24e8 100%);padding:30px 32px 32px;">
    <span style="display:inline-block;margin:0 0 12px;padding:5px 12px;border-radius:999px;background:${LIME};font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#18210a;">${fill(c.eyebrow, v)}</span>
    <h1 style="margin:0;font-family:'DM Serif Display',Georgia,serif;font-weight:400;font-size:30px;line-height:1.18;color:#ffffff;">${title}</h1>
  </td></tr>
  <tr><td style="padding:28px 32px 6px;">
    ${body.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#3c3a44;">${p}</p>`).join('')}
    ${
      c.cta && url
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:999px;background:${PURPLE};">
        <a href="${esc(url)}" style="display:inline-block;padding:15px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(c.cta)} &rarr;</a>
      </td></tr></table>`
        : ''
    }
  </td></tr>
  <tr><td style="padding:0 32px;"><div style="height:4px;width:56px;border-radius:4px;background:${LIME};"></div></td></tr>
  <tr><td style="padding:16px 32px 30px;">
    <p style="margin:0;font-size:13px;line-height:1.6;color:#8d8a96;">${note ? `${note}<br />` : ''}${footer}${
      unsubscribeUrl ? ` · <a href="${esc(unsubscribeUrl)}" style="color:#8d8a96;text-decoration:underline;">${UNSUBSCRIBE[lang]}</a>` : ''
    }</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const text = [
    stripTags(title),
    '',
    ...body.map((p) => stripTags(p.replace(/<br \/>/g, '\n'))),
    c.cta && url ? `\n${c.cta}: ${url}` : '',
    note ? `\n${stripTags(note)}` : '',
    `\n${footer}`,
    unsubscribeUrl ? `${UNSUBSCRIBE[lang]}: ${unsubscribeUrl}` : '',
  ].join('\n')
  return { subject, html, text }
}
