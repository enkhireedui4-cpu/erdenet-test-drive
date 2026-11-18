import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as validation from "../public/lead-validation.js";

// The module's absolute browser import is supplied by the test context.
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace(/^import .*\r?\n/, "");
const unavailable = () => Response.json({ error: "Unavailable" }, { status: 503 });
const confirmed = (lead, receipt = "a".repeat(32)) => Response.json({
  status: "synced", receipt, day: lead.day, time: lead.time, prize: "usb",
}, { status: 201 });
const flush = () => new Promise(resolve => setImmediate(resolve));

function eventTarget(properties = {}) {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatch(type, properties = {}) {
      for (const listen of listeners.get(type) ?? []) listen({ type, preventDefault() {}, ...properties });
    },
    ...properties,
  };
}

function storage() {
  const records = Object.create(null);
  Object.defineProperties(records, {
    length: { get: () => Object.keys(records).length },
    key: { value: index => Object.keys(records)[index] ?? null },
    getItem: { value: key => records[key] ?? null },
    setItem: { value: (key, value) => { records[key] = String(value); } },
    removeItem: { value: key => { delete records[key]; } },
  });
  return records;
}

function openPage(fetch, { localStorage = storage(), sessionStorage = storage() } = {}) {
  const elements = new Map();
  const timers = new Map();
  let lastTimer = 0;
  let clock = Date.now();
  class BrowserDate extends Date {
    constructor(...args) { super(...(args.length === 0 ? [clock] : args)); }
    static now() { return clock; }
  }
  const node = selector => {
    if (!elements.has(selector)) {
      elements.set(selector, eventTarget({
        value: "", hidden: true, textContent: "", dataset: {}, style: {},
        classList: { add() {}, remove() {} },
        querySelector: element => node(element),
        querySelectorAll: selector => selector === ".wheel-slice" ? [{ dataset: { prize: "usb" } }] : [],
        getBoundingClientRect: () => ({ top: 0, bottom: 0 }),
        setAttribute() {}, focus() {}, reset() {},
      }));
    }
    return elements.get(selector);
  };
  const form = node("#lead-form");
  form.elements = {
    name: node("#name"), phone: node("#phone"), website: node("#website"),
    day: { value: "2026-11-28" }, time: { value: "10:00" },
  };
  const window = eventTarget();
  runInNewContext(app, {
    ...validation, window, localStorage, sessionStorage, fetch,
    document: eventTarget({ querySelector: node, fonts: { ready: Promise.resolve() }, visibilityState: "visible", hidden: false }),
    crypto: { randomUUID }, navigator: { onLine: true }, location: { search: "" },
    matchMedia: query => ({ matches: query === "(prefers-reduced-motion: reduce)" }),
    requestAnimationFrame() {}, innerHeight: 500,
    Date: BrowserDate, URLSearchParams, AbortSignal,
    setTimeout(callback, delay) {
      timers.set(++lastTimer, { callback, time: clock + delay });
      return lastTimer;
    },
    clearTimeout: id => timers.delete(id),
  }, { filename: "public/app.js" });
  return {
    dispatch: window.dispatch,
    resultVisible: () => !node("#result-panel").hidden,
    resultSlot: () => node("#result-slot").textContent,
    formContact: () => [form.elements.name.value, form.elements.phone.value],
    prizeVisible: () => !node("#prize-card").hidden,
    spin: () => node("#spin-button").dispatch("click"),
    submit(name = "Synthetic Visitor", phone = "00000000", slot = { day: "2026-11-28", time: "10:00" }) {
      form.elements.name.value = name;
      form.elements.phone.value = phone;
      form.elements.day.value = slot.day;
      form.elements.time.value = slot.time;
      form.dispatch("submit");
    },
    async runNextTimer() {
      const first = [...timers].sort(([, a], [, b]) => a.time - b.time)[0];
      assert.ok(first, "A failed submission should schedule a retry while the browser is online");
      const [id, { callback, time }] = first;
      timers.delete(id);
      clock = Math.max(clock, time);
      callback();
      await flush();
    },
  };
}

test("a connected browser retries a 503 with the same request ID and shows the receipt", async () => {
  const payloads = [];
  const page = openPage(async (_url, { body }) => {
    const payload = JSON.parse(body);
    payloads.push(payload);
    return payloads.length === 1 ? unavailable() : confirmed(payload);
  });

  page.submit();
  await flush();
  assert.equal(page.resultVisible(), false);
  await page.runNextTimer();
  assert.equal(payloads.length, 2);
  assert.equal(payloads[1].requestId, payloads[0].requestId);
  assert.equal(page.resultVisible(), true);
});

test("after a lost acknowledgement, manually retrying equivalent contact details keeps the original request ID", async () => {
  const payloads = [];
  const page = openPage(async (_url, { body }) => {
    const payload = JSON.parse(body);
    payloads.push(payload);
    if (payloads.length === 1) throw new TypeError("Connection dropped after commit");
    if (payload.requestId === payloads[0].requestId) return confirmed(payload);
    return Response.json({ code: "duplicate_phone" }, { status: 409 });
  });

  page.submit("Synthetic  Visitor", "0000 0000");
  await flush();
  page.submit("Synthetic Visitor", "+976 0000-0000");
  await flush();
  assert.equal(payloads.length, 2);
  assert.equal(payloads[1].requestId, payloads[0].requestId);
  assert.equal(page.resultVisible(), true);
});

