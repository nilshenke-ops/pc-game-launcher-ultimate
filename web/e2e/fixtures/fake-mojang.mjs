// Stand-in for launchercontent.mojang.com (Minecraft patch notes feed) – answers slowly so "Abbrechen" can be tested.
import http from "node:http";
const port = Number(process.argv[2]);
const feed = { version: 1, entries: [
  { title: "Minecraft 26.4 Snapshot 6", version: "26.4-snapshot-6", type: "snapshot", date: "2026-10-27T13:40:29.000Z", contentPath: "javaPatchNotes/26-4-snapshot-6.json" },
  { title: "Minecraft Java Edition 26.3", version: "26.3", type: "release", date: "2026-10-20T10:00:00.000Z", contentPath: "javaPatchNotes/26-3.json" },
] };
http.createServer((req, res) => {
  const send = (body) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.url === "/healthz") return send({ ok: true });
  if (req.url.endsWith("javaPatchNotes.json")) return send(feed);
  setTimeout(() => send({ body: req.url.includes("26-3") ? "<p>26.3 is here!</p><ul><li>Added Snow Bricks</li></ul>" : "<p>Snapshot 6 adds the Cold Sulfur Cube.</p>" }), 1500);
}).listen(port, "127.0.0.1");
