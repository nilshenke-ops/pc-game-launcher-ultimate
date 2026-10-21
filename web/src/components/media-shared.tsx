// Shared parts of "Medien": importing a picture into the photo museum (EXIF date, checksum, thumbnail), albums that hold
// museum photos and PC captures, category names and a lazily loaded thumbnail.

import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { addImage, getEntry, listKind, newId, saveEntry, type Entry } from "../lib/journal";
import { exifDate, formatOf, sha256Hex } from "../lib/media";
import { PHOTO } from "../lib/collection-schemas";
import type { GameRef } from "../lib/journal-logic";
import { JImage } from "./journal-ui";
import { removeWithLinks } from "./collection-view";

export interface Photo {
  title: string; game: GameRef; description?: string; category?: string | null; tags: string[]; favorite: boolean;
  /** "YYYY-MM-DD" – from EXIF or the file date at import (takenAuto), changeable. */
  takenAt?: string | null; takenAuto?: string | null; takenSource?: "exif" | "file" | null;
  settings: { name: string; value?: string }[];
  imageId: string; thumbId: string;
  file: { name: string; type: string; bytes: number; width: number; height: number; format: string };
  /** SHA-256 of the original file (finds the same picture imported twice). */
  hash: string;
  captureId?: string | null;
  links?: string[];
}

/** An album: museum photos ("photo:<id>") and PC captures ("pc:<id>"). */
export interface Album { title: string; description?: string; items: string[] }

export const PHOTO_CATEGORIES = PHOTO.fields.find((f) => f.key === "category")!.options!;
export const categoryLabel = (v?: string | null) => (v ? t(PHOTO_CATEGORIES.find((c) => c.value === v)?.label ?? v) : "");

const localDate = (ms: number) => { const d = new Date(ms); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

export function photoByHash(hash: string) { return listKind<Photo>("photo").find((p) => p.data.hash === hash); }

/** Reads a picture once: checksum and EXIF date from the original, then a 1600 px copy and a 480 px thumbnail. */
export async function preparePhoto(file: Blob, name: string, lastModified?: number) {
  const buf = await file.arrayBuffer();
  const hash = await sha256Hex(buf);
  const exif = /jpe?g$/i.test(file.type) ? exifDate(buf) : null;
  let width = 0, height = 0;
  try { const bmp = await createImageBitmap(file); width = bmp.width; height = bmp.height; bmp.close(); } catch { /* addImage reports it */ }
  return { hash, exif, width, height, name, lastModified, file };
}

export async function savePhoto(p: Awaited<ReturnType<typeof preparePhoto>>, extra: { game?: GameRef; captureId?: string | null; tags?: string[]; favorite?: boolean } = {}): Promise<Entry<Photo>> {
  const imageId = await addImage(p.file);
  const thumbId = await addImage(p.file, { side: 480, maxBytes: 60 * 1024 });
  const taken = p.exif ? p.exif.slice(0, 10) : p.lastModified ? localDate(p.lastModified) : null;
  const data: Photo = {
    title: p.name.replace(/\.[a-z0-9]{2,5}$/i, "").slice(0, 120) || t("Foto"), game: extra.game ?? { gameId: null, gameName: null },
    description: "", category: null, tags: extra.tags ?? [], favorite: extra.favorite ?? false,
    takenAt: taken, takenAuto: taken, takenSource: p.exif ? "exif" : taken ? "file" : null, settings: [],
    imageId, thumbId, file: { name: p.name.slice(0, 200), type: p.file.type, bytes: p.file.size, width: p.width, height: p.height, format: formatOf(p.name, p.file.type) },
    hash: p.hash, captureId: extra.captureId ?? null, links: [],
  };
  return saveEntry("photo", newId(), data);
}

/** Deleting a photo: from every album and every link too. */
export function removePhoto(id: string) {
  for (const a of listKind<Album>("album")) if (a.data.items.includes(`photo:${id}`)) saveEntry("album", a.id, { ...a.data, items: a.data.items.filter((x) => x !== `photo:${id}`) });
  removeWithLinks(id);
}

export function setInAlbum(albumId: string, keys: string[], on: boolean) {
  const a = getEntry<Album>(albumId);
  if (!a) return;
  const items = on ? [...new Set([...a.data.items, ...keys])] : a.data.items.filter((x) => !keys.includes(x));
  saveEntry("album", a.id, { ...a.data, items: items.slice(0, 5000) });
}

export function newAlbum(title: string): string {
  const id = newId();
  saveEntry("album", id, { title: title.trim().slice(0, 80), description: "", items: [] } satisfies Album);
  return id;
}

/** A museum thumbnail that is only read when it scrolls into view (hundreds of pictures stay fast). */
export function LazyThumb({ id, alt = "" }: { id: string; alt?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return <div ref={ref} className="m-thumb">{seen ? <JImage id={id} alt={alt} /> : null}</div>;
}
