"""Generates the app icon (Windows .ico and PWA PNGs) from code so it can be rebuilt reproducibly."""
import os, sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def render(size, maskable=False):
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    # diagonal gradient cyan -> violet
    grad = Image.new("RGBA", (s, s))
    px = grad.load()
    for y in range(s):
        for x in range(s):
            t = (x + y) / (2 * s)
            r = int(34 + (139 - 34) * t); g = int(211 + (92 - 211) * t); b = int(238 + (246 - 238) * t)
            px[x, y] = (r, g, b, 255)
    mask = Image.new("L", (s, s), 0)
    pad = 0 if maskable else int(s * 0.04)
    radius = 0 if maskable else int(s * 0.23)
    ImageDraw.Draw(mask).rounded_rectangle([pad, pad, s - pad, s - pad], radius=radius, fill=255)
    img.paste(grad, (0, 0), mask)
    # inner dark plate
    d = ImageDraw.Draw(img)
    inset = int(s * (0.2 if maskable else 0.14))
    d.rounded_rectangle([inset, inset, s - inset, s - inset], radius=int(s * 0.16), fill=(10, 14, 26, 235))
    # play triangle with glow
    cx, cy, r = s * 0.53, s * 0.5, s * (0.17 if maskable else 0.2)
    tri = [(cx - r * 0.8, cy - r), (cx - r * 0.8, cy + r), (cx + r, cy)]
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(glow).polygon(tri, fill=(34, 211, 238, 200))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.03))
    img.alpha_composite(glow)
    ImageDraw.Draw(img).polygon(tri, fill=(236, 254, 255, 255))
    return img.resize((size, size), Image.LANCZOS)

def main():
    pub = os.path.join(ROOT, "web", "public", "icons")
    os.makedirs(pub, exist_ok=True)
    render(192).save(os.path.join(pub, "icon-192.png"))
    render(512).save(os.path.join(pub, "icon-512.png"))
    render(512, maskable=True).save(os.path.join(pub, "maskable-512.png"))
    render(180).save(os.path.join(pub, "apple-touch-icon.png"))
    render(64).save(os.path.join(pub, "favicon-64.png"))
    big = render(256)
    big.save(os.path.join(ROOT, "companion", "src", "Companion.Windows", "app.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("Icons erzeugt.")

if __name__ == "__main__":
    main()
