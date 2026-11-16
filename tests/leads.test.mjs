import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { normalizePhone, validateLead, EVENT_ID, PRIZES, prizeLabel } from "../public/lead-validation.js";
import { createLeadStore } from "../lib/lead-store.mjs";
import { createSheetSync } from "../lib/sheet-sync.mjs";

const input = (overrides = {}) => ({
  requestId: randomUUID(), name: "Тест хэрэглэгч", phone: "00000000", day: "2026-11-28", time: "10:00", consent: true, website: "", ...overrides,
});

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "erdenet-leads-"));
  const dbPath = path.join(directory, "leads.sqlite");
  let store = createLeadStore(dbPath);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { get store() { return store; }, restart() { store.close(); store = createLeadStore(dbPath); return store; } };
}

test("normalizes local, formatted and +976 phones without accepting extra characters", () => {
  for (const value of ["99112233", "9911 2233", "+976 9911-2233", "97699112233"]) {
    assert.equal(normalizePhone(value), "+97699112233");
  }
  for (const value of ["9911223", "991122334", "+86 99112233", "abc99112233", "99112233<script>", null]) {
    assert.equal(normalizePhone(value), null);
  }
});

test("requires explicit consent, a real name, an idempotency UUID and an empty honeypot", () => {
  const validated = validateLead(input({ name: "  Өлзий   Бат  ", phone: "9911 2233", utmSource: "social" }));
  assert.equal(validated.ok, true);
  assert.equal(validated.data.name, "Өлзий Бат");
  assert.equal(validated.data.phone, "+97699112233");
  assert.equal(validated.data.event, EVENT_ID);
  assert.equal(validated.data.day, "2026-11-28");
  for (const patch of [{ consent: false }, { consent: "true" }, { name: " " }, { name: "а".repeat(81) }, { name: "A\u0000B" }, { requestId: "id" }, { website: "spam.example" }]) {
    assert.equal(validateLead(input(patch)).ok, false, JSON.stringify(patch));
  }
});

test("preserves either selected event day and rejects an unoffered date", (t) => {
  const { store } = fixture(t);
  const testDrive = validateLead(input());
  const opening = validateLead(input({ day: "2026-11-29", time: "17:00" }));
  assert.equal(testDrive.data.day, "2026-11-28");
  assert.equal(opening.data.day, "2026-11-29");
  for (const day of ["2026-11-21", "2026-11-22", "2026-11-30"]) assert.equal(validateLead(input({ day })).ok, false);
  assert.notEqual(store.accept(opening.data).id, store.accept(testDrive.data).id);
  assert.equal(store.pending().length, 2);
});

test("only offers 17:00 on opening day and five two-hour options on test-drive day", () => {
  assert.equal(validateLead(input({ day: "2026-11-29", time: "17:00" })).ok, true);
  assert.equal(validateLead(input({ day: "2026-11-29", time: "10:00" })).ok, false);
  for (const time of ["10:00", "12:00", "14:00", "16:00", "18:00"]) assert.equal(validateLead(input({ time })).ok, true);
  for (const time of ["", "17:00", "20:00", "bad"]) assert.equal(validateLead(input({ time })).ok, false);
});

test("exposes the four wheel prizes with Mongolian labels", () => {
  assert.deepEqual(PRIZES.map(p => p.id), ["umbrella", "usb", "notebook", "gift"]);
  assert.equal(prizeLabel("usb"), "USB багц");
  assert.equal(prizeLabel("car"), undefined);
  assert.equal(EVENT_ID, "erdenet-opening-2026-11");
  assert.ok(Object.isFrozen(PRIZES));
});

test("a new lead stores one server-drawn prize and retries keep it", (t) => {
  const { store } = fixture(t);
  const data = validateLead(input()).data;
  const first = store.accept(data);
  assert.ok(PRIZES.some(p => p.id === first.prize));
  assert.equal(store.accept(data).prize, first.prize);
});

