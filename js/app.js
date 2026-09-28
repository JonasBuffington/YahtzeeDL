import {
  CATEGORIES, ROUNDS, ROLLS, YAHTZEE, UPPER_TARGET,
  countsOf, placementScore, yahtzeeBonus, yahtzeeFace, totals,
} from './rules.js';
import { diceTable, fallbackSeed } from './rng.js';
import { solvePerfect } from './perfect.js';
import { dateKey, puzzleNumber, longDate } from './dates.js';
import * as store from './storage.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(resolve => setTimeout(resolve, reduceMotion ? 0 : ms));
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'];
const $ = id => document.getElementById(id);

let puzzle, table, game;
let busy = false;
let shownDice = null; // dice kept on screen during the between-rounds interlude

// ---------- Puzzle & game state ----------

async function loadPuzzle(date) {
  try {
    const res = await fetch(`puzzles/${date}.json`, { cache: 'no-cache' });
    if (res.ok) return await res.json();
  } catch { /* offline or not yet published */ }
  return localPuzzle(date, fallbackSeed(date));
}

function localPuzzle(date, seed) {
  const perfect = solvePerfect(diceTable(seed));
  return { date, number: puzzleNumber(date), seed, par: null, perfect: perfect.total, perfectPlan: perfect.plan, parPlan: null };
}

function newGame(date, seed) {
  return {
    date, seed, round: 0, roll: 0,
    dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false],
    card: Array(ROUNDS).fill(null), yBonus: 0, log: [], done: false,
  };
}

const filledMask = () => game.card.reduce((m, v, i) => (v === null ? m : m | (1 << i)), 0);
const score = () => totals(game.card, game.yBonus);

// ---------- DOM construction ----------

function buildDice() {
  const wrap = $('dice');
  for (let i = 0; i < 5; i++) {
    const die = document.createElement('button');
    die.className = 'die';
    for (let p = 1; p <= 9; p++) {
      const pip = document.createElement('span');
      pip.className = 'pip p' + p;
      die.append(pip);
    }
    die.addEventListener('click', () => toggleHold(i));
    wrap.append(die);
  }
}

function buildCard() {
  CATEGORIES.forEach((cat, c) => {
    const row = document.createElement('button');
    row.className = 'row';
    row.dataset.cat = c;
    row.innerHTML = `<span class="row-name">${cat.name}<span class="row-hint">${cat.hint}</span></span><span class="row-value"></span>`;
    row.addEventListener('click', () => scoreCategory(c));
    row.addEventListener('animationend', () => row.classList.remove('just-scored'));
    $(cat.upper ? 'upper-rows' : 'lower-rows').append(row);
  });
  for (let r = 0; r < ROUNDS; r++) $('progress').append(document.createElement('li'));
}

// ---------- Rendering ----------

function render() {
  const { round, roll, done } = game;

  [...$('progress').children].forEach((li, r) => {
    li.classList.toggle('done', r < round);
    li.classList.toggle('current', r === round && !done);
  });

  $('round-numeral').textContent = ROMAN[Math.min(round, ROUNDS - 1)];
  const left = ROLLS - roll;
  $('rolls').innerHTML = done ? 'Game complete'
    : `<span class="roll-pips">${[0, 1, 2].map(i => `<span class="${i < roll ? 'used' : ''}"></span>`).join('')}</span>` +
      (roll === 0 ? 'Three rolls' : left ? `${left === 1 ? 'One roll' : 'Two rolls'} left` : 'No rolls left');

  renderDice();

  const rb = $('roll-button');
  rb.textContent = done ? 'Game complete' : roll === 0 ? 'Roll' : roll < ROLLS ? 'Roll again' : 'Choose a box';
  rb.disabled = busy || done || roll >= ROLLS;

  $('hint').textContent = done ? 'That’s the game. See you tomorrow.'
    : roll === 0 ? (round === 0 ? 'Roll the dice to begin.' : ' ')
    : roll < ROLLS ? 'Select dice to hold them, or choose a box.'
    : 'Choose a box to score.';

  renderCard();
}

