# ZionDesk desktop (macOS + Windows)

A native app around the live ZionDesk web app (https://ziondesk.com). Because it loads the live site,
every web release reaches desktop users instantly — no reinstall needed. Built with Electron.

- **It is the dashboard, not the website.** It opens on the sign-in screen (or straight into the dashboard
  when already signed in). The home page and other marketing pages are never shown: the logo, "back to
  website" and sign-out all land on the sign-in screen.
- **Mac:** one universal `.dmg` for Intel and Apple Silicon (M1–M4 and newer), macOS 12 Monterey or later.
  Distributed as a direct download, not through the Mac App Store.
- **Windows:** one installer for Windows 10/11, 64-bit Intel/AMD and ARM.

What the app adds on top of the website:

- Its own window, Dock/taskbar icon, Start-menu and desktop shortcut (Windows), and menus with shortcuts
  (File → Members / Giving / Messaging / Events / Design Studio / Ellen, ⌘, / Ctrl+, for Settings).
- Remembers window size and position; only one copy runs at a time.
- Sign-in (email, Google), Paystack / Flutterwave / Stripe checkouts and Google connect run inside the window
  and come back to ZionDesk. Other outside links open in the computer's normal browser.
- A branded "You're offline" screen that reconnects by itself.
- Notifications, camera (check-in scanning) and microphone are allowed for ZionDesk only.
- The web app can detect it via `window.ziondeskDesktop` (`{ isDesktop: true, platform }`).

## Get the installers

**For churches:** the website's **Download app** button (header, footer and the dashboard's profile menu) opens
`/download` (`src/pages/Download.tsx`). It picks the right file for the visitor's computer and shows step-by-step
install instructions for macOS 15 Sequoia / 26 Tahoe, macOS 12–14, Windows 11 and Windows 10, in all 5 languages.
The buttons link to the newest GitHub Release:

- Mac: `https://github.com/Josephadebiyi/desk/releases/latest/download/ZionDesk-mac.dmg`
- Windows: `https://github.com/Josephadebiyi/desk/releases/latest/download/ZionDesk-Setup.exe`

(Host the files elsewhere by building the website with `VITE_DESKTOP_MAC_URL` / `VITE_DESKTOP_WIN_URL`.)

**Publishing a version:** push a tag such as `desktop-v1.0.0`:

```bash
git tag desktop-v1.0.0 && git push origin desktop-v1.0.0
```

GitHub Actions builds both apps and publishes a Release with them; the download buttons pick it up right away.
Bump the number for each new desktop release (only needed when `desktop/` changes — website changes reach the app
without a new release).

**Test builds:** every push that touches `desktop/` builds both apps. Open GitHub → **Actions → Desktop apps**
→ the run → *Artifacts* to download **ZionDesk-mac** / **ZionDesk-win** (sign-in to GitHub required).

## Run or build locally

```bash
cd desktop
npm install
npm start              # opens the app on https://ziondesk.com/dashboard
npm run start:local    # against the dev server (npm run dev in the repo root)
npm run dist:mac       # on a Mac   → release/ZionDesk-mac.dmg
npm run dist:win       # on Windows → release/ZionDesk-Setup.exe
```

Point the app anywhere with `ZIONDESK_URL=https://… npm start`.

## Code signing (recommended before handing it to churches)

Without certificates, the Mac app is ad-hoc signed and the Windows installer is unsigned. Both work, but ask
for a confirmation the first time (the /download page walks people through it):

- **macOS:** "can't be opened because Apple cannot check it". Right-click the app → *Open* → *Open*.
  To remove the warning, join the Apple Developer Program ($99/yr), export a *Developer ID Application*
  certificate as `.p12`, and add repository secrets `MAC_CSC_LINK` (the `.p12`, base64), `MAC_CSC_KEY_PASSWORD`,
  `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. The workflow then signs and notarizes automatically.
- **Windows:** SmartScreen shows "Windows protected your PC" → *More info* → *Run anyway*. Add a code-signing
  certificate as `WIN_CSC_LINK` (`.pfx`, base64) and `WIN_CSC_KEY_PASSWORD` to sign the installer.

## Files

- `src/main.js` — window, menus, link and permission rules, offline handling
- `src/preload.js` — exposes `window.ziondeskDesktop`
- `src/offline.html` — the offline screen
- `build/` — app icons (`icon.png`, `icon-mac.png`, `icon.ico`) and macOS entitlements
- `../.github/workflows/desktop.yml` — builds the `.dmg` and `.exe` on GitHub's Mac and Windows machines
