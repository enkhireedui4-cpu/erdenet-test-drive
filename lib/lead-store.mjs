import * as sqlite from "node:sqlite";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { CONSENT_VERSION } from "../public/lead-validation.js";
import { pickPrize as drawPrize, remainingPrizeStock, TEST_LEAD_IDS } from "./prizes.mjs";

const Database = sqlite.Database ?? sqlite.DatabaseSync;

export function createLeadStore(filename, { pickPrize = drawPrize } = {}) {
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY, receipt TEXT NOT NULL UNIQUE, event TEXT NOT NULL, phone TEXT NOT NULL,
      payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','synced')),
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, sheet_id TEXT,
      UNIQUE(event, phone)
    ) STRICT;`);
  const record = row => row ? { ...JSON.parse(row.payload), receipt: row.receipt, status: row.status, attempts: row.attempts, nextAttemptAt: row.next_attempt_at, sheetId: row.sheet_id } : undefined;
  const byId = id => record(db.prepare("SELECT * FROM leads WHERE id = ?").get(id));
  function transaction(accept) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = accept();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  let closed = false;
  return {
    byId,
    byReceipt: receipt => record(db.prepare("SELECT * FROM leads WHERE receipt = ?").get(receipt)),
    accept(data) {
      return transaction(() => {
        const existing = byId(data.requestId);
        if (existing) {
          if (existing.phone !== data.phone || existing.name !== data.name || existing.event !== data.event || existing.day !== data.day || existing.time !== data.time) throw new Error("Request ID conflict");
          return existing;
        }
        const now = new Date().toISOString();
        const sibling = db.prepare("SELECT payload FROM leads WHERE phone = ? AND event LIKE ? LIMIT 1").get(data.phone, `${data.event}:%`);
        if (sibling) throw new Error("Duplicate phone");
        const saved = db.prepare("SELECT payload FROM leads WHERE event LIKE ?").all(`${data.event}:%`).map(row => JSON.parse(row.payload));
        const prize = TEST_LEAD_IDS.includes(data.requestId) ? "none" : pickPrize(remainingPrizeStock(saved, data.event));
        const payload = { id: data.requestId, name: data.name, phone: data.phone, event: data.event, day: data.day, time: data.time, consent: true, consentVersion: CONSENT_VERSION, createdAt: now, consentAt: now, source: "erdenet-web", utmSource: data.utmSource, utmCampaign: data.utmCampaign, prize };
        const eventKey = `${payload.event}:${payload.day}:${payload.time}`;
        db.prepare("INSERT INTO leads(id,receipt,event,phone,payload) VALUES(?,?,?,?,?) ON CONFLICT(event,phone) DO NOTHING")
          .run(payload.id, randomBytes(24).toString("base64url"), eventKey, payload.phone, JSON.stringify(payload));
        return byId(payload.id) ?? record(db.prepare("SELECT * FROM leads WHERE event = ? AND phone = ?").get(eventKey, payload.phone));
      });
    },
    pending: (now = Date.now(), limit = 25) => db.prepare("SELECT * FROM leads WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY rowid LIMIT ?").all(now, limit).map(record),
    markSynced(id, sheetId, prize) {
      return transaction(() => {
        const row = db.prepare("SELECT payload FROM leads WHERE id=?").get(id);
        if (row && prize !== undefined) db.prepare("UPDATE leads SET payload=? WHERE id=?").run(JSON.stringify({ ...JSON.parse(row.payload), prize }), id);
        return db.prepare("UPDATE leads SET status='synced', sheet_id=? WHERE id=?").run(sheetId, id);
      });
    },
    defer(id) {
      const lead = byId(id);
      if (lead?.status === "pending") db.prepare("UPDATE leads SET attempts=attempts+1,next_attempt_at=? WHERE id=?").run(Date.now() + Math.min(300_000, 15_000 * 2 ** Math.min(lead.attempts, 5)), id);
    },
    counts() { return db.prepare("SELECT status,COUNT(*) AS count FROM leads GROUP BY status").all(); },
    close() { if (!closed) { db.close(); closed = true; } },
  };
}