test("the same phone on the other day reuses its first prize", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "erdenet-prize-"));
  let n = 0; const store = createLeadStore(path.join(directory, "l.sqlite"), { pickPrize: () => ["usb", "gift"][n++] });
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const a = store.accept(validateLead(input()).data);
  const b = store.accept(validateLead(input({ requestId: randomUUID(), day: "2026-11-29", time: "17:00" })).data);
  assert.notEqual(a.id, b.id);
  assert.equal(a.prize, "usb"); assert.equal(b.prize, "usb");
});

test("committed pending records and receipt tokens survive a process restart", (t) => {
  const f = fixture(t);
  const lead = f.store.accept(validateLead(input()).data);
  assert.equal(lead.status, "pending");
  assert.match(lead.receipt, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(f.store.pending().length, 1);
  const restarted = f.restart();
  assert.equal(restarted.byReceipt(lead.receipt).id, lead.id);
  assert.equal(restarted.pending()[0].phone, "+97600000000");
});

test("retries and normalized duplicate phones reuse one record without overwriting it", (t) => {
  const { store } = fixture(t);
  const data = validateLead(input({ phone: "9911 2233" })).data;
  const first = store.accept(data);
  assert.equal(store.accept(data).id, first.id);
  assert.equal(store.accept(validateLead(input({ phone: "+97699112233", name: "Өөр нэр" })).data).id, first.id);
  assert.equal(store.pending().length, 1);
  assert.equal(store.byId(first.id).name, "Тест хэрэглэгч");
  assert.throws(() => store.accept({ ...data, phone: "+97688112233" }), /conflict/i);
});

test("Google outages leave a durable pending lead that a later worker synchronizes", async (t) => {
  const f = fixture(t);
  const lead = f.store.accept(validateLead(input()).data);
  const config = { url: "https://script.google.com/macros/s/test/exec", secret: "test-only-secret" };
  const failed = createSheetSync({ store: f.store, getConfig: () => config, fetcher: async () => { throw new Error("offline"); } });
  await failed.send(lead.id);
  assert.equal(f.store.byId(lead.id).status, "pending");
  assert.equal(f.store.byId(lead.id).attempts, 1);
  const restarted = f.restart();
  let posted;
  const success = createSheetSync({ store: restarted, getConfig: () => config, fetcher: async (url, options) => {
    posted = JSON.parse(options.body);
    return Response.json({ ok: true, requestId: lead.id, id: lead.id });
  } });
  await success.send(lead.id);
  assert.equal(posted.secret, "test-only-secret");
  assert.equal(posted.event, EVENT_ID);
  assert.ok(lead.prize);
  assert.equal(posted.prize, lead.prize);
  assert.equal(restarted.byId(lead.id).status, "synced");
  assert.equal(restarted.pending().length, 0);
});

test("HTTP 200, an opaque response, or a mismatched acknowledgement never confirms a lead", async (t) => {
  const { store } = fixture(t);
  const lead = store.accept(validateLead(input()).data);
  for (const body of [{ ok: false }, { ok: true, id: lead.id }, { ok: true, requestId: randomUUID(), id: lead.id }]) {
    const sync = createSheetSync({ store, getConfig: () => ({ url: "https://script.google.com/macros/s/test/exec", secret: "secret" }), fetcher: async () => Response.json(body) });
    await sync.send(lead.id);
    assert.equal(store.byId(lead.id).status, "pending");
  }
});

test("concurrent syncs share one request and never retry a confirmed lead", async (t) => {
  const { store } = fixture(t);
  const lead = store.accept(validateLead(input()).data);
  let calls = 0;
  const sync = createSheetSync({ store, getConfig: () => ({ url: "https://script.google.com/macros/s/test/exec", secret: "secret" }), fetcher: async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return Response.json({ ok: true, requestId: lead.id, id: lead.id });
  } });
  await Promise.all([sync.send(lead.id), sync.send(lead.id), sync.send(lead.id)]);
  await sync.send(lead.id);
  assert.equal(calls, 1);
  assert.equal(store.byId(lead.id).status, "synced");
});
