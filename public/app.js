import { validateLead, EVENT_SLOTS, EVENT_DAYS, prizeLabel } from "/lead-validation.js";

const form = document.querySelector("#lead-form");
const fields = { name: form.elements.name, phone: form.elements.phone };
const panel = document.querySelector("#registration");
const submit = document.querySelector("#submit-button");
const formError = document.querySelector("#form-error");
const live = document.querySelector("#form-status");
const result = document.querySelector("#result-panel");
const retryButton = document.querySelector("#retry-button");
const spinButton = document.querySelector("#spin-button");
const prizeCard = document.querySelector("#prize-card");
const rotor = document.querySelector("#wheel-rotor");
const slices = [...rotor.querySelectorAll(".wheel-slice")];
const OUTBOX_KEY = "sain-erdenet-submitted-v2";
const RECEIPT_KEY = "sain-erdenet-receipt-v2";
const SPUN_KEY = "sain-erdenet-spun-v2";
const LEGACY_KEYS = ["sain-erdenet-submitted-v1", "sain-erdenet-receipt-v1"];
const PRIZE_BODY = "11.29-ний 17:00 цагаас Эрдэнэт шоурумын нээлтэд хүрэлцэн ирж бэлгээ аваарай. Бүртгүүлсэн утасны дугаараа хэлэхэд хангалттай.";
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let busy = false, pollTimer, receipt, submitted, outboxAvailable = true, resultMode = null, spinning = false;
let acceptedSlot = { day: "2026-11-28", time: "" }, acceptedPrize = "";
const chosenTimes = { "2026-11-28": "", "2026-11-29": "17:00" };

const mobileButton = document.querySelector("#mobile-register-button");
const floatingCta = document.querySelector(".mobile-cta");
let stickyFrame = 0;
function updateSticky() {
  const bounds = panel.getBoundingClientRect();
  floatingCta.hidden = !matchMedia("(max-width:760px)").matches || (bounds.top <= innerHeight * .35 && bounds.bottom > 80);
}
window.addEventListener("scroll", () => { if (!stickyFrame) stickyFrame = requestAnimationFrame(() => { updateSticky(); stickyFrame = 0; }); }, { passive: true });
window.addEventListener("resize", updateSticky, { passive: true });
document.fonts.ready.then(updateSticky);
updateSticky();
mobileButton.addEventListener("click", () => {
  const bounds = panel.getBoundingClientRect();
  if (!result.hidden || bounds.top > 160 || bounds.bottom < 100) panel.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  else form.requestSubmit();
});

function slotLabel(day, time) { const d = EVENT_DAYS[day]; return d ? `${d.date} · ${d.weekday}${time ? ` · ${time}` : ""}` : ""; }
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

