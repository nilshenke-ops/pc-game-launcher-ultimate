// "PC einschalten": the FRITZ!Box of the account's home network sends the Wake-on-LAN packet. A phone cannot send one itself (browsers have
// no UDP) and the PC is off – but the FRITZ!Box is always on and has this built in (TR-064, service Hosts, action
// X_AVM-DE_WakeOnLANByMACAddress). This worker passes exactly that one request on, for a signed-in device of the account:
//
//   POST /api/sync/wake      { user, token, host, port, fbUser, fbPass, mac }  -> { ok, sent }
//   POST /api/sync/wakeinfo  { user, token, host, port, fbUser, fbPass, mac }  -> { ok, known, active, name, iface, ip }
//
// Security: only the two fixed SOAP actions on /tr064/upnp/control/hosts, only to a MyFRITZ address (never an IP or a private host),
// only over HTTPS with a valid certificate, only for a valid device token, and rate-limited per account. The FRITZ!Box password comes
// with the request (kept sealed on the user's devices) and is never stored or logged here.

const HOST_RX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.myfritz\.(net|link)$/;
const MAC_RX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const FB_USER_RX = /^[^\s:"<>&]{1,64}$/;
const CONTROL_PATH = "/tr064/upnp/control/hosts";
const SERVICE = "urn:dslforum-org:service:Hosts:1";
const TIMEOUT_MS = 12_000;
const MIN_GAP_MS = 20_000;            // one start signal every 20 s at most
const MAX_PER_HOUR = 20;

export const normalizeMac = (m) => String(m ?? "").trim().toUpperCase().replace(/-/g, ":");

/** Checks what the client sent. Returns { error } or the cleaned values. */
export function parseTarget(body) {
  const host = String(body?.host ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
  const port = Number(body?.port);
  const fbUser = String(body?.fbUser ?? "");
  const fbPass = String(body?.fbPass ?? "");
  const mac = normalizeMac(body?.mac);
  if (!HOST_RX.test(host)) return { error: "Die FRITZ!Box-Adresse muss deine MyFRITZ!-Adresse sein (…​.myfritz.net)." };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: "Der HTTPS-Port der FRITZ!Box fehlt (steht in der FRITZ!Box unter Internet → Freigaben → FRITZ!Box-Dienste)." };
  if (!FB_USER_RX.test(fbUser)) return { error: "FRITZ!Box-Benutzername fehlt oder ist ungültig." };
  if (fbPass.length < 1 || fbPass.length > 128) return { error: "FRITZ!Box-Kennwort fehlt." };
  if (!MAC_RX.test(mac)) return { error: "Die MAC-Adresse des PCs ist ungültig (Form: AA:BB:CC:DD:EE:FF)." };
  return { host, port, fbUser, fbPass, mac };
}

// ---- MD5 (HTTP digest authentication of the FRITZ!Box needs it; small pure implementation so it runs everywhere, also in tests)
export function md5(str) {
  const bytes = new TextEncoder().encode(str), n = bytes.length;
  const words = new Uint32Array((((n + 8) >>> 6) + 1) << 4);
  for (let i = 0; i < n; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  words[n >> 2] |= 0x80 << ((n % 4) * 8);
  words[words.length - 2] = (n * 8) >>> 0; words[words.length - 1] = Math.floor(n / 0x20000000);
  const K = new Uint32Array(64); for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let o = 0; o < words.length; o += 16) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g; const r = i >> 4;
      if (r === 0) { f = (b & c) | (~b & d); g = i; } else if (r === 1) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (r === 2) { f = b ^ c ^ d; g = (3 * i + 5) % 16; } else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const x = (a + f + K[i] + words[o + g]) >>> 0, s = S[r * 4 + (i % 4)];
      a = d; d = c; c = b; b = (b + ((x << s) | (x >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const hex = (v) => Array.from({ length: 4 }, (_, i) => ((v >>> (i * 8)) & 255).toString(16).padStart(2, "0")).join("");
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

const param = (header, name) => { const m = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^,\\s]+))`, "i").exec(header); return m ? (m[1] ?? m[2]) : ""; };

/** The Authorization header for an HTTP digest challenge (RFC 2617, MD5, qop=auth – what the FRITZ!Box asks for). */
export function digestHeader(challenge, { user, pass, method, uri, cnonce, nc = "00000001" }) {
  const realm = param(challenge, "realm"), nonce = param(challenge, "nonce"), opaque = param(challenge, "opaque");
  const qop = /\bauth\b/i.test(param(challenge, "qop")) ? "auth" : "";
  const ha1 = md5(`${user}:${realm}:${pass}`), ha2 = md5(`${method}:${uri}`);
  const response = qop ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${nonce}:${ha2}`);
  return `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"` +
    (qop ? `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"` : "") + (opaque ? `, opaque="${opaque}"` : "") + ", algorithm=MD5";
}

const envelope = (action, args) =>
  `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
  `<s:Body><u:${action} xmlns:u="${SERVICE}">${Object.entries(args).map(([k, v]) => `<${k}>${v}</${k}>`).join("")}</u:${action}></s:Body></s:Envelope>`;

const tag = (xml, name) => { const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml); return m ? m[1] : ""; };

/**
 * One TR-064 call to the FRITZ!Box over its HTTPS internet access. Returns { ok, status, xml } or { ok:false, code, message }.
 * `fetcher` is injectable for tests.
 */
export async function fritzCall(t, action, args, fetcher = fetch) {
  const url = `https://${t.host}:${t.port}${CONTROL_PATH}`;
  const body = envelope(action, args);
  const headers = { "Content-Type": 'text/xml; charset="utf-8"', SOAPAction: `"${SERVICE}#${action}"` };
  const once = (extra) => fetcher(url, { method: "POST", headers: { ...headers, ...extra }, body, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  let res;
  try {
    res = await once({});
    if (res.status === 401) {
      const challenge = res.headers.get("www-authenticate") ?? "";
      if (!/^digest/i.test(challenge)) return { ok: false, code: "fritz-auth", message: "Die FRITZ!Box hat die Anmeldung auf unerwartete Weise verlangt." };
      const cnonce = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
      res = await once({ Authorization: digestHeader(challenge, { user: t.fbUser, pass: t.fbPass, method: "POST", uri: CONTROL_PATH, cnonce }) });
    }
  } catch (e) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    return { ok: false, code: "fritz-unreachable", message: timeout
      ? "Die FRITZ!Box hat nicht geantwortet. Stimmen MyFRITZ!-Adresse und Port, und ist „Internetzugriff auf die FRITZ!Box über HTTPS“ eingeschaltet?"
      : "Die FRITZ!Box ist über das Internet nicht erreichbar (Adresse/Port prüfen; in der FRITZ!Box muss das Zertifikat von letsencrypt.org eingeschaltet sein)." };
  }
  const xml = await res.text().catch(() => "");
  if (res.status === 401) return { ok: false, code: "fritz-auth", message: "FRITZ!Box-Benutzer oder Kennwort falsch – oder der Benutzer darf nicht aus dem Internet zugreifen bzw. hat nicht das Recht „FRITZ!Box Einstellungen“." };
  if (res.status === 200) return { ok: true, status: 200, xml };
  const upnp = tag(xml, "errorCode");
  if (upnp === "714") return { ok: false, code: "fritz-unknown-device", message: "Die FRITZ!Box kennt kein Gerät mit dieser MAC-Adresse. Der PC muss einmal per LAN-Kabel an der FRITZ!Box gewesen sein." };
  if (res.status === 404) return { ok: false, code: "fritz-no-tr064", message: "Die FRITZ!Box hat die Schnittstelle nicht gefunden. In der FRITZ!Box unter Heimnetz → Netzwerk → Netzwerkeinstellungen „Zugriff für Anwendungen zulassen“ einschalten." };
  return { ok: false, code: "fritz-error", message: `Die FRITZ!Box hat den Befehl abgelehnt (${res.status}${upnp ? `, Fehler ${upnp}` : ""}).` };
}

let wakeSchemaReady = null;
function ensureWakeSchema(env) {
  wakeSchemaReady ??= env.DB.prepare("CREATE TABLE IF NOT EXISTS wake_log (user TEXT NOT NULL, at INTEGER NOT NULL)").run().catch((e) => { wakeSchemaReady = null; throw e; });
  return wakeSchemaReady;
}

/** Called from sync.js after the device token was accepted. */
export async function handleWake(env, action, user, body, cors, { json, fail }, fetcher = fetch) {
  const t = parseTarget(body);
  if (t.error) return fail("invalid-params", t.error, 400, cors);

  if (action === "wakeinfo") {
    // What the FRITZ!Box knows about the PC: is it in the home network right now, and over cable or WLAN?
    const r = await fritzCall(t, "GetSpecificHostEntry", { NewMACAddress: t.mac }, fetcher);
    if (!r.ok) return r.code === "fritz-unknown-device" ? json({ ok: true, known: false }, 200, cors) : fail(r.code, r.message, 502, cors);
    return json({ ok: true, known: true, active: tag(r.xml, "NewActive") === "1", name: tag(r.xml, "NewHostName"), iface: tag(r.xml, "NewInterfaceType"), ip: tag(r.xml, "NewIPAddress") }, 200, cors);
  }

  // Protection against repeated and accidental start signals.
  await ensureWakeSchema(env);
  const now = Date.now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n, MAX(at) AS last FROM wake_log WHERE user = ?1 AND at > ?2").bind(user, now - 3_600_000).first();
  if (recent?.last && now - Number(recent.last) < MIN_GAP_MS) return fail("too-soon", "Das Startsignal wurde gerade erst gesendet – bitte kurz warten.", 429, cors);
  if ((recent?.n ?? 0) >= MAX_PER_HOUR) return fail("rate-limited", "Zu viele Startsignale in der letzten Stunde.", 429, cors);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO wake_log (user, at) VALUES (?1, ?2)").bind(user, now),
    env.DB.prepare("DELETE FROM wake_log WHERE at < ?1").bind(now - 86_400_000),
  ]);

  const r = await fritzCall(t, "X_AVM-DE_WakeOnLANByMACAddress", { NewMACAddress: t.mac }, fetcher);
  if (!r.ok) return fail(r.code, r.message, 502, cors);
  // "sent" means: the FRITZ!Box accepted the order and sent the wake packet. Whether the PC starts is not known here.
  return json({ ok: true, sent: true, at: new Date(now).toISOString() }, 200, cors);
}
