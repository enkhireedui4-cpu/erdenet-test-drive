import { createLeadHandler } from "../../lib/netlify-lead.mjs";

// Netlify Functions v2: POST /api/leads forwards a validated registration to the Google Sheet.
// Needs the site environment variables GOOGLE_SHEETS_WEBHOOK_URL and LEAD_WEBHOOK_SECRET.
export default createLeadHandler();

export const config = { path: ["/api/leads", "/api/leads/*"] };
