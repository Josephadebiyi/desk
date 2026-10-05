# ZionDesk launch reel (31 s)

Story-driven SaaS reel in the style of the Instagram references: light canvas, glossy 3D clay objects,
a mascot, word-by-word kinetic type synced to the voice, captions, and sound design on every action.
Two sizes from one source: **1920×1080** and **1080×1920** (Reels/TikTok/Shorts).

| File | What it is |
|---|---|
| `reel.html` | All visuals, driven by the voice-over's word timings (`words.json`). Preview: open `reel.html?play` (or `?format=reel&play`) in Chrome |
| `words.json` | Word-level timings of the voice-over (ElevenLabs Scribe), remapped to the tightened take |
| `audio/` | ElevenLabs voice-over (ayo jeje, Nigerian male), music (re-cut on bar lines: drop on "Meet ZionDesk"), sound effects |
| `assets/` | 3D mascot, paperwork and coins (generated, background removed with `cutout.py`) |
| `mix.py` | Sound-design cue sheet + ducked mix at -14 LUFS |
| `render.mjs` | Headless Chrome frames → ffmpeg |
| `build.sh` | Everything → `out/ZionDesk-reel-1920x1080.mp4` and `out/ZionDesk-reel-1080x1920.mp4` |

```bash
npm run promo
```

Script: "Pastor… be honest. Your church runs on WhatsApp groups, notebooks… and three different spreadsheets.
First-timers slip away. Offerings get counted twice. Meet ZionDesk. Every member, every family — in one place.
Tithes and offerings, counted and receipted — in naira, cedis or dollars. Messages on WhatsApp and email, in five
languages. Need a flyer for Sunday? Ellen designs it… in seconds. Less paperwork. More people. ZionDesk. Start your
free trial today."

The earlier dark version (`scene.html`, `music.py`, `voice.mjs`) is kept for reference.
