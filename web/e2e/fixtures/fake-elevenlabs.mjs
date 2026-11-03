// Stand-in for ElevenLabs: /v1/voices (one stock voice, one cloned, one community voice) and /v1/text-to-speech/{id}
// (a tiny MP3 frame). Checks the key header like the real service; the "kaputt" text makes it answer with an error.
import http from "node:http";
const port = Number(process.argv[2]);
const KEY = "e2e-eleven-key-0123456789";
const STOCK = "21m00Tcm4TlvDq8ikWAM";
const MP3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
http.createServer((req, res) => {
  const send = (code, body, type = "application/json") => { res.writeHead(code, { "Content-Type": type }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  if (req.url === "/healthz") return send(200, { ok: true });
  if (req.headers["xi-api-key"] !== KEY) return send(401, { detail: { status: "invalid_api_key" } });
  if (req.method === "GET" && req.url.startsWith("/v1/voices")) {
    return send(200, { voices: [
      { voice_id: STOCK, name: "Rachel", category: "premade", labels: { gender: "female", accent: "american" } },
      { voice_id: "Cl0ned1111111111", name: "Mein Klon", category: "cloned" },
      { voice_id: "Communit1111111", name: "Community", category: "professional" },
    ] });
  }
  if (req.method === "POST" && req.url.startsWith("/v1/text-to-speech/")) {
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => { try { if (String(JSON.parse(raw).text).includes("kaputt")) return send(500, { detail: "boom" }); } catch { return send(400, {}); } send(200, MP3, "audio/mpeg"); });
    return;
  }
  send(404, { detail: "not found" });
}).listen(port, "127.0.0.1");
