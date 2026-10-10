# ZionDesk tutorial video (~8 min, 1920×1080)

Part 1 "Why ZionDesk" (story, every team in the church, trust & price), then 12 tutorial chapters recorded from the
real app (demo workspace, Ministry Max unlocked) with an on-screen cursor, highlights, zooms, team labels and chapter cards.

| File | What it is |
|---|---|
| `script.json` | Voice-over script, one entry per scene (`chapter` marks a new chapter) |
| `vo/` | ElevenLabs voice "Jeff – Smooth, Calming and Natural" (eleven_multilingual_v2), one mp3 per scene |
| `music/` | `intro.mp3` (ElevenLabs Music, warm/hopeful), `bed.mp3` (calm organic bed, looped under the tutorials) |
| `overlay.js` | Cursor, highlight ring, zoom, chapter badge, lower-thirds and brand cards drawn over the app |
| `record.mjs` | Drives the app scene by scene in headless Chrome and records `out/screen.mp4` + `out/timeline.json` |
| `flyer.svg` | The AI flyer shown in the Design Studio scene (the demo has no API server) |
| `captions.mjs` | Captions → transparent caption track + `out/ZionDesk-Tutorial.srt` |
| `build.py` | Voice (92% tempo) + ducked music → `out/ZionDesk-Tutorial-1920x1080.mp4` and the captioned version |

Rebuild (demo app on :5175 — the `ziondesk-demo` preview, i.e. vite with empty `VITE_SUPABASE_*`):

```bash
node promo/tutorial/record.mjs && node promo/tutorial/captions.mjs && python3 promo/tutorial/build.py
```

To change a line: edit `script.json`, regenerate that line's mp3 in `vo/` with the same voice, then rebuild.
