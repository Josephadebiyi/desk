"""
Original 30-second Afro-house cue for the ZionDesk launch film (120 BPM, A minor).
Pure synthesis with numpy — no samples, no licensing. Output: promo/out/music.wav
Hits land on the scene cuts used in scene.html.
"""
import wave
from pathlib import Path

import numpy as np

SR = 44100
DUR = 30.0
BPM = 120
BEAT = 60 / BPM
STEP = BEAT / 4  # 16th note
N = int(SR * DUR)
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)


def t_arr(sec):
    return np.arange(int(sec * SR)) / SR


def add(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    l = np.sqrt(0.5 * (1 - pan))
    r = np.sqrt(0.5 * (1 + pan))
    L[i : i + len(sig)] += sig * l * 1.414
    R[i : i + len(sig)] += sig * r * 1.414


def env(n, a=0.002, d=0.2, sus=0.0, rel=0.05, length=None):
    t = np.arange(n) / SR
    e = np.where(t < a, t / a, np.exp(-(t - a) / max(d, 1e-4)) * (1 - sus) + sus)
    if length:
        e[t > length] *= np.exp(-(t[t > length] - length) / rel)
    return e


def lowpass(x, cutoff):
    # one-pole low-pass
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# ── instruments ──────────────────────────────────────────────
def kick():
    t = t_arr(0.45)
    f = 42 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
    click = rng.standard_normal(len(t)) * np.exp(-t * 400) * 0.25
    return np.tanh((body + click) * 1.6) * 0.9


def clap():
    t = t_arr(0.3)
    n = rng.standard_normal(len(t))
    e = np.zeros(len(t))
    for off in (0, 0.011, 0.022):
        e += np.exp(-np.clip(t - off, 0, None) * 60) * (t >= off)
    e += np.exp(-t * 18) * 0.5
    return highpass(n * e, 900) * 0.45


def shaker(acc=1.0):
    t = t_arr(0.09)
    n = highpass(rng.standard_normal(len(t)), 5000)
    return n * np.exp(-t * 55) * 0.16 * acc


def hat(open_=False):
    t = t_arr(0.25 if open_ else 0.06)
    n = highpass(rng.standard_normal(len(t)), 7000)
    return n * np.exp(-t * (14 if open_ else 70)) * (0.16 if open_ else 0.13)


def conga(note, slap=False):
    t = t_arr(0.35)
    f = midi(note) * (1 + 0.08 * np.exp(-t * 40))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * (16 if slap else 9))
    if slap:
        s += highpass(rng.standard_normal(len(t)), 2000) * np.exp(-t * 90) * 0.4
    return s * 0.42


def log_drum(note, length=0.32):
    # Amapiano-style "log drum": pitched, slightly saturated, pitch drop at the attack
    t = t_arr(length + 0.15)
    f = midi(note) * (1 + 0.5 * np.exp(-t * 35))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)
    e = env(len(t), a=0.003, d=0.9, sus=0.55, rel=0.05, length=length)
    return np.tanh(s * e * 1.8) * 0.5


def pad_chord(notes, length):
    t = t_arr(length)
    s = np.zeros(len(t))
    for n in notes:
        for det in (-0.12, 0.0, 0.12):
            f = midi(n) * 2 ** (det / 12)
            # soft saw (few harmonics)
            for h in range(1, 6):
                s += np.sin(2 * np.pi * f * h * t + rng.random() * 6.28) / (h * 1.6)
    s /= len(notes) * 3 * 2.2
    e = np.minimum(1, t / 0.06) * np.exp(-t * 0.35)
    e *= np.minimum(1, (length - t) / 0.12).clip(0, 1)
    return lowpass(s * e, 2200) * 0.55


def stab(notes):
    t = t_arr(0.28)
    s = np.zeros(len(t))
    for n in notes:
        f = midi(n)
        for h in range(1, 7):
            s += np.sin(2 * np.pi * f * h * t) / h
    s /= len(notes) * 2.5
    return lowpass(s * np.exp(-t * 11), 3200) * 0.5


def marimba(note):
    t = t_arr(0.6)
    f = midi(note)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 6) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 22) + 0.12 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t * 40)
    return s * 0.32


def boom():
    t = t_arr(1.4)
    f = 38 + 60 * np.exp(-t * 6)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 2.6)
    s += lowpass(rng.standard_normal(len(t)), 900) * np.exp(-t * 7) * 0.5
    return np.tanh(s * 1.4) * 0.75


def whoosh(length=0.6):
    t = t_arr(length)
    n = rng.standard_normal(len(t))
    e = (t / length) ** 2.2
    return highpass(lowpass(n, 6000), 400) * e * 0.35


