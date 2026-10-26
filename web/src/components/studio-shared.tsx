// Shared parts of the creative studio: loading pictures for the canvas, saving a rendered picture, downloading,
// sharing via the system share sheet (only when the browser offers it) and picking a picture.

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Images } from "lucide-react";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { addImage, imageUrl, listKind } from "../lib/journal";
import type { ImageMap } from "../lib/design";
import type { Photo } from "./media-shared";
import { JImage } from "./journal-ui";
import { Button, Empty, Modal } from "./ui";

const loaded = new Map<string, HTMLImageElement>();

/** Loads pictures (from this device, else from the PC) for drawing. Missing ones are simply left out. */
export async function loadImages(ids: string[]): Promise<ImageMap> {
  const map: ImageMap = new Map();
  await Promise.all(ids.map(async (id) => {
    let img = loaded.get(id);
    if (!img) {
      const url = await imageUrl(id);
      if (!url) return;
      img = new Image();
      img.src = url;
      try { await img.decode(); } catch { return; }
      loaded.set(id, img);
    }
    map.set(id, img);
  }));
  return map;
}

/** The pictures for a set of ids, reloaded when the ids change. */
export function useImages(ids: string[]): ImageMap {
  const key = [...ids].sort().join(",");
  const [map, setMap] = useState<ImageMap>(() => new Map());
  useEffect(() => { let on = true; void loadImages(ids).then((m) => { if (on) setMap(m); }); return () => { on = false; }; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}

export function canvasBlob(cv: HTMLCanvasElement, type = "image/png", quality = 0.92): Promise<Blob> {
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error(t("Bild konnte nicht erzeugt werden.")))), type, quality));
}

/** Keeps a rendered picture (longest side 1600 px) and a thumbnail with the entry – for galleries and exhibitions. */
export async function storeRender(cv: HTMLCanvasElement): Promise<{ renderId: string; thumbId: string }> {
  const blob = await canvasBlob(cv, "image/png");
  const renderId = await addImage(blob, { side: 1600 });
  const thumbId = await addImage(blob, { side: 480, maxBytes: 70 * 1024 });
  return { renderId, thumbId };
}

export async function downloadCanvas(cv: HTMLCanvasElement, name: string, type: "png" | "jpg" = "png") {
  const blob = await canvasBlob(cv, type === "png" ? "image/png" : "image/jpeg", 0.92);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.${type}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** True when the browser can hand a picture file to the system share sheet. */
export function canShareFiles() {
  try { return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([new Blob()], "x.png", { type: "image/png" })] }); } catch { return false; }
}

/** Opens the system share sheet with the picture. Nothing is uploaded by Nexus itself. */
export async function shareCanvas(cv: HTMLCanvasElement, name: string, title: string) {
  const blob = await canvasBlob(cv);
  try { await navigator.share({ files: [new File([blob], `${name}.png`, { type: "image/png" })], title }); }
  catch (e) { if ((e as Error).name !== "AbortError") toast(t("Teilen ist hier nicht möglich – „Als Bild speichern“ benutzen."), "error"); }
}

/** Own picture from the device or a photo from the photo museum. Returns a picture id. */
export function PictureButton({ onPick, label = t("Bild wählen"), side = 1600 }: { onPick: (imageId: string) => void; label?: string; side?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [museum, setMuseum] = useState(false);
  const [busy, setBusy] = useState(false);
  const pickFile = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    try { onPick(await addImage(f, { side })); } catch (e) { toast(t((e as Error).message), "error"); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const photos = museum ? listKind<Photo>("photo") : [];
  return (
    <>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pickFile(e.target.files?.[0])} />
      <Button size="sm" icon={<ImagePlus size={15} />} busy={busy} onClick={() => input.current?.click()}>{label}</Button>
      <Button size="sm" variant="ghost" icon={<Images size={15} />} onClick={() => setMuseum(true)}>{t("Aus dem Fotomuseum")}</Button>
      {museum && (
        <Modal title={t("Foto aus dem Fotomuseum")} onClose={() => setMuseum(false)} wide>
          {photos.length === 0 ? <Empty icon={<Images size={26} />} title={t("Noch keine Fotos im Museum")} text={t("Unter Medien → Fotomuseum Bilder importieren.")} /> : (
            <div className="studio-pick">
              {photos.map((p) => (
                <button key={p.id} type="button" className="studio-pick-item" onClick={() => { onPick(p.data.imageId); setMuseum(false); }} aria-label={p.data.title}>
                  <JImage id={p.data.thumbId || p.data.imageId} alt={p.data.title} />
                  <span className="tiny">{p.data.title}</span>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
