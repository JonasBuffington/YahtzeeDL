// Optimal solitaire Yahtzee strategy (maximises expected final score) and
// "par": that strategy playing a day's dice without foresight.
//
// State between rounds: (filled mask, upper subtotal capped at 63, whether the
// Yahtzee box holds 50). E[state] is the expected remaining score under optimal
// play. The classic result for these rules is E[start] ≈ 254.5896.
//
// Used by the puzzle generator (Node); too heavy to build in the browser.

import {
  ALL_FILLED, NUM_CATS, YAHTZEE, UPPER_TARGET, UPPER_BONUS, YAHTZEE_BONUS,
  baseScore, placementScore, countsOf,
} from './rules.js';

// ---- Dice combinatorics -------------------------------------------------

const keepCounts = [];        // counts[1..6] per keep (multiset of <= 5 dice)
const keepIndex = new Map();  // key -> index
const keyOf = c => c[1] + 6 * c[2] + 36 * c[3] + 216 * c[4] + 1296 * c[5] + 7776 * c[6];

(function enumerate(face, c, left) {
  if (face > 6) { keepIndex.set(keyOf(c), keepCounts.length); keepCounts.push(c.slice()); return; }
  for (let n = 0; n <= left; n++) { c[face] = n; enumerate(face + 1, c, left - n); }
  c[face] = 0;
})(1, [0, 0, 0, 0, 0, 0, 0], 5);

const NK = keepCounts.length; // 462
const keepSize = keepCounts.map(c => c.reduce((a, b) => a + b, 0));
const child = new Int16Array(NK * 6).fill(-1);
for (let k = 0; k < NK; k++) {
  if (keepSize[k] === 5) continue;
  for (let f = 1; f <= 6; f++) {
    const c = keepCounts[k].slice(); c[f]++;
    child[k * 6 + f - 1] = keepIndex.get(keyOf(c));
  }
}
// Keeps with fewer than five dice, largest first (children resolve first).
const partialKeeps = [...Array(NK).keys()].filter(k => keepSize[k] < 5).sort((a, b) => keepSize[b] - keepSize[a]);

const handKeep = [...Array(NK).keys()].filter(k => keepSize[k] === 5);
const NH = handKeep.length; // 252
const fact = [1, 1, 2, 6, 24, 120];
const handProb = new Float64Array(NH);
const handYFace = new Int8Array(NH);
const handBase = new Int16Array(NH * NUM_CATS);
const subStart = new Int32Array(NH + 1);
const subList = [];
for (let h = 0; h < NH; h++) {
  const c = keepCounts[handKeep[h]];
  let denom = 1;
  for (let f = 1; f <= 6; f++) { denom *= fact[c[f]]; if (c[f] === 5) handYFace[h] = f; }
  handProb[h] = 120 / denom / 7776;
  for (let cat = 0; cat < NUM_CATS; cat++) handBase[h * NUM_CATS + cat] = baseScore(c, cat);
  // All sub-multisets of the hand, the whole hand first.
  subStart[h] = subList.length;
  const sub = [0, 0, 0, 0, 0, 0, 0];
  const subs = [];
  (function rec(f) {
    if (f > 6) { subs.push(keepIndex.get(keyOf(sub))); return; }
    for (let n = c[f]; n >= 0; n--) { sub[f] = n; rec(f + 1); }
    sub[f] = 0;
  })(1);
  subList.push(...subs);
}
subStart[NH] = subList.length;
const subs = Int16Array.from(subList);
const handOfKeep = new Int16Array(NK).fill(-1);
handKeep.forEach((k, h) => { handOfKeep[k] = h; });

// ---- Upper-section reachability ------------------------------------------

// reachable[upperMask * 64 + u]: can the filled upper boxes sum to u (capped)?
const reachable = new Uint8Array(64 * 64);
for (let m = 0; m < 64; m++) {
  let sums = new Set([0]);
  for (let f = 1; f <= 6; f++) {
    if (!((m >> (f - 1)) & 1)) continue;
    const next = new Set();
    for (const s of sums) for (let n = 0; n <= 5; n++) next.add(Math.min(UPPER_TARGET, s + n * f));
    sums = next;
  }
  for (const s of sums) reachable[m * 64 + s] = 1;
}

const stateIndex = (mask, u, y) => (mask * 64 + u) * 2 + y;

// ---- Per-round evaluation ------------------------------------------------

function placement(h, cat, mask) {
  if (handYFace[h] && (mask >> YAHTZEE) & 1) return placementScore(keepCounts[handKeep[h]], cat, mask);
  return handBase[h * NUM_CATS + cat];
}

