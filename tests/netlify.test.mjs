import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLeadHandler } from "../lib/netlify-lead.mjs";

const SITE = "https://erdenet.example";
const config = () => ({ url: "https://script.google.com/macros/s/test/exec", secret: "s".repeat(43) });
const lead = (overrides = {}) => ({ requestId: randomUUID(), name: "Synthetic verification", phone: "00000000", day: "2026-11-28", time: "10:00", consent: true, website: "", ...overrides });
const post = (handler, body, headers = {}) => handler(new Request(`${SITE}/api/leads`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: SITE, ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
}));
function sheet(respond) {
  const calls = [];
  return { calls, fetcher: async (url, options) => { const payload = JSON.parse(options.body); calls.push({ url, payload }); return respond(payload); } };
}

test("forwards a valid registration to the Sheet and answers with the Sheet's prize", async () => {
  const s = sheet(p => Response.json({ ok: true, requestId: p.id, id: p.id, prize: "usb" }));
  const handler = createLeadHandler({ getConfig: config, fetcher: s.fetcher, draw: () => "gift" });
  const input = lead();
  const response = await post(handler, input);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["day", "prize", "receipt", "status", "time"]);
  assert.equal(body.status, "synced");
  assert.equal(body.prize, "usb", "the Sheet decides the prize when the phone already has one");
  assert.equal(body.day, "2026-11-28");
  assert.match(body.receipt, /^[A-Za-z0-9_-]{32}$/);
  const sent = s.calls[0].payload;
  assert.equal(sent.secret, config().secret);
  assert.equal(sent.prize, "gift");
  assert.equal(sent.event, "erdenet-opening-2026-11");
  assert.equal(sent.consentVersion, "erdenet-opening-v1");
  assert.equal(sent.phone, "+97600000000");
  assert.equal(sent.id, input.requestId);
  const again = await (await post(handler, input)).json();
  assert.equal(again.receipt, body.receipt, "a retry keeps the same receipt");
});

test("an unavailable or unconfirmed Sheet write returns 503 without a receipt", async () => {
  const answers = [
    () => { throw new Error("offline"); },
    () => Response.json({ ok: false }),
    p => Response.json({ ok: true, requestId: randomUUID(), id: p.id, prize: "usb" }),
    p => Response.json({ ok: true, requestId: p.id, id: p.id }),
    p => Response.json({ ok: true, requestId: p.id, id: p.id, prize: "car" }),
    () => new Response("<html>sign in</html>", { status: 200 }),
  ];
  for (const respond of answers) {
    const handler = createLeadHandler({ getConfig: config, fetcher: sheet(respond).fetcher });
    const response = await post(handler, lead());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).receipt, undefined);
  }
});

test("a duplicate phone receives a clear conflict instead of a new receipt", async () => {
  const s = sheet(p => Response.json({ ok: true, requestId: p.id, duplicate: true }));
  const response = await post(createLeadHandler({ getConfig: config, fetcher: s.fetcher }), lead());
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "duplicate_phone");
  assert.equal(body.errors.phone, "Энэ дугаар бүртгэгдсэн байна.");
  assert.equal(body.receipt, undefined);
});

test("a saved registration without a remaining gift is still confirmed", async () => {
  const s = sheet(p => Response.json({ ok: true, requestId: p.id, id: p.id, prize: "none" }));
  const response = await post(createLeadHandler({ getConfig: config, fetcher: s.fetcher }), lead());
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.status, "synced");
  assert.equal(result.prize, "none");
  assert.match(result.receipt, /^[A-Za-z0-9_-]{32}$/);
});

test("rejects foreign origins, wrong content types, oversized or invalid bodies and other routes", async () => {
  const s = sheet(p => Response.json({ ok: true, requestId: p.id, id: p.id, prize: "usb" }));
  const handler = createLeadHandler({ getConfig: config, fetcher: s.fetcher });
  assert.equal((await post(handler, lead(), { origin: "https://foreign.example" })).status, 403);
  assert.equal((await post(handler, lead(), { "content-type": "text/plain" })).status, 415);
  assert.equal((await post(handler, lead({ name: "a".repeat(5000) }))).status, 413);
  assert.equal((await post(handler, "{not json")).status, 400);
  const invalid = await post(handler, lead({ phone: "123" }));
  assert.equal(invalid.status, 400);
  assert.ok((await invalid.json()).errors.phone);
  assert.equal((await post(handler, lead({ website: "spam.example" }))).status, 400);
  assert.equal((await handler(new Request(`${SITE}/api/leads/${"a".repeat(32)}`))).status, 404);
  assert.equal((await handler(new Request(`${SITE}/api/leads`))).status, 405);
  assert.equal(s.calls.length, 0, "nothing reaches the Sheet");
});

test("refuses leads while the Sheet connection is not configured", async () => {
  const handler = createLeadHandler({ getConfig: () => ({ url: "", secret: "" }), fetcher: async () => { throw new Error("must not be called"); } });
  assert.equal((await post(handler, lead())).status, 503);
});
