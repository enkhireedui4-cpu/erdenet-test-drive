import { validateLead, EVENT_SLOTS } from "/lead-validation.js";

const form = document.querySelector("#lead-form");
const fields = { name: form.elements.name, phone: form.elements.phone };
const submit = document.querySelector("#submit-button");
const formError = document.querySelector("#form-error");
const live = document.querySelector("#form-status");
const result = document.querySelector("#result-panel");
const retryButton = document.querySelector("#retry-button");
const OUTBOX_KEY = "sain-erdenet-submitted-v1";
const RECEIPT_KEY = "sain-erdenet-receipt-v1";
let busy = false, pollTimer, receipt, submitted, outboxAvailable = true, resultMode = null;
const mobileButton = document.querySelector("#mobile-register-button");
const floatingCta = document.querySelector(".mobile-cta");
let stickyFrame = 0;
function updateSticky() {
  const bounds = document.querySelector("#registration").getBoundingClientRect();
  floatingCta.hidden = !matchMedia("(max-width:760px)").matches || (bounds.top <= innerHeight * .35 && bounds.bottom > 80);
}
window.addEventListener("scroll", () => { if (!stickyFrame) stickyFrame = requestAnimationFrame(() => { updateSticky(); stickyFrame = 0; }); }, { passive: true });
window.addEventListener("resize", updateSticky, { passive: true });
document.fonts.ready.then(updateSticky);
updateSticky();
mobileButton.addEventListener("click", () => {
  const panel = document.querySelector("#registration"), bounds = panel.getBoundingClientRect();
  if (!result.hidden || bounds.top > 160 || bounds.bottom < 100) panel.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  else form.requestSubmit();
});
let acceptedSlot = { day: "2026-11-22", time: "" };
const chosenTimes = { "2026-11-21": "17:00", "2026-11-22": "" };

function slotLabel(day, time) { return `11-р сарын ${day === "2026-11-21" ? "21" : "22"}${time ? ` · ${time}` : ""}`; }
function timeError(message) { const el = document.querySelector("#time-error"); el.textContent = message || ""; el.hidden = !message; document.querySelector("#time-fieldset").setAttribute("aria-invalid", message ? "true" : "false"); }
function updateSummary() { const day = form.elements.day.value, time = form.elements.time?.value || ""; document.querySelector("#selected-slot").textContent = time ? slotLabel(day, time) : "Цагаа сонгоно уу"; }
function renderTimes(day) {
  const times = EVENT_SLOTS[day];
  document.querySelector("#time-choices").innerHTML = times.map(time => `<label class="choice-label"><input class="choice-radio" type="radio" name="time" value="${time}" ${chosenTimes[day] === time ? "checked" : ""}><span class="time-card">${time}</span></label>`).join("");
  timeError(""); updateSummary();
}
form.addEventListener("change", event => { if (event.target.name === "day") renderTimes(event.target.value); else if (event.target.name === "time") { chosenTimes[form.elements.day.value] = event.target.value; timeError(""); updateSummary(); } });

