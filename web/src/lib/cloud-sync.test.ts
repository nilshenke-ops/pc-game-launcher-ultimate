import { describe, expect, it } from "vitest";
import { createCipheriv, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { openBlob, sealBlob } from "./cloud-seal";

const KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString("base64");

describe("Cloud-Synchronisierung (Browser-Seite)", () => {
  it("versiegelt und öffnet Daten mit dem Konto-Schlüssel – ein falscher Schlüssel öffnet nichts", async () => {
    const json = JSON.stringify({ items: [{ name: "Hollow Knight", favorite: true }], text: "Ünïcödé ✓" });
    const blob = await sealBlob(KEY, json);
    expect(blob).toMatch(/^g[01]\./);
    expect(blob).not.toContain("Hollow");
    expect(await openBlob(KEY, blob)).toBe(json);
    await expect(openBlob(Buffer.alloc(32, 9).toString("base64"), blob)).rejects.toThrow();
    await expect(openBlob(KEY, "x1.abcd")).rejects.toThrow();
  });
  it("öffnet, was der Begleiter versiegelt (gzip + AES-GCM, Iv und Tag im selben Aufbau)", async () => {
    const key = Buffer.from(KEY, "base64"), iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([c.update(gzipSync(Buffer.from('{"a":1}'))), c.final()]);
    const blob = "g1." + Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64");
    expect(await openBlob(KEY, blob)).toBe('{"a":1}');
  });
});
