// Which Way Next? — the page's pure logic. No DOM; imported by app.js and the test.

export const ROUNDS = 10;
export const H = 12;      // the question: this many months after the chart ends
export const HIST = 120;  // months of chart shown before the question month
// Size of the year's move, in standard deviations of that series' 12-month changes, for
// each round of a day: a landslide first, a near-flat year last.
export const BANDS = [
  [2, 99], [1.5, 3], [1.2, 2.2], [1, 1.8], [0.8, 1.5], [0.6, 1.2], [0.5, 1], [0.4, 0.8], [0.3, 0.6], [0.15, 0.45],
];
export const MIN_Z = 0.15;     // a smaller move is a coin toss, never asked
export const MIN_FILLED = 96;  // of the HIST months, at least this many must have a value

// FNV-1a: a date string to a 32-bit seed.
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// mulberry32: small, fast, and the same sequence in every browser.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Month i of a series that starts at "YYYY-MM", as "YYYY-MM".
export function monthKey(start, i) {
  const m = Number(start.slice(5, 7)) - 1 + i;
  const y = Number(start.slice(0, 4)) + Math.floor(m / 12);
  return `${y}-${String(((m % 12) + 12) % 12 + 1).padStart(2, '0')}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function monthLabel(key, short = false) {
  const m = MONTHS[Number(key.slice(5, 7)) - 1];
  return `${short ? m.slice(0, 3) : m} ${key.slice(0, 4)}`;
}

// Standard deviation of a series' 12-month changes: the yardstick a move is measured in.
export function changeSd(v) {
  const d = [];
  for (let i = H; i < v.length; i++) if (v[i] != null && v[i - H] != null) d.push(v[i] - v[i - H]);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  return Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length);
}

// Every askable question, per series: [t, z] with the chart's months [t-HIST+1, t] mostly
// filled, both ends present, and a move of at least MIN_Z.
export function questions(series) {
  return series.map((s) => {
    const v = s.v, sd = changeSd(v), out = [];
    let filled = 0;
    for (let t = 0; t + H < v.length; t++) {
      if (v[t] != null) filled++;
      if (t - HIST >= 0 && v[t - HIST] != null) filled--;
      if (t < HIST - 1 || v[t] == null || v[t + H] == null || filled < MIN_FILLED) continue;
      const z = Math.abs(v[t + H] - v[t]) / sd;
      if (z >= MIN_Z) out.push([t, z]);
    }
    return out;
  });
}

// The day's ten: each is [seriesIndex, t]. No series twice in a day, while there are
// series left. A band nothing fits widens until one does.
export function roundsFor(series, seedStr, qs = questions(series), n = ROUNDS) {
  const r = rng(hash(seedStr));
  const used = new Set(), out = [];
  for (let k = 0; k < n; k++) {
    let [lo, hi] = BANDS[Math.min(k, BANDS.length - 1)];
    let got = null;
    for (let widen = 0; !got && widen < 6; widen++) {
      for (let tries = 0; tries < 400 && !got; tries++) {
        const si = Math.floor(r() * series.length);
        if (used.has(si) && used.size < series.length) continue;
        const q = qs[si];
        if (!q.length) continue;
        const [t, z] = q[Math.floor(r() * q.length)];
        if (z >= lo && z <= hi) got = [si, t];
      }
      lo /= 2; hi *= 2;
    }
    if (!got) break;
    used.add(got[0]);
    out.push(got);
  }
  return out;
}

// pick: 1 = higher, 0 = lower. Ties are never asked (MIN_Z > 0).
export function isUp(s, t) { return s.v[t + H] > s.v[t]; }
export function isRight(s, t, pick) { return (isUp(s, t) ? 1 : 0) === pick; }

// A rate (unit % or points) moves in points; a level (dollars, yen, an index) in percent.
export const isRate = (s) => s.unit.startsWith('%') || s.unit === 'points';

export function fmt(s, x) {
  const n = x.toLocaleString('en-US', { minimumFractionDigits: s.dp, maximumFractionDigits: s.dp });
  return s.fmt.replace('{}', n);
}

export function change(s, t) {
  const a = s.v[t], b = s.v[t + H];
  if (isRate(s)) {
    const d = Math.abs(b - a);
    return `${b > a ? 'up' : 'down'} ${d.toFixed(d < 0.1 ? 2 : s.dp || 1)} ${d === 1 ? 'point' : 'points'}`;
  }
  const p = Math.abs(100 * (b / a - 1));
  return `${b > a ? 'up' : 'down'} ${p < 1 ? p.toFixed(1) : Math.round(p)}%`;
}

export function verdict(s, t) {
  const end = monthLabel(monthKey(s.start, t + H));
  return `By ${end} it was ${fmt(s, s.v[t + H])}, ${change(s, t)} from ${fmt(s, s.v[t])}.`;
}

// Local calendar date, so "today's ten" turns over at the player's midnight.
export function dayKey(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The first day a daily ten was served. ?day= plays any day from here up to yesterday.
export const FIRST_DAY = '2026-11-02';

export function prevDay(key) {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

export function pastDay(param, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param || '')) return null;
  const d = new Date(param + 'T12:00:00');
  if (Number.isNaN(d.getTime()) || dayKey(d) !== param) return null;
  return param >= FIRST_DAY && param < today ? param : null;
}

export function missedDay(from, done) {
  for (let d = prevDay(from); d >= FIRST_DAY; d = prevDay(d)) if (!done(d)) return d;
  return null;
}

export function shareText(day, marks) {
  const score = marks.filter(Boolean).length;
  return `Which Way Next? ${day}: ${score}/${marks.length}\n${marks.map((m) => (m ? '🟩' : '🟥')).join('')}`;
}

export function streak(days, today) {
  const have = new Set(days);
  const d = new Date(today + 'T12:00:00');
  if (!have.has(today)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (have.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// The chart's points: [i, value] for months lo..hi with a value, gaps skipped.
export function points(s, lo, hi) {
  const out = [];
  for (let i = Math.max(0, lo); i <= Math.min(hi, s.v.length - 1); i++) if (s.v[i] != null) out.push([i, s.v[i]]);
  return out;
}
