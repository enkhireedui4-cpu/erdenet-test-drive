import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";

const LEGACY_HEADERS = ["Бүртгэлийн ID", "Бүртгэсэн огноо", "Нэр", "Утас", "Эвент", "Өдөр", "Цаг", "Эх сурвалж", "UTM source", "UTM campaign", "Зөвшөөрөл"];

function receiver(initialMaxRows = 1000, { legacyHeaders = false } = {}) {
  const rows = [legacyHeaders ? [...LEGACY_HEADERS] : [...LEGACY_HEADERS, "Бэлэг"]];
  let locked = false, failWrite = false, maxRows = initialMaxRows;
  const sheet = {
    getLastRow: () => rows.length,
    getMaxRows: () => maxRows,
    insertRowsAfter: (after, count) => { assert.equal(after, maxRows); maxRows += count; },
    getRange: (row, column, height = 1, width = 1) => ({
      getValues: () => Array.from({ length: height }, (_, i) => rows[row - 1 + i]?.slice(column - 1, column - 1 + width) ?? Array(width).fill("")),
      setNumberFormat() { return this; },
      setValues(values) { if (failWrite) throw new Error("quota"); if (row + values.length - 1 > maxRows) throw new Error("Rows out of bounds"); values.forEach((r, i) => { const target = rows[row - 1 + i] ?? []; r.forEach((value, j) => { target[column - 1 + j] = value; }); rows[row - 1 + i] = target; }); return this; },
    }),
  };
  const context = vm.createContext({
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
    ContentService: { MimeType: { JSON: "JSON" }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (locked) return false; locked = true; return true; }, releaseLock: () => { locked = false; } }) },
    SpreadsheetApp: { openById: id => { assert.equal(id, "1argV8PktHaKNvW5_iK0UICcwOkHGDJtEq__PwSOGs2k"); return { getSheetByName: name => { assert.equal(name, "Sheet1"); return sheet; } }; }, flush() { if (failWrite) throw new Error("quota"); } },
    Utilities: { formatDate: () => "2026-11-16 12:00:00" },
  });
  const source = readFileSync(new URL("../apps-script/Code.gs.template", import.meta.url), "utf8").replaceAll("__WEBHOOK_SECRET__", "test-secret");
  vm.runInContext(source, context);
  return { rows, post(data) { return JSON.parse(context.doPost({ postData: { contents: JSON.stringify(data) } }).text); }, set failWrite(value) { failWrite = value; } };
}

const data = () => ({ id: randomUUID(), secret: "test-secret", name: "Synthetic verification", phone: "+97600000000", event: "erdenet-opening-2026-11", day: "2026-11-28", time: "10:00", consent: true, consentVersion: "erdenet-opening-v1", prize: "umbrella", createdAt: new Date().toISOString(), consentAt: new Date().toISOString(), source: "erdenet-web" });

test("receiver authenticates writes, deduplicates retries and safely stores literal cell text", () => {
  const f = receiver();
  const lead = { ...data(), name: "=IMPORTXML(\"example\")" };
  const first = f.post(lead);
  assert.equal(first.ok, true);
  assert.equal(first.id, lead.id);
  assert.equal(first.requestId, lead.id);
  assert.equal(f.rows.length, 2);
  assert.ok(f.rows[1][2].startsWith("'="));
  assert.ok(f.rows[1][3].startsWith("'+976"));
  assert.equal(f.post(lead).id, first.id);
  assert.equal(f.post({ ...lead, id: randomUUID() }).duplicate, true);
  assert.equal(f.rows.length, 2);
  assert.equal(f.post({ ...data(), secret: "wrong" }).ok, false);
  assert.equal(f.rows.length, 2);
});

test("receiver rejects invalid payloads and never reports success after a storage failure", () => {
  const f = receiver();
  for (const patch of [{ consent: false }, { event: "other-event" }, { phone: "bad" }, { name: "\u0000invalid" }, { id: "bad-id" }]) {
    assert.equal(f.post({ ...data(), ...patch }).ok, false);
  }
  f.failWrite = true;
  assert.equal(f.post(data()).ok, false);
});

test("receiver expands a full sheet without losing the next registration", () => {
  const f = receiver(2);
  assert.equal(f.post(data()).ok, true);
  assert.equal(f.post({ ...data(), phone: "+97600000001" }).ok, true);
  assert.equal(f.rows.length, 3);
});

test("receiver refuses to acknowledge a reused ID with different contact data", () => {
  const f = receiver();
  const lead = data();
  assert.equal(f.post(lead).ok, true);
  assert.equal(f.post({ ...lead, phone: "+97600000001" }).ok, false);
  assert.equal(f.rows.length, 2);
});