function renderDice() {
  const dice = shownDice ?? (game.roll ? game.dice : null);
  [...$('dice').children].forEach((die, i) => {
    const face = dice ? dice[i] : 0;
    die.dataset.face = face;
    die.classList.toggle('blank', !face);
    die.classList.toggle('held', !shownDice && !!game.roll && game.held[i]);
    die.disabled = busy || game.done || !game.roll || game.roll >= ROLLS;
    die.setAttribute('aria-label', face ? `Die ${i + 1}: ${face}${game.held[i] ? ', held' : ''}` : `Die ${i + 1}`);
    die.setAttribute('aria-pressed', String(!!game.held[i]));
  });
}

function renderCard() {
  const counts = game.roll ? countsOf(game.dice) : null;
  const mask = filledMask();
  document.querySelectorAll('.row[data-cat]').forEach(row => {
    const c = Number(row.dataset.cat);
    const value = row.querySelector('.row-value');
    const filled = game.card[c];
    row.classList.remove('available', 'forbidden', 'filled', 'scratched');
    row.removeAttribute('aria-disabled');
    if (filled !== null) {
      row.classList.add('filled');
      if (filled === 0) row.classList.add('scratched');
      value.textContent = filled;
      row.setAttribute('aria-disabled', 'true');
      row.setAttribute('aria-label', `${CATEGORIES[c].name}: scored ${filled}`);
    } else if (counts && !game.done && !busy) {
      const s = placementScore(counts, c, mask);
      if (s < 0) {
        row.classList.add('forbidden');
        value.innerHTML = '<span class="potential zero">—</span>';
        row.setAttribute('aria-disabled', 'true');
        row.setAttribute('aria-label', `${CATEGORIES[c].name}: not allowed for a joker Yahtzee`);
      } else {
        row.classList.add('available');
        value.innerHTML = `<span class="potential${s ? '' : ' zero'}">${s}</span>`;
        row.setAttribute('aria-label', `Score ${s} in ${CATEGORIES[c].name}`);
      }
    } else {
      value.textContent = '';
      row.setAttribute('aria-disabled', 'true');
      row.setAttribute('aria-label', CATEGORIES[c].name);
    }
  });

  const t = score();
  $('upper-subtotal').innerHTML = t.upper >= UPPER_TARGET ? `${t.upper}` : `${t.upper}<span class="muted"> / ${UPPER_TARGET}</span>`;
  const upperDone = game.card.slice(0, 6).every(v => v !== null);
  const ub = $('upper-bonus');
  ub.textContent = t.bonus ? '35' : upperDone ? '0' : '—';
  ub.classList.toggle('earned', !!t.bonus);
  const yb = $('yahtzee-bonus');
  yb.textContent = game.yBonus ? `${game.yBonus}` : '—';
  yb.classList.toggle('earned', !!game.yBonus);
  $('grand-total').textContent = t.total;
}

