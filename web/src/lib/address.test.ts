import { describe, expect, it } from "vitest";
import { directPairUrl, isLoopbackAddress, pcAddressToWs, wsToPcAddress } from "./address";

describe("PC-Adresse aus QR-Code oder Eingabe", () => {
  it("WLAN-Adresse: immer http und Standardport, auch von der https-Website aus", () => {
    expect(pcAddressToWs("192.168.1.5", true)).toBe("ws://192.168.1.5:8787/ws");
    expect(pcAddressToWs("gaming-pc.fritz.box", true)).toBe("ws://gaming-pc.fritz.box:8787/ws");
    expect(pcAddressToWs("10.0.0.7:9000", true)).toBe("ws://10.0.0.7:9000/ws");
  });
  it("Tailscale-Name ohne Schema ist https/wss, mit Schema bleibt es wie getippt", () => {
    expect(pcAddressToWs("gaming-pc.tail1234.ts.net", true)).toBe("wss://gaming-pc.tail1234.ts.net/ws");
    expect(pcAddressToWs("https://gaming-pc.tail1234.ts.net", false)).toBe("wss://gaming-pc.tail1234.ts.net/ws");
    expect(pcAddressToWs("http://100.101.102.103:8787", true)).toBe("ws://100.101.102.103:8787/ws");
  });
  it("Relay-Adresse mit Pfad und Parametern bleibt erhalten", () => {
    expect(pcAddressToWs("wss://relay.example.org/r/abc?x=1", true)).toBe("wss://relay.example.org/r/abc/ws?x=1");
  });
  it("Hin und zurück: aus der Adresse wird die Kurzform für den QR-Parameter „pc“ und wieder dieselbe Adresse", () => {
    for (const a of ["192.168.1.5", "gaming-pc.tail1234.ts.net", "https://relay.example.org/r/abc"]) {
      const ws = pcAddressToWs(a, true)!;
      const short = wsToPcAddress(ws);
      // The short form of a plain-http address carries its port, so it round-trips too.
      expect(pcAddressToWs(/^[a-z]+:\/\//.test(a) || short.includes("ts.net") ? (ws.startsWith("wss") ? "https://" : "http://") + short : short, true)).toBe(ws);
    }
  });
  it("Adresswechsel des PCs: ein neuer QR-Code mit neuer Adresse ersetzt die alte", () => {
    const before = pcAddressToWs("192.168.1.5", true);
    const after = pcAddressToWs("192.168.1.77", true);
    expect(before).not.toBe(after);
    expect(after).toBe("ws://192.168.1.77:8787/ws");
  });
  it("Ungültiges oder leeres wird abgelehnt, 127.0.0.1 gilt als „dieses Gerät“", () => {
    expect(pcAddressToWs("", true)).toBeNull();
    expect(pcAddressToWs("ftp://x", true)).toBeNull();
    expect(isLoopbackAddress("ws://127.0.0.1:8787/ws")).toBe(true);
    expect(isLoopbackAddress("localhost")).toBe(true);
    expect(isLoopbackAddress("ws://192.168.1.5:8787/ws")).toBe(false);
  });
});

describe("Direkter Kopplungslink (QR → PC-Seite)", () => {
  it("WLAN-Adresse bekommt einen http-Link mit eingetragenem Code (nur erlaubte Zeichen, höchstens 9)", () => {
    expect(directPairUrl("192.168.1.5", "abcd-2345")).toBe("http://192.168.1.5:8787/#/pair?code=ABCD-2345");
    expect(directPairUrl("192.168.1.5", "ab<cd>-23456789")).toBe("http://192.168.1.5:8787/#/pair?code=ABCD-2345");
    expect(directPairUrl("192.168.1.5", "")).toBe("http://192.168.1.5:8787/#/pair");
  });
  it("Tailscale (https) braucht keinen Umweg: kein direkter http-Link", () => {
    expect(directPairUrl("gaming-pc.tail1234.ts.net", "ABCD-2345")).toBeNull();
    expect(directPairUrl("https://gaming-pc.tail1234.ts.net", "ABCD-2345")).toBeNull();
  });
});
