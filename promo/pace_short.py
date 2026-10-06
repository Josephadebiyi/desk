"""Short launch VO: adds breathing pauses between story beats so it feels told, not rushed.
In: audio-short/take2.mp3 + words-raw.json. Out: audio-short/vo.wav, words-short.json/.js"""
import json, subprocess
from pathlib import Path
import numpy as np

D = Path(__file__).parent; A = D / "audio-short"
LEAD = 1.4
# (first word of the next beat, extra silence before it)
PAUSES = [("I'm", 0.8), ("One", 0.6), ("So", 0.5), ("That's", 0.7), ("Now,", 1.0),
          ("Less", 0.6), ("The", 0.8), ("ZionDesk.", 0.6)]
raw = [w for w in json.load(open(A / "words-raw.json"))["words"] if w["type"] == "word"]
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(A / "take2.mp3"), "-f", "f32le", "-ac", "1", "-ar", "48000", "-"],
                     capture_output=True, check=True).stdout
x = np.frombuffer(pcm, np.float32); SR = 48000
cuts = []  # (cut time in source, pause)
for i, w in enumerate(raw):
    for word, p in PAUSES:
        if w["text"] == word and i and raw[i - 1]["text"].endswith((".", "…")) and all(c[0] < w["start"] for c in cuts):
            cuts.append(((raw[i - 1]["end"] + w["start"]) / 2, p)); break
assert len(cuts) == len(PAUSES), cuts
out, prev, words = [np.zeros(int(LEAD * SR), np.float32)], 0.0, []
shift = lambda t: t + LEAD + sum(p for c, p in cuts if c <= t)
for c, p in cuts + [(len(x) / SR, 0)]:
    out += [x[int(prev * SR):int(c * SR)], np.zeros(int(p * SR), np.float32)]; prev = c
words = [{"w": w["text"], "s": round(shift(w["start"]), 3), "e": round(shift(w["end"]), 3)} for w in raw]
y = np.concatenate(out)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", "48000", "-ac", "1", "-i", "-", str(A / "vo.wav")], input=y.tobytes(), check=True)
dur = round(len(y) / SR, 2)
json.dump({"duration": dur, "words": words}, open(D / "words-short.json", "w"))
open(D / "words-short.js", "w").write("window.WORDS=" + json.dumps(words) + ";")
print("vo", dur, "s; last word ends", words[-1]["e"])
