// Stand-in for OBS Studio's WebSocket server (obs-websocket protocol 5) for the end-to-end tests.
// Usage: node fake-obs.mjs <port> <password>. GET /state returns what was requested (recording, replay buffer, saved replays).
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const [port, password] = [Number(process.argv[2]), process.argv[3]];
const state = { recording: false, replayBuffer: false, savedReplays: 0, requests: [] };
const sha = (s) => createHash("sha256").update(s).digest("base64");
const SALT = "c2FsdA==", CHALLENGE = "Y2hhbGxlbmdl";

function frame(text) {
  const data = Buffer.from(text);
  const head = data.length < 126 ? Buffer.from([0x81, data.length])
    : Buffer.from([0x81, 126, data.length >> 8, data.length & 255]);
  return Buffer.concat([head, data]);
}
function close(sock, code, reason) {
  const r = Buffer.from(reason);
  sock.end(Buffer.concat([Buffer.from([0x88, 2 + r.length, code >> 8, code & 255]), r]));
}

const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(state));
});

server.on("upgrade", (req, sock) => {
  const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const send = (op, d) => sock.write(frame(JSON.stringify({ op, d })));
  send(0, { obsWebSocketVersion: "5.5.4", rpcVersion: 1, authentication: { challenge: CHALLENGE, salt: SALT } });
  let identified = false;
  let buf = Buffer.alloc(0);
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const opcode = buf[0] & 15;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const masked = (buf[1] & 128) !== 0;
      const total = off + (masked ? 4 : 0) + len;
      if (buf.length < total) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const payload = Buffer.from(buf.subarray(off + (masked ? 4 : 0), total));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buf = buf.subarray(total);
      if (opcode === 8) { sock.end(); return; }
      if (opcode !== 1) continue;
      const msg = JSON.parse(payload.toString());
      if (!identified) {
        if (msg.op !== 1 || msg.d?.authentication !== sha(sha(password + SALT) + CHALLENGE)) { close(sock, 4009, "Authentication failed."); return; }
        identified = true;
        send(2, { negotiatedRpcVersion: 1 });
        continue;
      }
      const { requestType: type, requestId } = msg.d;
      state.requests.push(type);
      let status = { result: true, code: 100 }, data;
      if (type === "GetRecordStatus") data = { outputActive: state.recording, outputTimecode: state.recording ? "00:00:07.000" : "00:00:00.000" };
      else if (type === "ToggleRecord") {
        state.recording = !state.recording;
        data = { outputActive: state.recording };
        send(5, { eventType: "RecordStateChanged", eventData: { outputActive: state.recording, outputState: state.recording ? "OBS_WEBSOCKET_OUTPUT_STARTED" : "OBS_WEBSOCKET_OUTPUT_STOPPED", outputPath: state.recording ? null : "C:/Videos/e2e.mkv" } });
      }
      else if (type === "GetReplayBufferStatus") data = { outputActive: state.replayBuffer };
      else if (type === "ToggleReplayBuffer") {
        state.replayBuffer = !state.replayBuffer;
        data = { outputActive: state.replayBuffer };
        send(5, { eventType: "ReplayBufferStateChanged", eventData: { outputActive: state.replayBuffer, outputState: state.replayBuffer ? "OBS_WEBSOCKET_OUTPUT_STARTED" : "OBS_WEBSOCKET_OUTPUT_STOPPED" } });
      }
      else if (type === "StartReplayBuffer") state.replayBuffer = true;
      else if (type === "StopReplayBuffer") state.replayBuffer = false;
      else if (type === "SaveReplayBuffer") {
        if (!state.replayBuffer) status = { result: false, code: 501, comment: "Replay buffer is not active." };
        else { state.savedReplays++; send(5, { eventType: "ReplayBufferSaved", eventData: { savedReplayPath: "C:/Videos/Replay e2e.mkv" } }); }
      }
      else status = { result: false, code: 204, comment: "Unknown request type." };
      send(7, { requestType: type, requestId, requestStatus: status, ...(data ? { responseData: data } : {}) });
    }
  });
  sock.on("error", () => {});
});

server.listen(port, "127.0.0.1");
