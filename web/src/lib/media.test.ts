import { describe, expect, it } from "vitest";
import { duplicateGroups, exifDate, filterMedia, fmtTime, formatOf, linkAt, mediaCsv, musicService, parseTime, sha256Hex, sizeCandidates, sortMedia, timeline, type MediaItem } from "./media";

/** A minimal JPEG with an EXIF block: IFD0 (optional DateTime + pointer to the EXIF IFD) and DateTimeOriginal. */
function jpeg(opts: { original?: string; plain?: string; le?: boolean }): ArrayBuffer {
  const le = opts.le ?? true;
  const t: number[] = [];
  const u16 = (n: number) => (le ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) => (le ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  const str = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);
  // TIFF header (8) + IFD0 (2 + 2·12 + 4 = 30) + EXIF IFD (2 + 12 + 4 = 18) + strings.
  const ifd0 = 8, exifIfd = 38, s1 = 56, s2 = 76;
  t.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0));
  t.push(...u16(2));
  t.push(...u16(0x0132), ...u16(2), ...u32(20), ...u32(opts.plain ? s2 : 0));
  t.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(opts.original ? exifIfd : 0));
  t.push(...u32(0));
  t.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(s1), ...u32(0));
  t.push(...str(opts.original ?? "0000:00:00 00:00:00"));
  t.push(...str(opts.plain ?? "0000:00:00 00:00:00"));
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...t];
  const bytes = [0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xff, 0xda, 0, 2];
  return new Uint8Array(bytes).buffer;
}

const item = (x: Partial<MediaItem>): MediaItem => ({ key: `pc:${x.id}`, src: "pc", id: "x", name: "a.png", kind: "image", game: null, date: "2026-01-01T00:00:00Z", size: 10, format: "PNG", favorite: false, tags: [], category: null, ...x });

