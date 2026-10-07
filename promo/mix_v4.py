"""V4 launch film audio: organic music bed + reference-style sound design. No voice (added by hand later).
python3 mix_v4.py musicA.mp3 [--guide]  ->  out/v4-audio.wav  (--guide also lays the paced AI voice on top, for rehearsal)"""
import json, re, subprocess, sys
from pathlib import Path

D = Path(__file__).parent; A = D / "audio-v3"
words = json.load(open(D / "words-v4.json"))
DUR = words["duration"]; words = words["words"]
clean = lambda w: re.sub(r"[^a-z0-9'-]", "", w.lower())
def T(word, n=1, end=False):
    c = 0
    for x in words:
        if clean(x["w"]) == clean(word):
            c += 1
            if c == n: return x["e" if end else "s"]
    raise KeyError(f"{word} #{n}")

# scene starts (same as v4.html) → whooshes on whip pans
CUTS = [T("a") - 0.35, T("and") - 0.3, T("why", 2) - 0.45, T("no") - 0.12, T("because") - 0.3, T("first-time") - 0.35, T("so") - 0.3,
        T("newcomers", 2) - 0.35, T("follow-ups") - 0.3, T("members") - 0.3, T("need", 2) - 0.3, T("first") - 0.45, T("ziondesk", 2) - 0.4]
CUES = [(f"whoosh", c - 0.12, 0.35) for c in CUTS] + [
    ("impact", T("five") - 0.02, 0.7), ("pop", T("sunday"), 0.35),
    *[("stamp", T(w) - 0.1, 0.3) for w in ["qr", "google", "spreadsheet", "whatsapp", "another"]],
    *[("notify", T(w) + 0.45, 0.22) for w in ["qr", "google", "spreadsheet", "whatsapp", "another"]],
    ("typing", T("stitch") - 0.1, 0.25),
    ("pop", T("why", 2) - 1.2, 0.3), ("typing", T("why", 2) - 0.9, 0.3), ("impact", T("why", 2) - 0.03, 0.55), ("pop", T("why", 2), 0.5),
    ("typing", T("why", 2, True) + 0.25, 0.32), ("pop", T("it's") - 0.03, 0.45),
    ("impact", T("no") - 0.02, 0.9), ("stamp", T("process.", 2, True) - 0.05, 0.45), ("impact", T("problem."), 0.6),
    ("click", T("don't"), 0.3), ("whoosh", T("slip"), 0.4), ("impact", T("cracks."), 0.4),
    ("pop", T("first-time"), 0.3), ("click", T("nobody"), 0.35),
    ("stamp", T("three"), 0.45), ("stamp", T("three") + 0.28, 0.45), ("stamp", T("three") + 0.56, 0.45),
    ("riser", T("ziondesk") - 1.55, 0.6), ("impact", T("ziondesk") - 0.03, 0.9), ("sparkle", T("ziondesk") + 0.1, 0.6),
    ("click", T("qr", 2) + 0.1, 0.4), ("sparkle", T("code.", 2, True) + 0.05, 0.4),
    ("notify", T("go"), 0.4), ("pop", T("whatsapp", 2), 0.3), ("pop", T("sms"), 0.3), ("pop", T("email"), 0.3), ("notify", T("in"), 0.3), ("notify", T("own"), 0.3),
    ("impact", T("automatically") - 0.03, 0.45), ("notify", T("language.") + 0.4, 0.35),
    *[("pop", T(w, n), 0.3) for w, n in [("members", 1), ("attendance", 1), ("giving", 2), ("events", 1), ("branches'", 1)]], ("whoosh", T("all", 2) - 0.1, 0.4),
    ("pop", T("need", 2) - 0.2, 0.4), ("whoosh", T("designers"), 0.35), ("sparkle", T("make"), 0.4), ("coin", T("you."), 0.4),
    ("stamp", T("spreadsheets.", 1, True), 0.4), ("sparkle", T("people.", 2), 0.5),
    ("riser", T("forty") - 1.4, 0.4), ("impact", T("forty") - 0.03, 0.85), ("coin", T("forty") + 0.25, 0.5), ("typing", T("christ") - 0.1, 0.45), ("sparkle", T("alone.", 1, True), 0.5),
    ("impact", T("ziondesk", 2) - 0.08, 0.7), ("sparkle", T("church.", 3, True) + 0.4, 0.55), ("pop", T("church.", 3, True) + 0.45, 0.4),
]
args = [a for a in sys.argv[1:] if not a.startswith("--")]
MUSIC = D / "audio-v4" / (args[0] if args else "musicA.mp3")
GUIDE = "--guide" in sys.argv
inputs = ["-i", str(MUSIC)] + (["-i", str(D / "audio-v4" / "guide-paced.wav")] if GUIDE else [])
off = len(inputs) // 2
parts = []
for i, (snd, at, vol) in enumerate(CUES):
    inputs += ["-i", str(A / f"{snd}.mp3")]
    parts.append(f"[{i + off}]aresample=48000,aformat=channel_layouts=stereo,volume={vol * 0.75},adelay={max(0, int(at * 1000))}:all=1[s{i}]")
fx = "".join(f"[s{i}]" for i in range(len(CUES))) + f"amix=inputs={len(CUES)}:normalize=0,apad=whole_dur={DUR}[fx]"
# Music: dip it under the "Why?" hush and the reveal so those moments hit harder.
why, rev = T("why", 2) - 0.5, T("ziondesk") - 0.1
music = (f"[0]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{DUR},afade=t=in:d=0.6,afade=t=out:st={DUR - 3}:d=3,"
         f"volume='if(between(t,{why},{why + 3.4}),0.45,1)':eval=frame,volume=0.55,apad=whole_dur={DUR}[m]")
mix = [fx, music]
if GUIDE:
    mix += [f"[1]aresample=48000,aformat=channel_layouts=stereo,volume=1.5,apad=whole_dur={DUR}[vo]", "[vo]asplit[v][sc]",
            "[m][sc]sidechaincompress=threshold=0.04:ratio=5:attack=20:release=400[duck]", f"[v][duck][fx]amix=inputs=3:normalize=0,atrim=0:{DUR},loudnorm=I=-14:TP=-1:LRA=9[out]"]
else:
    mix += [f"[m][fx]amix=inputs=2:normalize=0,atrim=0:{DUR},loudnorm=I=-16:TP=-1.5:LRA=9[out]"]
out = D / "out" / ("v4-audio-guide.wav" if GUIDE else "v4-audio.wav")
subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(parts + mix), "-map", "[out]", "-ar", "48000", str(out)], check=True)
print(out, DUR, len(CUES), "cues")
