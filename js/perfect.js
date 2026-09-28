// The hindsight-perfect game: the highest score achievable on a day's dice if
// every die were known in advance. Each slot's final value is whichever roll
// last touched it, so a round has at most 3^5 reachable hands; an exact DP over
// (filled categories, upper subtotal, Yahtzee-scored-50) finds the optimum.

import {
  ALL_FILLED, NUM_CATS, YAHTZEE, UPPER_TARGET, UPPER_BONUS,
  countsOf, yahtzeeFace, baseScore, placementScore, yahtzeeBonus,
} from './rules.js';

function roundHands(round) {
  const seen = new Map();
  for (let code = 0; code < 243; code++) {
    const plan = [];
    let x = code;
    for (let i = 0; i < 5; i++) { plan.push(x % 3); x = Math.floor(x / 3); }
    const dice = plan.map((r, i) => round[r][i]);
    const key = [...dice].sort().join('');
    if (!seen.has(key)) seen.set(key, { dice: [...dice].sort((a, b) => a - b), plan, counts: countsOf(dice) });
  }
  const hands = [...seen.values()];
  const bestNonY = [];
  for (let c = 0; c < NUM_CATS; c++) {
    let best = null;
    for (const h of hands) {
      if (yahtzeeFace(h.counts)) continue;
      const s = baseScore(h.counts, c);
      if (!best || s > best.score) best = { score: s, hand: h };
    }
    bestNonY.push(best);
  }
  const yHands = hands.filter(h => yahtzeeFace(h.counts));
  return { bestNonY, yHands };
}

function popcount(x) { let n = 0; while (x) { x &= x - 1; n++; } return n; }

export function solvePerfect(table) {
  const rounds = table.map(roundHands);
  const memo = new Int32Array((ALL_FILLED + 1) * 64 * 2).fill(-1);

  // Every legal (category, hand) placement for the round implied by `mask`.
  function* options(mask, u, y) {
    const r = rounds[popcount(mask)];
    const yFilled = (mask >> YAHTZEE) & 1;
    for (let c = 0; c < NUM_CATS; c++) {
      if ((mask >> c) & 1) continue;
      const nb = r.bestNonY[c];
      if (nb) yield { cat: c, hand: nb.hand, score: nb.score, bonus: 0 };
      for (const h of r.yHands) {
        const score = yFilled ? placementScore(h.counts, c, mask) : baseScore(h.counts, c);
        if (score < 0) continue;
        yield { cat: c, hand: h, score, bonus: yahtzeeBonus(h.counts, mask, y) };
      }
    }
  }

  function step(mask, u, y, o) {
    const upper = o.cat < 6;
    const nu = upper ? Math.min(UPPER_TARGET, u + o.score) : u;
    const ub = upper && u < UPPER_TARGET && u + o.score >= UPPER_TARGET ? UPPER_BONUS : 0;
    const ny = y || (o.cat === YAHTZEE && o.score === 50) ? 1 : 0;
    return { next: [mask | (1 << o.cat), nu, ny], gain: o.score + o.bonus + ub, upperBonus: ub };
  }

  function value(mask, u, y) {
    if (mask === ALL_FILLED) return 0;
    const key = (mask * 64 + u) * 2 + y;
    if (memo[key] >= 0) return memo[key];
    let best = 0;
    for (const o of options(mask, u, y)) {
      const s = step(mask, u, y, o);
      const v = s.gain + value(...s.next);
      if (v > best) best = v;
    }
    memo[key] = best;
    return best;
  }

  const total = value(0, 0, 0);
  const plan = [];
  let state = [0, 0, 0];
  for (let t = 0; t < table.length; t++) {
    const target = value(...state);
    let chosen = null;
    for (const o of options(...state)) {
      const s = step(...state, o);
      if (s.gain + value(...s.next) === target) { chosen = { o, s }; break; }
    }
    const { o, s } = chosen;
    plan.push({ round: t, cat: o.cat, dice: o.hand.dice, rolls: o.hand.plan, score: o.score, bonus: o.bonus });
    state = s.next;
  }
  return { total, plan };
}
