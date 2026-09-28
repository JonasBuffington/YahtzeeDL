// Scoring rules (official Hasbro rules, including Yahtzee bonuses and the
// forced-joker rule). Shared by the game, the solvers and the generator.

export const CATEGORIES = [
  { id: 'ones',   name: 'Aces',            hint: 'Sum of ones',          upper: true },
  { id: 'twos',   name: 'Twos',            hint: 'Sum of twos',          upper: true },
  { id: 'threes', name: 'Threes',          hint: 'Sum of threes',        upper: true },
  { id: 'fours',  name: 'Fours',           hint: 'Sum of fours',         upper: true },
  { id: 'fives',  name: 'Fives',           hint: 'Sum of fives',         upper: true },
  { id: 'sixes',  name: 'Sixes',           hint: 'Sum of sixes',         upper: true },
  { id: 'three',  name: 'Three of a Kind', hint: 'Sum of all dice' },
  { id: 'four',   name: 'Four of a Kind',  hint: 'Sum of all dice' },
  { id: 'full',   name: 'Full House',      hint: 'Twenty-five' },
  { id: 'small',  name: 'Small Straight',  hint: 'Thirty' },
  { id: 'large',  name: 'Large Straight',  hint: 'Forty' },
  { id: 'yahtzee', name: 'Yahtzee',        hint: 'Fifty' },
  { id: 'chance', name: 'Chance',          hint: 'Sum of all dice' },
];

export const NUM_CATS = 13;
export const ALL_FILLED = (1 << NUM_CATS) - 1;
export const THREE_KIND = 6, FOUR_KIND = 7, FULL_HOUSE = 8,
  SMALL_STRAIGHT = 9, LARGE_STRAIGHT = 10, YAHTZEE = 11, CHANCE = 12;
const LOWER_MASK = 0b1111111000000;
export const UPPER_TARGET = 63;
export const UPPER_BONUS = 35;
export const YAHTZEE_BONUS = 100;
export const ROUNDS = 13;
export const ROLLS = 3;

/** counts[1..6] for an array of dice values. */
export function countsOf(dice) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
}

function sumOf(c) {
  return c[1] + 2 * c[2] + 3 * c[3] + 4 * c[4] + 5 * c[5] + 6 * c[6];
}

/** Face of a Yahtzee (five of a kind), or 0. */
export function yahtzeeFace(c) {
  for (let f = 1; f <= 6; f++) if (c[f] === 5) return f;
  return 0;
}

/** Score for a hand in a category, ignoring joker rules. */
export function baseScore(c, cat) {
  if (cat < 6) return c[cat + 1] * (cat + 1);
  let max = 0, pair = false, three = false;
  for (let f = 1; f <= 6; f++) {
    if (c[f] > max) max = c[f];
    if (c[f] === 2) pair = true;
    if (c[f] === 3) three = true;
  }
  switch (cat) {
    case THREE_KIND: return max >= 3 ? sumOf(c) : 0;
    case FOUR_KIND: return max >= 4 ? sumOf(c) : 0;
    case FULL_HOUSE: return pair && three ? 25 : 0;
    case SMALL_STRAIGHT:
      return (c[1] && c[2] && c[3] && c[4]) || (c[2] && c[3] && c[4] && c[5]) ||
        (c[3] && c[4] && c[5] && c[6]) ? 30 : 0;
    case LARGE_STRAIGHT:
      return c[2] && c[3] && c[4] && c[5] && (c[1] || c[6]) ? 40 : 0;
    case YAHTZEE: return max === 5 ? 50 : 0;
    case CHANCE: return sumOf(c);
  }
  return 0;
}

/**
 * Score for placing a hand in an open category, applying the forced-joker rule.
 * `filled` is a bitmask of filled categories. Returns -1 if the placement is
 * not allowed (a joker Yahtzee must go in its matching upper box when open).
 */
export function placementScore(c, cat, filled) {
  const f = yahtzeeFace(c);
  if (f && (filled >> YAHTZEE) & 1) {
    if (!((filled >> (f - 1)) & 1)) return cat === f - 1 ? 5 * f : -1;
    if (cat < 6) return (filled & LOWER_MASK) === LOWER_MASK ? 0 : -1;
    if (cat === FULL_HOUSE) return 25;
    if (cat === SMALL_STRAIGHT) return 30;
    if (cat === LARGE_STRAIGHT) return 40;
    return 5 * f; // three/four of a kind, chance
  }
  return baseScore(c, cat);
}

/** Yahtzee bonus earned by this hand, given the box state. */
export function yahtzeeBonus(c, filled, yahtzeeScored50) {
  return yahtzeeFace(c) && yahtzeeScored50 && (filled >> YAHTZEE) & 1 ? YAHTZEE_BONUS : 0;
}

/** Totals for a scorecard: card is an array of 13 (number|null). */
export function totals(card, yahtzeeBonusTotal = 0) {
  let upper = 0, lower = 0;
  for (let i = 0; i < 6; i++) upper += card[i] ?? 0;
  for (let i = 6; i < 13; i++) lower += card[i] ?? 0;
  const bonus = upper >= UPPER_TARGET ? UPPER_BONUS : 0;
  return { upper, bonus, lower, yahtzeeBonus: yahtzeeBonusTotal, total: upper + bonus + lower + yahtzeeBonusTotal };
}
