// Everything the account carries and the PC needs by itself is applied here: the memory folder and rules, and the
// place weather questions use. Runs at start, after signing in to the PC and after switching the account.
import { client } from "./rpc";
import { applyMemoryToPc } from "./memory-sync";
import { applyHomePlaceToPc } from "./home-place-sync";

/** Signs the two apply steps onto the connection. Returns the cleanup. */
export function startAccountAutoApply() {
  const run = () => { void applyMemoryToPc(); void applyHomePlaceToPc(); };
  if (client.status.auth === "ok") run();
  const off = client.on("authenticated", run);
  window.addEventListener("online", run);
  window.addEventListener("pgl-account", run);
  return () => {
    off();
    window.removeEventListener("online", run);
    window.removeEventListener("pgl-account", run);
  };
}
