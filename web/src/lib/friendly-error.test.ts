import { describe, expect, it } from "vitest";
import { friendlyError } from "./friendly-error";

const err = (code: string, message: string) => Object.assign(new Error(message), { code });

describe("Verständliche Fehler", () => {
  it("die Meldung des PCs bleibt, wenn sie schon genau ist", () => {
    expect(friendlyError(err("assistant-key", "Der KI-Router lehnt den Schlüssel ab. Bitte neu eintragen."))).toBe("Der KI-Router lehnt den Schlüssel ab. Bitte neu eintragen.");
    expect(friendlyError(err("assistant-limit", "OpenRouter: Tageslimit erreicht."))).toContain("Tageslimit");
  });
  it("nackte Codes bekommen einen Satz und einen nächsten Schritt", () => {
    expect(friendlyError(err("forbidden", "forbidden"))).toMatch(/Berechtigung.*Verwalten/);
    expect(friendlyError(err("session-expired", "session-expired"))).toMatch(/selbst neu an/);
    expect(friendlyError(err("timeout", "timeout"))).toMatch(/Diagnose/);
    expect(friendlyError(err("unknown-method", "unknown-method"))).toMatch(/Updates/);
    expect(friendlyError(err("offline", "Verbindung unterbrochen"))).toMatch(/Ist er an/);
  });
  it("technisches Rauschen wird erklärt statt gezeigt", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/schiefgelaufen/);
    expect(friendlyError("kaputt")).toMatch(/schiefgelaufen/);
    expect(friendlyError(undefined)).toMatch(/schiefgelaufen/);
    expect(friendlyError(new Error("HTTP 500"))).toContain("HTTP 500");
  });
  it("ein genauer Text zu „forbidden“ bleibt, nur das nackte „forbidden“ wird erklärt", () => {
    expect(friendlyError(err("forbidden", "Einen Schlüssel kannst du nur über eine verschlüsselte Verbindung eintragen."))).toMatch(/verschlüsselte Verbindung/);
  });
});
