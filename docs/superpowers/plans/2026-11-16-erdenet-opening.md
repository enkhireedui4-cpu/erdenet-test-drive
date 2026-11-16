# Erdenet Branch Opening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the MEGA TEST DRIVE page into the "Сайн Моторс Эрдэнэт салбарын нээлт" page. It gets new dates, the ЭРДЭНЭТ SHOWROOM logo, a dusk-poster design and a server-drawn prize wheel. The prize travels with the lead into the Google Sheet.

**Architecture:** The no-dependency Node 24 server is kept, along with its SQLite outbox and the Apps Script receiver.
The event constants and prize list live in the shared browser/server module `public/lead-validation.js`.
The store draws a prize once per phone and the API returns it. The receiver writes it to a new column, `Бэлэг`.
The page is static HTML/CSS/JS, and the wheel is an inline SVG rotated by CSS.

**Tech Stack:** Node 24 (`node:http`, `node:sqlite`, `node:test`), vanilla ES modules, CSS, Google Apps Script. Browser QA uses Playwright (the `playwright-core` + system Chrome runner from this session).

**Spec:** `docs/superpowers/specs/2026-11-16-erdenet-opening-design.md`

## Global Constraints

- Never touch `Desktop/sainmotors.mn`. No npm dependencies. Node ≥ 24.
- `EVENT_ID = "erdenet-opening-2026-11"`, `CONSENT_VERSION = "erdenet-opening-v1"`, storage keys `sain-erdenet-submitted-v2`, `sain-erdenet-receipt-v2`, `sain-erdenet-spun-v2`.
- Slots: `"2026-11-28": ["10:00","12:00","14:00","16:00","18:00"]`, `"2026-11-29": ["17:00"]`. Default selected day: `2026-11-28`.
- Prize ids/labels: `umbrella` Борооны шүхэр, `usb` USB багц, `notebook` Тэмдэглэлийн дэвтэр, `gift` Гарын бэлэг.
- Sheet headers (12): the existing 11, then `Бэлэг`. The spreadsheet id and the `Sheet1` tab are unchanged.
- All visible copy is taken verbatim from the spec's Copy table. Colour and type tokens come from the spec's Design direction.
- Never log names or phones. Status endpoints never return name or phone.
- `data/`, `private/` and `.env` stay out of `public/` and out of git.

## Review Focus

1. **The same phone registers for 11.28 and again for 11.29.** It must get the same prize (one gift per phone). The test is in Task 2.
2. **The visitor reloads or reopens the page after spinning.** The same prize shows, with no second spin that could land elsewhere. Tests are in Task 2 (server keeps the prize) and Task 5 (QA reload).
3. **The live Sheet1 still has the 11 legacy headers.** The receiver adds `Бэлэг` to L1 instead of rejecting every write. The test is in Task 3.
4. **Google is down at registration.** The visitor can still spin and see the prize, and the later sync carries the prize to the Sheet. The test is in Task 2.
5. **Old 11.21/11.22 data is present**, either in localStorage (`…-v1` keys) or in `data/leads.sqlite`. It never appears or syncs under the new event. Tests are in Task 2 (archive step) and Task 5 (QA seeds a v1 key).

---

### Task 1: Event constants, prizes and validation

**Files:**
- Modify: `public/lead-validation.js`
- Test: `tests/leads.test.mjs`

**Interfaces:**
- Produces, from `public/lead-validation.js`:
  - `EVENT_ID`, `CONSENT_VERSION`, `EVENT_SLOTS`, all with the values in Global Constraints, frozen.
  - `EVENT_DAYS: Readonly<Record<day, {date:"11.28"|"11.29", weekday:"Бямба"|"Ням", title:string}>>`. The titles are `Тест драйв өдөрлөг` and `Нээлтийн үйл ажиллагаа`.
  - `PRIZES: ReadonlyArray<{id, label, short}>`, in the order umbrella, usb, notebook, gift. The `short` values are the spec's slice labels.
  - `prizeLabel(id: string): string | undefined`.
  - `validateLead`, with the same signature and the same `data` shape as before.

- [ ] **Step 0: Put the folder under local git (no remote)**

```bash
cd ~/OneDrive/Desktop/erdenet-test-drive && git init -q && git add -A && git commit -qm "chore: snapshot MEGA TEST DRIVE version before Erdenet opening rework"
```
Expected: `git status` is clean. `git ls-files | grep -E '^(data|private)/|\.env$'` prints nothing.

- [ ] **Step 1: Rewrite the slot/day tests in `tests/leads.test.mjs`**

Change the `input()` default to `day: "2026-11-28"`. Replace the two slot tests with these:

