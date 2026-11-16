import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createLeadStore } from "./lib/lead-store.mjs";
import { createSheetSync, validSheetUrl } from "./lib/sheet-sync.mjs";
import { ROOT, readLocalConfig } from "./lib/config.mjs";
import { validateLead } from "./public/lead-validation.js";

const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]], ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]], ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/lead-validation.js", ["lead-validation.js", "text/javascript; charset=utf-8"]],
  ["/assets/logo.svg", ["assets/logo.svg", "image/svg+xml"]], ["/assets/inter.woff2", ["assets/inter.woff2", "font/woff2"]],
  ["/assets/zona-bold.woff2", ["assets/zona-bold.woff2", "font/woff2"]], ["/assets/zona-semibold.woff2", ["assets/zona-semibold.woff2", "font/woff2"]],
  ["/favicon.svg", ["assets/logo.svg", "image/svg+xml"]],
]);

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };

function readJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? "")) { req.resume(); throw new HttpError(415, "Unsupported content type"); }
  if (Number(req.headers["content-length"]) > 4096) { req.resume(); throw new HttpError(413, "Request too large"); }
  return new Promise((resolve, reject) => {
    let size = 0, settled = false; const chunks = [];
    req.on("data", chunk => { if (settled) return; size += chunk.length; if (size > 4096) { settled = true; reject(new HttpError(413, "Request too large")); } else chunks.push(chunk); });
    req.on("end", () => { if (settled) return; settled = true; try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new HttpError(400, "Invalid request")); } });
    req.on("aborted", () => { if (!settled) { settled = true; reject(new HttpError(400, "Incomplete request")); } });
    req.on("error", () => { if (!settled) { settled = true; reject(new HttpError(400, "Incomplete request")); } });
  });
}

export function createApp({ dbPath = path.join(ROOT, "data", "leads.sqlite"), getSheetConfig = () => { const config = readLocalConfig(); return { url: config.GOOGLE_SHEETS_WEBHOOK_URL, secret: config.LEAD_WEBHOOK_SECRET }; }, fetcher, retryIntervalMs = 30_000, allowedOrigins = ["http://localhost:3210", "http://127.0.0.1:3210"] } = {}) {
  const store = createLeadStore(dbPath);
  const sync = createSheetSync({ store, getConfig: getSheetConfig, fetcher });
  let origins = new Set(allowedOrigins), closing = false;
  const rate = new Map();
  const server = createServer(async (req, res) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      if (pathname === "/api/leads") {
        if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
        if (!origins.has(req.headers.origin)) return json(res, 403, { error: "Origin not allowed" });
        const input = validateLead(await readJson(req));
        if (!input.ok) return json(res, 400, { errors: input.errors });
        // A shared proxy or event Wi-Fi must not reject distinct attendees.
        const now = Date.now(), rateKey = input.data.phone;
        if (rate.size > 1000) for (const [key, entry] of rate) if (entry.until < now) rate.delete(key);
        const entry = rate.get(rateKey);
        if (entry && entry.until > now && entry.count >= 30) { res.setHeader("retry-after", "60"); return json(res, 429, { error: "Түр хүлээгээд дахин оролдоно уу." }); }
        rate.set(rateKey, entry && entry.until > now ? { ...entry, count: entry.count + 1 } : { until: now + 60_000, count: 1 });
        let lead;
        try { lead = store.accept(input.data); } catch (error) { if (/conflict/i.test(error.message)) return json(res, 409, { error: "Мэдээлэл өөрчлөгдсөн байна. Дахин оролдоно уу." }); throw error; }
        await sync.send(lead.id);
        lead = store.byId(lead.id);
        return json(res, lead.status === "synced" ? 201 : 202, { status: lead.status, receipt: lead.receipt, day: lead.day, time: lead.time, prize: lead.prize });
      }
      if (pathname.startsWith("/api/leads/")) {
        if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
        const receipt = pathname.slice("/api/leads/".length);
        const lead = /^[A-Za-z0-9_-]{32}$/.test(receipt) ? store.byReceipt(receipt) : undefined;
        return lead ? json(res, 200, { status: lead.status, day: lead.day, time: lead.time, prize: lead.prize }) : json(res, 404, { error: "Not found" });
      }
      if (pathname === "/api/health" && req.method === "GET") {
        const config = getSheetConfig();
        return json(res, 200, { ok: true, sheetsConfigured: !!config.secret && validSheetUrl(config.url) });
      }
      if (!["GET", "HEAD"].includes(req.method)) return json(res, 405, { error: "Method not allowed" });
      const asset = files.get(pathname);
      if (!asset) return json(res, 404, { error: "Not found" });
      let content;
      try { content = await readFile(path.join(ROOT, "public", asset[0])); } catch { return json(res, 404, { error: "Not found" }); }
      res.writeHead(200, { "content-type": asset[1], "content-length": content.length, "cache-control": pathname.includes("woff2") ? "public, max-age=604800" : "no-cache" });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) { if (!res.headersSent) json(res, error.status ?? 503, { error: "Хүсэлтийг хадгалж чадсангүй. Дахин оролдоно уу." }); else res.end(); }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  const timer = retryIntervalMs > 0 ? setInterval(() => { void sync.drain(); }, retryIntervalMs) : null;
  timer?.unref();
  if (retryIntervalMs > 0) queueMicrotask(() => { void sync.drain(); });
  return {
    server, store, sync,
    setAllowedOrigins(values) { origins = new Set(values); },
    async close() { if (closing) return; closing = true; if (timer) clearInterval(timer); await new Promise(resolve => { if (server.listening) { server.close(resolve); server.closeIdleConnections(); } else resolve(); }); await sync.close(); store.close(); },
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href.toLowerCase() === import.meta.url.toLowerCase()) {
  const config = readLocalConfig(), port = Number(config.PORT || 3210), host = config.HOST || "127.0.0.1";
  const allowedOrigins = config.PUBLIC_ORIGIN ? [new URL(config.PUBLIC_ORIGIN).origin] : [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  const app = createApp({ dbPath: config.DATA_DIR ? path.join(path.resolve(config.DATA_DIR), "leads.sqlite") : undefined, allowedOrigins });
  app.server.listen(port, host, () => { console.log(`Erdenet Test Drive: http://localhost:${port}`); console.log("Durable lead storage ready. Google connection:", config.GOOGLE_SHEETS_WEBHOOK_URL ? "configured" : "awaiting /exec URL"); });
  app.server.on("error", error => { console.error(error.code === "EADDRINUSE" ? `Port ${port} is already in use.` : "Server could not start."); process.exitCode = 1; void app.close(); });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
}
