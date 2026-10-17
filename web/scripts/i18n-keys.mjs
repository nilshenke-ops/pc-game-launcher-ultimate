// Lists every German UI text used with t("...") so en.ts can be checked for completeness.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Texts that are translated through a variable, e.g. t(meta.label).
export const DYNAMIC = [
  "Verbindung & PC", "Aktuelle Spielesitzung", "Gaming-Profil", "Quick Actions", "Favoriten", "Zuletzt gestartet", "PC-Auslastung", "Audio",
  "Laufende Sounds", "Benachrichtigungen", "Begleiter & Updates", "Geräte",
  "Einstellungen", "Spiele & Programme", "Gaming-Profile", "Automatisierungen", "Hotkeys", "Soundboard", "Audio-Einstellungen", "Verlauf", "Design & Layouts (PC)",
  "Aktiv", "Fehler", "Aus", "Ausstehend",
];

export function collectKeys(dir) {
  const keys = new Set();
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") && f !== "en.ts") {
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
      }
    }
  };
  walk(dir);
  for (const k of DYNAMIC) keys.add(k);
  return [...keys].sort();
}

if (process.argv[1].endsWith("i18n-keys.mjs")) {
  const keys = collectKeys(new URL("../src", import.meta.url).pathname);
  const en = readFileSync(new URL("../src/lib/en.ts", import.meta.url), "utf8");
  const missing = keys.filter((k) => !en.includes(JSON.stringify(k) + ":"));
  console.log(JSON.stringify(missing, null, 0));
  console.error(`${keys.length} keys, ${missing.length} missing`);
}
