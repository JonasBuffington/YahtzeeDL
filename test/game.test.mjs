import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countsOf, baseScore, placementScore, yahtzeeBonus, totals,
  THREE_KIND, FOUR_KIND, FULL_HOUSE, SMALL_STRAIGHT, LARGE_STRAIGHT, YAHTZEE, CHANCE,
} from '../js/rules.js';
import { diceTable } from '../js/rng.js';
import { solvePerfect } from '../js/perfect.js';
import { buildStrategy, expectedScore, playPar } from '../js/strategy.js';
import { summarize } from '../js/storage.js';
import { puzzleNumber, addDays } from '../js/dates.js';

const s = (dice, cat) => baseScore(countsOf(dice), cat);
const bit = c => 1 << c;

test('base scoring', () => {
  assert.equal(s([1, 1, 3, 1, 5], 0), 3);
  assert.equal(s([6, 6, 6, 2, 1], 5), 18);
  assert.equal(s([4, 4, 4, 2, 1], THREE_KIND), 15);
  assert.equal(s([4, 4, 2, 2, 1], THREE_KIND), 0);
  assert.equal(s([4, 4, 4, 4, 1], FOUR_KIND), 17);
  assert.equal(s([3, 3, 5, 5, 5], FULL_HOUSE), 25);
  assert.equal(s([5, 5, 5, 5, 5], FULL_HOUSE), 0);
  assert.equal(s([1, 3, 2, 4, 4], SMALL_STRAIGHT), 30);
  assert.equal(s([3, 4, 5, 6, 1], SMALL_STRAIGHT), 30);
  assert.equal(s([1, 2, 3, 5, 6], SMALL_STRAIGHT), 0);
  assert.equal(s([2, 3, 4, 5, 6], LARGE_STRAIGHT), 40);
  assert.equal(s([1, 2, 3, 4, 6], LARGE_STRAIGHT), 0);
  assert.equal(s([2, 2, 2, 2, 2], YAHTZEE), 50);
  assert.equal(s([6, 5, 4, 3, 1], CHANCE), 19);
});

test('forced joker rule', () => {
  const y = countsOf([4, 4, 4, 4, 4]);
  const yFilled = bit(YAHTZEE);
  // Upper Fours open: must go there.
  assert.equal(placementScore(y, 3, yFilled), 20);
  assert.equal(placementScore(y, FULL_HOUSE, yFilled), -1);
  // Upper Fours filled: lower boxes score in full.
  const mask = yFilled | bit(3);
  assert.equal(placementScore(y, FULL_HOUSE, mask), 25);
  assert.equal(placementScore(y, SMALL_STRAIGHT, mask), 30);
  assert.equal(placementScore(y, LARGE_STRAIGHT, mask), 40);
  assert.equal(placementScore(y, CHANCE, mask), 20);
  assert.equal(placementScore(y, 0, mask), -1);
  // All lower filled: zero an upper box.
  const lowerFull = 0b1111111000000 | bit(3);
  assert.equal(placementScore(y, 0, lowerFull), 0);
  // Yahtzee box still open: no joker.
  assert.equal(placementScore(y, FULL_HOUSE, bit(3)), 0);
  // Bonus only when the Yahtzee box holds 50.
  assert.equal(yahtzeeBonus(y, yFilled, true), 100);
  assert.equal(yahtzeeBonus(y, yFilled, false), 0);
});

test('totals', () => {
  const card = [3, 6, 9, 12, 15, 18, 20, 0, 25, 30, 40, 50, 22];
  assert.deepEqual(totals(card, 100), { upper: 63, bonus: 35, lower: 187, yahtzeeBonus: 100, total: 385 });
});

test('dice table is deterministic', () => {
  assert.deepEqual(diceTable('abc'), diceTable('abc'));
  assert.notDeepEqual(diceTable('abc'), diceTable('abd'));
  const flat = diceTable('abc').flat(2);
  assert.equal(flat.length, 13 * 3 * 5);
  assert.ok(flat.every(d => d >= 1 && d <= 6));
});

// A random legal player: perfect must never be beaten.
function randomPlay(table, rand) {
  const card = Array(13).fill(null);
  let yb = 0;
  for (let t = 0; t < 13; t++) {
    let dice = table[t][0].slice();
    for (let r = 1; r < 3; r++) dice = dice.map((d, i) => (rand() < 0.5 ? d : table[t][r][i]));
    const counts = countsOf(dice);
    const mask = card.reduce((m, v, i) => (v === null ? m : m | bit(i)), 0);
    const open = card.map((v, i) => i).filter(i => card[i] === null && placementScore(counts, i, mask) >= 0);
    const c = open[Math.floor(rand() * open.length)];
    yb += yahtzeeBonus(counts, mask, card[YAHTZEE] === 50);
    card[c] = placementScore(counts, c, mask);
  }
  return totals(card, yb).total;
}

test('perfect plan is consistent and unbeaten by random play', () => {
  let x = 1;
  const rand = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 20; k++) {
    const table = diceTable('perfect-' + k);
    const p = solvePerfect(table);
    const card = Array(13).fill(null);
    let yb = 0;
    p.plan.forEach(e => { card[e.cat] = e.score; yb += e.bonus; });
    assert.equal(totals(card, yb).total, p.total);
    // Each planned hand is reachable in its round.
    p.plan.forEach(e => {
      const dice = e.rolls.map((r, i) => table[e.round][r][i]).sort((a, b) => a - b);
      assert.deepEqual(dice, e.dice);
    });
    for (let n = 0; n < 50; n++) assert.ok(randomPlay(table, rand) <= p.total);
  }
});

test('optimal strategy matches the known expected score, par <= perfect', () => {
  const E = buildStrategy();
  // 254.5896 is Verhoeff's value with the free-choice joker; the official
  // forced-joker rule used here is worth slightly less.
  assert.equal(expectedScore(E).toFixed(4), '254.5877');
  for (let k = 0; k < 10; k++) {
    const table = diceTable('par-' + k);
    assert.ok(playPar(E, table).total <= solvePerfect(table).total);
  }
});

test('dates and streaks', () => {
  assert.equal(puzzleNumber('2026-09-27'), 1);
  assert.equal(puzzleNumber('2026-10-27'), 31);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  const g = { score: 200, par: 250, perfect: 350 };
  const history = { '2026-09-27': g, '2026-09-28': g, '2026-09-30': g, '2026-10-01': g, '2026-10-02': g };
  const s = summarize(history, '2026-10-03');
  assert.equal(s.played, 5);
  assert.equal(s.best, 3);
  assert.equal(s.current, 3);
  assert.equal(summarize(history, '2026-10-04').current, 0);
});
