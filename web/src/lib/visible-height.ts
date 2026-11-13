// Die sichtbare Höhe (ohne Bildschirmtastatur) als CSS-Variable --vvh. Auf dem iPhone schrumpft die Seite nicht, wenn die
// Tastatur aufgeht – Dialoge richten ihre Höhe deshalb nach dieser Variable, damit Titel, Eingabefeld und Knöpfe sichtbar bleiben.

/** Bildschirmtastatur offen: der sichtbare Bereich ist deutlich kleiner als das Fenster (mehr als 120 px weniger). */
export function keyboardOpen(vvHeight: number | null, inner: number): boolean {
  return vvHeight != null && inner - vvHeight > 120;
}

/** Ergebnis in px, oder null wenn der Browser keine sichtbare Höhe meldet. */
export function visibleHeight(vv: { height: number } | null | undefined, inner: number): number | null {
  if (!vv || !(vv.height > 0)) return null;
  return Math.max(120, Math.min(Math.round(vv.height), inner));
}

const FORM_FIELD = "input, textarea, select, [contenteditable=\"\"], [contenteditable=\"true\"]";

function isFormField(el: EventTarget | null): el is HTMLElement {
  return el instanceof HTMLElement && el.matches(FORM_FIELD);
}

/** Nur echte Touch-Geräte (iPad/Handy) – ein Laptop mit Touchscreen soll kein Tastatur-Layout bekommen. */
function touchDevice(): boolean {
  return window.matchMedia?.("(hover: none) and (pointer: coarse)").matches === true;
}

/** iOS/iPad: keep the focused field visible above the on-screen keyboard. */
function scrollFocusedIntoView() {
  const el = document.activeElement;
  if (!isFormField(el)) return;
  try {
    // Center on touch/keyboard so the field isn't hidden behind the on-screen keyboard
    // (iOS visual-viewport offsets can make "nearest" think it's already visible).
    const block = document.documentElement.dataset.kb ? "center" : "nearest";
    el.scrollIntoView({ block, inline: "nearest", behavior: "smooth" });
  } catch { /* old browsers */ }
}

export function trackVisibleHeight(): void {
  if (typeof window === "undefined") return;
  const vv = window.visualViewport;
  // Größte bisher gesehene Höhe: iPad verkleinert beim Öffnen der Tastatur teils auch window.innerHeight, dann fällt der
  // Vergleich mit innerHeight aus. Der Abstand zur größten Höhe erkennt die Tastatur trotzdem.
  let baseline = visibleHeight(vv, window.innerHeight) ?? window.innerHeight;
  let forced = false; // Tastatur nach Antippen eines Feldes angenommen (iPad meldet sie nicht immer über die Höhe)
  let kb = false;

  const paint = (open: boolean) => {
    if (open === kb) return;
    kb = open;
    if (open) document.documentElement.dataset.kb = "1"; else delete document.documentElement.dataset.kb;
    // Das Layout ändert sich: Feld nach dem Setzen der Tastatur erneut in den Blick holen.
    setTimeout(scrollFocusedIntoView, 50);
    setTimeout(scrollFocusedIntoView, 350);
  };

  const update = () => {
    const h = visibleHeight(vv, window.innerHeight);
    if (h == null) document.documentElement.style.removeProperty("--vvh");
    else document.documentElement.style.setProperty("--vvh", `${h}px`);
    if (h != null && h > baseline) baseline = h;
    const measured = h != null && (baseline - h > 120 || keyboardOpen(h, window.innerHeight));
    paint(forced || measured);
  };

  update();
  vv?.addEventListener("resize", update);
  // Nur --vvh nachführen (iOS verschiebt den sichtbaren Bereich beim Scrollen) – kein Auto-Scroll, das gegen den Nutzer kämpft.
  vv?.addEventListener("scroll", () => {
    const h = visibleHeight(vv, window.innerHeight);
    if (h != null) document.documentElement.style.setProperty("--vvh", `${h}px`);
  });
  window.addEventListener("orientationchange", () => { baseline = window.innerHeight; update(); });

  // Beim Antippen eines Feldes sofort ins Tastatur-Layout wechseln und das Feld sichtbar halten.
  document.addEventListener("focusin", (e) => {
    if (!isFormField(e.target)) return;
    if (touchDevice()) { forced = true; update(); }
    setTimeout(scrollFocusedIntoView, 50);
    setTimeout(scrollFocusedIntoView, 350);
  });
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      if (isFormField(document.activeElement)) return;
      forced = false;
      update();
    }, 150);
  });
}
