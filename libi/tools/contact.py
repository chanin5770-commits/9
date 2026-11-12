#!/usr/bin/env python3
"""Contact sheet of QC stills: python3 tools/contact.py dist/stills out.jpg [cols]"""
import sys, glob, os
from PIL import Image, ImageDraw
fs = sorted(glob.glob(os.path.join(sys.argv[1], '*.png')))
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 6
w, h = 270, 480
rows = (len(fs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + 24)), (40, 20, 30))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(fs):
    im = Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS)
    x, y = (i % cols) * w, (i // cols) * (h + 24)
    sheet.paste(im, (x, y + 24)); d.text((x + 4, y + 4), os.path.basename(f), fill=(255, 255, 255))
sheet.save(sys.argv[2], quality=88)
