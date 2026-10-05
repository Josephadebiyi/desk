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
  // Where THIS API server is reachable (payment returns, Google callback). On Render it's known automatically.
  // Set API_URL only for a custom API domain, e.g. https://api.ziondesk.com
  apiUrl: (v('API_URL') || v('RENDER_EXTERNAL_URL') || v('SITE_URL') || 'http://localhost:8787').replace(/\/$/, ''),
  // Extra browser origins allowed to call the API (comma-separated). The site, www and admin domains are always allowed.
  corsOrigins: v('CORS_ORIGINS').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),

  // Supabase (Project Settings → API)
  supabaseUrl: v('SUPABASE_URL') || v('VITE_SUPABASE_URL'),
  supabaseServiceKey: v('SUPABASE_SERVICE_ROLE_KEY') || v('SUPABASE_SECRET_KEY'), // either name works
  // Supabase → Authentication → Hooks → Send Email hook secret ("v1,whsec_…")
  authHookSecret: v('SUPABASE_AUTH_HOOK_SECRET'),

  // Resend (resend.com → API Keys); EMAIL_FROM must use a domain verified in Resend
  resendKey: v('RESEND_API_KEY'),
  emailFrom: v('EMAIL_FROM') || 'ZionDesk <hello@ziondesk.com>',
  emailReplyTo: v('EMAIL_REPLY_TO'),
  // Where Ministry Max flyer requests go (your design team inbox).
  designTeamEmail: v('DESIGN_TEAM_EMAIL') || 'hello@ziondesk.com',
  // Where new support tickets are announced (optional; defaults to hello@ziondesk.com).
  supportEmail: v('SUPPORT_EMAIL') || v('DESIGN_TEAM_EMAIL') || 'hello@ziondesk.com',

  // Optional SMS / WhatsApp (Twilio). Leave empty to keep those channels in "queued" state.
  twilioSid: v('TWILIO_ACCOUNT_SID'),
  twilioToken: v('TWILIO_AUTH_TOKEN'),
  twilioSmsFrom: v('TWILIO_SMS_FROM'),
  twilioWhatsappFrom: v('TWILIO_WHATSAPP_FROM'),

  // Flutterwave (dashboard → Settings → API keys / Webhooks)
  flwSecretKey: v('FLW_SECRET_KEY') || v('FLUTTERWAVE_SECRET_KEY'),
  // Optional override, e.g. https://api.flutterwave.com/v3
  flwBaseUrl: (v('FLUTTERWAVE_BASE_URL') || 'https://api.flutterwave.com/v3').replace(/\/+$/, '').replace(/^(https:\/\/[^/]+)$/, '$1/v3'),
  flwWebhookHash: v('FLW_WEBHOOK_HASH') || v('FLUTTERWAVE_WEBHOOK_SECRET_HASH') || v('FLUTTERWAVE_WEBHOOK_HASH'), // the "Secret hash" you set on the webhook
  flwPlatformFee: Number(v('FLW_PLATFORM_FEE') || 0), // share ZionDesk keeps from gifts, e.g. 0.02 = 2%
  // Monthly payment-plan ids for subscriptions (create once with: npm run flw:plans)
  flwPlans: { essentials: v('FLW_PLAN_ESSENTIALS'), plus: v('FLW_PLAN_PLUS'), max: v('FLW_PLAN_MAX') } as Record<string, string>,

  // WhatsApp Cloud API (Meta → WhatsApp → API Setup). Preferred over Twilio when set.
  waToken: v('WHATSAPP_TOKEN'), // permanent System User access token
  waPhoneId: v('WHATSAPP_PHONE_NUMBER_ID'),
  // Approved message template with ONE body variable {{1}} (the message text). Needed to message
  // people who haven't written to you in the last 24 hours (WhatsApp rule). e.g. church_update
  waTemplate: v('WHATSAPP_TEMPLATE'),
  waVerifyToken: v('WHATSAPP_VERIFY_TOKEN'), // any string; paste the same one in Meta → Webhooks
  waAppSecret: v('WHATSAPP_APP_SECRET'), // optional: verifies webhook signatures

  // Google Meet: OAuth client (Google Cloud → Credentials). Can be the same client used for Google sign-in.
  googleClientId: v('GOOGLE_CLIENT_ID'),
  googleClientSecret: v('GOOGLE_CLIENT_SECRET'),


  // Staff console on its own domain, e.g. https://admin.ziondesk.com (optional; used in staff emails)
  adminUrl: (v('ADMIN_URL') || '').replace(/\/$/, ''),
  // Platform admin console (/admin): comma-separated emails of ZionDesk staff
  adminEmails: v('ADMIN_EMAILS').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean),

  // Protects the cron endpoints (Render Cron Job sends it as a Bearer token)
  cronSecret: v('CRON_SECRET'),
}

export const configured = {
  supabase: Boolean(env.supabaseUrl && env.supabaseServiceKey),
  email: Boolean(env.resendKey),
  sms: Boolean(env.twilioSid && env.twilioToken && env.twilioSmsFrom),
  whatsappCloud: Boolean(env.waToken && env.waPhoneId),
  whatsapp: Boolean((env.waToken && env.waPhoneId) || (env.twilioSid && env.twilioToken && env.twilioWhatsappFrom)),
  googleMeet: Boolean(env.googleClientId && env.googleClientSecret),
  prayers: Boolean(process.env.ANTHROPIC_API_KEY),
  admin: env.adminEmails.length > 0,
  flutterwave: Boolean(env.flwSecretKey),
}
