"""Cut a white-background render to a transparent PNG: flood-fill near-white from the borders
(so white details inside the object, like eyes, are kept), soften the edge, crop to content."""
import subprocess, sys
import numpy as np

def cut(src, dst):
    w, h = map(int, subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src]).decode().strip().split(','))
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
    img = np.frombuffer(raw, np.uint8).reshape(h, w, 3).astype(np.float32)
    dist = 255 - img.min(axis=2)               # 0 = pure white
    sat = img.max(axis=2) - img.min(axis=2)
    bgish = (dist < 22) & (sat < 14)
    seed = np.zeros_like(bgish)
    seed[0, :] = seed[-1, :] = seed[:, 0] = seed[:, -1] = True
    reach = seed & bgish
    while True:
        grow = reach.copy()
        grow[1:] |= reach[:-1]; grow[:-1] |= reach[1:]; grow[:, 1:] |= reach[:, :-1]; grow[:, :-1] |= reach[:, 1:]
        grow &= bgish
        if (grow == reach).all(): break
        reach = grow
    # soft alpha: background = 0, ramp over near-white fringe touching the background
    alpha = np.where(reach, 0.0, 1.0)
    near = np.zeros_like(reach)
    near[1:] |= reach[:-1]; near[:-1] |= reach[1:]; near[:, 1:] |= reach[:, :-1]; near[:, :-1] |= reach[:, 1:]
    fringe = near & ~reach
    alpha[fringe] = np.clip(dist[fringe] / 40.0, 0.25, 1)
    # keep the soft contact shadow faintly: light-grey pixels in the reach area become translucent grey
    shadow = reach & (dist > 4) & (sat < 14)
    alpha[shadow] = np.clip((dist[shadow] - 4) / 60.0, 0, 0.35)
    ys, xs = np.where(alpha > 0.05)
    y0, y1, x0, x1 = max(ys.min() - 6, 0), min(ys.max() + 6, h), max(xs.min() - 6, 0), min(xs.max() + 6, w)
    rgba = np.dstack([img, alpha * 255]).astype(np.uint8)[y0:y1, x0:x1]
    hh, ww = rgba.shape[:2]
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{ww}x{hh}', '-i', '-', dst], input=rgba.tobytes(), check=True)
    print(dst, ww, hh)

for a in sys.argv[1:]:
    s, d = a.split(':')
    cut(s, d)