function retrigger(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

// ---------- Actions ----------

async function roll() {
  if (busy || game.done || game.roll >= ROLLS) return;
  const r = game.roll;
  const rolling = [];
  for (let i = 0; i < 5; i++) {
    if (r === 0 || !game.held[i]) {
      game.dice[i] = table[game.round][r][i];
      rolling.push(i);
    }
  }
  game.roll++;
  if (game.roll >= ROLLS) game.held = game.held.map(() => false);
  store.saveGame(game);

  busy = true;
  render();
  await animateRoll(rolling);
  busy = false;
  render();
}

async function animateRoll(indices) {
  if (reduceMotion || !indices.length) return;
  const dice = [...$('dice').children];
  const flicker = () => indices.forEach(i => { if (dice[i].classList.contains('rolling')) dice[i].dataset.face = 1 + Math.floor(Math.random() * 6); });
  indices.forEach(i => { dice[i].classList.remove('settle'); dice[i].classList.add('rolling'); });
  flicker();
  const timer = setInterval(flicker, 70);
  await wait(380);
  for (const i of indices) {
    dice[i].classList.remove('rolling');
    dice[i].dataset.face = game.dice[i];
    retrigger(dice[i], 'settle');
    await wait(70);
  }
  clearInterval(timer);
  await wait(200);
  indices.forEach(i => dice[i].classList.remove('settle'));
}

function toggleHold(i) {
  if (busy || game.done || !game.roll || game.roll >= ROLLS) return;
  game.held[i] = !game.held[i];
  store.saveGame(game);
  renderDice();
}

async function scoreCategory(c) {
  if (busy || game.done || !game.roll || game.card[c] !== null) return;
  const counts = countsOf(game.dice);
  const mask = filledMask();
  const s = placementScore(counts, c, mask);
  if (s < 0) {
    toast(`A joker Yahtzee must go in ${CATEGORIES[yahtzeeFace(counts) - 1].name} while it’s open.`);
    return;
  }
  const before = score();
  const bonus = yahtzeeBonus(counts, mask, game.card[YAHTZEE] === 50);

  shownDice = [...game.dice];
  game.card[c] = s;
  game.yBonus += bonus;
  game.log.push({ round: game.round, cat: c, dice: [...game.dice], rolls: game.roll, score: s, bonus });
  game.round++;
  game.roll = 0;
  game.dice = [0, 0, 0, 0, 0];
  game.held = game.held.map(() => false);
  game.done = game.round >= ROUNDS;
  store.saveGame(game);
  if (game.done) recordResult();

  busy = true;
  render();
  retrigger(document.querySelector(`.row[data-cat="${c}"]`), 'just-scored');
  const after = score();
  if (after.total !== before.total) retrigger($('grand-total'), 'bump');
  if (after.bonus && !before.bonus) { retrigger($('upper-bonus'), 'bump'); toast('Upper bonus earned: +35'); }
  if (bonus) { retrigger($('yahtzee-bonus'), 'bump'); toast('Yahtzee bonus: +100'); }

  await wait(650);
  $('dice').classList.add('away');
  await wait(300);
  shownDice = null;
  renderDice();
  await interlude(game.done ? 'The End' : 'Round', game.done ? 'Fin.' : ROMAN[game.round]);
  $('dice').classList.remove('away');
  busy = false;
  render();
  if (game.done) showResults(true);
}

async function interlude(kicker, text) {
  const el = $('interlude');
  $('interlude-kicker').textContent = kicker;
  $('interlude-numeral').textContent = text;
  if (reduceMotion) return;
  retrigger(el, 'show');
  await wait(1250);
  el.classList.remove('show');
}

// ---------- Results & stats ----------

function recordResult() {
  const t = score();
  store.recordResult(game.date, {
    number: puzzle.number, score: t.total, par: puzzle.par, perfect: puzzle.perfect,
    upperBonus: t.bonus > 0,
    yahtzees: game.log.filter(e => yahtzeeFace(countsOf(e.dice))).length,
    card: game.card,
  });
}

function verdict(pct) {
  if (pct >= 0.95) return 'Flawless';
  if (pct >= 0.85) return 'Masterful';
  if (pct >= 0.75) return 'Distinguished';
  if (pct >= 0.65) return 'Commendable';
  if (pct >= 0.55) return 'Steady';
  return 'A humble outing';
}

function parCaption(total) {
  if (puzzle.par == null) return '';
  const d = total - puzzle.par;
  return d > 0 ? `${d} above par` : d < 0 ? `${-d} below par` : 'Level with par';
}

const miniDice = dice => `<span class="mini-dice">${dice.map(d => `<span>${d}</span>`).join('')}</span>`;

function planTable(rows) {
  return `<table class="ledger"><thead><tr><th>Rd.</th><th>Dice</th><th>Box</th><th class="n">Pts</th></tr></thead><tbody>${
    rows.map((e, i) => `<tr><td>${ROMAN[i]}</td><td>${miniDice(e.dice)}</td><td>${CATEGORIES[e.cat].name}</td><td class="n">${e.score}${e.bonus ? `<span class="muted"> +${e.bonus}</span>` : ''}</td></tr>`).join('')
  }</tbody></table>`;
}

function showResults(animate) {
  const t = score();
  const pct = t.total / puzzle.perfect;
  const pos = v => `${Math.min(100, (v / puzzle.perfect) * 100).toFixed(2)}%`;
  const caption = [parCaption(t.total), `${Math.round(pct * 100)}% of perfect`].filter(Boolean).join(' · ');

  $('results').innerHTML = `
    <p class="kicker">No. ${puzzle.number} · ${longDate(puzzle.date)}</p>
    <p class="final" id="final-score">${animate && !reduceMotion ? 0 : t.total}</p>
    <p class="verdict">${verdict(pct)}</p>
    <div class="versus">
      <div><span class="num">${t.total}</span><span class="label">You</span></div>
      <div><span class="num">${puzzle.par ?? '—'}</span><span class="label">Par</span></div>
      <div><span class="num">${puzzle.perfect}</span><span class="label">Perfect</span></div>
    </div>
    <div class="measure" aria-hidden="true">
      <div class="measure-track">
        <div class="measure-fill" id="measure-fill" style="width:${pos(t.total)}"></div>
        ${puzzle.par != null ? `<div class="measure-mark par" style="left:${pos(puzzle.par)}"><span>par</span></div>` : ''}
        <div class="measure-mark end" style="left:100%"><span>perfect</span></div>
        <div class="measure-mark you" style="left:${pos(t.total)}"><span>${t.total}</span></div>
      </div>
    </div>
    <p class="measure-caption">${caption}</p>
    <div class="actions">
      <button class="button primary" id="share-button">Share</button>
      <button class="button" id="card-button">Scorecard</button>
    </div>
    <p class="countdown">Next game in <strong id="countdown"></strong></p>
    <details class="replay"><summary>Your game</summary>${planTable(game.log)}</details>
    ${puzzle.parPlan ? `<details class="replay"><summary>Par’s game · ${puzzle.par}</summary>${planTable(puzzle.parPlan)}</details>` : ''}
    <details class="replay"><summary>The perfect game · ${puzzle.perfect}</summary>${planTable(puzzle.perfectPlan)}</details>
  `;
  $('share-button').addEventListener('click', share);
  $('card-button').addEventListener('click', () => $('results-dialog').close());
  openDialog('results-dialog');

  requestAnimationFrame(() => requestAnimationFrame(() => { $('measure-fill').style.transform = 'scaleX(1)'; }));
  if (animate && !reduceMotion) countUp($('final-score'), t.total, 1100);
  tickCountdown();
}

function countUp(node, target, ms) {
  const start = performance.now();
  const step = now => {
    const k = Math.min(1, (now - start) / ms);
    node.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let countdownTimer;
function tickCountdown() {
  clearInterval(countdownTimer);
  const update = () => {
    const node = $('countdown');
    if (!node || !$('results-dialog').open) return clearInterval(countdownTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const s = Math.max(0, Math.floor((next - now) / 1000));
    const p = n => String(n).padStart(2, '0');
    node.textContent = `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  };
  update();
  countdownTimer = setInterval(update, 1000);
}

function shareText() {
  const t = score();
  const perfectByCat = [];
  for (const e of puzzle.perfectPlan) perfectByCat[e.cat] = e.score;
  const square = c => {
    const v = game.card[c];
    return v === 0 ? '⬛' : v >= perfectByCat[c] ? '🟩' : '🟨';
  };
  const upper = [0, 1, 2, 3, 4, 5].map(square).join('');
  const lower = [6, 7, 8, 9, 10, 11, 12].map(square).join('');
  const line2 = [puzzle.par != null ? `Par ${puzzle.par}` : null, `Perfect ${puzzle.perfect}`].filter(Boolean).join(' · ');
  return `Yahtzee Daily No. ${puzzle.number} — ${t.total}\n${line2}\n${upper}\n${lower}\n${location.origin}${location.pathname}`;
}

async function share() {
  const text = shareText();
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* dismissed */ }
    } else {
      toast('Couldn’t copy — your browser blocked the clipboard');
    }
  }
}

function showStats() {
  const s = store.summarize(store.loadHistory(), dateKey());
  const stat = (num, label) => `<div><span class="num">${num}</span><span class="label">${label}</span></div>`;
  $('stat-grid').innerHTML =
    stat(s.played, 'Played') + stat(s.current, 'Current streak') + stat(s.best, 'Best streak') +
    stat(s.played ? Math.round(s.avgPct * 100) + '%' : '—', 'Average of perfect');
  $('stats-extra').innerHTML = s.played ? `
    <p class="measure-caption" style="text-align:center">Best score ${s.bestScore} · beat or matched par ${s.beatPar} ${s.beatPar === 1 ? 'time' : 'times'}</p>
    <h3>Recent games</h3>
    <table class="ledger"><thead><tr><th>No.</th><th class="n">Score</th><th class="n">Par</th><th class="n">Perfect</th></tr></thead><tbody>${
      s.recent.map(g => `<tr class="${g.date === puzzle.date ? 'highlight' : ''}"><td>${g.number}</td><td class="n">${g.score}</td><td class="n">${g.par ?? '—'}</td><td class="n">${g.perfect}</td></tr>`).join('')
    }</tbody></table>
    ${game.done ? '<div class="actions"><button class="button" id="today-button">Today’s result</button></div>' : ''}
  ` : '<p class="measure-caption" style="text-align:center">Finish today’s game to start your record.</p>';
  $('today-button')?.addEventListener('click', () => { $('stats-dialog').close(); showResults(false); });
  openDialog('stats-dialog');
}

// ---------- Misc UI ----------

function openDialog(id) {
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  const dialog = $(id);
  dialog.showModal();
  dialog.focus();
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function bindEvents() {
  $('roll-button').addEventListener('click', roll);
  $('help-button').addEventListener('click', () => openDialog('help-dialog'));
  $('stats-button').addEventListener('click', showStats);
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    const onButton = e.target instanceof HTMLButtonElement;
    if ((e.key === ' ' || e.key === 'Enter') && !onButton) { e.preventDefault(); roll(); }
    else if (e.key === 'r' || e.key === 'R') roll();
    else if (/^[1-5]$/.test(e.key)) toggleHold(Number(e.key) - 1);
  });

  // A new day's puzzle, unless a game is mid-flight (it can still be finished).
  document.addEventListener('visibilitychange', () => {
    const idle = game.done || (game.round === 0 && game.roll === 0);
    if (document.visibilityState === 'visible' && dateKey() !== puzzle.date && idle) location.reload();
  });
}

// ---------- Start ----------

async function init() {
  const today = dateKey();
  puzzle = await loadPuzzle(today);
  game = store.loadGame(today);
  if (game && game.seed !== puzzle.seed) puzzle = localPuzzle(today, game.seed);
  if (!game) game = newGame(today, puzzle.seed);
  table = diceTable(puzzle.seed);

  $('edition').textContent = `No. ${puzzle.number} · ${longDate(today)}`;
  buildDice();
  buildCard();
  bindEvents();
  render();

  if (!store.hasSeenHelp()) {
    store.markHelpSeen();
    openDialog('help-dialog');
  } else if (game.done) {
    showResults(false);
  }
}

init();
