# Hosting the website on Hostinger (API stays on Render)

```
ziondesk.com (Hostinger)  ── static site: index.html, assets, .htaccess
        │  calls
        ▼
desk-noae.onrender.com (Render) ── API only: payments, email, AI, admin, cron
        │
        ▼
Supabase (database + sign-in)
```

Hostinger shared hosting can't run the Node server, so the API keeps running on Render (nothing to change
there except the environment below). Visitors only ever see ziondesk.com.

## 1. Build the upload
```bash
npm run build:hostinger
```
Creates `ziondesk-hostinger.zip` (the `dist/` folder, including the hidden `.htaccess`).
The API address is baked in: default `https://desk-noae.onrender.com`. For a custom API domain:
`VITE_API_URL=https://api.ziondesk.com npm run build:hostinger`.

## 2. Upload to Hostinger
1. hPanel → Websites → ziondesk.com → **File Manager** → `public_html`.
2. **Delete everything in `public_html`** (the old site) — or move it into a backup folder outside `public_html`.
3. Upload `ziondesk-hostinger.zip` into `public_html` → right-click → **Extract** → delete the zip.
4. Check that `public_html/.htaccess` exists (enable "Show hidden files" in File Manager settings).

## 3. Point the domain at Hostinger
hPanel → Domains → ziondesk.com → **DNS / Nameservers**:
- `A @` → Hostinger's IP for your plan (hPanel shows it under Hosting → Details), **remove** the Render A records (216.24.57.x).
- `CNAME www` → `ziondesk.com` (or Hostinger's default).
- Delete the old `app` record if you no longer use the Vercel app.
- hPanel → Security → **SSL** → install/enable the free SSL for ziondesk.com and www.
In Render → your service → Settings → Custom Domains, **remove `ziondesk.com`** (Render keeps `desk-noae.onrender.com`).

## 4. Render environment (API)
- `SITE_URL=https://ziondesk.com` — emails, payment returns and sign-in links send people to the website.
- `ADMIN_EMAILS=you@…` — who can open /admin.
- Optional `API_URL=https://api.ziondesk.com` only if you give the API its own domain (then also add that
  custom domain in Render and a `CNAME api → desk-noae.onrender.com` at Hostinger).
- Redeploy (Manual Deploy → latest commit).

## 5. Update the links that point at the API
- **Flutterwave** → Settings → Webhooks: `https://desk-noae.onrender.com/api/payments/webhook` (same secret hash).
- **Supabase** → Authentication → **Send Email hook** (if enabled): `https://desk-noae.onrender.com/api/auth/email-hook`.
- **Supabase** → Authentication → URL Configuration: Site URL `https://ziondesk.com`; Redirect URLs `https://ziondesk.com/**`
  (and `https://admin.ziondesk.com/**` if you use the admin domain).
- **Google Cloud** OAuth client (Google Meet): redirect URI `https://desk-noae.onrender.com/api/google/callback`.
- **WhatsApp** webhook: `https://desk-noae.onrender.com/api/whatsapp/webhook`.
- **Render cron jobs** keep calling the API — no change.

## 6. Check
- https://ziondesk.com loads the new site; https://www.ziondesk.com redirects to it.
- https://ziondesk.com/dashboard and https://ziondesk.com/give/<slug> load (the `.htaccess` handles app routes).
- https://desk-noae.onrender.com/api/health shows the latest commit.
- Sign up, add a member, open a QR link, test a payment.

## Admin on admin.ziondesk.com (optional)
Hostinger → Domains → Subdomains → create `admin` pointing to the **same folder** (`public_html`), enable SSL.
The app opens straight into the staff console on any `admin.` address.

## Updating later
Run `npm run build:hostinger` and upload the new zip the same way (delete old `assets/` first).
