#!/usr/bin/env bash
# Builds the ZionDesk launch film in both sizes:
#   out/ZionDesk-launch-1920x1080.mp4  (YouTube, website, LinkedIn)
#   out/ZionDesk-launch-1080x1920.mp4  (Instagram Reels, TikTok, Shorts, WhatsApp Status)
# Voice: set GEMINI_API_KEY (or ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID) in .env first; see voice.mjs.
set -euo pipefail
cd "$(dirname "$0")"
python3 music.py
node voice.mjs
for f in wide reel; do node render.mjs "$f"; done
for f in wide reel; do
  size=$([ "$f" = reel ] && echo 1080x1920 || echo 1920x1080)
  # music ducks under the voice; final loudness -14 LUFS (social platforms)
  ffmpeg -y -v error -i "out/$f-silent.mp4" -i out/music.wav -i out/vo.wav -filter_complex \
    "[1]volume=0.85[m];[2]asplit[v][sc];[m][sc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=300[duck];[duck][v]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1:LRA=9[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "out/ZionDesk-launch-$size.mp4"
  echo "out/ZionDesk-launch-$size.mp4"
done