def riser(length):
    t = t_arr(length)
    f = 200 * (1 + 8 * (t / length) ** 2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = (np.sin(ph) * 0.25 + highpass(rng.standard_normal(len(t)), 1500) * 0.3) * (t / length) ** 2
    return s * 0.5


# ── arrangement ──────────────────────────────────────────────
# A minor: Am9 – Fmaj7 – C(add9) – G6, one chord per bar
CHORDS = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 55, 60, 62, 64], [55, 59, 62, 64, 67]]
ROOTS = [33, 29, 36, 31]  # log-drum roots (A1, F1, C2, G1)
BAR = BEAT * 4
DROP = 3.5            # groove starts with the logo reveal
OUTRO = 26.0          # end card
CUTS = [3.5, 5.5, 9.5, 14.0, 18.0, 23.0, 26.0]
MELODY = [  # (16th step in a 2-bar phrase, midi) — A minor pentatonic hook
    (0, 76), (3, 74), (6, 72), (8, 69), (10, 72), (12, 74), (14, 76),
    (16, 79), (19, 76), (22, 74), (24, 72), (26, 74), (28, 69),
]

bars = int(np.ceil(DUR / BAR))
for b in range(bars):
    t0 = b * BAR
    ci = b % 4
    # warm pad throughout (quieter in the intro)
    add(pad_chord(CHORDS[ci], BAR + 0.2), t0, gain=0.55 if t0 < DROP else 0.42)

    for s in range(16):
        ts = t0 + s * STEP + (0.012 if s % 2 else 0)  # light swing
        if ts >= DUR:
            continue
        groove = DROP - 0.01 <= ts < 29.4
        intro = ts < DROP
        # shaker from bar 1, conga from the drop
        if ts > 0.5:
            add(shaker(1.0 if s % 4 == 2 else 0.6), ts, pan=0.35, gain=0.9 if groove else 0.6)
        if groove:
            if s % 4 == 0:
                add(kick(), ts)
            if s in (4, 12):
                add(clap(), ts, pan=-0.05)
            if s % 4 == 2:
                add(hat(open_=(s == 14)), ts, pan=-0.3)
            # conga pattern (3-3-2 feel)
            if s in (3, 6, 10, 13):
                add(conga(64 if s in (3, 10) else 60, slap=(s == 10)), ts, pan=-0.45)
            if s in (7, 15):
                add(conga(67), ts, pan=0.45, gain=0.7)
            # log drum bass
            if s in (0, 3, 7, 10, 14):
                add(log_drum(ROOTS[ci] + (12 if s == 7 else 0) + 12, 0.18 if s in (3, 14) else 0.3), ts, gain=0.95)
            # chord stabs on the off-beats
            if s in (2, 6, 11):
                add(stab(CHORDS[ci][1:]), ts, pan=0.2 if s == 6 else -0.2, gain=0.6)
        elif intro and s in (0, 6, 10) and ts > 1.0:
            add(conga(60 if s else 64), ts, pan=-0.4, gain=0.5)

    # marimba hook (from the drop to the end card, every phrase)
    if DROP <= t0 + BAR and t0 < OUTRO:
        phrase = b % 2
        for st, note in MELODY:
            if st // 16 == phrase:
                ts = t0 + (st % 16) * STEP
                if DROP <= ts < OUTRO:
                    add(marimba(note), ts, pan=0.25, gain=0.75)

# intro riser into the drop; hits + whooshes on every scene cut
add(riser(1.6), DROP - 1.6, gain=0.9)
for c in CUTS:
    add(whoosh(0.45), c - 0.45, pan=-0.2, gain=0.8)
    add(boom(), c, gain=0.85 if c in (DROP, OUTRO) else 0.45)

# end: big chord + final hit, then fade
add(pad_chord([45, 57, 60, 64, 71, 76], 4.0), OUTRO, gain=0.7)
add(stab([57, 60, 64, 71]), 29.0, gain=0.9)
add(boom(), 29.0, gain=0.6)

# ── simple stereo reverb (feedback delays) ──
def reverb(x, mix=0.18):
    out = x.copy()
    for d, g in ((0.0297, 0.5), (0.0371, 0.48), (0.0411, 0.46), (0.0437, 0.44)):
        k = int(d * SR)
        y = np.zeros_like(x)
        for i in range(k, len(x), k):
            y[i : i + k] = x[i - k : i][: len(y[i : i + k])] + y[i - k : i][: len(y[i : i + k])] * g
        out += y * mix / 4
    return out


L = reverb(L)
R = reverb(R)

# fade in/out, glue, normalise
t = np.arange(N) / SR
fade = np.clip(t / 0.25, 0, 1) * np.clip((DUR - t) / 0.9, 0, 1)
mix = np.stack([L, R], axis=1) * fade[:, None]
mix = np.tanh(mix * 1.15)
mix /= np.max(np.abs(mix)) / 0.89

out = Path(__file__).parent / "out" / "music.wav"
out.parent.mkdir(exist_ok=True)
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print(out)
