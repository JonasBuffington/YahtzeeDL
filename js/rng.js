// Deterministic dice for a daily seed.
//
// For every round, roll and die position there is exactly one predetermined
// value: table[round][roll][slot]. Rerolling a die in position `slot` on roll
// `r` always yields table[round][r][slot], so every player faces the same dice
// and the hindsight-perfect game is well defined.

import { ROUNDS, ROLLS } from './rules.js';

function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a, b, c, d) {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** table[round][roll][slot] -> 1..6 */
export function diceTable(seed) {
  const rand = sfc32(...cyrb128(String(seed)));
  const table = [];
  for (let t = 0; t < ROUNDS; t++) {
    const rolls = [];
    for (let r = 0; r < ROLLS; r++) {
      const slots = [];
      for (let i = 0; i < 5; i++) slots.push(1 + Math.floor(rand() * 6));
      rolls.push(slots);
    }
    table.push(rolls);
  }
  return table;
}

/** Fallback seed when no published puzzle exists for a date. */
export function fallbackSeed(dateKey) {
  return 'fallback-' + dateKey;
}
