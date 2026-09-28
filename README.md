# Yahtzee Daily

One game of Yahtzee a day. Everyone rolls the same dice.

**Play:** https://jonasbuffington.github.io/YahtzeeDL/

## How the daily works

Each day has a random seed. From it, every round, roll and die position gets one
fixed value: rerolling the third die on your second roll of round five gives the
same number for everyone. Players differ only in their decisions.

Your score is measured against two numbers, both precomputed for each puzzle:

- **Par**: the score of the optimal strategy (maximum expected score, E ≈ 254.59)
  playing today's dice with no knowledge of future rolls.
- **Perfect**: the best score possible with full hindsight. Each die ends as
  whichever roll last touched it, so a round has at most 3⁵ reachable hands and
  an exact DP over (filled boxes, upper subtotal, Yahtzee scored) finds the optimum.

Rules are the official ones, including the 35-point upper bonus, 100-point
Yahtzee bonuses and the forced joker rule.

## Layout

```
index.html, css/, js/     the static site (vanilla ES modules, no build step)
js/rules.js               scoring
js/rng.js                 seed → dice table
js/perfect.js             hindsight-perfect solver (also runs in the browser as a fallback)
js/strategy.js            optimal-strategy table and par player (Node only)
scripts/generate.mjs      writes puzzles/YYYY-MM-DD.json for the coming days
puzzles/                  published puzzles
test/                     node --test
```

The `Daily puzzles & deploy` workflow runs every six hours and on every push.
It runs the tests, generates any missing puzzles (yesterday to two days ahead in
UTC, so every time zone's "today" exists), commits them, and deploys to Pages.
If a puzzle file is ever missing, the site falls back to a date-derived seed
and computes Perfect locally (Par is then unavailable).

## Develop

```sh
npm test            # rules, solvers (≈20 s: builds the strategy table)
npm run generate    # create upcoming puzzles
npm run serve       # http://localhost:8080 (modules need a server, not file://)
```

Progress and history live in `localStorage` (`ydl:v1:*`); the per-game log is
kept so achievements can be derived later.
