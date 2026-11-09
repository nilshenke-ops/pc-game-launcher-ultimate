// Sealing of the data that goes through the cloud: "g1." + base64(iv ‖ ciphertext ‖ tag) of gzip(JSON), AES-GCM with the account's own key.
// The companion (CloudSyncService.cs) uses exactly this format; "g0." is the same without gzip (a browser that cannot compress).

// ------------------------------------------------------------------ sealing (the same format as the companion: "g1." + base64(iv ‖ ciphertext ‖ tag) of gzip(JSON))

const b64 = (u: Uint8Array) => { let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const aesKey = (enc: string) => crypto.subtle.importKey("raw", unb64(enc) as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
const hasGzip = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const w = stream.writable.getWriter();
  void w.write(data as BufferSource).then(() => w.close()).catch(() => { /* the reader below reports it */ });
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export async function sealBlob(enc: string, json: string): Promise<string> {
  const raw = new TextEncoder().encode(json);
  const gz = hasGzip();
  const plain = gz ? await pipe(raw, new CompressionStream("gzip")) : raw;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, await aesKey(enc), plain as BufferSource));   // ciphertext ‖ tag
  const all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12);
  return (gz ? "g1." : "g0.") + b64(all);
}

export async function openBlob(enc: string, blob: string): Promise<string> {
  const kind = blob.slice(0, 3);
  if (kind !== "g1." && kind !== "g0.") throw new Error("format");
  const all = unb64(blob.slice(3));
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) as BufferSource }, await aesKey(enc), all.slice(12) as BufferSource));
  if (kind === "g0.") return new TextDecoder().decode(plain);
  if (!hasGzip()) throw new Error("gzip");
  return new TextDecoder().decode(await pipe(plain, new DecompressionStream("gzip")));
}

