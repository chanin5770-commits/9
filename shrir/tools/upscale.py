#!/usr/bin/env python3
"""4× Real-ESRGAN upscale of the cleaned storyboard cells (assets/scenes/clean -> assets/scenes/hd).

The cells are ~300 px; the film needs ~1100–2400 px. Real-ESRGAN gives cleaner
edges than plain resampling, but it cannot recover detail that is not in the
source, so close-ups stay soft. Needs torch + spandrel and the
RealESRGAN_x4plus.pth weights (path in $ESRGAN_WEIGHTS).
"""
import os, sys, glob
import numpy as np, torch
from PIL import Image
from spandrel import ModelLoader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
weights = os.environ.get('ESRGAN_WEIGHTS') or sys.exit('set ESRGAN_WEIGHTS to RealESRGAN_x4plus.pth')
torch.set_num_threads(os.cpu_count())
model = ModelLoader().load_from_file(weights).eval()
os.makedirs(os.path.join(ROOT, 'assets/scenes/hd'), exist_ok=True)
for f in sorted(glob.glob(os.path.join(ROOT, 'assets/scenes/clean/*.png'))):
    im = np.asarray(Image.open(f).convert('RGB'), dtype=np.float32) / 255
    x = torch.from_numpy(im).permute(2, 0, 1)[None]
    # reflect-pad so the borders upscale as cleanly as the centre
    p = 8
    x = torch.nn.functional.pad(x, (p, p, p, p), mode='reflect')
    with torch.no_grad():
        y = model(x)[0, :, p * 4:-p * 4, p * 4:-p * 4]
    out = (y.clamp(0, 1).permute(1, 2, 0).numpy() * 255 + 0.5).astype(np.uint8)
    Image.fromarray(out).save(os.path.join(ROOT, 'assets/scenes/hd', os.path.basename(f)))
    print(os.path.basename(f), out.shape[1], 'x', out.shape[0], flush=True)
