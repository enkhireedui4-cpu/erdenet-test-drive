# Gift Inventory Implementation Plan

> Execute natively in this session, following the user request and clarification that the generic gift has no awards.

**Goal:** Bound gift awards by available stock and update event information.

**Architecture:** Shared server-side stock rules, atomic Sheet allocation, SQLite transaction allocation, and explicit no-award UI.

**Tech Stack:** Node.js, vanilla JavaScript, Google Apps Script, SQLite, Netlify.

**Spec:** `docs/superpowers/specs/2026-11-17-prize-stock-design.md`

## Global constraints

- Гарын бэлэг stays visible and receives no allocations.
- Available inventory is USB багц 10, Шүхэр 30, Хуванцар дугаар бичигч 20, Дугаар бичигч 50.
- Exclude the two explicitly identified test IDs; count the existing real lead.
- Retries preserve the saved award; registrations continue after stock exhaustion.
- Keep webhook credentials private; push reviewed changes to the existing repository.

## Review focus

- Existing legacy gift labels consume stock; unrelated events and test IDs do not.
- Concurrent requests cannot oversell the final unit.
- Duplicate phones and request retries do not consume another unit.
- No-award responses are accepted by the browser, including reloads.
- Failed writes cannot consume stock or be acknowledged as successful.

## Tasks

- [x] Add failing tests for quota exhaustion, legacy records, excluded test IDs, retries and generic-gift exclusion.
- [x] Implement server prize selection and atomic SQLite inventory; allocate authoritatively under the Apps Script lock.
- [x] Accept explicit no-award Sheet responses and present successful registration without a spin when exhausted.
- [x] Update labels, programme and all phone links; prepare the private Apps Script source.
- [x] Run the complete Node suite and browser checks; inspect the diff and commit.
- [ ] Push using an available authenticated Git transport and verify the published commit; deploy Apps Script if the connected browser permits it.

## Verification and final review

- Tests first demonstrated missing quotas, generic-gift exclusion, no-award acceptance and legacy-label migration; all are now passing.
- Final review: one Important finding, no Critical or Minor findings. Fixed configured-Sheet outage handling: pending API responses withhold the provisional prize, and the browser waits for the authoritative award before offering a spin. Regression test `a Sheet outage withholds provisional awards until the authoritative gift is confirmed` and the browser recovery scenario failed before the fix and passed after it.
- Final Node suite: 43/43 passing. Browser scripts `tests/browser-qa.js` and `tests/browser-stock-qa.js` both pass, including ten-sector landing, reload, stock exhaustion, outage recovery, 1440/390/320 layouts and zero runtime errors. Google writes are mocked for browser QA.
- Private Apps Script sources refreshed with each file's existing credential; both remain ignored by Git. Live Google deployment and production concurrency could not be verified through the available browser connection.
