/**
 * Server configuration. Every secret comes from environment variables (Render → Environment).
 * Nothing here is ever sent to the browser.
 */
// Local development: read .env if present (Render injects variables directly).
try {
  process.loadEnvFile?.('.env')
} catch {
  /* no .env file */
}

const v = (k: string) => process.env[k]?.trim() || ''

export const env = {
  port: Number(v('PORT') || 8787),
  // Render sets RENDER_EXTERNAL_URL automatically; SITE_URL only needed for a custom domain.
  siteUrl: (v('SITE_URL') || v('RENDER_EXTERNAL_URL') || 'http://localhost:5173').replace(/\/$/, ''),

  // Supabase (Project Settings → API)
  supabaseUrl: v('SUPABASE_URL') || v('VITE_SUPABASE_URL'),
  supabaseServiceKey: v('SUPABASE_SERVICE_ROLE_KEY'),
  // Supabase → Authentication → Hooks → Send Email hook secret ("v1,whsec_…")
  authHookSecret: v('SUPABASE_AUTH_HOOK_SECRET'),

  // Resend (resend.com → API Keys); EMAIL_FROM must use a domain verified in Resend
  resendKey: v('RESEND_API_KEY'),
  emailFrom: v('EMAIL_FROM') || 'ZionDesk <hello@ziondesk.com>',
  emailReplyTo: v('EMAIL_REPLY_TO'),

  // Optional SMS / WhatsApp (Twilio). Leave empty to keep those channels in "queued" state.
  twilioSid: v('TWILIO_ACCOUNT_SID'),
  twilioToken: v('TWILIO_AUTH_TOKEN'),
  twilioSmsFrom: v('TWILIO_SMS_FROM'),
  twilioWhatsappFrom: v('TWILIO_WHATSAPP_FROM'),

  // Flutterwave (dashboard → Settings → API keys / Webhooks)
  flwSecretKey: v('FLW_SECRET_KEY'),
  flwWebhookHash: v('FLW_WEBHOOK_HASH'), // the "Secret hash" you set on the webhook
  flwPlatformFee: Number(v('FLW_PLATFORM_FEE') || 0), // share ZionDesk keeps from gifts, e.g. 0.02 = 2%
  // Monthly payment-plan ids for subscriptions (create once with: npm run flw:plans)
  flwPlans: { essentials: v('FLW_PLAN_ESSENTIALS'), plus: v('FLW_PLAN_PLUS'), max: v('FLW_PLAN_MAX') } as Record<string, string>,

  // Protects the cron endpoints (Render Cron Job sends it as a Bearer token)
  cronSecret: v('CRON_SECRET'),
}

export const configured = {
  supabase: Boolean(env.supabaseUrl && env.supabaseServiceKey),
  email: Boolean(env.resendKey),
  sms: Boolean(env.twilioSid && env.twilioToken && env.twilioSmsFrom),
  whatsapp: Boolean(env.twilioSid && env.twilioToken && env.twilioWhatsappFrom),
  flutterwave: Boolean(env.flwSecretKey),
}
