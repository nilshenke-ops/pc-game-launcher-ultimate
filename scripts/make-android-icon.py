"""Draws the Android launcher icon from code – same look as the PC/PWA icon (scripts/make-icons.py).

Output goes straight into android/app/src/main/res:
  mipmap-<density>/ic_launcher.png             the normal symbol (older launchers, app info)
  mipmap-<density>/ic_launcher_round.png       the round variant
  mipmap-<density>/ic_launcher_foreground.png  the part on top of the gradient (adaptive icon, Android 8+)

Usage: python3 scripts/make-android-icon.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}


def gradient(size):
    """Diagonal cyan -> violet, the same colours as the site and the PC icon."""
    grad = Image.new("RGBA", (size, size))
    px = grad.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            px[x, y] = (int(34 + (139 - 34) * t), int(211 + (92 - 211) * t), int(238 + (246 - 238) * t), 255)
    return grad


def triangle(draw, cx, cy, r, fill):
    draw.polygon([(cx - r * 0.8, cy - r), (cx - r * 0.8, cy + r), (cx + r, cy)], fill=fill)


def icon(size, round_shape=False):
    """Full symbol: gradient plate, dark inner plate, glowing play triangle."""
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    mask = Image.new("L", (s, s), 0)
    pad = 0 if round_shape else int(s * 0.04)
    radius = int(s * 0.5) if round_shape else int(s * 0.23)
    ImageDraw.Draw(mask).rounded_rectangle([pad, pad, s - pad, s - pad], radius=radius, fill=255)
    img.paste(gradient(s), (0, 0), mask)
    inset = int(s * (0.2 if round_shape else 0.14))
    ImageDraw.Draw(img).rounded_rectangle([inset, inset, s - inset, s - inset], radius=int(s * 0.16), fill=(10, 14, 26, 235))
    cx, cy, r = s * 0.53, s * 0.5, s * (0.17 if round_shape else 0.2)
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    triangle(ImageDraw.Draw(glow), cx, cy, r, (34, 211, 238, 200))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(s * 0.03)))
    triangle(ImageDraw.Draw(img), cx, cy, r, (236, 254, 255, 255))
    return img.resize((size, size), Image.LANCZOS)


def foreground(size):
    """Only the plate and the play triangle; launchers mask it, so it stays inside the inner 72 of 108."""
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    plate = [int(s * 0.26), int(s * 0.26), int(s * 0.74), int(s * 0.74)]
    ImageDraw.Draw(img).rounded_rectangle(plate, radius=int(s * 0.1), fill=(10, 14, 26, 240))
    cx, cy, r = s * 0.52, s * 0.5, s * 0.13
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    triangle(ImageDraw.Draw(glow), cx, cy, r, (34, 211, 238, 180))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(s * 0.02)))
    triangle(ImageDraw.Draw(img), cx, cy, r, (236, 254, 255, 255))
    return img.resize((size, size), Image.LANCZOS)


def main():
    for density, factor in DENSITIES.items():
        folder = os.path.join(RES, "mipmap-" + density)
        os.makedirs(folder, exist_ok=True)
        icon(round(48 * factor)).save(os.path.join(folder, "ic_launcher.png"))
        icon(round(48 * factor), round_shape=True).save(os.path.join(folder, "ic_launcher_round.png"))
        foreground(round(108 * factor)).save(os.path.join(folder, "ic_launcher_foreground.png"))
        print(density, "geschrieben")


if __name__ == "__main__":
    main()
