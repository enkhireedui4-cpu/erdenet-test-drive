# Sain Motors Erdenet branch opening: event page and prize wheel

Supersedes the "MEGA TEST DRIVE" brief in `docs/design.md` (event, dates, branding, look).
The lead pipeline is kept: SQLite outbox, then the Apps Script receiver, then the existing Google Sheet.

## Brief (user, 2026-11-16)

- Replace the MEGA TEST DRIVE mark with the supplied logo `C:\Users\user\Downloads\Media (2).jpg`.
  It shows a chrome ЭРДЭНЭТ above a red SHOWROOM on black, 2508×625.
- Event name: **Сайн Моторс Эрдэнэт салбарын нээлт**.
- Timing: **11-28 тест драйв өдөрлөг**; **11-29, 17:00 цагаас нээлтийн үйл ажиллагаа**.
- Programme: a petrol prize worth up to 500,000₮, fun contests, catering.
- After registering, the visitor spins a lucky wheel. The wheel's prizes are an umbrella, a USB set, a notebook and a gift.
  The visitor then comes to the showroom opening to collect the gift. The registration records the phone number.
- Leads go to the Google Sheet `1argV8PktHaKNvW5_iK0UICcwOkHGDJtEq__PwSOGs2k` / `Sheet1`. The user deploys the Apps Script.
- Make the design substantially better and more stylish. The builder chooses the direction.

## Decisions taken without asking (reversible; flag in the hand-off)

1. Slots: **2026-11-28 (Бямба): 10:00, 12:00, 14:00, 16:00, 18:00** carries over the old test-drive day.
   **2026-11-29 (Ням): 17:00 only** carries over the old opening day.
2. The prize is drawn **on the server** when the lead is first stored, with equal weights.
   One phone keeps one prize for the whole event, even across both days.
   The wheel animation only reveals the stored prize, so re-spinning or reloading cannot change it.
3. The prize goes to the Sheet as a new 12th column, **Бэлэг**, holding the Mongolian label.
   The receiver adds this header to a sheet that still has the 11 legacy headers.
4. New identifiers so old test data never mixes in.
   Event `erdenet-opening-2026-11`, consent `erdenet-opening-v1`, browser storage keys `…-v2`.
   The old `data/leads.sqlite` is archived, never deleted.
5. The location stays as on the poster: Sain Motors Эрдэнэт, Alpha Arena Sportainment Center. The phone stays 9909-6347.
6. No winner count is stated for the petrol prize, because the new brief gives none.
   The wheel note says gifts last while stock lasts.

## Copy (exact, Mongolian)

| Slot | Text |
|---|---|
| `<title>` | Сайн Моторс Эрдэнэт салбарын нээлт |
| H1 | Сайн Моторс Эрдэнэт салбарын нээлт |
| Lead | 28-нд тест драйв өдөрлөгт ирж шинэ машинуудаа жолоодоод, 29-нд шинэ шоурумынхаа нээлтийг бидэнтэй хамт тэмдэглээрэй. |
| Day 11.28 | 11.28 · Бямба / Тест драйв өдөрлөг |
| Day 11.29 | 11.29 · Ням / 17:00 цагаас нээлтийн үйл ажиллагаа |
| Programme heading | Нээлтийн хөтөлбөр |
| Programme items | 500,000₮ хүртэл үнийн дүнтэй бензиний шагнал / Хөгжөөнт уралдаан / Катеринг |
| Steps heading | Бэлгээ хэрхэн авах вэ? |
| Step 1 | Бүртгүүлэх: Нэр, утасны дугаараа үлдээнэ. |
| Step 2 | Хүрд эргүүлэх: Бүртгэлийн дараа азын хүрдээ эргүүлж бэлгээ мэдэнэ. |
| Step 3 | Бэлгээ авах: 11.29-ний 17:00 цагаас шоурумын нээлтэд ирж бэлгээ авна. |
| Form heading | Бүртгүүлэх |
| Form sub | Бүртгүүлээд азын хүрдээ эргүүлээрэй. |
| Submit / mobile CTA | Бүртгүүлэх |
| Spin stage heading (synced) | Та бүртгэгдлээ. Одоо хүрдээ эргүүлээрэй. |
| Spin stage heading (pending) | Хүсэлтийг хүлээн авлаа. Одоо хүрдээ эргүүлээрэй. |
| Spin button | Хүрд эргүүлэх |
| Prize heading | Таны бэлэг: {label} |
| Prize body | 11.29-ний 17:00 цагаас Эрдэнэт шоурумын нээлтэд хүрэлцэн ирж бэлгээ аваарай. Бүртгүүлсэн утасны дугаараа хэлэхэд хангалттай. |
| Stock note | Бэлэг нөөц дуустал олгогдоно. |
| Location heading | Эрдэнэт шоурум |