function readStored(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function saveStored(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
function removeStored(key) { try { localStorage.removeItem(key); } catch { /* A disabled browser store does not prevent a server write. */ } }
function error(message) { formError.textContent = message; formError.hidden = !message; live.textContent = message || ""; }
function fieldError(name, message) {
  const target = document.querySelector(`#${name}-error`);
  target.textContent = message || ""; target.hidden = !message;
  fields[name].setAttribute("aria-invalid", message ? "true" : "false");
}
function loading(value) {
  busy = value; submit.disabled = value; form.setAttribute("aria-busy", String(value));
  mobileButton.disabled = value;
  mobileButton.textContent = value ? "Бүртгэж байна…" : resultMode ? "Бүртгэлийг харах" : "Бүртгүүлэх";
  document.querySelector("#submit-label").textContent = value ? "Бүртгэж байна…" : "Бүртгүүлэх";
  document.querySelector(".button-loader").hidden = !value;
  if (value) live.textContent = "Хүсэлтийг илгээж байна.";
}
function showResult(status, focus = true) {
  resultMode = status;
  mobileButton.textContent = "Бүртгэлийг харах";
  const synced = status === "synced";
  document.querySelector("#form-content").hidden = true; result.hidden = false;
  requestAnimationFrame(updateSticky);
  document.querySelector("#result-symbol").textContent = synced ? "✓" : "…";
  document.querySelector("#result-title").textContent = synced ? "Та бүртгэгдлээ." : "Хүсэлтийг хүлээн авлаа.";
  const message = synced ? (acceptedSlot.day === "2026-11-21" ? "Шоурумын нээлтээр Эрдэнэтэд уулзацгаая.\nШаардлагатай мэдээллээр бид тантай холбогдоно." : "Test Drive-аар Эрдэнэтэд уулзацгаая.\nШаардлагатай мэдээллээр бид тантай холбогдоно.") : "Бүртгэлийг баталгаажуулж байна.\nДахин мэдээллээ оруулах шаардлагагүй.";
  document.querySelector("#result-slot").textContent = slotLabel(acceptedSlot.day, acceptedSlot.time);
  document.querySelector("#result-description").textContent = message;
  retryButton.hidden = synced; live.textContent = `${document.querySelector("#result-title").textContent} ${message}`;
  if (focus) result.focus({ preventScroll: true });
  if (synced) { clearTimeout(pollTimer); removeStored(OUTBOX_KEY); submitted = null; form.reset(); }
}
async function checkStatus(focus = false) {
  if (!receipt) return;
  clearTimeout(pollTimer);
  try {
    const response = await fetch(`/api/leads/${receipt}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (response.ok) {
      const body = await response.json();
      if ((body.status === "synced" || body.status === "pending") && EVENT_SLOTS[body.day]?.includes(body.time)) {
        acceptedSlot = { day: body.day, time: body.time };
        showResult(body.status, focus);
        if (body.status === "pending") pollTimer = setTimeout(() => checkStatus(), 10_000);
        return;
      }
    }
  } catch { /* The server retains an acknowledged pending lead during a browser outage. */ }
  retryButton.hidden = false;
  document.querySelector("#result-description").textContent = "Баталгаажуулалтыг түр шалгаж чадсангүй.\nХолболтоо шалгаад дахин оролдоорой.";
  pollTimer = setTimeout(() => checkStatus(), 20_000);
}
async function send(payload, focus = true) {
  if (busy) return;
  loading(true); error("");
  try {
    const response = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000), cache: "no-store" });
    const body = await response.json();
    if (!response.ok || !["pending", "synced"].includes(body.status) || !/^[A-Za-z0-9_-]{32}$/.test(body.receipt) || !EVENT_SLOTS[body.day]?.includes(body.time)) {
      if (body.errors) for (const name of Object.keys(fields)) fieldError(name, body.errors[name]);
      throw new Error(response.status === 429 ? "Түр хүлээгээд дахин оролдоно уу." : "Хүсэлтийг баталгаажуулж чадсангүй. Дахин оролдоорой.");
    }
    receipt = body.receipt;
    acceptedSlot = { day: body.day, time: body.time };
    saveStored(RECEIPT_KEY, { receipt, ...acceptedSlot, expires: Date.now() + 7 * 86400_000 });
    removeStored(OUTBOX_KEY); submitted = null;
    showResult(body.status, focus);
    if (body.status === "pending") pollTimer = setTimeout(() => checkStatus(), 5000);
  } catch (failure) {
    const warning = outboxAvailable ? "" : " Энэ хөтөч түр хадгалах боломжгүй байна. Амжилттай илгээх хүртэл хуудсаа бүү хаагаарай.";
    error((navigator.onLine ? (failure.name === "TimeoutError" || failure.name === "TypeError" ? "Холболт тасарлаа. Мэдээллээ дахин оруулахгүйгээр дахин илгээнэ үү." : failure.message) : "Интернэт холболт алга. Холбогдоход таны хүсэлтийг дахин илгээнэ.") + warning);
  } finally { loading(false); }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  if (busy) return;
  const params = new URLSearchParams(location.search);
  const contact = { name: fields.name.value, phone: fields.phone.value, day: form.elements.day.value, time: form.elements.time?.value || "", consent: true, website: form.elements.website.value, utmSource: params.get("utm_source") || "", utmCampaign: params.get("utm_campaign") || "" };
  const same = submitted && submitted.name === contact.name && submitted.phone === contact.phone && submitted.day === contact.day && submitted.time === contact.time && submitted.consent === contact.consent;
  const input = { ...contact, requestId: same ? submitted.requestId : crypto.randomUUID() };
  const validated = validateLead(input);
  for (const name of Object.keys(fields)) fieldError(name, validated.errors?.[name]);
  timeError(validated.errors?.time);
  error(validated.errors?.form || "");
  if (!validated.ok) { if (validated.errors.time) form.querySelector('[name="time"]').focus(); else { const first = Object.keys(fields).find(name => validated.errors[name]); if (first) fields[first].focus(); } return; }
  submitted = { ...input, expires: Date.now() + 7 * 86400_000 };
  // Persist only after the visitor explicitly submits a valid, consented payload.
  outboxAvailable = saveStored(OUTBOX_KEY, submitted);
  void send(input);
});
for (const [name, field] of Object.entries(fields)) field.addEventListener(name === "consent" ? "change" : "input", () => fieldError(name, ""));
retryButton.addEventListener("click", () => { retryButton.disabled = true; void checkStatus(true).finally(() => { retryButton.disabled = false; }); });
window.addEventListener("online", () => { if (receipt) void checkStatus(); else if (submitted && !busy) void send(submitted, false); });
window.addEventListener("pagehide", () => clearTimeout(pollTimer));
window.addEventListener("pageshow", event => { if (event.persisted && receipt) void checkStatus(); });

const savedReceipt = readStored(RECEIPT_KEY);
const savedSubmission = readStored(OUTBOX_KEY);
if (savedReceipt && savedReceipt.expires > Date.now() && /^[A-Za-z0-9_-]{32}$/.test(savedReceipt.receipt)) {
  receipt = savedReceipt.receipt;
  if (EVENT_SLOTS[savedReceipt.day]?.includes(savedReceipt.time)) acceptedSlot = { day: savedReceipt.day, time: savedReceipt.time };
  showResult("pending", false);
  void checkStatus();
} else if (savedSubmission?.expires > Date.now() && validateLead(savedSubmission).ok) {
  submitted = savedSubmission;
  form.querySelector(`[name="day"][value="${submitted.day}"]`).checked = true;
  chosenTimes[submitted.day] = submitted.time; renderTimes(submitted.day);
  fields.name.value = submitted.name; fields.phone.value = submitted.phone;
  if (navigator.onLine) void send(submitted, false);
  else error("Илгээж байсан хүсэлт байна. Холболт сэргэхэд дахин илгээнэ.");
} else { removeStored(OUTBOX_KEY); removeStored(RECEIPT_KEY); }
