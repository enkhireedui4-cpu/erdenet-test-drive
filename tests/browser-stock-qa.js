async (page) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const errors = [];
  const clearRegistration = () => page.evaluate(() => {
    for (const store of [localStorage, sessionStorage]) {
      for (const key of Object.keys(store)) if (key.startsWith("sain-erdenet-")) store.removeItem(key);
    }
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://localhost:3210/", { waitUntil: "networkidle" });
  await clearRegistration();
  await page.reload({ waitUntil: "networkidle" });
  const phones = await page.locator('a[href^="tel:"]').evaluateAll(links => links.map(link => link.getAttribute("href")));
  check(phones.length === 4 && phones.every(phone => phone === "tel:+97688088505"), "All contact links dial the new number");
  check((await page.locator(".program-list").textContent()).includes("Урлагийн номер"), "The programme includes the performance");
  check((await page.locator(".program-list").textContent()).includes("QR уншуулж бүртгүүлсэн эхний 250 хүн гарын бэлэгтэй"), "The programme advertises gifts for the first 250 QR registrations");
  check(await page.locator('[data-prize="usb"]').count() === 2, "USB stays visible on the wheel");
  check(await page.locator('[data-prize="generalGift"]').count() === 2, "The general gift stays visible on the wheel");
  await page.route("**/api/leads", route => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "synced", receipt: "z".repeat(32), day: "2026-11-29", time: "17:00", prize: "none" }) }));
  await page.locator('input[name="day"][value="2026-11-29"]').check();
  await page.locator("#name").fill("Synthetic stock verification");
  await page.locator("#phone").fill("00000000");
  await page.locator("#submit-button").click();
  await page.locator("#result-panel").waitFor({ state: "visible" });
  check(await page.locator("#spin-button").isHidden(), "A registration after stock exhaustion must never offer an unwinnable spin");
  check((await page.locator("#result-title").textContent()) === "Та бүртгэгдлээ.", "A no-award registration is confirmed");
  check((await page.locator("#prize-title").textContent()) === "Бэлгийн нөөц дууссан", "The exhausted stock is explained");
  check((await page.locator("#prize-body").textContent()).includes("Та эвентэд бүртгэгдсэн"), "The visitor is invited to attend after a no-award registration");
  await page.reload({ waitUntil: "networkidle" });
  check(await page.locator("#spin-button").isHidden() && await page.locator("#prize-card").isVisible(), "Reload restores the registration without a spin");
  check(errors.length === 0, errors.join("\n"));
  await page.screenshot({ path: "C:/Users/user/OneDrive/Desktop/erdenet-test-drive/test-results/no-award.png", fullPage: true });
  await page.unroute("**/api/leads");
  await clearRegistration();
  await page.reload({ waitUntil: "networkidle" });
  let ready = false;
  const pendingResult = () => ({ status: ready ? "synced" : "pending", receipt: "w".repeat(32), day: "2026-11-29", time: "17:00", prize: ready ? "usb" : "pending" });
  await page.route("**/api/leads", route => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(pendingResult()) }));
  await page.route("**/api/leads/*", route => route.fulfill({ contentType: "application/json", body: JSON.stringify(pendingResult()) }));
  await page.locator('input[name="day"][value="2026-11-29"]').check();
  await page.locator("#name").fill("Synthetic outage verification");
  await page.locator("#phone").fill("00000001");
  await page.locator("#submit-button").click();
  await page.locator("#result-panel").waitFor({ state: "visible", timeout: 2000 });
  check(await page.locator("#spin-button").isHidden() && await page.locator("#prize-card").isHidden(), "An unconfirmed Sheet award must not be revealed");
  check(!(await page.locator("#result-title").textContent()).includes("эргүүлээрэй"), "Pending confirmation must not invite a spin");
  ready = true;
  await page.locator("#retry-button").click();
  await page.locator("#spin-button").waitFor({ state: "visible" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#spin-button").click();
  await page.locator("#prize-card").waitFor({ state: "visible" });
  check((await page.locator("#prize-title").textContent()) === "Таны бэлэг: USB багц", "Only the authoritative Sheet award is revealed after recovery");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.unroute("**/api/leads");
  await page.unroute("**/api/leads/*");
  await clearRegistration();
  return { passed: ["updated contact links and programme", "USB and general gift remain visible", "stock exhaustion confirms registration without a spin", "no-award result survives reload", "Sheet outage hides the spin until the authoritative USB award arrives", "zero runtime errors"], writes: "All registration responses mocked; no live Sheet writes" };
}