```js
test("preserves either selected event day and rejects an unoffered date", (t) => {
  const { store } = fixture(t);
  const testDrive = validateLead(input());
  const opening = validateLead(input({ day: "2026-11-29", time: "17:00" }));
  assert.equal(testDrive.data.day, "2026-11-28");
  assert.equal(opening.data.day, "2026-11-29");
  for (const day of ["2026-11-21", "2026-11-22", "2026-11-30"]) assert.equal(validateLead(input({ day })).ok, false);
  assert.notEqual(store.accept(opening.data).id, store.accept(testDrive.data).id);
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
```
Add `PRIZES, prizeLabel` to the import.
Also update the old dates elsewhere:
- `tests/leads.test.mjs:38`: expect `"2026-11-28"`.
- `tests/server.test.mjs:20` and `:33`: change `"2026-11-22"` to `"2026-11-28"`.

- [ ] **Step 2: Run, expect failures**

Run: `node --test tests/leads.test.mjs`
Expected: FAIL. The 11-28 days are rejected, and `PRIZES` is not exported.

- [ ] **Step 3: Update `public/lead-validation.js` to the Interfaces block**

The `validateLead` logic is unchanged apart from reading the new constants.

- [ ] **Step 4: Run all tests**

Run: `npm.cmd test`
Expected: the leads and server tests pass. The 5 receiver tests fail on the old event id and days (`tests/receiver.test.mjs:31,76-83`); Task 3 fixes those.

- [ ] **Step 5: Commit**

```bash
git add public/lead-validation.js tests/leads.test.mjs && git commit -m "feat: Erdenet opening dates, slots and prize list"
```

---

### Task 2: Store draws one prize per phone; API returns it; old data archived

**Files:**
- Create: `lib/prizes.mjs`
- Modify: `lib/lead-store.mjs`, `server.mjs`
- Test: `tests/leads.test.mjs`, `tests/server.test.mjs`

**Interfaces:**
- Consumes `PRIZES` and `EVENT_ID` from Task 1.
- Produces:
  - `pickPrize(randomInt?: (max:number)=>number): string`, in `lib/prizes.mjs`. The default is `crypto.randomInt`. It returns `PRIZES[randomInt(PRIZES.length)].id`.
  - `createLeadStore(filename, { pickPrize } = {})`. Records gain `prize: string`.
    In `accept`, a phone that already has a lead whose `event` column starts with `${EVENT_ID}:` reuses that lead's prize. Otherwise it calls `pickPrize()`. The prize is stored in the payload JSON, so sheet-sync forwards it unchanged.
  - `POST /api/leads` returns `{status, receipt, day, time, prize}`. `GET /api/leads/:receipt` returns `{status, day, time, prize}`.

- [ ] **Step 1: Write failing store tests (`tests/leads.test.mjs`)**

```js
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
```
In the existing test "Google outages leave a durable pending lead that a later worker synchronizes", add `assert.ok(lead.prize); assert.equal(posted.prize, lead.prize);` after `assert.equal(posted.event, EVENT_ID);`. That pins Review Focus #4: the prize survives the outage and the restart, and reaches the Sheet payload.

- [ ] **Step 2: Write a failing server test (`tests/server.test.mjs`)**

Extend "intake returns pending only after durable storage; status exposes no personal data" to check these:
- The POST body has `prize` ∈ PRIZE ids.
- `GET /api/leads/:receipt` returns the same `prize`.
- The GET body's keys are exactly `["day","prize","status","time"]` when sorted.

- [ ] **Step 3: Run, expect failures**

Run: `npm.cmd test`
Expected: the new tests fail because `prize` is undefined.

- [ ] **Step 4: Implement `lib/prizes.mjs`, the store change and the two `server.mjs` response objects**

The SQLite schema is unchanged. Look up the prize to reuse with `SELECT payload FROM leads WHERE phone = ? AND event LIKE ? LIMIT 1`.

- [ ] **Step 5: Run all node tests**

Run: `npm.cmd test`
Expected: the leads and server tests pass. The receiver tests still fail until Task 3.

- [ ] **Step 6: Archive the old lead database, never delete it**

Stop any server on 3210 first: `Get-NetTCPConnection -LocalPort 3210 -State Listen | % { Stop-Process -Id $_.OwningProcess }`.
Then move `data/leads.sqlite`, `data/leads.sqlite-wal` and `data/leads.sqlite-shm` together into `data/archive/mega-test-drive-2026-11-21/`.
Expected: `data/leads.sqlite` is absent until the next start creates an empty one. The archive holds all three files.

