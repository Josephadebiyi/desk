/**
 * Renders any catalog email into { subject, html, text } in the recipient's language.
 * Table-based HTML with inline styles for Gmail, Outlook and Apple Mail.
 */
import { CATALOG, type EmailKind } from './catalog'
import { EMAIL, fill, type EmailLang } from './strings'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
/** Escape values, then allow only <b> in copy that is ours. */
const safeVars = (vars: Record<string, string | number>) => Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(String(v))]))
const stripTags = (s: string) => s.replace(/<[^>]+>/g, '')

export interface RenderInput {
  kind: EmailKind
  lang: EmailLang
  vars: Record<string, string | number>
  /** Main button target. */
  url?: string
  siteUrl: string
}

export function renderEmail({ kind, lang, vars, url, siteUrl }: RenderInput) {
  const c = CATALOG[lang][kind]
  const v = safeVars(vars)
  // Free text from a church (custom messages) keeps its line breaks.
  if (v.text) v.text = v.text.replace(/\n/g, '<br />')
  const subject = stripTags(fill(c.subject, vars))
  const title = fill(c.title, v)
  const body = c.body.map((p) => fill(p, v))
  const note = c.note ? fill(c.note, v) : ''
  const footer = EMAIL[lang].common.footer

  const html = `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f5f1;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#111015;">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${esc(stripTags(body[body.length > 1 ? 1 : 0] ?? ''))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;">
  <tr><td style="background:#111015;padding:24px 32px;">
    <img src="${esc(siteUrl)}/brand/logo-lime.webp" alt="ZionDesk" height="34" style="display:block;height:34px;" />
  </td></tr>
  <tr><td style="background:#c4ec62;padding:26px 32px;">
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#18210a;">${fill(c.eyebrow, v)}</p>
    <h1 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:30px;line-height:1.15;color:#18210a;">${title}</h1>
  </td></tr>
  <tr><td style="padding:26px 32px 8px;">
    ${body.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3c3a44;">${p}</p>`).join('')}
    ${
      c.cta && url
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;"><tr><td style="border-radius:999px;background:#6c34ff;">
        <a href="${esc(url)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(c.cta)} →</a>
      </td></tr></table>`
        : ''
    }
  </td></tr>
  <tr><td style="padding:8px 32px 30px;">
    <p style="margin:0;font-size:13px;line-height:1.6;color:#8d8a96;">${note ? `${note}<br />` : ''}${footer}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const text = [stripTags(title), '', ...body.map((p) => stripTags(p.replace(/<br \/>/g, '\n'))), c.cta && url ? `\n${c.cta}: ${url}` : '', note ? `\n${stripTags(note)}` : '', `\n${footer}`].join('\n')
  return { subject, html, text }
}
