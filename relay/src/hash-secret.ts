import { randomBytes } from "node:crypto";
import { sha256Hex } from "./relay.js";

// Usage: npm run hash-secret -- [secret]
// Without an argument a new random secret is generated. Put the secret into the companion and the hash into relay.config.json.
const secret = process.argv[2] ?? randomBytes(24).toString("base64url");
if (secret.length < 24) { console.error("Der Schlüssel muss mindestens 24 Zeichen lang sein."); process.exit(1); }
console.log(`Relay-Schlüssel (im Companion eintragen): ${secret}`);
console.log(`secretSha256 (in relay.config.json):      ${sha256Hex(secret)}`);