// The wheel only reveals the prize the server drew; it never decides one.
function spunPrize() { const spun = readStored(SPUN_KEY); return spun && spun.receipt === receipt && prizeLabel(spun.prize) ? spun.prize : ""; }
function landingAngle(prizeId, turns = 0, jitter = 0, randomSlice = true) {
  // Equal slices run clockwise from 12 o'clock; the pointer stays fixed at 0°.
  const sliceAngle = 360 / slices.length;
  const matches = slices.flatMap((slice, i) => slice.dataset.prize === prizeId ? [i] : []);
  const k = randomSlice ? matches[Math.floor(Math.random() * matches.length)] : matches[0];
  return 360 * turns + (360 - (k * sliceAngle + sliceAngle / 2)) + jitter;
}
// A restored reveal rests on a fixed slice so repeated renders never move the wheel.
function restWheel(prizeId) { rotor.style.transition = "none"; rotor.style.transform = `rotate(${landingAngle(prizeId, 0, 0, false)}deg)`; }
function spinTo(prizeId) {
  return new Promise(resolve => {
    const target = landingAngle(prizeId, 6, (Math.random() - 0.5) * (360 / slices.length - 10));
    rotor.style.transition = "none"; rotor.style.transform = "rotate(0deg)";
    if (reduceMotion()) { rotor.style.transform = `rotate(${target}deg)`; resolve(); return; }
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    rotor.getBoundingClientRect();
    requestAnimationFrame(() => {
      rotor.addEventListener("transitionend", finish, { once: true });
      setTimeout(finish, 5600);
      rotor.style.transition = "transform 5s cubic-bezier(.12,.6,.1,1)";
      rotor.style.transform = `rotate(${target}deg)`;
    });
  });
}
function stageTitle(status, stage) {
  const base = status === "synced" ? "Та бүртгэгдлээ." : "Хүсэлтийг хүлээн авлаа.";
  return stage === "spin" ? `${base} Одоо хүрдээ эргүүлээрэй.` : base;
}
function showPrize(prizeId, { animate = false } = {}) {
  const label = prizeLabel(prizeId);
  const noAward = prizeId === "none";
  panel.dataset.stage = "prize";
  spinButton.hidden = true;
  prizeCard.hidden = false;
  document.querySelector("#result-title").textContent = stageTitle(resultMode, "prize");
  document.querySelector("#prize-title").textContent = noAward ? label : `Таны бэлэг: ${label}`;
  document.querySelector("#prize-body").textContent = noAward ? "Та эвентэд бүртгэгдсэн тул сонгосон өдөр, цагтаа хүрэлцэн ирээрэй." : PRIZE_BODY;
  document.querySelector(".prize-note").hidden = noAward;
  if (!animate) return;
  prizeCard.classList.remove("is-revealed"); void prizeCard.offsetWidth; prizeCard.classList.add("is-revealed");
  prizeCard.focus({ preventScroll: true });
  live.textContent = `Таны бэлэг: ${label}. ${PRIZE_BODY}`;
}
spinButton.addEventListener("click", async () => {
  if (spinning || !prizeLabel(acceptedPrize)) return;
  spinning = true; spinButton.disabled = true;
  live.textContent = "Хүрд эргэж байна.";
  await spinTo(acceptedPrize);
  saveStored(SPUN_KEY, { receipt, prize: acceptedPrize });
  spinning = false;
  showPrize(acceptedPrize, { animate: true });
});

