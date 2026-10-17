import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const STATE_FILE = join(tmpdir(), "pgl-e2e-state.json");
export const COMPANION_PORT = 18787;
export const RELAY_PORT = 18788;
export const COMPANION = `http://127.0.0.1:${COMPANION_PORT}`;
export const RELAY = `http://127.0.0.1:${RELAY_PORT}`;
export const HOSTED_PORT = 18901;
export const HOSTED_SITE = `http://127.0.0.1:${HOSTED_PORT}`;

export interface E2EState { dataDir: string; adminToken: string; pids: number[]; workDir: string }
export function state(): E2EState { return JSON.parse(readFileSync(STATE_FILE, "utf8")); }
