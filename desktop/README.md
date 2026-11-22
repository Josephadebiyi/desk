# ZionDesk desktop (macOS + Windows)

A native app around the live ZionDesk web app (https://ziondesk.com). Because it loads the live site,
every web release reaches desktop users instantly — no reinstall needed. Built with Electron.

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

GitHub → **Actions → Desktop apps**. Every push that touches `desktop/` builds both apps; open the run and
download **ZionDesk-mac** (`.dmg`) and **ZionDesk-win** (`.exe`) under *Artifacts*. You can also start a build by
hand with **Run workflow**.

To publish a version: push a tag such as `desktop-v1.0.0`. The installers are attached to a **draft** GitHub
Release with that version number; check it, then press *Publish*.

## Run or build locally

```bash
cd desktop
npm install
npm start              # opens the app on https://ziondesk.com/dashboard
npm run start:local    # against the dev server (npm run dev in the repo root)
npm run dist:mac       # on a Mac   → release/ZionDesk-<version>-mac.dmg
npm run dist:win       # on Windows → release/ZionDesk-Setup-<version>.exe
```

Point the app anywhere with `ZIONDESK_URL=https://… npm start`.

## Code signing (recommended before handing it to churches)

Unsigned builds work but show a warning the first time:

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
