import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { STATE_FILE } from "./env";

export default async function teardown() {
  if (!existsSync(STATE_FILE)) return;
  const s = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  for (const pid of s.pids) { try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ } }
  unlinkSync(STATE_FILE);
}
