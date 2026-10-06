"""Founder-story launch mix: Taiwo voice-over + music bed (ducked under the voice) + SFX on the spoken words.
Output: promo/out/story-audio.wav (-14 LUFS)."""
import json, re, subprocess, sys
from pathlib import Path

D = Path(__file__).parent
A = D / "audio-v3"  # sound-effects library
words = json.load(open(D / "words-story.json"))["words"]
clean = lambda w: re.sub(r"[^a-z0-9'-]", "", w.lower())


def T(word, n=1):
    c = 0
    for x in words:
        if clean(x["w"]) == clean(word):
            c += 1
            if c == n:
                return x["s"]
    raise KeyError(f"{word} #{n}")


DUR = 117.1
MUSIC = D / "audio-story" / (sys.argv[1] if len(sys.argv) > 1 else "music.mp3")
CUES = [
    ("pop", T("taiwo"), 0.5), ("pop", T("worker"), 0.35), ("whoosh", T("media") - 0.1, 0.35),
    ("typing", T("why") - 0.45, 0.35), ("pop", T("why"), 0.55), ("impact", T("five"), 0.5), ("stamp", T("done"), 0.55),
    ("whoosh", T("qr") - 0.15, 0.4), ("stamp", T("qr") + 0.15, 0.35),
    ("whoosh", T("google") - 0.15, 0.4), ("stamp", T("google") + 0.15, 0.35),
    ("whoosh", T("another") - 0.15, 0.4), ("stamp", T("another") + 0.15, 0.35),
    ("whoosh", T("another", 2) - 0.15, 0.4), ("stamp", T("another", 2) + 0.15, 0.35),
    ("whoosh", T("spreadsheets") - 0.15, 0.4), ("stamp", T("spreadsheets") + 0.15, 0.35), ("pop", T("newcomers"), 0.4),
    ("whoosh", T("visited") - 0.25, 0.4), ("notify", T("life"), 0.45), ("impact", T("challenge"), 0.4),
    ("pop", T("care"), 0.45), ("whoosh", T("too"), 0.45),
    ("stamp", T("weren't"), 0.45), ("stamp", T("built"), 0.45), ("stamp", T("around"), 0.45), ("stamp", T("actually"), 0.5),
    ("pop", T("two"), 0.45), ("sparkle", T("decided"), 0.5), ("riser", T("ziondesk", 2) - 1.55, 0.55), ("impact", T("ziondesk", 2) - 0.03, 0.85),
    ("whoosh", T("one", 4) - 0.1, 0.45), ("whoosh", T("jumping"), 0.45),
    ("whoosh", T("create", 2) - 0.15, 0.45), ("click", T("qr", 2), 0.5),
    ("whoosh", T("collect", 2) - 0.15, 0.45), ("pop", T("newcomer"), 0.35),
    ("whoosh", T("automatically") - 0.15, 0.45), ("notify", T("follow"), 0.4),
    ("whoosh", T("manage", 3) - 0.15, 0.45), ("click", T("members", 1), 0.4),
    ("whoosh", T("send") - 0.15, 0.45), ("notify", T("sms"), 0.45),
    ("whoosh", T("send", 2) - 0.15, 0.45), ("sparkle", T("birthday"), 0.4),
    ("whoosh", T("manage", 4) - 0.15, 0.45), ("coin", T("giving", 2), 0.5),
    ("whoosh", T("run") - 0.15, 0.45), ("click", T("events", 2), 0.4),
    ("whoosh", T("give") - 0.15, 0.45), ("pop", T("media", 2), 0.4), ("pop", T("finance"), 0.4), ("pop", T("follow-up"), 0.4),
    ("pop", T("simple", 2), 0.45), ("stamp", T("fighting"), 0.35), ("sparkle", T("ministry"), 0.6),
    ("pop", T("fifty"), 0.45), ("pop", T("five", 2), 0.45), ("impact", T("thousands"), 0.45),
    ("stamp", T("ten"), 0.45), ("whoosh", T("one", 5) - 0.2, 0.45), ("impact", T("one", 5), 0.45),
    ("coin", T("first"), 0.45), ("impact", T("forty"), 0.7), ("coin", T("forty") + 0.3, 0.5),
    ("typing", T("christ", 2) - 0.05, 0.5), ("sparkle", T("alone"), 0.6),
    ("pop", T("pastor"), 0.4), ("pop", T("administrator"), 0.4), ("pop", T("media", 3), 0.4), ("pop", T("follow-up", 2), 0.4), ("pop", T("finance", 2), 0.4),
    ("impact", T("this", 2), 0.45),
    ("whoosh", T("sign") - 0.1, 0.45), ("pop", T("one", 7), 0.4), ("pop", T("your", 5), 0.4), ("pop", T("everything", 2), 0.45),
    ("riser", T("ziondesk", 6) - 1.55, 0.5), ("impact", T("ziondesk", 6) - 0.03, 0.8), ("sparkle", T("church", 12), 0.6),
]

inputs = ["-i", str(D / "audio-story" / "vo.wav"), "-i", str(MUSIC)]
parts = []
for i, (snd, at, vol) in enumerate(CUES):
    inputs += ["-i", str(A / f"{snd}.mp3")]
    parts.append(f"[{i + 2}]aresample=48000,aformat=channel_layouts=stereo,volume={vol * 0.8},adelay={max(0, int(at * 1000))}:all=1[s{i}]")
graph = ";".join(parts + [
    "".join(f"[s{i}]" for i in range(len(CUES))) + f"amix=inputs={len(CUES)}:normalize=0,apad=whole_dur={DUR}[fx]",
    f"[0]aresample=48000,aformat=channel_layouts=stereo,highpass=f=70,acompressor=threshold=-18dB:ratio=3:attack=4:release=90,volume=1.6,apad=whole_dur={DUR}[vo]",
    "[vo]asplit[v][sc]",
    f"[1]aresample=48000,aformat=channel_layouts=stereo,volume=0.5,afade=t=out:st={DUR - 2.2}:d=2.2,apad=whole_dur={DUR}[m]",
    "[m][sc]sidechaincompress=threshold=0.04:ratio=5:attack=20:release=350[duck]",
    f"[v][duck][fx]amix=inputs=3:normalize=0,atrim=0:{DUR},loudnorm=I=-14:TP=-1:LRA=9[out]",
])
out = D / "out" / "story-audio.wav"
subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", str(out)], check=True)
print(out)
