"""
Final audio for the launch reel: ElevenLabs voice-over + music (ducked under the voice) +
sound effects placed on the spoken words / on-screen actions (same anchors as reel.html).
Output: promo/out/reel-audio.wav  (31 s, -14 LUFS for social)
"""
import json, re, subprocess
from pathlib import Path

D = Path(__file__).parent
A = D / "audio"
words = json.load(open(D / "words.json"))["words"]
clean = lambda w: re.sub(r"[^a-z0-9-]", "", w.lower())

def T(word, n=1):
    c = 0
    for x in words:
        if clean(x["w"]) == clean(word):
            c += 1
            if c == n:
                return x["s"]
    raise KeyError(word)

# (sound, time, volume)
CUES = [
    ("pop", T("pastor"), 0.5), ("pop", T("honest"), 0.6),
    ("whoosh", T("your") - 0.15, 0.5),
    ("notify", T("whatsapp") + 0.05, 0.55),
    ("paper", T("notebooks") - 0.05, 0.7),
    ("whoosh", T("three"), 0.45), ("pop", T("three") + 0.25, 0.35), ("pop", T("three") + 0.5, 0.35),
    ("whoosh", T("first-timers") - 0.15, 0.45),
    ("pop", T("first-timers") + 0.05, 0.35), ("pop", T("first-timers") + 0.25, 0.35),
    ("oops", T("slip"), 0.3),
    ("coin", T("offerings"), 0.45),
    ("stamp", T("twice"), 0.8),
    ("riser", T("meet") - 1.55, 0.6),
    ("impact", T("zionDesk") - 0.05, 0.85),
    ("whoosh", T("every") - 0.1, 0.5),
    ("click", T("family") - 0.1, 0.7),
    ("pop", T("place"), 0.55),
    ("whoosh", T("tithes") - 0.1, 0.45), ("coin", T("tithes") + 0.1, 0.45),
    ("stamp", T("receipted"), 0.75),
    ("coin", T("naira"), 0.4), ("coin", T("cedis"), 0.4), ("coin", T("dollars"), 0.45),
    ("whoosh", T("messages") - 0.1, 0.45),
    ("notify", T("messages") + 0.4, 0.5), ("notify", T("messages") + 0.9, 0.45), ("notify", T("messages") + 1.4, 0.45),
    ("pop", T("five"), 0.4), ("pop", T("five") + 0.16, 0.4), ("pop", T("five") + 0.32, 0.4),
    ("whoosh", T("need") - 0.1, 0.45),
    ("typing", T("need") + 0.3, 0.55),
    ("sparkle", T("ellen"), 0.6),
    ("pop", T("seconds") - 0.1, 0.5),
    ("whoosh", T("less") + 0.25, 0.45),
    ("pop", T("more"), 0.4), ("pop", T("more") + 0.14, 0.4), ("pop", T("more") + 0.28, 0.4),
    ("impact", T("zionDesk", 2) - 0.1, 0.7),
    ("click", T("today") - 0.05, 0.75),
]

inputs = ["-i", str(A / "vo-30.wav"), "-i", str(A / "music-edit.wav")]
parts = []
for i, (snd, at, vol) in enumerate(CUES):
    inputs += ["-i", str(A / f"{snd}.mp3")]
    k = i + 2
    parts.append(f"[{k}]aresample=48000,aformat=channel_layouts=stereo,volume={vol},adelay={max(0, int(at * 1000))}:all=1[s{i}]")
sfx = "".join(f"[s{i}]" for i in range(len(CUES)))
graph = ";".join(parts + [
    f"{sfx}amix=inputs={len(CUES)}:normalize=0,apad=whole_dur=31[fx]",
    "[0]aresample=48000,aformat=channel_layouts=stereo,highpass=f=70,acompressor=threshold=-18dB:ratio=3:attack=4:release=90,volume=1.5,apad=whole_dur=31[vo]",
    "[vo]asplit[v][sc]",
    "[1]aresample=48000,volume=0.5[m]",
    "[m][sc]sidechaincompress=threshold=0.04:ratio=5:attack=20:release=350[duck]",
    "[v][duck][fx]amix=inputs=3:normalize=0,atrim=0:31,loudnorm=I=-14:TP=-1:LRA=8[out]",
])
out = D / "out" / "reel-audio.wav"
subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", str(out)], check=True)
print(out)
