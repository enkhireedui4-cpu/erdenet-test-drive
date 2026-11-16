import { randomInt as cryptoRandomInt } from "node:crypto";
import { PRIZES } from "../public/lead-validation.js";

/** Draws one wheel prize id with equal odds. */
export function pickPrize(randomInt = cryptoRandomInt) {
  return PRIZES[randomInt(PRIZES.length)].id;
}