test("receiver rejects a new registration for the same phone across days", () => {
  const f = receiver();
  assert.equal(f.post({ ...data(), day: "2026-11-29", time: "17:00" }).ok, true);
  assert.equal(f.post({ ...data(), day: "2026-11-28" }).duplicate, true);
  assert.equal(f.rows.length, 2);
  assert.equal(f.rows[1][5], "'2026-11-29");
  assert.equal(f.rows[1][6], "'17:00");
  assert.equal(f.post({ ...data(), day: "2026-11-29", time: "10:00" }).ok, false);
  assert.equal(f.post({ ...data(), day: "2026-11-30" }).ok, false);
});

test("receiver upgrades a legacy 11-column header row and stores the prize label", () => {
  const r = receiver(1000, { legacyHeaders: true });
  assert.equal(r.post(data()).ok, true);
  assert.equal(r.rows[0][11], "Бэлэг");
  assert.equal(r.rows[1][11], "'Шүхэр");
});

test("receiver rejects an unknown prize and old-event payloads", () => {
  const r = receiver();
  assert.equal(r.post({ ...data(), prize: "car" }).ok, false);
  assert.equal(r.post({ ...data(), event: "erdenet-2026-11" }).ok, false);
  assert.equal(r.post({ ...data(), day: "2026-11-22" }).ok, false);
  assert.equal(r.rows.length, 1);
});

test("receiver reports the prize it stored for a new registration", () => {
  const r = receiver();
  const result = r.post(data());
  assert.equal(result.ok, true);
  assert.equal(result.prize, "umbrella");
});

test("receiver rejects a phone's second registration on another day", () => {
  const r = receiver();
  assert.equal(r.post(data()).prize, "umbrella");
  const second = r.post({ ...data(), day: "2026-11-29", time: "17:00", prize: "gift" });
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(r.rows.length, 2);
});

test("receiver returns the stored prize when the same registration arrives again", () => {
  const r = receiver();
  const first = data();
  r.post(first);
  const again = r.post({ ...first, prize: "gift" });
  assert.equal(again.ok, true);
  assert.equal(again.id, first.id);
  assert.equal(again.prize, "umbrella");
  assert.equal(r.rows.length, 2);
});

test("receiver enforces all four quotas and keeps accepting registrations from the 251st", () => {
  const r = receiver();
  const counts = {};
  for (let i = 0; i < 252; i++) {
    const lead = { ...data(), phone: `+976${String(i).padStart(8, "0")}`, prize: "generalGift" };
    const result = r.post(lead);
    assert.equal(result.ok, true);
    assert.equal(result.prize === "none", i >= 250, `registration ${i + 1}`);
    counts[result.prize] = (counts[result.prize] || 0) + 1;
    assert.equal(r.post(lead).prize, result.prize);
  }
  assert.deepEqual(counts, { umbrella: 50, usb: 25, notebook: 20, gift: 155, none: 2 });
  assert.equal(r.rows.length, 253);
  assert.equal(r.rows[51][11], "'USB багц");
  assert.equal(r.rows[76][11], "'Хуванцар дугаар бичигч");
  assert.equal(r.rows[96][11], "'Дугаар бичигч");
  assert.equal(r.rows[251][11], "'Бэлэг олгогдоогүй");
});

test("receiver ignores the two existing test leads and counts the real lead's legacy gift", () => {
  const r = receiver();
  const ids = ["9c4a6cb0-16ae-4c30-b539-f7f92a3443c5", "fbdea9e6-01c6-4a01-9f4f-544de11b2bc3", "fdb23047-35c4-415c-84f5-dd82a984710d"];
  const labels = ["Тэмдэглэлийн дэвтэр", "Борооны шүхэр", "Гарын бэлэг"];
  ids.forEach((id, i) => r.rows.push([id, "2026-11-17", i < 2 ? "test" : "Мөнхдэлгэр", `+9769000000${i}`, "erdenet-opening-2026-11", "2026-11-28", "12:00", "erdenet-web", "", "", "consent", labels[i]]));
  const counts = {};
  for (let i = 0; i < 250; i++) {
    const result = r.post({ ...data(), phone: `+976${String(i).padStart(8, "0")}` });
    assert.equal(result.ok, true);
    counts[result.prize] = (counts[result.prize] || 0) + 1;
  }
  assert.deepEqual(counts, { umbrella: 50, usb: 25, notebook: 20, gift: 154, none: 1 });
  assert.equal(r.rows[3][11], "'Дугаар бичигч", "the real lead gets a concrete gift label");
  assert.equal(r.rows[1][11], "Тэмдэглэлийн дэвтэр", "test rows remain unchanged");
  assert.equal(r.rows[2][11], "Борооны шүхэр", "test rows remain unchanged");
});
