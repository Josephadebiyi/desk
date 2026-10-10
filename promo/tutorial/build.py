"""ZionDesk tutorial: voice + music mix and final videos.
   python3 promo/tutorial/build.py
Needs out/screen.mp4 + out/timeline.json (record.mjs), out/captions.txt (captions.mjs),
vo/<beat>.mp3 (ElevenLabs, Jeff), music/intro.mp3 + music/bed.mp3 (ElevenLabs Music).
Writes out/ZionDesk-Tutorial-1920x1080.mp4 (clean), out/ZionDesk-Tutorial-Captions-1920x1080.mp4, and the
YouTube chapter list out/youtube-chapters.txt."""
import json
import subprocess
from pathlib import Path

D = Path(__file__).parent
OUT = D / "out"
TEMPO = 0.92
VO_DELAY = 0.15
tl = json.loads((OUT / "timeline.json").read_text())
beats = tl["beats"]
TOTAL = tl["total"]
run = lambda *a: subprocess.run(["ffmpeg", "-y", "-v", "error", *a], check=True)

# 1. Voice: each line slowed to 92%, levelled, placed where its scene starts.
inputs, chains = [], []
for i, b in enumerate(beats):
    inputs += ["-i", str(D / "vo" / f"{b['id']}.mp3")]
    ms = int((b["start"] + VO_DELAY) * 1000)
    chains.append(f"[{i}]aresample=48000,atempo={TEMPO},loudnorm=I=-16:TP=-1.5:LRA=7,adelay={ms}|{ms},aformat=channel_layouts=stereo[v{i}]")
mix = "".join(f"[v{i}]" for i in range(len(beats)))
run(*inputs, "-filter_complex", ";".join(chains) + f";{mix}amix=inputs={len(beats)}:normalize=0,atrim=0:{TOTAL}[vo]", "-map", "[vo]", "-ac", "2", "-ar", "48000", str(OUT / "voice.wav"))

# 2. Music: warm intro under Part 1, crossfading into a calm looped bed for the tutorials; ducks under the voice.
tut_start = next(b["start"] for b in beats if b["id"] == "b09") - 2.6  # chapter card before "Getting around"
intro, bed = D / "music" / "intro.mp3", D / "music" / "bed.mp3"
xf = 4.0
music = (
    f"[0]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{tut_start + xf},afade=t=in:d=1.5,volume=0.9[a];"
    f"[1]aresample=48000,aformat=channel_layouts=stereo,volume=0.8[b0];"
    f"[b0]aloop=loop=-1:size=2e9,atrim=0:{TOTAL - tut_start + 2}[b];"
    f"[a][b]acrossfade=d={xf}:c1=tri:c2=tri,atrim=0:{TOTAL},afade=t=out:st={TOTAL - 4}:d=4,loudnorm=I=-27:TP=-3[m];"
    f"[2]aformat=channel_layouts=stereo,asplit=2[vk][vm];"
    f"[m][vk]sidechaincompress=threshold=0.03:ratio=6:attack=60:release=700:makeup=1[md];"
    f"[vm][md]amix=inputs=2:normalize=0,alimiter=limit=0.95,loudnorm=I=-15:TP=-1.5:LRA=9[out]"
)
run("-stream_loop", "0", "-i", str(intro), "-stream_loop", "-1", "-i", str(bed), "-i", str(OUT / "voice.wav"),
    "-filter_complex", music, "-map", "[out]", "-ar", "48000", "-t", str(TOTAL), str(OUT / "mix.wav"))

# 3. Clean video and captioned video.
clean = OUT / "ZionDesk-Tutorial-1920x1080.mp4"
run("-i", str(OUT / "screen.mp4"), "-i", str(OUT / "mix.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
    "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", str(clean))
run("-i", str(OUT / "screen.mp4"), "-f", "concat", "-safe", "0", "-i", str(OUT / "captions.txt"), "-i", str(OUT / "mix.wav"),
    "-filter_complex", "[1]format=rgba,fps=30[c];[0][c]overlay=0:0:shortest=1:format=auto[v]",
    "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", str(OUT / "ZionDesk-Tutorial-Captions-1920x1080.mp4"))

# 4. YouTube chapters (chapter cards appear 2.6 s before their first line).
def stamp(s):
    s = int(s)
    return f"{s // 60}:{s % 60:02d}"
lines = ["0:00 Why ZionDesk"]
for b in beats:
    if b.get("chapter") and b["id"] != "b01":
        t = b["start"] - (2.6 if b["id"] not in ("d01", "b13") else 0)
        lines.append(f"{stamp(max(0, t))} {b['chapter']}")
(OUT / "youtube-chapters.txt").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
print(f"→ {clean.name} and ZionDesk-Tutorial-Captions-1920x1080.mp4 ({TOTAL / 60:.1f} min)")
