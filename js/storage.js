// Local persistence: the in-progress game per day, and a history of finished
// games (the basis for streaks and, later, achievements).

import { addDays } from './dates.js';

const PREFIX = 'ydl:v1:';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* private mode */ }
}

export const loadGame = date => read('game:' + date, null);
export const saveGame = game => write('game:' + game.date, game);

export const loadHistory = () => read('history', {});

export function recordResult(date, result) {
  const history = loadHistory();
  if (!history[date]) {
    history[date] = result;
    write('history', history);
  }
  return history;
}

export const hasSeenHelp = () => read('seen-help', false);
export const markHelpSeen = () => write('seen-help', true);

export function summarize(history, today) {
  const dates = Object.keys(history).sort();
  const games = dates.map(d => history[d]);
  const played = games.length;

  let best = 0, run = 0, prev = null;
  for (const d of dates) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  // The current streak survives until a whole day is missed.
  let current = 0;
  let cursor = history[today] ? today : addDays(today, -1);
  while (history[cursor]) { current++; cursor = addDays(cursor, -1); }

  const avgPct = played ? games.reduce((s, g) => s + g.score / g.perfect, 0) / played : 0;
  const beatPar = games.filter(g => g.par != null && g.score >= g.par).length;
  const bestScore = games.reduce((m, g) => Math.max(m, g.score), 0);
  return { played, current, best, avgPct, beatPar, bestScore, recent: dates.slice(-7).reverse().map(d => ({ date: d, ...history[d] })) };
}
