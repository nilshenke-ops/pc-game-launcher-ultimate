import { describe, expect, it } from "vitest";
import { effective } from "./activity";

describe("activity status", () => {
  it("falls back to available when a timed status ran out or nothing was shared", () => {
    const now = Date.parse("2026-10-20T19:00:00Z");
    const busy = { shared: true, status: "busy" as const, text: "Raid", until: "2026-10-20T19:30:00Z" };
    expect(effective(busy, now)).toMatchObject({ status: "busy", text: "Raid" });
    expect(effective(busy, now + 31 * 60000)).toMatchObject({ status: "available", text: null });
    expect(effective({ shared: false }, now).status).toBe("available");
    expect(effective({ shared: true, status: "dnd" }, now).status).toBe("dnd");
  });
});
