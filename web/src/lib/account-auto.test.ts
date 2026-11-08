import { describe, expect, it, vi } from "vitest";

describe("startAccountAutoApply", () => {
  it("hängt sich an Anmeldung, online und Kontowechsel und räumt wieder auf", async () => {
    const handlers: string[] = [];
    const remove = vi.fn();
    const off = vi.fn();
    vi.stubGlobal("window", { addEventListener: (e: string) => handlers.push(e), removeEventListener: remove, dispatchEvent: vi.fn() });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.resetModules();
    const { client } = await import("./rpc");
    const on = vi.spyOn(client, "on").mockReturnValue(off);
    const { startAccountAutoApply } = await import("./account-auto");
    const cleanup = startAccountAutoApply();
    expect(handlers).toEqual(["online", "pgl-account"]);
    expect(on).toHaveBeenCalledWith("authenticated", expect.any(Function));
    cleanup();
    expect(off).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("online", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("pgl-account", expect.any(Function));
    on.mockRestore();
    vi.unstubAllGlobals();
  });
});
