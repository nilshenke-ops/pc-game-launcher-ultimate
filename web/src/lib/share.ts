// QR transfer between PC and phone (3.64) on top of the existing connection to the companion. The PC creates a share (the island),
// the QR code carries "<app>/#/x/<id>.<secret>"; the phone proves the secret with an HMAC, the PC allows it (same 4-digit code on
// both), then encrypted pieces go through the normal connection – LAN, tunnel or relay. Nothing is uploaded anywhere else.
import { client } from "./rpc";
import { appBase, DEFAULT_APP_URL } from "./island-shelf";
import { isLoopbackAddress } from "./address";
import { b64, codeOf, deriveKeys, mac, open, seal, unb64, type ShareKeys } from "./share-crypto";

export const PIECE = 512 * 1024;
export type Direction = "send" | "receive";
export interface ShareView { id: string; direction: Direction; state: "open" | "waiting" | "approved" | "done" | "rejected" | "revoked" | "expired"; device?: string; code?: string; files: string[]; done: string[]; bytes: number; current?: string; expiresAt: string; by: string }
export interface ShareHistory { id: string; direction: Direction; at: string; device?: string; files: number; bytes: number; result: string; names: string[] }
export interface ShareList { active: ShareView[]; history: ShareHistory[]; historyEnabled: boolean; folder: string }

// ---------------------------------------------------------------- PC side
export interface Created { id: string; secret: string; direction: Direction; files: string[]; expiresAt: string; ttlMinutes: number }
export const createShare = (direction: Direction, files?: string[]) => client.call<Created>("share.create", { direction, files });

/**
 * Where the phone should open the page. Best is the PC's own address in the Wi-Fi (direct, no detour); otherwise the public address
 * set in the settings (tunnel) or the fixed website – then the phone reaches the PC like any paired device (relay).
 */
export function shareBase(o: { lanUrls?: string[]; lanAccess?: boolean; webAppUrl?: string | null; publicUrl?: string | null; here: { href: string; hostname: string } }): { base: string; route: "lan" | "web" } {
  const lan = o.lanAccess ? o.lanUrls?.find((u) => /^http:\/\/(\d+\.){3}\d+(:\d+)?\/?$/.test(u) && !/^http:\/\/(127\.|169\.254\.)/.test(u)) : undefined;
  if (lan) return { base: lan.replace(/\/$/, ""), route: "lan" };
  const web = appBase(o.publicUrl) ?? appBase(o.webAppUrl) ?? (!isLoopbackAddress(o.here.hostname) ? appBase(o.here.href) : null) ?? DEFAULT_APP_URL;
  return { base: web, route: "web" };
}
export const shareLink = (base: string, id: string, secret: string) => `${base}/#/x/${id}.${secret}`;

// ---------------------------------------------------------------- phone side
export interface PhoneFile { name: string; size: number; kind: string; done: boolean }
export interface Control { paused: boolean; aborted: boolean }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitWhilePaused(ctl: Control) { while (ctl.paused && !ctl.aborted) await sleep(200); if (ctl.aborted) throw Object.assign(new Error("Abgebrochen"), { code: "cancelled" }); }
// Worth another try after a pause: lost connection, timeout, or – right after reconnecting – the moment before the page has signed
// this connection back in to the share (it does that by itself with the resume token).
const transient = (e: unknown) => { const c = (e as { code?: string }).code; return !c || ["timeout", "offline", "disconnected", "rate-limited", "network", "session-expired"].includes(c) || /verbind|timeout|offline|gehört nicht zu dieser Übertragung/i.test((e as Error).message); };

export function deviceName(ua = navigator.userAgent): string {
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android-Gerät";
  return "Browser";
}

export class PhoneShare {
  readonly keys: ShareKeys;
  code: string | null = null;
  resume: string | null = null;
  constructor(readonly id: string, secret: Uint8Array) { this.keys = deriveKeys(secret, id); }

  /** Proves the secret (never sends it) and asks the PC. On a new connection after approval, carries on with the resume token. */
  async join(): Promise<{ state: string; code: string; pc?: string; direction: Direction }> {
    const h = await client.call<{ challenge: string; direction: Direction; pc?: string }>("share.hello", { id: this.id });
    const challenge = unb64(h.challenge);
    const proof = b64(mac(this.keys.auth, challenge, "join"));
    const r = await client.call<{ state: string; code: string }>("share.join", { id: this.id, proof, device: deviceName(), resume: this.resume ?? undefined });
    if (!this.resume) this.code = codeOf(this.keys.auth, challenge);
    return { state: r.state, code: this.code ?? r.code, pc: h.pc, direction: h.direction };
  }
  info() { return client.call<{ direction: Direction; files: PhoneFile[]; maxFileBytes: number; previews?: boolean }>("share.info", { id: this.id }); }

  /** Fetches one file piece by piece (each checked and decrypted); a lost piece is asked for again from the same place. */
  async download(name: string, size: number, onBytes: (n: number) => void, ctl: Control): Promise<Blob> {
    const parts: Uint8Array[] = [];
    let offset = 0, tries = 0;
    while (true) {
      await waitWhilePaused(ctl);
      try {
        const r = await client.call<{ data: string; size: number; eof: boolean }>("share.read", { id: this.id, name, offset, length: PIECE });
        const plain = open(this.keys.enc, r.data, this.id, name, offset);
        parts.push(plain); offset += plain.length; tries = 0; onBytes(plain.length);
        if (r.eof || offset >= size) break;
      } catch (e) {
        if ((e as { code?: string }).code === "cancelled" || ctl.aborted) throw e;
        if (!transient(e) || ++tries > 6) throw e;
        await sleep(Math.min(8000, 500 * 2 ** tries));
      }
    }
    await client.call("share.done", { id: this.id, name });
    return new Blob(parts as BlobPart[]);
  }

  /** Sends one file to the PC piece by piece without loading it whole; a lost answer repeats the same piece (written only once). */
  async upload(file: File, onBytes: (n: number) => void, ctl: Control): Promise<string> {
    const { uploadId, name } = await client.call<{ uploadId: string; name: string }>("share.uploadBegin", { id: this.id, name: file.name, size: file.size });
    let offset = 0, tries = 0;
    while (offset < file.size) {
      await waitWhilePaused(ctl);
      const piece = new Uint8Array(await file.slice(offset, offset + PIECE).arrayBuffer());
      try {
        const data = seal(this.keys.enc, piece, this.id, name, offset); // the name as the PC keeps it (made safe there)
        const r = await client.call<{ received: number }>("share.uploadChunk", { id: this.id, uploadId, offset, data });
        onBytes(r.received - offset); offset = r.received; tries = 0;
      } catch (e) {
        if (!transient(e) || ++tries > 6) throw e;
        await sleep(Math.min(8000, 500 * 2 ** tries));
      }
    }
    const done = await client.call<{ name: string }>("share.uploadEnd", { id: this.id, uploadId });
    return done.name;
  }
  finish() { return client.call("share.finish", { id: this.id }); }
}

/** Speed and time left from the last seconds of progress (no guess before there is enough to go on). */
export function rate(samples: { t: number; bytes: number }[], left: number): { bps: number | null; eta: number | null } {
  if (samples.length < 2) return { bps: null, eta: null };
  const a = samples[0], b = samples[samples.length - 1];
  const dt = (b.t - a.t) / 1000;
  if (dt < 1) return { bps: null, eta: null };
  const bps = (b.bytes - a.bytes) / dt;
  return { bps, eta: bps > 0 ? Math.ceil(left / bps) : null };
}
