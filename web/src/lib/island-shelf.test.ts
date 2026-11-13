import { describe, expect, it } from "vitest";
import { appBase, DEFAULT_APP_URL, shelfUrl } from "./island-shelf";

describe("island shelf link", () => {
  it("keeps only the address of the web app", () => {
    expect(appBase("https://example.org/app/index.html?x=1#/home")).toBe("https://example.org/app");
    expect(appBase("https://example.org/")).toBe("https://example.org");
    expect(appBase("ftp://example.org")).toBeNull();
    expect(appBase("https://user:pw@example.org/app")).toBeNull();
    expect(appBase("kein link")).toBeNull();
  });
  it("prefers the PC's setting, then a reachable page, then the public app", () => {
    expect(shelfUrl("https://my.site/pgl/", { href: "http://127.0.0.1:8787/", hostname: "127.0.0.1" })).toBe("https://my.site/pgl/#/files");
    expect(shelfUrl("", { href: "http://192.168.1.20:8787/index.html", hostname: "192.168.1.20" })).toBe("http://192.168.1.20:8787/#/files");
    expect(shelfUrl(undefined, { href: "http://localhost:5173/", hostname: "localhost" })).toBe(`${DEFAULT_APP_URL}/#/files`);
  });
  it("never carries a query or a secret", () => {
    const u = shelfUrl("https://a.b/c?token=abc", { href: "http://localhost/", hostname: "localhost" });
    expect(u).not.toContain("token");
    expect(u).toBe("https://a.b/c/#/files");
  });
});
