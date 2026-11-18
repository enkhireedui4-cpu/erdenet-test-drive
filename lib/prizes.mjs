import { randomInt as cryptoRandomInt } from "node:crypto";
export const PRIZE_STOCK = Object.freeze({ umbrella: 50, usb: 25, notebook: 20, gift: 155, generalGift: 0 });
export const TEST_LEAD_IDS = Object.freeze([
  "9c4a6cb0-16ae-4c30-b539-f7f92a3443c5",
  "fbdea9e6-01c6-4a01-9f4f-544de11b2bc3",
]);

export function remainingPrizeStock(leads, event) {
  const remaining = { ...PRIZE_STOCK };
  for (const lead of leads) {
    if (lead.event === event && !TEST_LEAD_IDS.includes(lead.id) && Object.hasOwn(remaining, lead.prize)) {
      remaining[lead.prize] = Math.max(0, remaining[lead.prize] - 1);
    }
  }
  return remaining;
}

/** Draw uniformly from remaining units; the generic gift has no stock. */
export function pickPrize(remaining = PRIZE_STOCK, randomInt = cryptoRandomInt) {
  const entries = Object.entries(PRIZE_STOCK).map(([id, maximum]) => [id, Math.max(0, Math.min(maximum, remaining[id] ?? 0))]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return "none";
  let position = randomInt(total);
  for (const [id, count] of entries) {
    if (position < count) return id;
    position -= count;
  }
}
