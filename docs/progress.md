# Execution ledger — Erdenet Test Drive

- Scope: standalone folder; corporate source is read-only.
- Design: builder chooses the implementation as requested by the user. A durable outbox is used because received leads must survive a transient Sheets failure.
- Lead destination metadata checked: ErdenetTestDrive / Sheet1 / sheetId 0; A1:L5 is empty.
- Live Google receiver URL not yet supplied; the connector does not support deploying Apps Script.
- Task 1: complete — 13 tests passed, after observing their initial missing-module failures. Pending intake survives restart, retries deduplicate, and invalid acknowledgements do not confirm registration.
- Task 2: page implemented and serving at localhost:3210. The user's later BYD reference supersedes the initial navy/light-panel palette: black page, charcoal form, white button.
- Google Sheet: existing Sheet1 headers and text formatting prepared; live range re-read confirms all ten headers.
- Browser QA: desktop 1440px and mobile 390px/320px have no horizontal overflow; empty submission marks the three required controls.
- Asset correction: the supplied SVG has a square Illustrator artboard. Only the copied SVG viewport was tightened to the original paths' bounds, preserving every logo path and fill.
- Final user changes: 21/22 day chips, day-dependent time choices, brand-red floating mobile CTA with a 20px bottom inset, hidden while the form is visible. Removed the checkbox as requested and retained a submit-action privacy disclosure.
- Final code review: no critical issues. Fixed the shared-proxy IP quota by applying retry throttling per normalized contact; regression verifies 31 distinct attendees on one connection are accepted. LocalStorage failure now explains the browser limitation; BFCache pageshow resumes status checks.
- Receiver hardening: full sheets expand automatically; reusing an ID with different contact/day/time is rejected. Regression tests observed RED then GREEN.
- Latest verification: 19/19 native tests pass. Browser QA verifies day/time switching, keyboard, empty fields, failure preservation, stable-ID replay, pending vs confirmed, chosen-slot confirmation, 1440/390/320 widths, Sain-red CTA and hiding at the form. UI Google responses are mocked; no live delivery claim is made.
- Sheet1 A1:K2 re-read confirms eleven headers, including separate Өдөр and Цаг columns. Private/Code.gs regenerated from the final receiver template.
- Pending external input: actual Apps Script deployment /exec URL; confirmed business date because the later poster says Nov 20 while explicit booking instructions say Nov 21–22.
