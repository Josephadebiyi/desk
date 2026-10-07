"""V4 launch film (no-voice edition): paces the guide take into a dramatic timeline.
In: audio-v4/guide.mp3 + words-raw.json. Out: audio-v4/guide-paced.wav (rehearsal guide), words-v4.json/.js"""
import json, subprocess
from pathlib import Path
import numpy as np

D = Path(__file__).parent; A = D / "audio-v4"; SR = 48000
LEAD, TAIL = 0.9, 3.0
# In order: (first word of the next beat, silence added before it)
PAUSES = [("A", 0.8), ("A", 0.15), ("A", 0.15), ("A", 0.15), ("Another", 0.15), ("And", 0.5), ("Why?", 1.1), ('"It\'s', 1.0), ("No.", 0.9),
          ("Because", 0.8), ("A", 0.4), ("A", 0.5), ("So", 1.1), ("One", 0.4), ("Newcomers", 0.7), ("Follow-ups", 0.4), ("Members,", 0.6),
          ("Need", 0.6), ("Less", 0.7), ("The", 0.9), ("ZionDesk.", 0.8)]
raw = [w for w in json.load(open(A / "words-raw.json"))["words"] if w["type"] == "word"]
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(A / "guide.mp3"), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
x = np.frombuffer(pcm, np.float32)
cuts, pi = [], 0
for i, w in enumerate(raw):
    if pi < len(PAUSES) and i and w["text"] == PAUSES[pi][0] and raw[i - 1]["text"].rstrip('"').endswith((".", "…", "?", ",")):
        cuts.append(((raw[i - 1]["end"] + w["start"]) / 2, PAUSES[pi][1])); pi += 1
assert pi == len(PAUSES), (pi, PAUSES[pi:])
shift = lambda t: t + LEAD + sum(p for c, p in cuts if c <= t)
out, prev = [np.zeros(int(LEAD * SR), np.float32)], 0.0
for c, p in cuts + [(len(x) / SR, TAIL)]:
    out += [x[int(prev * SR):int(c * SR)], np.zeros(int(p * SR), np.float32)]; prev = c
y = np.concatenate(out)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", str(A / "guide-paced.wav")], input=y.tobytes(), check=True)
words = [{"w": w["text"], "s": round(shift(w["start"]), 3), "e": round(shift(w["end"]), 3)} for w in raw]
dur = round(len(y) / SR, 2)
json.dump({"duration": dur, "words": words}, open(D / "words-v4.json", "w"))
open(D / "words-v4.js", "w").write("window.WORDS=" + json.dumps(words) + ";window.DURATION=" + str(dur) + ";")
print("total", dur, "s")
