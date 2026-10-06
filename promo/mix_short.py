"""Short story launch mix: paced Taiwo VO + soft music bed (ducked) + a few gentle SFX.
python3 mix_short.py [musicB.mp3] [--no-voice]  ->  out/short-audio(.novoice).wav"""
import json, re, subprocess, sys
from pathlib import Path

D = Path(__file__).parent; A = D / "audio-v3"
words = json.load(open(D / "words-short.json"))["words"]
clean = lambda w: re.sub(r"[^a-z0-9'-]", "", w.lower())
def T(word, n=1, end=False):
    c = 0
    for x in words:
        if clean(x["w"]) == clean(word):
            c += 1
            if c == n: return x["e" if end else "s"]
    raise KeyError(f"{word} #{n}")

DUR = round(T("church", 2, True) + 3.0, 2)
MUSIC = D / "audio-story" / next((a for a in sys.argv[1:] if not a.startswith("--")), "musicB.mp3")
CUES = [
    ("whoosh", T("fills") - 0.2, 0.25), ("whoosh", T("and") + 0.2, 0.2),
    ("pop", T("i'm"), 0.3), ("pop", T("media"), 0.25),
    ("whoosh", T("qr") - 0.3, 0.22), ("notify", T("qr") + 0.75, 0.2),
    ("whoosh", T("google") - 0.3, 0.22), ("notify", T("google") + 0.75, 0.2),
    ("whoosh", T("spreadsheet") - 0.3, 0.22), ("notify", T("spreadsheet") + 0.75, 0.2),
    ("whoosh", T("another") - 0.3, 0.22), ("notify", T("another") + 0.75, 0.2),
    ("whoosh", T("slipped"), 0.2), ("stamp", T("work"), 0.2),
    ("riser", T("ziondesk") - 1.5, 0.35), ("sparkle", T("ziondesk") - 0.05, 0.5),
    ("click", T("scanning") + 0.2, 0.3), ("pop", T("code", 2), 0.3),
    ("notify", T("go"), 0.3), ("pop", T("automatically"), 0.25), ("notify", T("automatically", 1, True) + 0.15, 0.25),
    ("pop", T("members"), 0.25), ("pop", T("giving", 2), 0.25), ("pop", T("messages"), 0.25), ("pop", T("events"), 0.25),
    ("whoosh", T("all"), 0.25), ("whoosh", T("fighting"), 0.2), ("sparkle", T("ministry"), 0.4),
    ("coin", T("forty"), 0.35), ("typing", T("christ") - 0.05, 0.3), ("sparkle", T("alone"), 0.35),
    ("sparkle", T("ziondesk", 2), 0.45), ("pop", T("church", 2, True) + 0.25, 0.3),
]
NO_VOICE = "--no-voice" in sys.argv
inputs = ["-i", str(D / "audio-short" / "vo.wav"), "-i", str(MUSIC)]
parts = [f"[{i + 2}]aresample=48000,aformat=channel_layouts=stereo,volume={v},adelay={max(0, int(at * 1000))}:all=1[s{i}]" for i, (snd, at, v) in enumerate(CUES)]
for snd, *_ in CUES: inputs += ["-i", str(A / f"{snd}.mp3")]
fx = "".join(f"[s{i}]" for i in range(len(CUES))) + f"amix=inputs={len(CUES)}:normalize=0,apad=whole_dur={DUR}[fx]"
music = f"[1]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{DUR},afade=t=in:d=1.2,afade=t=out:st={DUR - 2.5}:d=2.5,apad=whole_dur={DUR}"
graph = ";".join(parts + ([fx, music + ",volume=0.4[m]", f"[m][fx]amix=inputs=2:normalize=0,atrim=0:{DUR},loudnorm=I=-18:TP=-2:LRA=9[out]"] if NO_VOICE else [
    fx, f"[0]aresample=48000,aformat=channel_layouts=stereo,highpass=f=70,acompressor=threshold=-18dB:ratio=3:attack=4:release=90,volume=1.6,apad=whole_dur={DUR}[vo]",
    "[vo]asplit[v][sc]", music + ",volume=0.42[m]", "[m][sc]sidechaincompress=threshold=0.04:ratio=5:attack=20:release=400[duck]",
    f"[v][duck][fx]amix=inputs=3:normalize=0,atrim=0:{DUR},loudnorm=I=-14:TP=-1:LRA=9[out]"]))
out = D / "out" / ("short-audio-novoice.wav" if NO_VOICE else "short-audio.wav")
subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", str(out)], check=True)
print(out, DUR)
