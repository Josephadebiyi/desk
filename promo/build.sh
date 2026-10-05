#!/usr/bin/env bash
# Builds the ZionDesk explainer (v3, 30.8 s) in both sizes from explainer.html + the ElevenLabs audio in audio-v3/:
#   out/ZionDesk-explainer-1920x1080.mp4   (YouTube, website, LinkedIn)
#   out/ZionDesk-explainer-1080x1920.mp4   (Instagram Reels, TikTok, Shorts, WhatsApp Status)
# Dashboard footage: start the app without Supabase (npx vite --port 5181 with empty VITE_SUPABASE_*) and run
#   node promo/shots.mjs && node promo/shots-phone.mjs
set -euo pipefail
cd "$(dirname "$0")"
python3 -c "import json; d=json.load(open('words-v3.json')); open('words-v3.js','w').write('window.__WORDS__='+json.dumps(d['words'])+';\n')"
python3 mix_v3.py
for f in wide reel; do
  SCENE=explainer.html node render.mjs "$f" --to 30.8
  size=$([ "$f" = reel ] && echo 1080x1920 || echo 1920x1080)
  ffmpeg -y -v error -i "out/$f-silent.mp4" -i out/explainer-audio.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart "out/ZionDesk-explainer-$size.mp4"
  echo "out/ZionDesk-explainer-$size.mp4"
done
