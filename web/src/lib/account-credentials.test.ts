import { beforeEach, describe, expect, it } from "vitest";
import { hasAccessCode, passwordState, rememberPassword, revealPassword, setCode } from "./account-secret";

// node has no localStorage: a tiny stand-in
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;

describe("password display and secret code", () => {
  beforeEach(() => mem.clear());

  it("an older sign-in does not know the password; once remembered it can be shown", async () => {
    expect(passwordState("nilsson")).toBe("unknown");
    await expect(revealPassword("nilsson")).rejects.toThrow();
    rememberPassword("nilsson", "geheim-123");
    expect(passwordState("nilsson")).toBe("visible");
    expect(await revealPassword("nilsson")).toBe("geheim-123");
  });

  it("starts without a code; a code locks the view, a wrong code does not open it, removing it makes it visible again", async () => {
    rememberPassword("nilsson", "geheim-123");
    expect(hasAccessCode("nilsson")).toBe(false);
    await setCode("nilsson", "1234");
    expect(hasAccessCode("nilsson")).toBe(true);
    expect(passwordState("nilsson")).toBe("locked");
    expect(mem.get("pgl.accountSecret")).not.toContain("geheim-123");        // sealed, not readable on the device
    await expect(revealPassword("nilsson")).rejects.toThrow();
    await expect(revealPassword("nilsson", "9999")).rejects.toThrow();
    expect(await revealPassword("nilsson", "1234")).toBe("geheim-123");
    rememberPassword("nilsson", "anderes-pw");                               // a later sign-in does not overwrite a protected password
    expect(await revealPassword("nilsson", "1234")).toBe("geheim-123");
    await expect(setCode("nilsson", null, "0000")).rejects.toThrow();        // removing needs the old code
    await setCode("nilsson", null, "1234");
    expect(hasAccessCode("nilsson")).toBe(false);
    expect(await revealPassword("nilsson")).toBe("geheim-123");
  });

  it("a code that is too short is refused", async () => {
    rememberPassword("nilsson", "geheim-123");
    await expect(setCode("nilsson", "12")).rejects.toThrow();
  });

  it("without a stored password no code can be set", async () => {
    await expect(setCode("nilsson", "1234")).rejects.toThrow();
  });
});
