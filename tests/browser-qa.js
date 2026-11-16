async (page) => {
  const base = "http://localhost:3210/";
  const root = "C:/Users/user/OneDrive/Desktop/erdenet-test-drive/test-results/";
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const reports = [];
  const errors = [];
  const KEYS = ["sain-erdenet-submitted-v2", "sain-erdenet-receipt-v2", "sain-erdenet-spun-v2"];
  const stage = () => page.locator("#registration").getAttribute("data-stage");
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base, { waitUntil: "networkidle" });

  // Old MEGA TEST DRIVE storage must never surface, and its personal data is purged.
  await page.evaluate(keys => {
    keys.forEach(key => localStorage.removeItem(key));
    localStorage.setItem("sain-erdenet-receipt-v1", JSON.stringify({ receipt: "b".repeat(32), day: "2026-11-22", time: "10:00", expires: Date.now() + 86400_000 }));
    localStorage.setItem("sain-erdenet-submitted-v1", JSON.stringify({ name: "Old visitor", phone: "99112233" }));
  }, KEYS);
  let mode = "failure", status = "pending", selectedDay = "2026-11-29", selectedTime = "17:00";
  const ids = [];
  await page.route("**/api/leads", async route => {
    const payload = route.request().postDataJSON(); ids.push(payload.requestId); selectedDay = payload.day; selectedTime = payload.time;
    if (mode === "failure") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Unavailable" }) });
    return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ status: "pending", receipt: "a".repeat(32), day: payload.day, time: payload.time, prize: "notebook" }) });
  });
  let statusCalls = 0;
  await page.route("**/api/leads/*", route => { statusCalls++; return route.fulfill({ contentType: "application/json", body: JSON.stringify({ status, day: selectedDay, time: selectedTime, prize: "notebook" }) }); });
  await page.reload({ waitUntil: "networkidle" });
  check(await page.locator("#form-content").isVisible() && await page.locator("#result-panel").isHidden(), "A v1 receipt must not show a result");
  check(await stage() === "form", "The page starts in the form stage");
  check(await page.evaluate(() => localStorage.getItem("sain-erdenet-submitted-v1") === null && localStorage.getItem("sain-erdenet-receipt-v1") === null), "Legacy v1 browser data must be removed");
  reports.push("v1 storage ignored and purged");

  const button = page.locator("#submit-button");
  await button.click();
  check(await page.locator("[aria-invalid=true]").count() === 3, "Empty input must identify time, name and phone");
  check(await page.evaluate(() => document.activeElement.name === "time"), "Focus must move to the first missing time option");
  await page.locator("#day-29").click();
  check(await page.locator('[name="time"]').count() === 1 && await page.locator('[name="time"]').inputValue() === "17:00", "Opening day must have only 17:00");
  check(await page.locator('[name="time"]:checked').count() === 1, "The only opening slot is preselected");
  await page.locator("#day-28").click();
  check(await page.locator('[name="time"]').count() === 5, "Test-drive day must have five slots");
  await page.locator('[name="time"][value="16:00"]').click();
  check((await page.locator("#selected-slot").textContent()) === "11.28 · Бямба · 16:00", "Chosen day and time must appear in the summary");
  await page.locator("#day-29").click();
  check((await page.locator("#selected-slot").textContent()) === "11.29 · Ням · 17:00", "Opening summary");
  await page.getByLabel("Таны нэр", { exact: true }).fill("Synthetic browser verification");
  await page.getByRole("textbox", { name: "Утасны дугаар", exact: true }).fill("00000000");
  await page.locator("#phone").press("Tab");
  check(await page.locator("#submit-button").evaluate(el => document.activeElement === el), "Keyboard must reach submit without honeypot focus");
  check(await page.locator('input[type="checkbox"]').count() === 0, "Contact permission must not require a checkbox");
  await button.click();
  await page.locator("#form-error").waitFor({ state: "visible" });
  check(await page.locator("#name").inputValue() === "Synthetic browser verification", "Server failure must preserve contact input");
  check(await button.isEnabled(), "Server failure must allow retry");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sain-erdenet-submitted-v2")));
  check(stored?.consent === true && stored.requestId === ids[0], "Consented request ID must be stored before POST");
  reports.push("empty validation, 11.28/11.29 slots, keyboard order, failure preserves fields and submitted ID");

  mode = "pending";
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#result-panel").waitFor({ state: "visible" });
  check(ids.length === 2 && ids[0] === ids[1], "Reload must retry the original request ID");
  check(await stage() === "spin", "A received registration opens the spin stage");
  check((await page.locator("#result-title").textContent()) === "Хүсэлтийг хүлээн авлаа. Одоо хүрдээ эргүүлээрэй.", "Durable pending must not say registered");
  check(await page.evaluate(() => localStorage.getItem("sain-erdenet-submitted-v2")) === null, "Server receipt must clear contact data from browser outbox");
  status = "synced";
  await page.locator("#retry-button").click();
  await page.getByRole("heading", { name: "Та бүртгэгдлээ. Одоо хүрдээ эргүүлээрэй." }).waitFor();
  check((await page.locator("#result-slot").textContent()) === "11.29 · Ням · 17:00", "Confirmation must preserve the actual day and time");
  reports.push("reload retries same ID, pending differs from completed, checked acknowledgement confirms");

  const started = Date.now();
  await page.locator("#spin-button").click();
  check(await page.locator("#spin-button").isDisabled() || await stage() === "prize", "Spin button locks while spinning");
  await page.waitForFunction(() => document.querySelector("#registration").dataset.stage === "prize", null, { timeout: 7000 });
  const spinMs = Date.now() - started;
  check(spinMs > 3000, `A normal spin must animate (took ${spinMs}ms)`);
  check((await page.locator("#prize-title").textContent()) === "Таны бэлэг: Тэмдэглэлийн дэвтэр", "Prize card names the server-drawn prize");
  const landed = await page.evaluate(() => {
    const [a, b] = getComputedStyle(document.querySelector("#wheel-rotor")).transform.match(/-?[\d.e]+/g).map(Number);
    const rotation = Math.atan2(b, a) * 180 / Math.PI;
    return [...document.querySelectorAll(".wheel-slice")].filter((slice, i) => {
      const angle = ((i * 45 + 22.5 + rotation) % 360 + 540) % 360 - 180;
      return Math.abs(angle) <= 22.5;
    }).map(slice => slice.dataset.prize);
  });
  check(landed.length === 1 && landed[0] === "notebook", `The pointer must rest on a notebook slice (got ${landed})`);
  check(await page.locator("#spin-button").isHidden(), "Spin button disappears after the reveal");
  check((await page.locator("#form-status").textContent()).includes("Тэмдэглэлийн дэвтэр"), "The prize is announced to screen readers");
  reports.push(`spin lands on the server prize (${spinMs}ms)`);

  statusCalls = 0;
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#prize-card").waitFor({ state: "visible" });
  check(await stage() === "prize" && await page.locator("#spin-button").isHidden(), "Reload shows the same prize without a second spin");
  await page.waitForTimeout(600);
  check(statusCalls === 0, `A confirmed registration must not poll the status endpoint after reload (${statusCalls} calls)`);
  check((await page.locator("#prize-title").textContent()) === "Таны бэлэг: Тэмдэглэлийн дэвтэр", "Reload keeps the same prize");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#registration").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector("#registration").scrollIntoView({ block: "start" }));
  await page.screenshot({ path: `${root}prize-390.png` });
  reports.push("reload restores the revealed prize");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => localStorage.removeItem("sain-erdenet-spun-v2"));
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#spin-button").waitFor({ state: "visible" });
  const quick = Date.now();
  await page.locator("#spin-button").click();
  await page.waitForFunction(() => document.querySelector("#registration").dataset.stage === "prize", null, { timeout: 2000 });
  check(Date.now() - quick < 500, "Reduced motion reveals the prize without the spin animation");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  reports.push("reduced motion reveals instantly");

  // While a lead stays pending, status polls must not move the wheel or replace the prize announcement.
  status = "pending";
  await page.evaluate(() => {
    localStorage.removeItem("sain-erdenet-spun-v2");
    const saved = JSON.parse(localStorage.getItem("sain-erdenet-receipt-v2"));
    localStorage.setItem("sain-erdenet-receipt-v2", JSON.stringify({ ...saved, status: "pending" }));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#spin-button").waitFor({ state: "visible" });
  await page.locator("#spin-button").click();
  await page.waitForFunction(() => document.querySelector("#registration").dataset.stage === "prize", null, { timeout: 7000 });
  const snapshot = () => page.evaluate(() => ({ transform: getComputedStyle(document.querySelector("#wheel-rotor")).transform, live: document.querySelector("#form-status").textContent }));
  const revealed = await snapshot();
  await page.waitForTimeout(11_500);
  const afterPoll = await snapshot();
  check(afterPoll.transform === revealed.transform, `A pending poll moved the wheel (${revealed.transform} -> ${afterPoll.transform})`);
  check(afterPoll.live === revealed.live && afterPoll.live.includes("Тэмдэглэлийн дэвтэр"), "A pending poll replaced the prize announcement");
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#prize-card").waitFor({ state: "visible" });
  const reloaded = await snapshot();
  await page.waitForTimeout(800);
  check((await snapshot()).transform === reloaded.transform, "Reloading while pending must not redraw the wheel twice");
  reports.push("pending polls leave the revealed wheel and announcement alone");

  await page.evaluate(keys => keys.forEach(key => localStorage.removeItem(key)), KEYS);
  await page.unroute("**/api/leads"); await page.unroute("**/api/leads/*");
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height, name] of [[1440, 1000, "desktop"], [390, 844, "mobile-390"], [320, 740, "mobile-320"]]) {
    await page.setViewportSize({ width, height });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
    await page.screenshot({ path: `${root}${name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const sticky = page.locator("#mobile-register-button");
  check(await sticky.isVisible(), "Red registration button must be visible on mobile from page entry");
  const color = await sticky.evaluate(el => getComputedStyle(el).backgroundColor);
  check(color === "rgb(224, 16, 42)", `Bottom CTA must use the button red (got ${color})`);
  const contrast = await page.evaluate(() => {
    const lum = rgb => { const [r, g, b] = rgb.match(/[0-9]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
    const ratio = el => { const s = getComputedStyle(el); const [a, b] = [lum(s.color), lum(s.backgroundColor)].sort((x, y) => y - x); return (a + .05) / (b + .05); };
    return { submit: ratio(document.querySelector("#submit-button")), mobile: ratio(document.querySelector("#mobile-register-button")) };
  });
  check(contrast.submit >= 4.5 && contrast.mobile >= 4.5, `Red buttons need 4.5:1 text contrast (submit ${contrast.submit.toFixed(2)}, mobile ${contrast.mobile.toFixed(2)})`);
  await sticky.click();
  await page.waitForFunction(() => document.querySelector("#registration").getBoundingClientRect().top < 160);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  check(await sticky.isHidden(), "Floating CTA must hide at the form so it cannot cover inputs");
  check(errors.length === 0, `Browser runtime errors: ${errors.join(", ")}`);
  reports.push("desktop, 390px, 320px: no horizontal overflow; zero runtime errors");
  return { passed: reports, googleWrites: "Mocked for UI QA only; live Google receiver not configured." };
}
