import { createHmac } from "node:crypto";
import { validateLead, prizeLabel, CONSENT_VERSION, UUID } from "../public/lead-validation.js";
import { pickPrize } from "./prizes.mjs";
import { validSheetUrl } from "./sheet-sync.mjs";

// Serverless intake for Netlify: no disk, so the Google Sheet is the record and the
// visitor's browser outbox resends a registration if Google is briefly unavailable.
const reply = (status, body) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** A stable opaque token per registration; the browser keys its saved result on it. */
export function receiptFor(id, secret) {
  return createHmac("sha256", secret).update(id).digest("base64url").slice(0, 32);
}

export function createLeadHandler({
  getConfig = () => ({ url: process.env.GOOGLE_SHEETS_WEBHOOK_URL, secret: process.env.LEAD_WEBHOOK_SECRET }),
  fetcher = fetch,
  draw = pickPrize,
  now = () => new Date(),
  timeoutMs = 9000,
} = {}) {
  return async function handleLead(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/api/leads") return reply(404, { error: "Not found" });
    if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
    if (req.headers.get("origin") !== url.origin) return reply(403, { error: "Origin not allowed" });
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") ?? "")) return reply(415, { error: "Unsupported content type" });
    const text = await req.text();
    if (text.length > 4096) return reply(413, { error: "Request too large" });
    let input;
    try { input = JSON.parse(text); } catch { return reply(400, { error: "Invalid request" }); }
    const lead = validateLead(input);
    if (!lead.ok) return reply(400, { errors: lead.errors });

    const unavailable = () => reply(503, { error: "Хүсэлтийг хадгалж чадсангүй. Дахин оролдоно уу." });
    const config = getConfig();
    if (!validSheetUrl(config.url) || !config.secret) return unavailable();
    const at = now().toISOString();
    const { requestId: id, name, phone, event, day, time, utmSource, utmCampaign } = lead.data;
    // The drawn prize is a proposal: the Sheet keeps a phone's first prize for the whole event.
    const payload = { id, name, phone, event, day, time, consent: true, consentVersion: CONSENT_VERSION, createdAt: at, consentAt: at, source: "erdenet-web", utmSource, utmCampaign, prize: draw() };
    try {
      const response = await fetcher(config.url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, secret: config.secret }),
        redirect: "follow", signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return unavailable();
      const result = await response.json();
      if (result?.ok !== true || result.requestId !== id || typeof result.id !== "string" || !UUID.test(result.id) || !prizeLabel(result.prize)) return unavailable();
      return reply(201, { status: "synced", receipt: receiptFor(id, config.secret), day, time, prize: result.prize });
    } catch {
      return unavailable();
    }
  };
}
