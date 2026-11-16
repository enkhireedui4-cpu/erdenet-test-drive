# Erdenet Test Drive Implementation Plan

> For agentic workers: use superpowers:executing-plans for inline implementation and a fresh final reviewer. The user's instruction to choose the implementation and build authorizes continuous work.

**Goal:** Deliver an independent premium event page with reliable lead collection into the provided Google Sheet.
**Architecture:** Buildless HTML/CSS/ES modules, a small Node HTTP server, SQLite durable outbox, authenticated Apps Script receiver.
**Tech Stack:** Node 24+, native SQLite, native test runner, browser ES modules; no runtime package installation.
**Spec:** `docs/design.md`

## Global constraints

- All work stays inside `Desktop/erdenet-test-drive`; existing `sainmotors.mn` is read-only.
- 2026-11-21 at 17:00 is the showroom opening; 2026-11-22 is the all-day test drive.
- Exactly two contact fields and explicit consent; no invented booking slots.
- Only durable storage acknowledges receipt; only verified Sheets acknowledgement confirms registration.
- Preserve the specified spreadsheet and its existing Sheet1 tab.
- No credentials in public files, HTTP logs, source control or browser responses.

## Review focus

- A committed lead survives a process restart before Google acknowledges it.
- An ambiguous timeout followed by retry creates exactly one sheet row.
- Double clicking, reloading or normalizing the same phone cannot create duplicates.
- Private database, configuration and Apps Script secret cannot be downloaded through static routes.
- Small screens, keyboard focus and failed submissions preserve access to the form.

## Task 1: Durable intake and sheet receiver

- [x] Write and run failing tests for validation, SQLite restart recovery, deduplication, Google failures/false acknowledgements and receiver security.
- [x] Implement `public/lead-validation.js`, `lib/lead-store.mjs`, `lib/sheet-sync.mjs`, `server.mjs`, `apps-script/Code.gs.template`, and private configuration helpers.
- [x] Run `node --test tests/*.test.mjs` and verify the tests pass.

## Task 2: Event page

- [x] Copy the supplied logo and licensed brand fonts into the new project only.
- [x] Implement `public/index.html`, `public/styles.css`, `public/app.js` with a responsive two-column composition, two-field form, submit-action contact permission, checked pending/success states and browser retry recovery; add the user's day/time and floating-CTA refinements.
- [x] Prepare the blank Sheet1 headers, phone/text formatting and frozen header in the existing Google file; verify the edit.

## Task 3: Review and delivery

- [x] Start the independent server at http://localhost:3210 and verify HTTP and private-route isolation.
- [x] Exercise the page at desktop, 390px and 320px widths; save and inspect screenshots.
- [x] Run a fresh code review and address material findings with regression tests.
- [x] Prepare a short Mongolian README, setup instructions and a persistent-disk deployment note.
- [ ] If a Google receiver URL is supplied, configure it and verify a clearly synthetic end-to-end write, including deduplication. Otherwise state precisely that live Sheets delivery awaits that deployment URL.

No Git initialization or commits are needed for the requested local artifact.