- [ ] **Step 7: Commit**

```bash
git add lib/prizes.mjs lib/lead-store.mjs server.mjs tests/leads.test.mjs tests/server.test.mjs && git commit -m "feat: server-drawn prize per phone, returned by intake and status"
```

---

### Task 3: Apps Script receiver writes the prize column

**Files:**
- Modify: `apps-script/Code.gs.template`, `README.md` (the Google Sheet section)
- Test: `tests/receiver.test.mjs`
- Regenerate: `private/Code.gs` (git-ignored) with `npm.cmd run setup`

**Interfaces:**
- Consumes the payload field `prize` (Task 2) and the ids and labels from Global Constraints. The Apps Script cannot import ES modules, so it repeats them in its own `ERDENET_PRIZES` map.
- Produces these receiver rules:
  - Reject when `data.prize` is not a known id.
  - Write the label, not the id, to column 12.
  - Headers are 12 long. If row 1 equals the 11 legacy headers and L1 is empty, set L1 to `Бэлэг` and continue.
  - `ERDENET_EVENT = 'erdenet-opening-2026-11'`, consent version `'erdenet-opening-v1'`, and slots as in Global Constraints.

- [ ] **Step 1: Update `tests/receiver.test.mjs`**

Change the `data()` fixture:
- `event` becomes `"erdenet-opening-2026-11"`, `consentVersion` becomes `"erdenet-opening-v1"`.
- `day` becomes `"2026-11-28"`, `time` stays `"10:00"`.
- Add `prize: "umbrella"`.

Change the fake sheet's initial header row to the 12 headers. Add these tests:

```js
test("receiver upgrades a legacy 11-column header row and stores the prize label", () => {
  const r = receiver(1000, { legacyHeaders: true });
  assert.equal(r.post(data()).ok, true);
  assert.equal(r.rows[0][11], "Бэлэг");
  assert.equal(r.rows[1][11], "'Борооны шүхэр");
});

test("receiver rejects an unknown prize and old-event payloads", () => {
  const r = receiver();
  assert.equal(r.post({ ...data(), prize: "car" }).ok, false);
  assert.equal(r.post({ ...data(), event: "erdenet-2026-11" }).ok, false);
  assert.equal(r.post({ ...data(), day: "2026-11-22" }).ok, false);
  assert.equal(r.rows.length, 1);
});
```
Give `receiver(initialMaxRows, { legacyHeaders = false } = {})` the option to start with the 11 legacy headers.
Also update the existing "chosen day" test (`:74-84`) to use the new days:
- `2026-11-21` + 17:00 becomes `2026-11-29` + 17:00.
- `2026-11-22` becomes `2026-11-28`.
- The rejected `2026-11-21` + 10:00 becomes `2026-11-29` + 10:00.

- [ ] **Step 2: Run, expect failures**

Run: `node --test tests/receiver.test.mjs`. Expected: FAIL, with the event rejected and no column 12.

- [ ] **Step 3: Update the template to the Interfaces block**

The header check reads 12 columns. Run the legacy upgrade under the lock, before the header comparison.

- [ ] **Step 4: Run everything and regenerate the private script**

Run: `npm.cmd test`, then `npm.cmd run setup`.
Expected: all tests pass. `private/Code.gs` contains `erdenet-opening-2026-11` and no `__WEBHOOK_SECRET__`.

- [ ] **Step 5: Update the README's Google Sheet section**

- New event and column. The user pastes `private/Code.gs` into Apps Script, then chooses **Deploy → Manage deployments → New version**.
- If they create a new deployment, they reconnect it with `npm.cmd run connect -- <exec url>`.
- Replace the stale 21/22 date notes and test count in the README.

- [ ] **Step 6: Commit**

```bash
git add apps-script/Code.gs.template tests/receiver.test.mjs README.md && git commit -m "feat: receiver stores prize label in new Бэлэг column"
```

---

### Task 4: Page redesign: markup, logo and dusk-poster styles

**Files:**
- Create: `public/assets/erdenet-showroom.jpg` (copy of `C:\Users\user\Downloads\Media (2).jpg`)
- Modify: `public/index.html`, `public/styles.css` (full rewrite), `server.mjs` (static map), `tests/server.test.mjs`
- Delete: nothing. `logo.svg` stays as the Sain Motors header logo and favicon.

