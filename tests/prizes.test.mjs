import test from "node:test";
import assert from "node:assert/strict";
import { pickPrize } from "../lib/prizes.mjs";

test("draws from remaining units including USB, but never the displayed general gift", () => {
  const stock = { umbrella: 2, usb: 1, notebook: 1, gift: 2, generalGift: 0 };
  const draws = Array.from({ length: 6 }, (_, index) => pickPrize(stock, maximum => {
    assert.equal(maximum, 6);
    return index;
  }));
  assert.deepEqual(draws, ["umbrella", "umbrella", "usb", "notebook", "gift", "gift"]);
});

test("an exhausted inventory returns no award without trying to draw", () => {
  assert.equal(pickPrize({ umbrella: 0, usb: 0, notebook: 0, gift: 0, generalGift: 0 }, () => {
    assert.fail("an empty inventory must not draw");
  }), "none");
});