test("a successful submission in another tab leaves the first tab's pending request recoverable on reload", async () => {
  const localStorage = storage();
  const firstTab = { localStorage, sessionStorage: storage() };
  const secondTab = { localStorage, sessionStorage: storage() };
  const payloads = [];
  const submitFirst = async (_url, { body }) => {
    const payload = JSON.parse(body);
    payloads.push(payload);
    return payloads.length === 1 ? unavailable() : confirmed(payload, "b".repeat(32));
  };
  const first = openPage(submitFirst, firstTab);
  const second = openPage(async (_url, { body }) => confirmed(JSON.parse(body)), secondTab);

  first.submit();
  await flush();
  second.submit("Other Synthetic Visitor", "00000001");
  await flush();
  assert.equal(second.resultVisible(), true);
  assert.equal(first.resultVisible(), false);
  first.dispatch("pagehide");

  const reloaded = openPage(submitFirst, firstTab);
  await flush();
  if (!reloaded.resultVisible()) await reloaded.runNextTimer();
  assert.equal(payloads.length, 2);
  assert.equal(payloads[1].phone, payloads[0].phone);
  assert.equal(payloads[1].requestId, payloads[0].requestId);
  assert.equal(reloaded.resultVisible(), true);
});

test("two confirmed tabs restore their own selected slots and revealed prizes without resubmitting", async () => {
  const localStorage = storage();
  const firstTab = { localStorage, sessionStorage: storage() };
  const secondTab = { localStorage, sessionStorage: storage() };
  const requests = [];
  const send = async (url, { body }) => {
    requests.push(url);
    const payload = JSON.parse(body);
    return confirmed(payload, (payload.day === "2026-11-28" ? "a" : "b").repeat(32));
  };
  const first = openPage(send, firstTab);
  const second = openPage(send, secondTab);
  first.submit();
  await flush();
  first.spin();
  await flush();
  second.submit("Other Synthetic Visitor", "00000001", { day: "2026-11-29", time: "17:00" });
  await flush();
  second.spin();
  await flush();

  const reloadedFirst = openPage(send, firstTab);
  const reloadedSecond = openPage(send, secondTab);
  await flush();
  assert.equal(reloadedFirst.resultVisible(), true);
  assert.equal(reloadedSecond.resultVisible(), true);
  assert.match(reloadedFirst.resultSlot(), /10:00$/);
  assert.match(reloadedSecond.resultSlot(), /17:00$/);
  assert.equal(reloadedFirst.prizeVisible(), true);
  assert.equal(reloadedSecond.prizeVisible(), true);
  const fresh = openPage(send, { localStorage });
  await flush();
  assert.equal(fresh.resultVisible(), false, "A fresh tab must not adopt another tab's receipt");
  assert.deepEqual(requests, ["/api/leads", "/api/leads"]);
});

test("a stale tab restores a receipt confirmed by another tab without resubmitting contact data", async () => {
  const localStorage = storage();
  const payloads = [];
  const send = async (_url, { body }) => {
    const payload = JSON.parse(body);
    payloads.push(payload);
    return payloads.length === 1 ? unavailable() : confirmed(payload);
  };
  const first = openPage(send, { localStorage });
  first.submit();
  await flush();
  const recovering = openPage(send, { localStorage });
  await flush();
  assert.deepEqual(recovering.formContact(), ["", ""]);
  assert.equal(payloads.length, 1, "A fresh tab must not send another tab's pending request");
  recovering.submit();
  await flush();
  assert.equal(recovering.resultVisible(), true);
  assert.equal(payloads[1].requestId, payloads[0].requestId);

  first.submit("Synthetic Visitor", "+976 0000-0000");
  await flush();
  assert.equal(payloads.length, 2);
  assert.equal(first.resultVisible(), true);
  assert.equal(Object.values(localStorage).some(record => record.includes("Synthetic Visitor")), false);
});

for (const [event, properties] of [["online", {}], ["pageshow", { persisted: true }]]) {
  test(`a confirmed receipt stays final after the ${event} event`, async () => {
    const requests = [];
    const page = openPage(async (url, { body }) => {
      requests.push(url);
      return body ? confirmed(JSON.parse(body)) : Response.json({ error: "Not found" }, { status: 404 });
    });

    page.submit();
    await flush();
    assert.equal(page.resultVisible(), true);
    page.dispatch(event, properties);
    await flush();
    assert.deepEqual(requests, ["/api/leads"]);
  });
}

test("an outstanding single-entry v2 outbox submission retries after upgrading", async () => {
  const legacy = {
    requestId: "25639734-14a7-430b-85a0-e41420835c59", name: "Synthetic Visitor", phone: "00000000",
    day: "2026-11-28", time: "10:00", consent: true, website: "", expires: Date.now() + 86_400_000,
  };
  const localStorage = storage();
  localStorage.setItem("sain-erdenet-submitted-v2", JSON.stringify(legacy));
  const ids = [];
  const page = openPage(async (_url, { body }) => {
    const payload = JSON.parse(body);
    ids.push(payload.requestId);
    return confirmed(payload);
  }, { localStorage });

  await flush();
  assert.deepEqual(ids, [legacy.requestId]);
  assert.equal(page.resultVisible(), true);
});