describe("media", () => {
  it("reads the capture date from EXIF (original first, both byte orders) and never invents one", () => {
    expect(exifDate(jpeg({ original: "2026:10:20 18:05:09", plain: "2026:10:21 09:00:00" }))).toBe("2026-10-20T18:05:09");
    expect(exifDate(jpeg({ original: "2025:01:02 03:04:05", le: false }))).toBe("2025-01-02T03:04:05");
    expect(exifDate(jpeg({ plain: "2024:12:24 20:00:00" }))).toBe("2024-12-24T20:00:00");
    expect(exifDate(jpeg({}))).toBeNull();                          // zeros = no date
    expect(exifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull(); // PNG
    expect(exifDate(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 200]).buffer)).toBeNull(); // cut off: no crash
  });

  it("finds duplicates only by checksum, and only asks checksums for files of equal size", async () => {
    const a = await sha256Hex(new Uint8Array([1, 2, 3]).buffer), b = await sha256Hex(new Uint8Array([1, 2, 4]).buffer);
    expect(a).toBe("039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
    const items = [item({ id: "1", size: 3, hash: a, date: "2026-02-01T00:00:00Z" }), item({ id: "2", size: 3, hash: a, date: "2026-01-01T00:00:00Z" }), item({ id: "3", size: 3, hash: b }), item({ id: "4", size: 99 }), item({ id: "5", src: "photo", size: 3, hash: a })];
    expect(sizeCandidates(items).map((i) => i.id)).toEqual(["1", "2", "3"]);
    const g = duplicateGroups(items);
    expect(g).toHaveLength(1);
    expect(g[0].map((i) => i.id)).toEqual(["2", "1"]); // oldest first (the original)
  });

  it("filters by format, size, source, tag and game, and sorts with games without name last", () => {
    const items = [item({ id: "1", name: "b10.png", size: 500, game: "Zelda", tags: ["Boss"] }), item({ id: "2", name: "b9.jpg", format: "JPG", size: 5 * 1024 ** 2, game: null }), item({ id: "3", name: "a.mp4", kind: "video", format: "MP4", size: 200 * 1024 ** 2, game: "Astro", src: "photo" })];
    expect(filterMedia(items, { format: "JPG" }).map((i) => i.id)).toEqual(["2"]);
    expect(filterMedia(items, { size: "s" }).map((i) => i.id)).toEqual(["1"]);
    expect(filterMedia(items, { size: "xl", src: "photo" }).map((i) => i.id)).toEqual(["3"]);
    expect(filterMedia(items, { tag: "boss", q: "zel" }).map((i) => i.id)).toEqual(["1"]);
    expect(filterMedia(items, { game: "-" }).map((i) => i.id)).toEqual(["2"]);
    expect(sortMedia(items, "name", false).map((i) => i.name)).toEqual(["a.mp4", "b9.jpg", "b10.png"]);
    expect(sortMedia(items, "game", false).map((i) => i.id)).toEqual(["3", "1", "2"]);
    expect(sortMedia(items, "game", true).map((i) => i.id)).toEqual(["1", "3", "2"]);
    expect(sortMedia(items, "size", true).map((i) => i.id)).toEqual(["3", "2", "1"]);
    expect(formatOf("x.JPEG")).toBe("JPG");
    expect(formatOf("blob", "image/webp")).toBe("WEBP");
  });

  it("exports metadata as CSV with formulas neutralised", () => {
    const csv = mediaCsv([item({ name: "=HYPERLINK(1)", tags: ["a", "b"], favorite: true })]);
    expect(csv.split("\r\n")[1]).toContain(`"'=HYPERLINK(1)"`);
    expect(csv).toContain("a, b");
  });

  it("parses clip times and jumps only where the site documents it", () => {
    expect(parseTime("1:02:03")).toBe(3723);
    expect(parseTime("2:05")).toBe(125);
    expect(parseTime("125")).toBe(125);
    expect(parseTime("1h2m3s")).toBe(3723);
    expect(parseTime("2m")).toBe(120);
    expect(parseTime("2:75")).toBeNull();
    expect(parseTime("abc")).toBeNull();
    expect(fmtTime(3723)).toBe("1:02:03");
    expect(fmtTime(65)).toBe("1:05");
    expect(linkAt("https://www.youtube.com/watch?v=abc", 90)).toBe("https://www.youtube.com/watch?v=abc&t=90s");
    expect(linkAt("https://youtu.be/abc?t=5", 61)).toBe("https://youtu.be/abc?t=61s");
    expect(linkAt("https://www.twitch.tv/videos/123", 3723)).toBe("https://www.twitch.tv/videos/123?t=1h2m3s");
    expect(linkAt("https://example.com/clip.mp4", 12)).toBe("https://example.com/clip.mp4#t=12");
    expect(linkAt("https://example.com/watch?v=1", 12)).toBeNull();
    expect(linkAt("javascript:alert(1)", 1)).toBeNull();
  });

  it("names music services by host only", () => {
    expect(musicService("https://open.spotify.com/track/x")).toBe("Spotify");
    expect(musicService("https://music.youtube.com/watch?v=x")).toBe("YouTube Music");
    expect(musicService("https://www.youtube.com/watch?v=x")).toBe("YouTube");
    expect(musicService("https://artist.bandcamp.com/album/x")).toBe("Bandcamp");
    expect(musicService("https://spotify.com.evil.example/x")).toBeNull();
    expect(musicService("kein link")).toBeNull();
  });

  it("builds the timeline newest first and skips invalid dates", () => {
    const tl = timeline([{ date: "2025-03-01" }, { date: "2026-10-02" }, { date: "2026-10-20" }, { date: "2026-01-05" }, { date: "kaputt" }]);
    expect(tl.map((y) => y.year)).toEqual([2026, 2025]);
    expect(tl[0].months.map((m) => m.month)).toEqual([10, 1]);
    expect(tl[0].months[0].items.map((i) => i.date)).toEqual(["2026-10-20", "2026-10-02"]);
  });
});
