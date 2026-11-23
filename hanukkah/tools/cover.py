"""Cinematic vertical cover image from an original frame (the girls raising their lights)."""
import os, sys, subprocess
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine as E

SRC, T = '20261123_165911', 1.5
W, H = 1080, 1920
out = os.path.join(E.ROOT, 'output', 'gan-malchut-hanukkah-cover.jpg')

raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(T), '-i', E.src_path(SRC), '-frames:v', '1', '-vf',
                      'hqdn3d=1.5:1.5:4:4', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True).stdout
img = np.frombuffer(raw, np.uint8).reshape(H, W, 3).copy()
img = E.zoom_frame(img, 1.18, 0.5, 0.36)
g = E.Grader(strength=0.4)
img = g(img)
img = E.sharpen(img, 0.35)
img = E.bloom(img, 0.3)
# darken the lower part so the title reads clearly
grad = np.linspace(0, 1, H)[:, None]
shade = 1 - 0.62 * np.clip((grad - 0.55) / 0.3, 0, 1) ** 1.3
img = (img.astype(np.float32) * shade[..., None]).astype(np.uint8)
img = cv2.add(img, (np.clip((grad - 0.55) / 0.45, 0, 1)[..., None] * np.array([38, 14, 4])).astype(np.uint8).repeat(W, 1))
img = E.rays(img, 1.0, 0.45)
img = E.Particles(W, H, n=140, seed=12).render(img, 2.0, 1.0)
img = E.flare(img, 0.5, 0.775, 0.55)
img = E.draw_text(img, 'מסיבת חנוכה', W / 2, H * 0.735, size=120, font='frank-ruhl-libre-700')
img = E.draw_text(img, 'גן מלכות', W / 2, H * 0.825, size=230, font='frank-ruhl-libre-900', shimmer=0.45)
img = E.draw_rule(img, W / 2, H * 0.9, W * 0.26, 1.0)
img = E.vignette(img, 0.36)
cv2.imwrite(out, img, [cv2.IMWRITE_JPEG_QUALITY, 94])
print(out)
