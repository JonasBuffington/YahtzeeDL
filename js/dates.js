// Puzzle days are calendar dates in the player's local time zone.

export const EPOCH = '2026-09-27'; // Puzzle No. 1

export function dateKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function utcDateKey(d) {
  return d.toISOString().slice(0, 10);
}

const dayNumber = key => Math.round(Date.parse(key + 'T00:00:00Z') / 86400000);

export function puzzleNumber(key) {
  return dayNumber(key) - dayNumber(EPOCH) + 1;
}

export function addDays(key, n) {
  return utcDateKey(new Date(Date.parse(key + 'T00:00:00Z') + n * 86400000));
}

export function longDate(key) {
  return new Date(key + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}
