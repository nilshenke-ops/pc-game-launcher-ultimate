// Opens a setting found by the settings search and highlights it on its page (3.62). The page is found by route; the setting
// by its visible text (switch, field, card title or page title). The lookup waits up to 6 s for the page (lazy pages load
// their code first) and gives up quietly – the page is open either way.
import { t } from "./i18n";
import { setSettingsLevel, type SettingEntry } from "./settings-index";

const SELECTOR = "main .switch .text, main .field > label, main .card-head h2, main h1, main .set-hub-title";

function findLabel(text: string): HTMLElement | null {
  const want = text.trim().toLowerCase();
  for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
    const own = (el.firstChild?.textContent ?? "").trim().toLowerCase();
    const all = (el.textContent ?? "").trim().toLowerCase();
    if (own.startsWith(want) || all.startsWith(want)) return el;
  }
  return null;
}

let timer: number | undefined;
export function flashSetting(label: string) {
  window.clearTimeout(timer);
  const text = t(label);
  const start = performance.now();
  const tryNow = () => {
    const el = findLabel(text);
    if (!el) { if (performance.now() - start < 6000) timer = window.setTimeout(tryNow, 120); return; }
    const box = el.closest<HTMLElement>(".switch, .field, .card, .set-hub-item") ?? el;
    const calm = document.documentElement.dataset.motion === "reduce";
    box.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    box.classList.remove("set-flash");
    void box.offsetWidth; // restart the highlight if the same setting is picked twice
    box.classList.add("set-flash");
    window.setTimeout(() => box.classList.remove("set-flash"), 2600);
  };
  timer = window.setTimeout(tryNow, 60);
}

/** Navigate to a search hit; an "advanced" setting turns the advanced view on so it is visible. */
export function goToSetting(entry: SettingEntry, navigate: (to: string) => void) {
  if (entry.level === "advanced") setSettingsLevel("advanced");
  navigate(entry.to);
  flashSetting(entry.label);
}
