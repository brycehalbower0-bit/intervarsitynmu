#!/usr/bin/env python3
"""Generate public/assets/og.png (1200x630) from the official logo + brand colors.

Run: python3 tools/build-og.py  (also wired to `npm run build:og`)
Requires Pillow:  pip install pillow
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, "public", "assets")
W, H = 1200, 630

# Brand colors
NAVY = (0, 71, 80)     # missional blue, shade
MBLUE = (0, 104, 128)  # missional blue
GOLD = (255, 198, 11)
HOPEFUL = (163, 220, 233)


def font(size, bold=True):
    p = ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
         else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    return ImageFont.truetype(p, size) if os.path.exists(p) else ImageFont.load_default()


# Background: vertical gradient, lighter toward the top (light moves up/north)
img = Image.new("RGB", (W, H), MBLUE)
d = ImageDraw.Draw(img)
for y in range(H):
    t = y / H  # 0 top -> 1 bottom
    col = tuple(int(MBLUE[i] + (NAVY[i] - MBLUE[i]) * t) for i in range(3))
    d.line([(0, y), (W, y)], fill=col)
img = img.convert("RGBA")

# Faint concentric-circle motif, top-right
circ = Image.open(os.path.join(A, "brand", "circles-white.png")).convert("RGBA")
circ.thumbnail((360, 360), Image.LANCZOS)
ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
ov.paste(circ, (W - 300, -70), circ)
ov.putalpha(ov.split()[3].point(lambda a: int(a * 0.16)))
img = Image.alpha_composite(img, ov)

# Official white logo, left
logo = Image.open(os.path.join(A, "logos", "InterVarsity_horizontal_white.png")).convert("RGBA")
lw = 560
logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
img.alpha_composite(logo, (96, 158))

# Text
d = ImageDraw.Draw(img)
d.text((100, 158 + logo.height + 12), "NORTHERN MICHIGAN UNIVERSITY", font=font(26), fill=HOPEFUL)
d.text((96, 430), "Real hope. Real community.", font=font(58), fill=(255, 255, 255))
d.text((96, 506), "A community following Jesus, right here at NMU.", font=font(30, bold=False), fill=GOLD)

# Divot-style orange-gradient bar along the bottom
for x in range(W):
    t = x / W
    col = (int(220 + (249 - 220) * t), int(65 + (157 - 65) * t), int(40 + (28 - 40) * t))
    d.line([(x, H - 12), (x, H)], fill=col)

img.convert("RGB").save(os.path.join(A, "og.png"))
print("wrote", os.path.join(A, "og.png"))
