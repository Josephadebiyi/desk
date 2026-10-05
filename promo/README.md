# ZionDesk launch film (30 s)

Two sizes from one source: **1920×1080** (YouTube, website, LinkedIn) and **1080×1920** (Instagram Reels, TikTok, Shorts, WhatsApp Status).

| File | What it is |
|---|---|
| `script.json` | Voice-over lines with their timings + voice direction (edit the words here) |
| `scene.html` | All visuals — animated dashboard, push-ins, right-to-left moves, 3D spins; open `scene.html?play` (or `?format=reel&play`) in Chrome to preview |
| `music.py` | Original Afro-house cue (120 BPM), synthesized — no licensing |
| `voice.mjs` | Voice-over: Gemini TTS (light Nigerian accent) → ElevenLabs → macOS placeholder |
| `render.mjs` | Renders frames with headless Chrome → ffmpeg |
| `build.sh` | Everything: music, voice, both renders, ducking + -14 LUFS mix |

```bash
npm run promo        # → promo/out/ZionDesk-launch-1920x1080.mp4 and -1080x1920.mp4
```

**The voice.** Put `GEMINI_API_KEY` in `.env` (the same key used for birthday prayers) and run `npm run promo`.
Optional: `GEMINI_TTS_VOICE` (default `Fenrir`, energetic male; also try `Orus`, `Puck`, `Charon`).
Or `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` for an African-accented male voice from ElevenLabs' library.
Or record a voice actor to `promo/out/vo.wav` (30 s, lines at the times in `script.json`) and run only the mix step in `build.sh`.

**The music** is original. For a commercial launch you can swap in a licensed track as `out/music.wav` (120 BPM, drop at 3.5 s).
