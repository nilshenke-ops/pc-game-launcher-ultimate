import { beforeEach, describe, expect, it } from "vitest";
import { CHAT_KEY, emptyChat, formatCost, readChat } from "./assistant";

describe("assistant helpers", () => {
  beforeEach(() => { const m = new Map<string, string>(); globalThis.sessionStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage; });
  it("formats cost honestly", () => {
    expect(formatCost(0)).toBe("0 $");
    expect(formatCost(0.004)).toBe("< 0,01 $");
    expect(formatCost(1.234)).toBe("1,23 $");
  });
  it("reads a stored chat and survives garbage", () => {
    expect(readChat()).toEqual(emptyChat());
    sessionStorage.setItem(CHAT_KEY, "{kaputt");
    expect(readChat()).toEqual(emptyChat());
    sessionStorage.setItem(CHAT_KEY, JSON.stringify({ conversationId: "conv_1", turns: Array.from({ length: 80 }, (_, i) => ({ role: "user", text: String(i) })) }));
    const c = readChat();
    expect(c.conversationId).toBe("conv_1");
    expect(c.turns).toHaveLength(60);
    expect(c.turns[0].text).toBe("20");
  });
});
