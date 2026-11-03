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

export function trackVisibleHeight(): void {
  if (typeof window === "undefined") return;
  const vv = window.visualViewport;
  const apply = () => {
    const h = visibleHeight(vv, window.innerHeight);
    if (h == null) document.documentElement.style.removeProperty("--vvh");
    else document.documentElement.style.setProperty("--vvh", `${h}px`);
    // With the keyboard open, dialogs move to the top (the bottom of the page lies behind the keyboard).
    if (keyboardOpen(h, window.innerHeight)) document.documentElement.dataset.kb = "1"; else delete document.documentElement.dataset.kb;
  };
  apply();
  vv?.addEventListener("resize", apply);
  vv?.addEventListener("scroll", apply);
  window.addEventListener("orientationchange", apply);
}