Prize labels: `umbrella` Борооны шүхэр, `usb` USB багц, `notebook` Тэмдэглэлийн дэвтэр, `gift` Гарын бэлэг.
Wheel slice labels (short): Шүхэр, USB багц, Дэвтэр, Гарын бэлэг.

## Design direction

**Subject:** a new branch showroom opening in Erdenet.
**Audience:** local residents, mostly arriving on phones from Facebook.
**Job:** register in under a minute, and want to turn up on the 29th to collect a gift.

The current page is the generic default: near-black, one red accent and a big italic wordmark.
The new page takes its world from the company's own opening poster (`docs/references/erdenet-opening-poster.png`):
a dusk sky running from deep blue to an ember horizon, the chrome logo, and Sain red.

**Colour tokens**

| Token | Hex | Use |
|---|---|---|
| `--night` | `#0A1033` | page base (upper poster sky) |
| `--dusk` | `#1C2A6E` | panels, alternate wheel slices |
| `--ember` | `#FF6A3D` | horizon glow only, plus the prize reveal flash |
| `--red` | `#F0142D` | CTA, selected chips, wheel slices, pointer |
| `--chrome` | `#C9CED8` | hairlines, wheel rim, secondary text |
| `--paper` | `#F5F6FA` | text |

**Type**
- Zona Pro Bold is the display face for the dates (`11.28`, `17:00`), `500,000₮` and the wheel labels.
- If the Zona files lack Cyrillic glyphs, the Cyrillic headings fall back to Inter 800 with -0.02em tracking.
- Inter is the body and form face.
- Scale: 14 / 16 / 21 / 28 / 40 / 56 px (desktop H1 56, mobile H1 34 via clamp). Body line-height 1.5; lines ≤ 70ch.
- Sentence case throughout. No all-caps eyebrow labels, no `A · B · C` meta strings except the day lines fixed above, no `→` in buttons.

**Layout**

```
Desktop ≥ 960px                                  Mobile
┌───────────────────────────────────────────┐   ┌──────────────────┐
│ SAIN MOTORS                     9909-6347 │   │ SAIN      9909…  │
│                                           │   │ [ЭРДЭНЭТ logo]   │
│ [ЭРДЭНЭТ / SHOWROOM logo]   ┌───────────┐ │   │ H1 + lead        │
│ H1  Сайн Моторс Эрдэнэт…    │  ◠ wheel  │ │   │ [11.28][11.29]   │
│ lead                        │  peeks in │ │   │ programme        │
│ ┌ 11.28 ────┐ ┌ 11.29 ───┐  │ Бүртгүүлэх│ │   │ 3 steps          │
│ │ Тест драйв│ │ 17:00    │  │ day/time  │ │   │ ┌panel─────────┐ │
│ └───────────┘ └──────────┘  │ name/phone│ │   │ │◠ wheel peeks │ │
│ programme: 500,000₮ …       │ [Бүртгүүл]│ │   │ │ form         │ │
│                             └───────────┘ │   │ └──────────────┘ │
│ ─ horizon glow ─────────────────────────  │   │ location         │
│ 1 Бүртгүүлэх  2 Хүрд эргүүлэх  3 Бэлгээ  │   │ [Бүртгүүлэх] fab │
│ location band                    footer   │   └──────────────────┘
└───────────────────────────────────────────┘
```

- Left-aligned text everywhere except inside the wheel stage, which is centred.
- The hero sky is a layered radial gradient. The ember glow sits low on the right, as on the poster, behind the hero only.
- The two day "tickets" are the timeline. The three steps are the only numbered list, because they are a real sequence. The programme items are not numbered.

**The one bold thing: the prize wheel**
- Before registration, the top third of the wheel peeks above the form inside the panel, as a promise.
- After registration, the panel's form stage is replaced by the spin stage. The wheel rises fully into view and the Spin button appears.
- The wheel is an inline SVG with 8 slices (each prize twice). Slices alternate `--red` and `--dusk`.
  It has a chrome rim (conic gradient), a paper hub with the Sain "S", and a red pointer at 12 o'clock.
- Spin: 5 s, `cubic-bezier(.12,.6,.1,1)`, landing on a slice of the stored prize. Then the prize card appears with one ember flash.
- With reduced motion, there is no rotation; the wheel jumps to the slice and the card appears.
- Everything else stays quiet. No entrance animations on sections, no hover lifts on cards, no faux metallic headings.
  The chrome lives only in the real logo and the wheel rim.

**Logo handling.** The JPG has a black field. It sits on the dark hero with `mix-blend-mode: screen`, so the black drops out without re-drawing the artwork.
It is served from `/assets/erdenet-showroom.jpg` and never placed on a light background.

**Quality floor.** No horizontal overflow at 320 / 390 / 1440 px. Visible focus rings (`--paper` 2px outline + `--red` offset).
Contrast is at least 4.5:1 for body text on `--night` and `--dusk`. The mobile floating CTA is kept: 20 px inset, hidden while the panel is in view.
