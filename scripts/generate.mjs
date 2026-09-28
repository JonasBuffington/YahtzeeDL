// Generates upcoming daily puzzles: puzzles/YYYY-MM-DD.json.
//
// Each puzzle gets a fresh random seed (so future days can't be predicted from
// the date), plus the precomputed Par and Perfect scores. Existing puzzles are
// never modified. Covers yesterday..today+2 in UTC so every time zone's
// "today" is always published.
//
//   node scripts/generate.mjs              # fill the window
//   node scripts/generate.mjs --days 7     # look further ahead

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diceTable } from '../js/rng.js';
import { solvePerfect } from '../js/perfect.js';
import { buildStrategy, expectedScore, playPar } from '../js/strategy.js';
import { EPOCH, addDays, puzzleNumber, utcDateKey } from '../js/dates.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'puzzles');
const cacheFile = join(root, '.cache', 'strategy.bin');

const daysAhead = Number(process.argv[process.argv.indexOf('--days') + 1]) || 2;
const today = utcDateKey(new Date());
const dates = [];
for (let n = -1; n <= daysAhead; n++) {
  const key = addDays(today, n);
  if (key >= EPOCH && !existsSync(join(outDir, key + '.json'))) dates.push(key);
}

if (!dates.length) {
  console.log('All puzzles up to date.');
  process.exit(0);
}

function loadStrategy() {
  if (existsSync(cacheFile)) {
    const buf = readFileSync(cacheFile);
    return new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8);
  }
  console.log('Building optimal strategy table…');
  const started = Date.now();
  const E = buildStrategy();
  console.log(`  done in ${((Date.now() - started) / 1000).toFixed(1)}s, E = ${expectedScore(E).toFixed(4)}`);
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, Buffer.from(E.buffer));
  return E;
}

const E = loadStrategy();
mkdirSync(outDir, { recursive: true });

for (const date of dates) {
  const seed = randomBytes(8).toString('hex');
  const table = diceTable(seed);
  const par = playPar(E, table);
  const perfect = solvePerfect(table);
  const puzzle = {
    date,
    number: puzzleNumber(date),
    seed,
    par: par.total,
    perfect: perfect.total,
    parPlan: par.plan.map(({ cat, dice, score, bonus }) => ({ cat, dice, score, bonus })),
    perfectPlan: perfect.plan.map(({ cat, dice, score, bonus }) => ({ cat, dice, score, bonus })),
  };
  writeFileSync(join(outDir, date + '.json'), JSON.stringify(puzzle) + '\n');
  console.log(`${date}  No. ${puzzle.number}  par ${par.total}  perfect ${perfect.total}`);
}
