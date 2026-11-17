# Gift inventory and event information

The user requests fixed gift inventory, exclusion of the two existing test leads, updated programme copy and contact number, then a Git push. They clarified that USB has ten awards; the generic Гарын бэлэг sector stays visible but must never be selected.

Keep existing prize IDs for saved-receipt compatibility. Use the exact gift names USB багц (10), Шүхэр (30), Хуванцар дугаар бичигч (20), Дугаар бичигч (50). The former notebook ID now means the plastic number holder, and gift means the number holder. Add a display-only generalGift ID for Гарын бэлэг with zero stock. Expand the wheel to ten equal sectors. Count the existing real lead's legacy gift label against number-holder stock and normalize its Sheet label. Exclude only the two identified test registration IDs, without deleting any leads.

Allocate randomly from remaining units under the existing Apps Script lock. Preserve awards on retries, enforce the same limits in local SQLite, and accept later registrations without an award after stock runs out. The browser must show successful registration without a spin when no gift remains.

Approaches: browser-only quotas cannot coordinate visitors; per-server counters reset in serverless deployments. Use the Sheet as the authoritative stock ledger and SQLite transactions for local-only intake.

Replace catering with Урлагийн номер; add QR gift information for the first 110 registrations; replace every public contact link with 8808-8505.

Deployment: prepare the private Apps Script source without committing credentials. Git publication is authorized. Report separately if the Apps Script deployment cannot be updated.