/** Best category for a final hand: returns [value, cat]. */
function scoreHand(E, h, mask, u, y) {
  let best = -Infinity, bestCat = -1;
  const bonus = handYFace[h] && y && (mask >> YAHTZEE) & 1 ? YAHTZEE_BONUS : 0;
  for (let cat = 0; cat < NUM_CATS; cat++) {
    if ((mask >> cat) & 1) continue;
    const s = placement(h, cat, mask);
    if (s < 0) continue;
    let nu = u, ub = 0;
    if (cat < 6) { nu = Math.min(UPPER_TARGET, u + s); if (u < UPPER_TARGET && u + s >= UPPER_TARGET) ub = UPPER_BONUS; }
    const ny = y || (cat === YAHTZEE && s === 50) ? 1 : 0;
    const v = s + bonus + ub + E[stateIndex(mask | (1 << cat), nu, ny)];
    if (v > best) { best = v; bestCat = cat; }
  }
  return [best, bestCat];
}

/** Keep values from final-hand values: K[k] = expected value of holding k and rolling the rest. */
function keepValues(V, K) {
  for (let h = 0; h < NH; h++) K[handKeep[h]] = V[h];
  for (const k of partialKeeps) {
    const b = k * 6;
    K[k] = (K[child[b]] + K[child[b + 1]] + K[child[b + 2]] + K[child[b + 3]] + K[child[b + 4]] + K[child[b + 5]]) / 6;
  }
  return K;
}

function bestKeepValues(K, V) {
  for (let h = 0; h < NH; h++) {
    let best = -Infinity;
    for (let i = subStart[h]; i < subStart[h + 1]; i++) if (K[subs[i]] > best) best = K[subs[i]];
    V[h] = best;
  }
  return V;
}

function roundTables(E, mask, u, y) {
  const V3 = new Float64Array(NH), V2 = new Float64Array(NH), V1 = new Float64Array(NH);
  for (let h = 0; h < NH; h++) V3[h] = scoreHand(E, h, mask, u, y)[0];
  const K3 = keepValues(V3, new Float64Array(NK));
  bestKeepValues(K3, V2);
  const K2 = keepValues(V2, new Float64Array(NK));
  bestKeepValues(K2, V1);
  return { K3, K2, V1 };
}

// ---- Full table -----------------------------------------------------------

/** Build E for every reachable state. ~1M states; takes tens of seconds in Node. */
export function buildStrategy(onProgress) {
  const E = new Float64Array((ALL_FILLED + 1) * 64 * 2);
  const V = new Float64Array(NH), K = new Float64Array(NK);
  for (let mask = ALL_FILLED - 1; mask >= 0; mask--) {
    const upperMask = mask & 63;
    const yMax = (mask >> YAHTZEE) & 1;
    for (let u = 0; u < 64; u++) {
      if (!reachable[upperMask * 64 + u]) continue;
      for (let y = 0; y <= yMax; y++) {
        for (let h = 0; h < NH; h++) V[h] = scoreHand(E, h, mask, u, y)[0];
        keepValues(V, K); bestKeepValues(K, V);
        keepValues(V, K); bestKeepValues(K, V);
        let e = 0;
        for (let h = 0; h < NH; h++) e += handProb[h] * V[h];
        E[stateIndex(mask, u, y)] = e;
      }
    }
    if (onProgress && mask % 512 === 0) onProgress(1 - mask / ALL_FILLED);
  }
  return E;
}

export const expectedScore = E => E[stateIndex(0, 0, 0)];

// ---- Par: the optimal strategy on a fixed day's dice ------------------------

function handIndex(dice) { return handOfKeep[keepIndex.get(keyOf(countsOf(dice)))]; }

function bestKeep(K, dice) {
  const h = handIndex(dice);
  let best = -Infinity, bestK = -1;
  for (let i = subStart[h]; i < subStart[h + 1]; i++) if (K[subs[i]] > best) { best = K[subs[i]]; bestK = subs[i]; }
  return keepCounts[bestK];
}

/** Hold the leftmost dice matching the keep; the rest are rerolled. */
function holdMask(dice, keep) {
  const need = keep.slice();
  return dice.map(d => (need[d] > 0 ? (need[d]--, true) : false));
}

export function playPar(E, table) {
  let mask = 0, u = 0, y = 0, total = 0;
  const rounds = [];
  for (let t = 0; t < table.length; t++) {
    const { K3, K2 } = roundTables(E, mask, u, y);
    let dice = table[t][0].slice();
    const holds = [];
    for (const [r, K] of [[1, K2], [2, K3]]) {
      const held = holdMask(dice, bestKeep(K, dice));
      holds.push(held);
      if (held.every(Boolean)) break;
      dice = dice.map((d, i) => (held[i] ? d : table[t][r][i]));
    }
    const h = handIndex(dice);
    const [, cat] = scoreHand(E, h, mask, u, y);
    const score = placement(h, cat, mask);
    const bonus = handYFace[h] && y && (mask >> YAHTZEE) & 1 ? YAHTZEE_BONUS : 0;
    let ub = 0;
    if (cat < 6) { if (u < UPPER_TARGET && u + score >= UPPER_TARGET) ub = UPPER_BONUS; u = Math.min(UPPER_TARGET, u + score); }
    if (cat === YAHTZEE && score === 50) y = 1;
    mask |= 1 << cat;
    total += score + bonus + ub;
    rounds.push({ round: t, cat, dice: [...dice].sort((a, b) => a - b), holds, score, bonus });
  }
  return { total, plan: rounds };
}