function showResult(status, focus = true) {
  const previousStage = panel.dataset.stage, previousStatus = resultMode;
  resultMode = status;
  mobileButton.textContent = "Бүртгэлийг харах";
  const synced = status === "synced";
  document.querySelector("#form-content").hidden = true; result.hidden = false;
  // The spin record only marks the reveal as done; the prize shown is the server's.
  const spun = spunPrize();
  const waiting = !prizeLabel(acceptedPrize);
  const prize = acceptedPrize === "none" ? "none" : spun ? (prizeLabel(acceptedPrize) ? acceptedPrize : spun) : "";
  const stage = waiting ? "waiting" : prize ? "prize" : "spin";
  if (!spinning) panel.dataset.stage = stage;
  document.querySelector("#result-symbol").textContent = synced ? "✓" : "…";
  const title = stageTitle(status, spinning ? "spin" : stage);
  document.querySelector("#result-title").textContent = title;
  const message = synced ? "" : "Бүртгэлийг баталгаажуулж байна.\nДахин мэдээллээ оруулах шаардлагагүй.";
  const description = document.querySelector("#result-description");
  description.textContent = message; description.hidden = !message;
  document.querySelector("#result-slot").textContent = slotLabel(acceptedSlot.day, acceptedSlot.time);
  retryButton.hidden = synced;
  if (!spinning) {
    if (waiting) { spinButton.hidden = true; prizeCard.hidden = true; }
    else if (prize) { if (prize !== "none" && (previousStage !== "prize" || spun !== prize)) restWheel(prize); showPrize(prize); }
    else { spinButton.hidden = false; spinButton.disabled = !prizeLabel(acceptedPrize); prizeCard.hidden = true; }
  }
  // Polls that change nothing must not replace an earlier announcement (such as the prize).
  if (status !== previousStatus) live.textContent = `${title} ${message}`.trim();
  requestAnimationFrame(updateSticky);
  if (focus) result.focus({ preventScroll: true });
  if (synced) { clearTimeout(pollTimer); removeStored(OUTBOX_KEY); submitted = null; form.reset(); }
}
function acceptResponse(body) {
  if (!["pending", "synced"].includes(body?.status) || !EVENT_SLOTS[body.day]?.includes(body.time) || !(prizeLabel(body.prize) || (body.status === "pending" && body.prize === "pending"))) return false;
  acceptedSlot = { day: body.day, time: body.time };
  acceptedPrize = body.prize;
  return true;
}
async function checkStatus(focus = false) {
  if (!receipt) return;
  clearTimeout(pollTimer);
  try {
    const response = await fetch(`/api/leads/${receipt}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (response.ok) {
      const body = await response.json();
      if (acceptResponse(body)) {
        const saved = readStored(RECEIPT_KEY);
        if (saved?.receipt === receipt) saveStored(RECEIPT_KEY, { ...saved, ...acceptedSlot, prize: acceptedPrize, status: body.status });
        showResult(body.status, focus);
        if (body.status === "pending") pollTimer = setTimeout(() => checkStatus(), 10_000);
        return;
      }
    }
  } catch { /* The server retains an acknowledged pending lead during a browser outage. */ }
  retryButton.hidden = false;
  const description = document.querySelector("#result-description");
  description.hidden = false;
  description.textContent = "Баталгаажуулалтыг түр шалгаж чадсангүй.\nХолболтоо шалгаад дахин оролдоорой.";
  pollTimer = setTimeout(() => checkStatus(), 20_000);
}
async function send(payload, focus = true) {
  if (busy) return;
  loading(true); error("");
  try {
    const response = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000), cache: "no-store" });
    const body = await response.json();
    if (response.status === 409 && body.code === "duplicate_phone") {
      removeStored(OUTBOX_KEY); submitted = null;
      fieldError("phone", "Энэ дугаар бүртгэгдсэн байна.");
      error("Энэ дугаар бүртгэгдсэн байна.");
      if (focus) fields.phone.focus();
      return;
    }
    if (!response.ok || !/^[A-Za-z0-9_-]{32}$/.test(body.receipt) || !acceptResponse(body)) {
      if (body.errors) for (const name of Object.keys(fields)) fieldError(name, body.errors[name]);
      throw new Error(response.status === 429 ? "Түр хүлээгээд дахин оролдоно уу." : "Хүсэлтийг баталгаажуулж чадсангүй. Дахин оролдоорой.");
    }
    receipt = body.receipt;
    saveStored(RECEIPT_KEY, { receipt, ...acceptedSlot, prize: acceptedPrize, status: body.status, expires: Date.now() + 14 * 86400_000 });
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
for (const [name, field] of Object.entries(fields)) field.addEventListener("input", () => fieldError(name, ""));
retryButton.addEventListener("click", () => { retryButton.disabled = true; void checkStatus(true).finally(() => { retryButton.disabled = false; }); });
window.addEventListener("online", () => { if (receipt) void checkStatus(); else if (submitted && !busy) void send(submitted, false); });
window.addEventListener("pagehide", () => clearTimeout(pollTimer));
window.addEventListener("pageshow", event => { if (event.persisted && receipt) void checkStatus(); });

// Data from the earlier MEGA TEST DRIVE page (other dates) never carries over.
LEGACY_KEYS.forEach(removeStored);
const savedReceipt = readStored(RECEIPT_KEY);
const savedSubmission = readStored(OUTBOX_KEY);
if (savedReceipt && savedReceipt.expires > Date.now() && /^[A-Za-z0-9_-]{32}$/.test(savedReceipt.receipt)) {
  receipt = savedReceipt.receipt;
  if (EVENT_SLOTS[savedReceipt.day]?.includes(savedReceipt.time)) acceptedSlot = { day: savedReceipt.day, time: savedReceipt.time };
  if (prizeLabel(savedReceipt.prize)) acceptedPrize = savedReceipt.prize;
  // A confirmed registration is final; only a pending one keeps asking the server.
  if (savedReceipt.status === "synced") showResult("synced", false);
  else { acceptedPrize = "pending"; showResult("pending", false); void checkStatus(); }
} else if (savedSubmission?.expires > Date.now() && validateLead(savedSubmission).ok) {
  submitted = savedSubmission;
  form.querySelector(`[name="day"][value="${submitted.day}"]`).checked = true;
  chosenTimes[submitted.day] = submitted.time; renderTimes(submitted.day);
  fields.name.value = submitted.name; fields.phone.value = submitted.phone;
  if (navigator.onLine) void send(submitted, false);
  else error("Илгээж байсан хүсэлт байна. Холболт сэргэхэд дахин илгээнэ.");
} else { removeStored(OUTBOX_KEY); removeStored(RECEIPT_KEY); removeStored(SPUN_KEY); }
