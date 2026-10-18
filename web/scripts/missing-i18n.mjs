// Prints German UI texts that have no English entry in src/lib/en.ts (one JSON string per line).
import { collectKeys } from "./i18n-keys.mjs";
import { readFileSync } from "node:fs";
const src = new URL("../src/", import.meta.url).pathname;
const en = readFileSync(new URL("../src/lib/en.ts", import.meta.url), "utf8");
const have = new Set([...en.matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:/gm)].map((m) => JSON.parse(m[1])));
for (const k of collectKeys(src)) if (!have.has(k)) console.log(JSON.stringify(k));
