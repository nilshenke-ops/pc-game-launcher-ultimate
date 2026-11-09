import { describe, expect, it } from "vitest";
import { ACCOUNT_KEYS, buildAccountBackup, DEVICE_KEY_STORES } from "./account-backup";
import { defaultPrefs } from "./prefs-core";

describe("account backup", () => {
  it("keeps AI keys out of the file, even when the caller passes them", () => {
    const local = {
      "pgl.memory": { folder: "JARVIS-MEMORY" },
      "pgl.aiChoice": { strategy: "fallback", order: ["groq"] },
      "pgl.localai": { groq: { v: 1, ct: "secret" } },
      "pgl.localai.session": { groq: "secret" },
      "pgl.localsearch.session": { tavily: "secret" },
      "pgl.localeleven.session": "secret",
      "pgl.somethingElse": "not account data",
    };
    const b = buildAccountBackup("nils", defaultPrefs(), local, { exportedAt: "2026-11-09T00:00:00.000Z", savedAt: 123 });

    expect(b).toMatchObject({ format: "nexus-account-backup", version: 1, user: "nils", exportedAt: "2026-11-09T00:00:00.000Z", savedAt: 123 });
    expect(Object.keys(b.local).sort()).toEqual(["pgl.aiChoice", "pgl.memory"]);
    const json = JSON.stringify(b);
    expect(json).not.toContain("pgl.localai");
    expect(json).not.toContain("secret");
    expect(json).not.toContain("somethingElse");
  });

  it("never lists a device key store among the account data", () => {
    expect(ACCOUNT_KEYS.filter((k) => (DEVICE_KEY_STORES as readonly string[]).includes(k))).toEqual([]);
  });
});
