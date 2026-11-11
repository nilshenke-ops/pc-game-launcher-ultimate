// The cloud part of "PC einschalten" (cloud-account-worker/src/wake.js) against a rebuilt FRITZ!Box: it asks for HTTP digest login, checks the
// answer with Node's own MD5 (independent of the worker's implementation) and answers like the TR-064 service "Hosts".
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module of the worker
import { digestHeader, fritzCall, handleWake, md5, normalizeMac, parseTarget } from "../../../cloud-account-worker/src/wake.js";

const nodeMd5 = (s: string) => createHash("md5").update(s).digest("hex");
const T = { host: "abc123def456.myfritz.net", port: 44443, fbUser: "jarvis", fbPass: "geheim-1", mac: "AA:BB:CC:DD:EE:FF" };

/** A FRITZ!Box that knows one user and one device. Counts what it was asked to do. */
function fritzbox(o: { user?: string; pass?: string; known?: boolean; active?: boolean } = {}) {
  const user = o.user ?? "jarvis", pass = o.pass ?? "geheim-1", realm = "HTTPS Access", nonce = "F00DBABE1234";
  const seen = { calls: 0, woke: [] as string[], urls: [] as string[] };
  const fetcher = (async (url: string, init: RequestInit) => {
    seen.calls++; seen.urls.push(url);
    const h = new Headers(init.headers), auth = h.get("authorization");
    if (!auth) return new Response("", { status: 401, headers: { "WWW-Authenticate": `Digest realm="${realm}", nonce="${nonce}", algorithm=MD5, qop="auth"` } });
    const get = (n: string) => new RegExp(`${n}="?([^",]+)"?`).exec(auth)?.[1] ?? "";
    const expected = nodeMd5(`${nodeMd5(`${user}:${realm}:${pass}`)}:${nonce}:${get("nc")}:${get("cnonce")}:auth:${nodeMd5(`POST:${get("uri")}`)}`);
    if (get("username") !== user || get("response") !== expected) return new Response("", { status: 401, headers: { "WWW-Authenticate": `Digest realm="${realm}", nonce="${nonce}", qop="auth"` } });
    const body = String(init.body), mac = /<NewMACAddress>([^<]+)</.exec(body)?.[1] ?? "";
    if (o.known === false) return new Response("<s:Envelope><s:Body><s:Fault><detail><UPnPError><errorCode>714</errorCode></UPnPError></detail></s:Fault></s:Body></s:Envelope>", { status: 500 });
    if (h.get("soapaction")?.includes("X_AVM-DE_WakeOnLANByMACAddress")) { seen.woke.push(mac); return new Response("<s:Envelope><s:Body><u:X_AVM-DE_WakeOnLANByMACAddressResponse/></s:Body></s:Envelope>", { status: 200 }); }
    return new Response(`<s:Envelope><s:Body><NewIPAddress>192.168.178.40</NewIPAddress><NewActive>${o.active ? 1 : 0}</NewActive><NewHostName>Victus</NewHostName><NewInterfaceType>Ethernet</NewInterfaceType></s:Body></s:Envelope>`, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, seen };
}

/** A tiny stand-in for D1: only what the rate limit needs. */
function db() {
  const rows: number[] = [];
  const stmt = (sql: string) => ({ bind: (...a: unknown[]) => ({
    first: async () => { const since = Number(a[1]); const r = rows.filter((x) => x > since); return { n: r.length, last: r.length ? Math.max(...r) : null }; },
    run: async () => ({}), sql, a,
  }), run: async () => ({}) });
  return { prepare: stmt, batch: async (list: { sql: string; a: unknown[] }[]) => { for (const s of list) if (s.sql.startsWith("INSERT")) rows.push(Number(s.a[1])); }, rows };
}
const deps = { json: (b: unknown, s: number) => new Response(JSON.stringify(b), { status: s }), fail: (code: string, message: string, s: number) => new Response(JSON.stringify({ ok: false, code, message }), { status: s }) };

describe("PC einschalten: Cloud → FRITZ!Box", () => {
  it("MD5 und Digest stimmen mit der unabhängigen Rechnung überein", () => {
    for (const s of ["", "abc", "jarvis:HTTPS Access:geheim-1", "ä€🙂".repeat(40)]) expect(md5(s)).toBe(nodeMd5(s));
    const h = digestHeader('Digest realm="r", nonce="n1", qop="auth"', { user: "u", pass: "p", method: "POST", uri: "/x", cnonce: "c1" });
    expect(h).toContain(`response="${nodeMd5(`${nodeMd5("u:r:p")}:n1:00000001:c1:auth:${nodeMd5("POST:/x")}`)}"`);
  });
  it("sendet genau den Weckbefehl an die MyFRITZ!-Adresse – nur über HTTPS und den festen Pfad", async () => {
    const fb = fritzbox();
    const r = await fritzCall(T, "X_AVM-DE_WakeOnLANByMACAddress", { NewMACAddress: T.mac }, fb.fetcher);
    expect(r.ok).toBe(true);
    expect(fb.seen.woke).toEqual(["AA:BB:CC:DD:EE:FF"]);
    expect(new Set(fb.seen.urls)).toEqual(new Set(["https://abc123def456.myfritz.net:44443/tr064/upnp/control/hosts"]));
  });
  it("falsches Kennwort, unbekanntes Gerät und nicht erreichbare Box werden klar gemeldet – nie als Erfolg", async () => {
    expect((await fritzCall({ ...T, fbPass: "falsch" }, "X_AVM-DE_WakeOnLANByMACAddress", { NewMACAddress: T.mac }, fritzbox().fetcher)).code).toBe("fritz-auth");
    expect((await fritzCall(T, "X_AVM-DE_WakeOnLANByMACAddress", { NewMACAddress: T.mac }, fritzbox({ known: false }).fetcher)).code).toBe("fritz-unknown-device");
    const down = (async () => { throw new TypeError("connect failed"); }) as unknown as typeof fetch;
    expect((await fritzCall(T, "X_AVM-DE_WakeOnLANByMACAddress", { NewMACAddress: T.mac }, down)).code).toBe("fritz-unreachable");
  });
  it("nimmt nur MyFRITZ!-Adressen an (keine IP, kein fremder Server, kein internes Ziel)", () => {
    for (const host of ["192.168.178.1", "example.com", "evil.myfritz.net.attacker.io", "localhost", "evil.com/a.myfritz.net", ""]) expect(parseTarget({ ...T, host }).error, host).toBeTruthy();
    expect(parseTarget({ ...T, host: "https://ABC123.myfritz.net:44443/" }).host).toBe("abc123.myfritz.net");
    expect(parseTarget({ ...T, host: "a.myfritz.net/x@evil.com" }).host).toBe("a.myfritz.net");            // only the host name is ever used
    expect(parseTarget({ ...T, mac: "aa-bb-cc-dd-ee-ff" }).mac).toBe("AA:BB:CC:DD:EE:FF");
    expect(parseTarget({ ...T, mac: "nope" }).error).toBeTruthy();
    expect(parseTarget({ ...T, port: 0 }).error).toBeTruthy();
    expect(normalizeMac(" aa:bb:cc:dd:ee:0f ")).toBe("AA:BB:CC:DD:EE:0F");
  });
  it("Schutz vor mehrfachen Startbefehlen: das zweite Signal innerhalb von 20 s wird abgelehnt und erreicht die Box nicht", async () => {
    const fb = fritzbox(), env = { DB: db() };
    const one = await handleWake(env, "wake", "nils", T, {}, deps, fb.fetcher);
    expect((await one.json()).sent).toBe(true);
    const two = await handleWake(env, "wake", "nils", T, {}, deps, fb.fetcher);
    expect(two.status).toBe(429);
    expect(fb.seen.woke.length).toBe(1);
  });
  it("Status aus der FRITZ!Box: bekannt, im Netz, per Kabel", async () => {
    const r = await (await handleWake({ DB: db() }, "wakeinfo", "nils", T, {}, deps, fritzbox({ active: true }).fetcher)).json();
    expect(r).toMatchObject({ ok: true, known: true, active: true, name: "Victus", iface: "Ethernet" });
    const u = await (await handleWake({ DB: db() }, "wakeinfo", "nils", T, {}, deps, fritzbox({ known: false }).fetcher)).json();
    expect(u).toMatchObject({ ok: true, known: false });
  });
});