**Interfaces:**
- Consumes `EVENT_DAYS` / `EVENT_SLOTS` (Task 1) through `app.js`, which keeps working unchanged in this task apart from the IDs below.
- Produces DOM hooks for Task 5, keeping every existing id that `app.js` reads (`lead-form`, `registration`, `form-content`, `result-panel`, `time-choices`, `selected-slot`, `submit-button`, `mobile-register-button`, …), plus:
  - `#registration[data-stage="form"|"spin"|"prize"]`
  - `#prize-wheel` (an `<svg>` with `<g id="wheel-rotor">` and 8 `<g class="wheel-slice" data-prize="…">`)
  - `#spin-button`, `#prize-card`, `#prize-title`, `#prize-body`
  - day radios `#day-28` (checked) and `#day-29`

- [ ] **Step 1: Add a failing static-route test**

In `tests/server.test.mjs`, check that `GET /assets/erdenet-showroom.jpg` returns 200 with `image/jpeg`. Check that `GET /` contains `Сайн Моторс Эрдэнэт салбарын нээлт` and no longer contains `MEGA`.

- [ ] **Step 2: Run, expect failures**

Run: `node --test tests/server.test.mjs`
Expected: FAIL with a 404 for the asset.

- [ ] **Step 3: Copy the logo and add the route**

Copy the logo into `public/assets/`. Add `["/assets/erdenet-showroom.jpg", ["assets/erdenet-showroom.jpg", "image/jpeg"]]` to `files` in `server.mjs`.

- [ ] **Step 4: Rewrite `public/index.html` to the spec layout and copy table**

- Meta description: built from the Lead copy.
- `<html lang="mn">`, `theme-color #0A1033`.
- Hero: the logo `<img src="/assets/erdenet-showroom.jpg" alt="Эрдэнэт Showroom" width="2508" height="625">`, then H1, lead, two day tickets, then the programme list.
- Below: the steps `<ol>` (the only numbered list) and the location section.
- Panel: a wheel-peek wrapper above the form. The result panel becomes the spin stage, holding the SVG wheel, `#spin-button` and `#prize-card` (hidden).
- Remove every `MEGA`, `11.21`, `11.22` and `10 азтанд` string.

The wheel SVG geometry is the one decision the markup cannot infer:
- viewBox `-110 -110 220 220`, rotor radius 100.
- Slice *k* (0–7) spans `[k·45°, (k+1)·45°]` clockwise from 12 o'clock. Prize order by *k*: umbrella, usb, notebook, gift, umbrella, usb, notebook, gift.
- Fills alternate `--red` / `--dusk`. Labels use the `short` text, rotated to `k·45+22.5°`, reading outward.
- Chrome rim circle r=104. Paper hub r=18 carries the Sain "S" from `logo.svg`, or a plain hub if extracting it is not clean.
- Pointer: a fixed red triangle at the top, outside the rotor.

- [ ] **Step 5: Rewrite `public/styles.css` from the spec tokens**

- Define the `:root` tokens and the type scale. Keep the `@font-face` rules for Zona and Inter.
- Check Cyrillic coverage: in the browser, compare `measureText("Эрдэнэт")` for `16px Zona` against `16px serif`. If the widths are equal, Zona lacks Cyrillic, so set the H1/H2 family to Inter 800.
- Hero sky: layered `radial-gradient`s on `--night`, with the ember low-right. The logo gets `mix-blend-mode: screen`.
- Desktop grid 7/5 at ≥ 960px. The panel uses `--dusk` at 70% with `backdrop-filter`, plus a 1px chrome hairline.
- Day tickets: two bordered blocks, with the date set in Zona 40px.
- Wheel peek: `#registration[data-stage="form"] .wheel-wrap` clips to the top 34% of the wheel. In the `spin` and `prize` stages it shows in full (a transform transition of 600ms, disabled under reduced motion).
- Floating mobile CTA: red, 20px inset. Focus rings as the spec says.

- [ ] **Step 6: Run the tests and take the first screenshots**

Run: `npm.cmd test` and expect all to pass. Start `npm.cmd start`, then capture 1440×1000, 390×844 and 320×700 into `test-results/` with the playwright-core runner.
Look at each one. Check:
- No horizontal overflow.
- The logo's black field is invisible.
- The text is legible over the ember glow.
- The wheel peek reads as a wheel.

