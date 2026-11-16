import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function readLocalConfig() {
  let text = "";
  try { text = readFileSync(path.join(ROOT, ".env"), "utf8"); } catch { /* Environment-only production configuration is supported. */ }
  const local = Object.fromEntries(text.split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).trim()]; }));
  return { ...local, ...process.env };
}
