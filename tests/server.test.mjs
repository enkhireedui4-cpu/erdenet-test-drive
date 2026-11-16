import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../server.mjs";

async function fixture(t, overrides = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "erdenet-http-"));
  const app = createApp({ dbPath: path.join(directory, "leads.sqlite"), getSheetConfig: () => ({ url: "", secret: "" }), retryIntervalMs: 0, ...overrides });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  app.setAllowedOrigins([origin]);
  t.after(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });
  const post = data => fetch(`${origin}/api/leads`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(data) });
  return { ...app, origin, post };
}

const valid = () => ({ requestId: randomUUID(), name: "Synthetic verification", phone: "00000000", day: "2026-11-28", time: "10:00", consent: true, website: "" });

test("intake returns pending only after durable storage; status exposes no personal data", async (t) => {
  const f = await fixture(t);
  const response = await f.post(valid());
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.status, "pending");
  assert.match(body.receipt, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(f.store.pending().length, 1);
  const status = await fetch(`${f.origin}/api/leads/${body.receipt}`).then(r => r.json());
  assert.equal(status.status, "pending");
  assert.deepEqual(Object.keys(status).sort(), ["day", "status", "time"]);
  assert.equal(status.day, "2026-11-28");
});

test("distinct attendees sharing a proxy or event Wi-Fi are not blocked by an IP quota", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 31; i++) {
    const response = await f.post({ ...valid(), phone: String(i).padStart(8, "0") });
    assert.equal(response.status, 202, `Attendee ${i + 1}`);
  }
  assert.equal(f.store.counts().find(row => row.status === "pending").count, 31);
});

test("a checked Google acknowledgement changes the response to confirmed", async (t) => {
  const f = await fixture(t, {
    getSheetConfig: () => ({ url: "https://script.google.com/macros/s/test/exec", secret: "test-secret" }),
    fetcher: async (url, options) => { const lead = JSON.parse(options.body); return Response.json({ ok: true, requestId: lead.id, id: lead.id }); },
  });
  const response = await f.post(valid());
  assert.equal(response.status, 201);
  assert.equal((await response.json()).status, "synced");
});

test("rejects invalid consent, foreign origins, oversized bodies and unsupported methods", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.post({ ...valid(), consent: false })).status, 400);
  assert.equal((await fetch(`${f.origin}/api/leads`, { method: "POST", headers: { "content-type": "application/json", origin: "https://foreign.example" }, body: JSON.stringify(valid()) })).status, 403);
  assert.equal((await f.post({ ...valid(), name: "a".repeat(5000) })).status, 413);
  assert.equal((await fetch(`${f.origin}/api/leads`, { method: "DELETE" })).status, 405);
  assert.equal(f.store.pending().length, 0);
});

test("static routing cannot expose private files, source, config, database or traversal paths", async (t) => {
  const f = await fixture(t);
  for (const pathname of ["/.env", "/data/leads.sqlite", "/private/Code.gs", "/server.mjs", "/apps-script/Code.gs.template", "/..%2f.env", "/assets/..%2f..%2f.env"]) {
    const response = await fetch(`${f.origin}${pathname}`);
    assert.equal(response.status, 404, pathname);
  }
});