Fix and re-capture until it passes.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/styles.css public/assets/erdenet-showroom.jpg server.mjs tests/server.test.mjs && git commit -m "feat: Erdenet showroom opening page in poster dusk palette"
```

---

### Task 5: Registration flow and prize wheel

**Files:**
- Modify: `public/app.js`, `tests/browser-qa.js`

**Interfaces:**
- Consumes `EVENT_DAYS`, `EVENT_SLOTS`, `PRIZES`, `prizeLabel` (Task 1); the API `prize` field (Task 2); the DOM hooks (Task 4).
- Produces:
  - `slotLabel(day, time)`, which returns `${EVENT_DAYS[day].date} · ${EVENT_DAYS[day].weekday}` plus ` · ${time}` when a time is given. It replaces the hard-coded 21/22 strings.
  - `chosenTimes` seeds `"2026-11-29": "17:00"`.
  - `spinTo(prizeId): Promise<void>` and `showPrize(prizeId)`.
  - The `sain-erdenet-spun-v2` value is `{ receipt, prize }`.

- [ ] **Step 1: Update `tests/browser-qa.js` first**

- Mocks return `prize: "notebook"`, and the receipt status echoes it.
- Seed `localStorage["sain-erdenet-receipt-v1"]` with an old receipt before the reload. Assert that the form stage is shown, not a result.
- After a successful mocked submit, assert `#registration[data-stage="spin"]`. Click `#spin-button`, wait up to 6s for `[data-stage="prize"]`, and assert `#prize-title` is `Таны бэлэг: Тэмдэглэлийн дэвтэр`.
- Assert the slice under the pointer: the `data-prize` of the slice whose centre angle plus the final rotation ≡ 0 (mod 360, ±22.5°) is `notebook`.
- Reload and assert the prize stage shows immediately with the same title and `#spin-button` hidden.
- Repeat with `page.emulateMedia({ reducedMotion: "reduce" })`. The prize must appear in under 500 ms.
- Keep the existing checks: day/time switching, empty-field errors, failure preserves input, pending vs confirmed, no overflow at 1440/390/320, and the floating CTA hiding.
- Save the screenshots `desktop.png`, `mobile-390.png`, `mobile-320.png` and `prize-390.png`.

- [ ] **Step 2: Run QA, expect failures**

Run (server on 3210): the playwright-core runner with `tests/browser-qa.js`.
Expected: FAIL at the `data-stage="spin"` assertion.

- [ ] **Step 3: Implement in `public/app.js`**

Rename the storage keys to v2. `send`/`checkStatus` keep `prize` from the response (it must be a known id, or the response is treated as invalid).
`showResult` sets `data-stage` as follows:
- `"prize"` when the spun record matches the receipt.
- `"spin"` otherwise.

`#spin-button` calls `spinTo`. The landing angle is the one non-obvious algorithm:

```js
// Slices clockwise from 12 o'clock, 45° each; the pointer is fixed at 0°.
const slices = [...rotor.querySelectorAll(".wheel-slice")];
const k = pick(slices.flatMap((s, i) => s.dataset.prize === prizeId ? [i] : []));
const jitter = (Math.random() - 0.5) * 30;            // stay inside the 45° slice
const target = 360 * 6 + (360 - (k * 45 + 22.5)) + jitter;
rotor.style.transition = reduce ? "none" : "transform 5s cubic-bezier(.12,.6,.1,1)";
rotor.style.transform = `rotate(${target}deg)`;
```

On `transitionend`, or immediately under reduced motion:
- Save the spun record.
- Set `data-stage="prize"`.
- Fill `#prize-title` / `#prize-body` with the spec copy.
- Add the one ember flash class.
- Move focus to `#prize-card` and announce the prize through `#form-status`.

Disable `#spin-button` once it is clicked.

- [ ] **Step 4: Run QA until it passes**

Run the QA and expect PASS. Then open each screenshot and judge it against the spec's design direction. Check:
- The wheel labels are legible at 320px.
- The prize card does not push the wheel off-screen on 390×844.

- [ ] **Step 5: Final verification and docs**

- Run `npm.cmd test` and expect everything to pass. Update `docs/progress.md` with what was verified.
- Replace `docs/design.md` with a pointer to the new spec.
- Check the real local round trip with `npm.cmd start`. Submit a synthetic lead (`Synthetic QA`, phone `00000000`) and confirm it shows `pending` with a prize. It syncs only once the user has deployed the script.

- [ ] **Step 6: Commit**

```bash
git add public/app.js tests/browser-qa.js docs/ && git commit -m "feat: prize wheel reveals the server-drawn gift after registration"
```

---

## Hand-off notes for the user (after execution)

- Paste `private/Code.gs` into the Sheet's Apps Script. Deploy a new version as Web app (Execute as: Me, Access: Anyone). If the `/exec` URL changed, run `npm.cmd run connect -- <url>`.
- Confirm these choices or correct them:
  - The 11.28 test-drive slots (10–18, every two hours).
  - Equal prize odds, and the "while stock lasts" note.
  - The Alpha Arena location.
  - That no winner count is stated for the 500,000₮ petrol prize.
