// Stand-in for an OpenAI-compatible AI router (OpenRouter style): /models with prices, /chat/completions where the
// first model is "busy" so the fallback to the next model can be tested. Checks the key like a real router.
import http from "node:http";
const port = Number(process.argv[2]);
const KEY = "sk-test-router";
const models = [
  { id: "test/busy-model:free", pricing: { prompt: "0", completion: "0" }, context_length: 8192 },
  { id: "test/good-model:free", pricing: { prompt: "0", completion: "0" }, context_length: 8192 },
  { id: "test/paid-model", pricing: { prompt: "0.000001", completion: "0.000002" }, context_length: 8192 },
];
http.createServer((req, res) => {
  const send = (code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.url === "/healthz") return send(200, { ok: true });
  if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: { message: "No auth credentials found" } });
  if (req.method === "GET" && req.url === "/v1/models") return send(200, { data: models });
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      const list = body.models ?? [body.model];
      const use = list.find((m) => m !== "test/busy-model:free");
      if (!use) return send(429, { error: { message: "busy" } });
      // The companion puts a marked context line first – the user's words are the last line.
      const last = String(body.messages[body.messages.length - 1]?.content ?? "").split("\n").pop();
      send(200, { model: use, choices: [{ message: { role: "assistant", content: `Router-Antwort auf: ${last.slice(0, 60)}` } }] });
    });
    return;
  }
  send(404, { error: { message: "not found" } });
}).listen(port, "127.0.0.1");
