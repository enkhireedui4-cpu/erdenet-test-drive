# Progress — Erdenet branch opening

- 2026-11-16: page rebuilt for "Сайн Моторс Эрдэнэт салбарын нээлт" — ЭРДЭНЭТ SHOWROOM logo, 11.28 test-drive day (10/12/14/16/18), 11.29 opening 17:00, programme, prize wheel. Plan: `docs/superpowers/plans/2026-11-16-erdenet-opening.md`.
- Prize: drawn on the server when a lead is first stored (equal odds), one per phone across both days, returned by intake and status, synced to Sheet column 12 `Бэлэг` as the Mongolian label. The wheel only reveals it.
- Old MEGA TEST DRIVE lead database archived (not deleted): `data/archive/mega-test-drive-2026-11-21/`. Browser `…-v1` keys are purged on load.
- Verified: `npm test` (node) all pass; `tests/browser-qa.js` all pass — v1 storage ignored, 11.28/11.29 slots, empty-field errors and keyboard order, failure keeps input and request ID, pending vs confirmed, 5 s spin lands on the server prize, reload restores the prize without a re-spin, reduced motion reveals instantly, no overflow at 1440/390/320, floating CTA in Sain red hides at the form, zero runtime errors. Google responses are mocked in UI QA.
- Verified on a throwaway server instance (temporary DB, no Google URL): POST → 202 pending with prize; status returns the same prize and only day/prize/status/time.
- Pending external step: paste `private/Code.gs` into the Sheet's Apps Script and deploy a new version (see README). Until then leads wait safely as `pending` in `data/leads.sqlite`.
