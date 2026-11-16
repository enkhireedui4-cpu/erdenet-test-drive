import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/config.mjs";
import { validSheetUrl } from "../lib/sheet-sync.mjs";

const url = process.argv[2];
if (!validSheetUrl(url)) { console.error("Usage: npm run connect -- https://script.google.com/macros/s/DEPLOYMENT_ID/exec"); process.exitCode = 1; }
else {
  const filename = path.join(ROOT, ".env");
  const contents = readFileSync(filename, "utf8");
  const setting = `GOOGLE_SHEETS_WEBHOOK_URL=${url}`;
  writeFileSync(filename, /^GOOGLE_SHEETS_WEBHOOK_URL=.*$/m.test(contents) ? contents.replace(/^GOOGLE_SHEETS_WEBHOOK_URL=.*$/m, setting) : `${contents}\n${setting}\n`, { mode: 0o600 });
  console.log("Google receiver configured. The running server picks this up automatically within 30 seconds.");
}
