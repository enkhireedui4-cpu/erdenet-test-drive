# Erdenet Mega Test Drive

## Intent and scope

A separate Mongolian event registration website in `Desktop/erdenet-test-drive`.
Never edit, install into, or build the existing `sainmotors.mn` directory.
The visitor should understand the event and register with a name and phone number.
The user delegated the design and implementation choices to the builder.

## Content

- Sain Motors, the official distributor of 11 automotive brands.
- Erdenet: showroom opening on 2026-11-21 at 17:00; Mega Test Drive on 2026-11-22 throughout the day. Do not invent time slots or a closing time.
- 11 brands, more than 20 models; petrol, diesel, electric and hybrid vehicles.
- Use the supplied original white/red Sain Motors SVG, without redrawing it.
- The later supplied opening poster supersedes the old showroom address: Sain Motors Erdenet, Alpha Arena Sportainment Center. Keep the previously supplied local showroom phone 9909-6347; no precise map pin is invented.
- The later poster says 2026-11-20, 11:00–20:00, conflicting with the user's specific 21/22 registration instructions. A clarification is pending; do not silently replace the two-day schedule.
- User-specified choices: Nov 21 only 17:00; Nov 22 10:00, 12:00, 14:00, 16:00, 18:00. Selected day/time must persist through retries and appear in Sheets and confirmation.
- Prizes are supporting information only: ten winners, petrol vouchers up to 500,000 MNT. Do not imply that registration guarantees a prize.

## Approaches

1. Static form directly to Apps Script: easy to host, but browser abandonment during an outage can lose an unacknowledged request.
2. A separate lightweight Node site with a durable SQLite outbox, synchronizing to Apps Script: chosen to retain received leads through Google outages and process restarts.
3. Reuse the existing corporate site or its R8 lead database: rejected because the user explicitly requires a new folder and a different campaign/destination.

## Design direction

Updated to the user's later BYD reference: black (#090909), charcoal panel (#101010), paper white (#f3f2ef), Sain red (#f11436), muted grey (#a09f9b), and fine borders (#2a2a28).
Use the supplied Zona Pro for display and Inter for readable Mongolian forms.
Desktop has a spacious event composition on the left and a dark registration panel with a Sain red CTA on the right. Mobile has a red floating CTA inset 20px above the bottom. It scrolls to the form and hides while the form is in view; the internal red submit button remains. Compact program and showroom sections follow the form, matching the supplied BYD reference.
The memorable element is an oversized italic MEGA TEST DRIVE wordmark made of live text, with a quiet city/date treatment. No gradients, fake metallic effects, carousels or stock imagery.

```
SAIN logo                                      Эрдэнэт · 21–22.11
────────────────────────────────────────────────────────────────
MEGA TEST DRIVE             │ Бүртгүүлэх
Эрдэнэт хот                 │ Нэр
11 брэнд. 20+ загвар.        │ +976 Утас
Өөрөө жолоодож, мэдэр.       │ Холбогдох зөвшөөрөл
21.11 / 17:00   22.11       │ [ TEST DRIVE-д бүртгүүлэх ]
Нээлт           Test drive  │ Төлбөргүй бүртгэл
────────────────────────────────────────────────────────────────
Showroom address / telephone                   Sain Motors
```

## Lead integrity and privacy

Required: day, time, name and an eight-digit Mongolian phone number. At the user's request there is no checkbox. The submit-button disclosure explains event follow-up; the explicit submit action records contact permission.
Normalize the phone to +976, record server timestamps, event, consent version and bounded UTM attribution. Never log personal details.
Commit each lead to SQLite in WAL/FULL mode before acknowledging receipt. Deduplicate by request ID and by event/day/time/phone. A random opaque receipt token permits status checks without exposing contact data.
Retry pending Google writes after outages and restarts; never discard pending leads. Only the Sheets receiver's checked acknowledgement can produce the completed registration state. A pending state means received, awaiting confirmation.
The Google receiver uses a server-only shared secret, a script lock, idempotency and literal text cells. It never exposes a lead-reading endpoint.
Google destination: spreadsheet `1argV8PktHaKNvW5_iK0UICcwOkHGDJtEq__PwSOGs2k`, existing blank tab `Sheet1` (sheetId 0). Do not create a replacement spreadsheet.

## Configuration and delivery

Build and run locally on port 3210 without third-party runtime dependencies (Node 24+).
Prepare private paste-ready Apps Script code and a single command to connect its deployed `/exec` URL. The Google Drive connector can edit the sheet but cannot deploy an Apps Script web app. If no existing receiver URL is supplied, finish the site and setup files, then request that one deployment step with the exact ready files.
No public deployment is assumed for this local-folder task. Production requires persistent disk, HTTPS and backing up the lead database. Do not advertise absolute protection from device/disk destruction.

## Verification

Test normalization, consent, invalid inputs, durable restart recovery, duplicate submissions, outage recovery, false Google acknowledgements, receiver lock/idempotency/formula protection, and public file isolation.
Review desktop and mobile screenshots and exercise the form, including keyboard, offline and failure states, in a headless browser. Run a live synthetic Sheets round trip only after the actual receiver is configured; label test data clearly.
