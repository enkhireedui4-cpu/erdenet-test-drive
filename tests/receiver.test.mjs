import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";

function receiver(initialMaxRows = 1000) {
  const rows = [["Бүртгэлийн ID", "Бүртгэсэн огноо", "Нэр", "Утас", "Эвент", "Өдөр", "Цаг", "Эх сурвалж", "UTM source", "UTM campaign", "Зөвшөөрөл"]];
  let locked = false, failWrite = false, maxRows = initialMaxRows;
  const sheet = {
    getLastRow: () => rows.length,
    getMaxRows: () => maxRows,
    insertRowsAfter: (after, count) => { assert.equal(after, maxRows); maxRows += count; },
    getRange: (row, column, height = 1, width = 1) => ({
      getValues: () => Array.from({ length: height }, (_, i) => rows[row - 1 + i]?.slice(column - 1, column - 1 + width) ?? Array(width).fill("")),
      setNumberFormat() { return this; },
      setValues(values) { if (failWrite) throw new Error("quota"); if (row + values.length - 1 > maxRows) throw new Error("Rows out of bounds"); values.forEach((r, i) => { rows[row - 1 + i] = r; }); return this; },
    }),
  };
  const context = vm.createContext({
    ContentService: { MimeType: { JSON: "JSON" }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (locked) return false; locked = true; return true; }, releaseLock: () => { locked = false; } }) },
    SpreadsheetApp: { openById: id => { assert.equal(id, "1argV8PktHaKNvW5_iK0UICcwOkHGDJtEq__PwSOGs2k"); return { getSheetByName: name => { assert.equal(name, "Sheet1"); return sheet; } }; }, flush() { if (failWrite) throw new Error("quota"); } },
    Utilities: { formatDate: () => "2026-11-16 12:00:00" },
  });
  const source = readFileSync(new URL("../apps-script/Code.gs.template", import.meta.url), "utf8").replaceAll("__WEBHOOK_SECRET__", "test-secret");
  vm.runInContext(source, context);
  return { rows, post(data) { return JSON.parse(context.doPost({ postData: { contents: JSON.stringify(data) } }).text); }, set failWrite(value) { failWrite = value; } };
}

const data = () => ({ id: randomUUID(), secret: "test-secret", name: "Synthetic verification", phone: "+97600000000", event: "erdenet-2026-11", day: "2026-11-22", time: "10:00", consent: true, consentVersion: "erdenet-test-drive-v1", createdAt: new Date().toISOString(), consentAt: new Date().toISOString(), source: "erdenet-web" });

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
  assert.equal(f.post({ ...lead, id: randomUUID() }).id, first.id);
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

test("receiver stores the chosen day and allows one registration per phone on each day", () => {
  const f = receiver();
  assert.equal(f.post({ ...data(), day: "2026-11-21", time: "17:00" }).ok, true);
  assert.equal(f.post({ ...data(), day: "2026-11-22" }).ok, true);
  assert.equal(f.rows.length, 3);
  assert.equal(f.rows[1][5], "'2026-11-21");
  assert.equal(f.rows[2][5], "'2026-11-22");
  assert.equal(f.rows[1][6], "'17:00");
  assert.equal(f.rows[2][6], "'10:00");
  assert.equal(f.post({ ...data(), day: "2026-11-21", time: "10:00" }).ok, false);
  assert.equal(f.post({ ...data(), day: "2026-11-23" }).ok, false);
});
