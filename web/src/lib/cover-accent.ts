// An accent colour for the music card from the song's cover: the average of the pixels that are colourful and not too dark or too
// light (grey covers fall back to the plain accent). Pure on pixel data, so it is tested without a browser.

/** RGBA pixels → "#rrggbb", or null when the picture has no usable colour. */
export function accentFromPixels(data: ArrayLike<number>): string | null {
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const R = data[i], G = data[i + 1], B = data[i + 2], A = data[i + 3];
    if (A < 200) continue;
    const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 510, sat = max === 0 ? 0 : (max - min) / max;
    if (l < 0.12 || l > 0.9) continue;                  // nearly black or white says nothing
    const weight = sat * sat * (1 - Math.abs(l - 0.5));  // colourful and medium bright count most
    r += R * weight; g += G * weight; b += B * weight; w += weight;
  }
  if (w < 0.5) return null;
  const hex = (v: number) => Math.round(v / w).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

const cache = new Map<string, string | null>();
/** The accent colour of a cover (data URL); asked once per cover. Needs a browser (canvas) – without one it just answers null. */
export async function accentOfCover(src: string | null | undefined): Promise<string | null> {
  if (!src) return null;
  if (cache.has(src)) return cache.get(src)!;
  try {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = c.height = 24;
    const ctx = c.getContext("2d", { willReadFrequently: true }); if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 24, 24);
    const v = accentFromPixels(ctx.getImageData(0, 0, 24, 24).data);
    cache.set(src, v); if (cache.size > 20) cache.delete(cache.keys().next().value as string);
    return v;
  } catch { return null; }
}
