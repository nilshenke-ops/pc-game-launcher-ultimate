#!/usr/bin/env node
// Packs a plugin folder into "<id>-<version>.pglplugin" (ZIP) after checking the basics of plugin.json.
// The launcher checks everything again on install (see plugins/sdk/README.md for all rules).
// Usage: node plugins/sdk/pack.mjs <plugin-folder> [output-folder]
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const ALLOWED = [".json", ".html", ".js", ".css", ".png", ".svg", ".jpg", ".jpeg", ".webp", ".txt", ".md"];
const PERMISSIONS = ["library.read", "library.launch", "history.read", "monitor.read", "sounds.read", "sounds.play", "profiles.read", "profiles.activate", "audio.output", "diagnostics.run", "notify", "network"];
const CATEGORIES = ["launcher", "audio", "discord", "performance", "design", "automation", "device", "information", "productivity", "community"];

export function checkManifest(m, files) {
  const problems = [];
  if (!/^[a-z0-9]+(\.[a-z0-9-]+){1,5}$/.test(m.id ?? "") || m.id.length > 64) problems.push("id: Format z. B. „de.meinname.mein-plugin“");
  if (!/^\d+\.\d+\.\d+$/.test(m.version ?? "")) problems.push("version: MAJOR.MINOR.PATCH");
  if (m.apiVersion !== 1) problems.push("apiVersion: 1");
  if (!/^\d+\.\d+\.\d+$/.test(m.minAppVersion ?? "")) problems.push("minAppVersion: MAJOR.MINOR.PATCH");
  if (!m.name || m.name.length > 60) problems.push("name: 1–60 Zeichen");
  if (!m.author) problems.push("author fehlt");
  if (!CATEGORIES.includes(m.category)) problems.push(`category: eine von ${CATEGORIES.join(", ")}`);
  if (!Array.isArray(m.platforms) || !m.platforms.length || m.platforms.some((p) => !["web", "windows"].includes(p))) problems.push("platforms: web und/oder windows");
  for (const p of m.permissions ?? []) if (!PERMISSIONS.includes(p)) problems.push(`Unbekannte Berechtigung ${p}`);
  for (const w of m.contributes?.widgets ?? []) if (!files.includes(w.entry)) problems.push(`Widget ${w.id}: ${w.entry} fehlt`);
  return problems;
}

/** Minimal ZIP writer (deflate), deterministic: fixed timestamps, sorted entries. */
export function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(0, 10); head.writeUInt16LE(0x5a21, 12); // 2025-01-01
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(comp.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
    locals.push(head, nameBuf, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x5a21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
    centrals.push(c, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

export function pack(dir, outDir) {
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  const files = walk(dir).map((f) => relative(dir, f).split(sep).join("/")).filter((f) => !f.startsWith(".")).sort();
  for (const f of files) if (!ALLOWED.some((e) => f.toLowerCase().endsWith(e))) throw new Error(`${f}: Dateityp nicht erlaubt`);
  const manifest = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8"));
  const problems = checkManifest(manifest, files);
  if (problems.length) throw new Error("plugin.json: " + problems.join("; "));
  const data = zip(files.map((name) => ({ name, data: readFileSync(join(dir, name)) })));
  if (data.length > 2 * 1024 * 1024) throw new Error("Paket größer als 2 MB");
  mkdirSync(outDir, { recursive: true });
  const fileName = `${manifest.id}-${manifest.version}.pglplugin`;
  writeFileSync(join(outDir, fileName), data);
  return { manifest, fileName, size: data.length, sha256: createHash("sha256").update(data).digest("hex") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, out = "."] = process.argv.slice(2);
  if (!dir) { console.error("Aufruf: node plugins/sdk/pack.mjs <plugin-ordner> [ausgabe-ordner]"); process.exit(1); }
  try { const r = pack(dir, out); console.log(`${r.fileName}: ${r.size} Bytes, SHA-256 ${r.sha256}`); }
  catch (e) { console.error("Fehler: " + e.message); process.exit(1); }
}
