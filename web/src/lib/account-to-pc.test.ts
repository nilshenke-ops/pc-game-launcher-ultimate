import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), _m: m }; };
const local = mem(), session = mem();
vi.stubGlobal("window", { localStorage: local, sessionStorage: session });

const queued: { method: string; params: Record<string, unknown> }[] = [];
let acct: { user: string; cloud: boolean } | null = { user: "nils", cloud: true };
let bundle: { providers: Record<string, { key: string; attested: boolean }> } | null = null;
let memory = { path: "", enabled: true, writeEnabled: true, deleteEnabled: false, auto: "suggest" };
vi.mock("./cloud-sync", () => ({ queueCloudOp: (method: string, params: Record<string, unknown>) => { queued.push({ method, params }); } }));
vi.mock("./design-account", () => ({ session: () => acct }));
vi.mock("./free-ai-local", () => ({ exportKeyBundle: () => bundle }));
vi.mock("./memory-config", () => ({ memorySettings: () => memory }));

import { sendAccountToPc } from "./account-to-pc";

beforeEach(() => { local._m.clear(); queued.length = 0; acct = { user: "nils", cloud: true }; bundle = null; memory = { path: "", enabled: true, writeEnabled: true, deleteEnabled: false, auto: "suggest" }; });

describe("Einmal pro Konto einstellen – der PC bekommt es über das Konto", () => {
  it("Gedächtnis-Ordner und Regeln gehen einmal als versiegelte Änderung an den PC, nicht bei jedem Aufruf", () => {
    memory = { ...memory, path: "C:\\Notizen\\JARVIS" };
    expect(sendAccountToPc()).toBe(1);
    expect(queued[0]).toEqual({ method: "memory.configure", params: { path: "C:\\Notizen\\JARVIS", enabled: true, writeEnabled: true, deleteEnabled: false, auto: "suggest" } });
    expect(sendAccountToPc()).toBe(0);                                  // nothing changed
    memory = { ...memory, auto: "auto" };
    expect(sendAccountToPc()).toBe(1);                                  // a rule changed
    expect(sendAccountToPc(true)).toBe(1);                              // a new PC: everything again
  });
  it("KI-Schlüssel gehen an den PC, wenn sie neu oder geändert sind – der Schlüssel steht nicht im Merkzettel", () => {
    bundle = { providers: { groq: { key: "gsk_" + "a".repeat(30), attested: true }, openrouter: { key: "sk-or-" + "b".repeat(30), attested: true } } };
    expect(sendAccountToPc()).toBe(2);
    expect(queued.find((q) => q.params.provider === "groq")?.params).toMatchObject({ provider: "groq", attested: true });
    expect(queued.find((q) => q.params.provider === "openrouter")?.params).not.toHaveProperty("attested");
    expect(local._m.get("pgl.toPc.sent")).not.toContain("gsk_");
    expect(sendAccountToPc()).toBe(0);
    bundle = { providers: { groq: { key: "gsk_" + "c".repeat(30), attested: true }, openrouter: bundle.providers.openrouter } };
    expect(sendAccountToPc()).toBe(1);
  });
  it("ohne Cloud-Konto oder ohne Einstellungen wird nichts gesendet; jedes Konto hat seinen eigenen Merkzettel", () => {
    memory = { ...memory, path: "C:\\X\\Y" };
    acct = null; expect(sendAccountToPc()).toBe(0);
    acct = { user: "nils", cloud: false }; expect(sendAccountToPc()).toBe(0);
    acct = { user: "nils", cloud: true }; expect(sendAccountToPc()).toBe(1);
    acct = { user: "anna", cloud: true }; expect(sendAccountToPc()).toBe(1);   // another account: its own state
  });
});
