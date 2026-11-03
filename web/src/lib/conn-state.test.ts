import { describe, expect, it } from "vitest";
import { connView, isHomeNetworkHost, outdatedCompanionMessage, UNREACHABLE_AFTER } from "./conn-state";
import type { ConnStatus } from "./rpc";

const base: ConnStatus = { phase: "online", attempt: 0, everConnected: true, auth: "ok", url: "ws://192.168.1.5:8787/ws" };
const view = (p: Partial<ConnStatus>, o: { demo?: boolean; hasCredentials?: boolean } = {}) => connView({ ...base, ...p }, o);

describe("Verbindungsstatus: jeder Zustand hat seinen eigenen Text", () => {
  it("verbunden nur, wenn die Verbindung offen UND angemeldet ist", () => {
    expect(view({}).key).toBe("connected");
    expect(view({ auth: "checking" }).key).toBe("signing-in");
    expect(view({ auth: "none" }, { hasCredentials: true }).label).toBe("Anmeldung erforderlich");
    expect(view({ auth: "none" }).label).toContain("noch nicht gekoppelt");
    expect(view({ auth: "paused" }).key).toBe("paused");
  });
  it("Verbindung wird aufgebaut → verloren/Wiederverbindung mit Versuch → nach vielen Versuchen: PC nicht erreichbar", () => {
    expect(view({ phase: "connecting", everConnected: false }).key).toBe("connecting");
    const lost = view({ phase: "offline", attempt: 3 });
    expect(lost.key).toBe("reconnecting");
    expect(lost.label).toContain("Versuch 3");
    const gone = view({ phase: "offline", attempt: UNREACHABLE_AFTER });
    expect(gone.key).toBe("pc-unreachable");
    expect(gone.label).toContain("PC nicht erreichbar");
    expect(gone.label).toContain(`Versuch ${UNREACHABLE_AFTER}`);
    expect(view({ phase: "offline", everConnected: false }).key).toBe("pc-unreachable");
  });
  it("Relay ohne PC, Widerruf, fehlgeschlagene Anmeldung, kein PC, Demo", () => {
    expect(view({ relayCompanion: "offline" }).key).toBe("pc-not-at-relay");
    expect(view({ auth: "revoked", phase: "offline" }).key).toBe("not-authorized");
    expect(view({ auth: "failed" }).key).toBe("not-authorized");
    expect(view({ needsServer: true, phase: "offline", everConnected: false }).key).toBe("no-pc");
    expect(view({}, { demo: true }).key).toBe("demo");
  });
  it("Farbton passt: nur verbunden ist grün", () => {
    expect(view({}).tone).toBe("ok");
    for (const p of [{ auth: "checking" as const }, { phase: "offline" as const, attempt: 2 }, { phase: "offline" as const, attempt: 40 }]) expect(view(p).tone).not.toBe("ok");
  });
  it("Heimnetz-Adressen werden erkannt", () => {
    expect(isHomeNetworkHost("ws://192.168.1.5:8787/ws")).toBe(true);
    expect(isHomeNetworkHost("wss://pc.tail1234.ts.net/ws")).toBe(false);
  });
});

describe("Companion zu alt für diese Seite", () => {
  it("nennt die Version, die Aktion und den Weg zum Update", () => {
    const m = outdatedCompanionMessage("2.40.0", "island.get");
    expect(m).toContain("v2.40.0");
    expect(m).toContain("island.get");
    expect(m).toContain("Updates");
  });
  it("kommt auch ohne bekannte Version aus", () => {
    expect(outdatedCompanionMessage()).toContain("kennt diese Funktion noch nicht");
  });
});
