#!/usr/bin/env bash
# Builds the ZionDesk launch reel (31 s) in both sizes from reel.html + the ElevenLabs audio in audio/:
#   out/ZionDesk-reel-1920x1080.mp4   (YouTube, website, LinkedIn)
#   out/ZionDesk-reel-1080x1920.mp4   (Instagram Reels, TikTok, Shorts, WhatsApp Status)
set -euo pipefail
cd "$(dirname "$0")"
python3 -c "import json; d=json.load(open('words.json')); open('words.js','w').write('window.__WORDS__='+json.dumps(d['words'],ensure_ascii=False)+';\n')"
python3 mix.py
for f in wide reel; do
  SCENE=reel.html node render.mjs "$f" --to 31
  size=$([ "$f" = reel ] && echo 1080x1920 || echo 1920x1080)
  ffmpeg -y -v error -i "out/$f-silent.mp4" -i out/reel-audio.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart "out/ZionDesk-reel-$size.mp4"
  echo "out/ZionDesk-reel-$size.mp4"
done
