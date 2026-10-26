import { describe, expect, it } from "vitest";
import { handoffLink, hostIsIp } from "../components/keep-access";

describe("keep access", () => {
  it("knows which addresses can change", () => {
    expect(hostIsIp("192.168.178.116:8787")).toBe(true);
    expect(hostIsIp("[fe80::1]:8787")).toBe(true);
    expect(hostIsIp("gaming-pc.fritz.box:8787")).toBe(false);
    expect(hostIsIp("gaming-pc.tail1234.ts.net")).toBe(false);
  });
  it("builds the transfer link as a query parameter (kept by the home screen), not inside the route", () => {
    expect(handoffLink("http://gaming-pc.fritz.box:8787/", "abc_DEF-123")).toBe("http://gaming-pc.fritz.box:8787/?handoff=abc_DEF-123#/");
  });
});
