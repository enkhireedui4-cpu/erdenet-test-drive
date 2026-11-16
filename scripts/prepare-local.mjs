import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ROOT, readLocalConfig } from "../lib/config.mjs";

const envPath = path.join(ROOT, ".env");
if (!existsSync(envPath)) writeFileSync(envPath, `PORT=3210\nHOST=127.0.0.1\nGOOGLE_SHEETS_WEBHOOK_URL=\nLEAD_WEBHOOK_SECRET=${randomBytes(32).toString("base64url")}\n`, { mode: 0o600 });
const config = readLocalConfig();
if (!/^[A-Za-z0-9_-]{32,}$/.test(config.LEAD_WEBHOOK_SECRET ?? "")) throw new Error("A secure LEAD_WEBHOOK_SECRET is required.");
mkdirSync(path.join(ROOT, "private"), { recursive: true });
const template = readFileSync(path.join(ROOT, "apps-script", "Code.gs.template"), "utf8");
writeFileSync(path.join(ROOT, "private", "Code.gs"), template.replaceAll("__WEBHOOK_SECRET__", config.LEAD_WEBHOOK_SECRET), { mode: 0o600 });
console.log("Ready: private/Code.gs (keep this file private). No dependency installation required.");
