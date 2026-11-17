# Progress — Erdenet branch opening

- 2026-11-17: fixed stock allocation for 110 real leads: USB багц 10, Шүхэр 30, Хуванцар дугаар бичигч 20, Дугаар бичигч 50. The two identified test IDs do not consume stock. Гарын бэлэг stays visible on the ten-sector wheel with zero allocations. Registrations continue without a spin once stock is exhausted. Updated programme and every contact link to 8808-8505. Apps Script deployment must be updated separately from the Git push.
- Verification: 43 Node tests pass; both browser QA scripts pass. Review found and fixed provisional award disclosure during a configured-Sheet outage: the browser now waits for confirmation before allowing the spin. Browser QA made no real Google writes.

- 2026-11-16: page rebuilt for "Сайн Моторс Эрдэнэт салбарын нээлт" — ЭРДЭНЭТ SHOWROOM logo, 11.28 test-drive day (10/12/14/16/18), 11.29 opening 17:00, programme, prize wheel. Plan: `docs/superpowers/plans/2026-11-16-erdenet-opening.md`.
- Prize: drawn on the server when a lead is first stored (equal odds), one per phone across both days, returned by intake and status, synced to Sheet column 12 `Бэлэг` as the Mongolian label. The wheel only reveals it.
- Old MEGA TEST DRIVE lead database archived (not deleted): `data/archive/mega-test-drive-2026-11-21/`. Browser `…-v1` keys are purged on load.
- Verified: `npm test` (node) all pass; `tests/browser-qa.js` all pass — v1 storage ignored, 11.28/11.29 slots, empty-field errors and keyboard order, failure keeps input and request ID, pending vs confirmed, 5 s spin lands on the server prize, reload restores the prize without a re-spin, reduced motion reveals instantly, no overflow at 1440/390/320, floating CTA in Sain red hides at the form, zero runtime errors. Google responses are mocked in UI QA.
- Verified on a throwaway server instance (temporary DB, no Google URL): POST → 202 pending with prize; status returns the same prize and only day/prize/status/time.
- Pending external step: paste `private/Code.gs` into the Sheet's Apps Script and deploy a new version (see README). Until then leads wait safely as `pending` in `data/leads.sqlite`.
