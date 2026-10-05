"""v3 explainer mix: Ray D voice-over + energetic music (ducked under the voice) + SFX on the spoken words.
Output: promo/out/explainer-audio.wav (30.8 s, -14 LUFS)."""
import json, re, subprocess
from pathlib import Path

D = Path(__file__).parent
A = D / "audio-v3"
words = json.load(open(D / "words-v3.json"))["words"]
clean = lambda w: re.sub(r"[^a-z0-9-]", "", w.lower())


def T(word, n=1):
    c = 0
    for x in words:
        if clean(x["w"]) == clean(word):
            c += 1
            if c == n:
                return x["s"]
    raise KeyError(word)


DUR = 30.8
CUES = [
    ("pop", T("growing"), 0.45),
    ("whoosh", T("your", 2) - 0.12, 0.5), ("stamp", T("up"), 0.5),
    ("riser", T("meet") - 1.55, 0.55), ("impact", T("meet") - 0.03, 0.9),
    ("whoosh", T("your", 3) - 0.15, 0.55),
    ("whoosh", T("new") - 0.12, 0.5), ("click", T("scan"), 0.6), ("pop", T("scan") + 0.12, 0.4),
    ("whoosh", T("service") - 0.15, 0.45), ("typing", T("service") + 0.15, 0.45),
    ("notify", T("in", 2) + 0.05, 0.75), ("pop", T("instantly"), 0.55),
    ("whoosh", T("track") - 0.12, 0.45), ("pop", T("member"), 0.35), ("pop", T("family"), 0.35), ("pop", T("follow-up"), 0.4),
    ("whoosh", T("see") - 0.12, 0.45), ("coin", T("live"), 0.55), ("coin", T("giving"), 0.4),
    ("whoosh", T("send") - 0.12, 0.45), ("notify", T("whatsapp"), 0.45), ("notify", T("sms"), 0.4), ("notify", T("email"), 0.4),
    ("pop", T("five"), 0.4),
    ("whoosh", T("create") - 0.12, 0.45), ("sparkle", T("ai"), 0.6),
    ("whoosh", T("plan") - 0.1, 0.45), ("whoosh", T("ask") - 0.1, 0.45), ("typing", T("ellen"), 0.35),
    ("impact", T("set") - 0.05, 0.45), ("pop", T("set"), 0.4), ("pop", T("seven"), 0.45), ("pop", T("no"), 0.45),
    ("impact", T("start") - 0.05, 0.6), ("click", T("ziondeskcom") + 0.6, 0.75),
]

inputs = ["-i", str(A / "vo.wav"), "-i", str(A / "music.wav")]
parts = []
for i, (snd, at, vol) in enumerate(CUES):
    inputs += ["-i", str(A / f"{snd}.mp3")]
    parts.append(f"[{i + 2}]aresample=48000,aformat=channel_layouts=stereo,volume={vol},adelay={max(0, int(at * 1000))}:all=1[s{i}]")
graph = ";".join(parts + [
    "".join(f"[s{i}]" for i in range(len(CUES))) + f"amix=inputs={len(CUES)}:normalize=0,apad=whole_dur={DUR}[fx]",
    f"[0]aresample=48000,aformat=channel_layouts=stereo,highpass=f=70,acompressor=threshold=-18dB:ratio=3:attack=4:release=90,volume=1.6,apad=whole_dur={DUR}[vo]",
    "[vo]asplit[v][sc]",
    "[1]aresample=48000,volume=0.55[m]",
    "[m][sc]sidechaincompress=threshold=0.05:ratio=4:attack=20:release=300[duck]",
    f"[v][duck][fx]amix=inputs=3:normalize=0,atrim=0:{DUR},loudnorm=I=-14:TP=-1:LRA=8[out]",
])
out = D / "out" / "explainer-audio.wav"
subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", str(out)], check=True)
print(out)
