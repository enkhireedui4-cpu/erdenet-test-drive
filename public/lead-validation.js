export const EVENT_ID = "erdenet-opening-2026-11";
export const EVENT_SLOTS = Object.freeze({ "2026-11-28": Object.freeze(["10:00", "12:00", "14:00", "16:00", "18:00"]), "2026-11-29": Object.freeze(["17:00"]) });
export const EVENT_DAYS = Object.freeze({
  "2026-11-28": Object.freeze({ date: "11.28", weekday: "Бямба", title: "Тест драйв өдөрлөг" }),
  "2026-11-29": Object.freeze({ date: "11.29", weekday: "Ням", title: "Нээлтийн үйл ажиллагаа" }),
});
export const CONSENT_VERSION = "erdenet-opening-v1";
// The server draws the prize; the browser only reveals it on the wheel.
export const PRIZES = Object.freeze([
  Object.freeze({ id: "umbrella", label: "Борооны шүхэр", short: "Шүхэр" }),
  Object.freeze({ id: "usb", label: "USB багц", short: "USB багц" }),
  Object.freeze({ id: "notebook", label: "Тэмдэглэлийн дэвтэр", short: "Дэвтэр" }),
  Object.freeze({ id: "gift", label: "Гарын бэлэг", short: "Гарын бэлэг" }),
]);
export const prizeLabel = id => PRIZES.find(prize => prize.id === id)?.label;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizePhone(value) {
  if (typeof value !== "string" || !/^[+\d\s()-]+$/.test(value) || value.length > 32) return null;
  let digits = value.replace(/[\s()-]/g, "");
  if (/^\+?976\d{8}$/.test(digits)) digits = digits.replace(/^\+?976/, "");
  return /^\d{8}$/.test(digits) ? `+976${digits}` : null;
}

export function validateLead(input) {
  const errors = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: { form: "Мэдээллээ дахин шалгана уу." } };
  const rawName = typeof input.name === "string" ? input.name : "";
  const name = rawName.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(rawName)) errors.name = "Нэрээ зөв оруулна уу.";
  const phone = normalizePhone(input.phone);
  if (!phone) errors.phone = "Утасны 8 оронтой дугаараа оруулна уу.";
  const day = input.day;
  if (!Object.hasOwn(EVENT_SLOTS, day)) errors.day = "Ирэх өдрөө сонгоно уу.";
  if (!EVENT_SLOTS[day]?.includes(input.time)) errors.time = "Ирэх цагаа сонгоно уу.";
  if (input.consent !== true) errors.consent = "Холбогдох зөвшөөрлөө сонгоно уу.";
  if (typeof input.requestId !== "string" || !UUID.test(input.requestId)) errors.form = "Хуудсаа шинэчлээд дахин оролдоно уу.";
  if (input.website !== undefined && input.website !== "") errors.form = "Мэдээллээ дахин шалгана уу.";
  if (Object.keys(errors).length) return { ok: false, errors };
  const attribution = key => typeof input[key] === "string" ? input[key].replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 100) : "";
  return { ok: true, data: { requestId: input.requestId.toLowerCase(), name, phone, day, time: input.time, consent: true, event: EVENT_ID, utmSource: attribution("utmSource"), utmCampaign: attribution("utmCampaign") } };
}
