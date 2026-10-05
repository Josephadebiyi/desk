/**
 * Welcome / trial email. Plain table-based HTML with inline styles so it renders
 * in Gmail, Outlook and Apple Mail. Shared by the API route and the in-app preview.
 */
import { EMAIL, fill, type EmailLang } from './strings'

export interface WelcomeEmailInput {
  lang?: EmailLang
  email: string
  dashboardUrl: string
  signupUrl: string
  trialDays: number
  siteUrl: string
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function welcomeEmailSubject(days: number, lang: EmailLang = 'en') {
  return fill(EMAIL[lang].welcome.subject, { days })
}

export function renderWelcomeEmail({ lang = 'en', email, dashboardUrl, signupUrl, trialDays, siteUrl }: WelcomeEmailInput) {
  const w = EMAIL[lang].welcome
  const c = EMAIL[lang].common
  const features = w.features
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(welcomeEmailSubject(trialDays, lang))}</title>
</head>
<body style="margin:0;padding:0;background:#f6f5f1;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#111015;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;">
  <tr><td style="background:#111015;padding:28px 32px;">
    <img src="${esc(siteUrl)}/brand/logo-lime.png" alt="ZionDesk" height="40" style="display:block;height:40px;" />
  </td></tr>
  <tr><td style="background:#c4ec62;padding:28px 32px;">
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#18210a;">${w.eyebrow}</p>
    <h1 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:32px;line-height:1.1;color:#18210a;">${esc(fill(w.title, { days: trialDays }))}</h1>
  </td></tr>
  <tr><td style="padding:28px 32px 8px;">
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3c3a44;">${w.hi}</p>
    <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#3c3a44;">
      ${fill(w.body, { email: esc(email) })}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
      <tr><td style="border-radius:999px;background:#111015;">
        <a href="${esc(dashboardUrl)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${w.open}</a>
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="border-radius:999px;border:2px solid #111015;">
        <a href="${esc(signupUrl)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#111015;text-decoration:none;">${w.finish}</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px 8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;border-radius:16px;">
      <tr><td style="padding:20px 22px;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6c34ff;">${w.activated}</p>
        ${features
          .map(
            (f) =>
              `<p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#111015;"><span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:50%;background:#c4ec62;color:#18210a;font-size:11px;font-weight:700;margin-right:8px;">✓</span>${esc(f)}</p>`,
          )
          .join('')}
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:24px 32px 32px;">
    <p style="margin:0;font-size:13px;line-height:1.6;color:#8d8a96;">
      ${c.ignore}<br />
      ${c.footer}
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
