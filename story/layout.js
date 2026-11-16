/* Where every mark sits on each step of the story. Pure: no DOM, so test/story.test.mjs
 * runs every layout at several plot sizes.
 *
 * Time steps: one dot per month of US unemployment, 1948 on, coloured by what the next
 * 12 months did (red: higher, grey: lower). "line" puts each at its rate, "years" at the
 * change over those 12 months.
 * Scatter steps: x = share of 12-month windows that ended higher, y = the average rise
 * over the average fall. "shuffle" adds 1,000 reshuffles of unemployment's monthly moves;
 * "lineup" swaps them for the game's 15 series, each with a tail from its own median shuffle.
 */
export const COL = { up: '#b3261e', down: '#8a857e', flat: '#cfcac3', ink: '#1d1a18', real: '#b3261e', faint: '#cfcac3' };
export const XR = [0.3, 0.6];   // scatter: share of years up
export const YR = [0.6, 2.0];   // scatter: average rise / average fall
export const RATE = [0, 16];    // line: percent
export const CHG = [-10, 12];   // years: points over 12 months

export const STEPS = {
  line: ['time', 'rate'],
  years: ['time', 'change'],
  shuffle: ['scatter', 'shuffles'],
  lineup: ['scatter', 'lineup'],
};

export const ratio = (r) => r[1] / r[2];
/* month index -> decimal year */
export const when = (D, i) => { const [y, m] = D.start.split('-').map(Number); return y + (m - 1 + i) / 12; };
/* 12-month change from month i, or null */
export const change = (D, i) => (D.v[i] == null || D.v[i + D.h] == null ? null : D.v[i + D.h] - D.v[i]);

/* -> {kind, X, Y, months: [{x,y,r,fill,op}], shuffles: [...], series: [...]} in px of w x h */
export function layout(name, D, w, h) {
  const [kind, what] = STEPS[name] || (() => { throw new Error(`unknown step ${name}`); })();
  const pad = 8;
  const none = () => ({ x: w / 2, y: h / 2, r: 0, op: 0, fill: COL.faint });
  if (kind === 'time') {
    const t0 = when(D, 0), t1 = when(D, D.v.length - 1);
    const [lo, hi] = what === 'rate' ? RATE : CHG;
    const X = (t) => pad + ((t - t0) / (t1 - t0)) * (w - 2 * pad);
    const Y = (v) => h - pad - ((v - lo) / (hi - lo)) * (h - 2 * pad);
    const r = Math.max(1, Math.min(2.4, w / 420));
    const months = D.v.map((v, i) => {
      const c = change(D, i);
      const y = what === 'rate' ? v : c;
      if (y == null) return { ...none(), x: X(when(D, i)), y: Y(0) };
      return { x: X(when(D, i)), y: Y(y), r, fill: c == null || Math.abs(c) < 1e-9 ? COL.flat : c > 0 ? COL.up : COL.down, op: 0.9 };
    });
    return { kind, X, Y, lo, hi, months, shuffles: D.shuffles.map(none), series: D.lineup.map(none) };
  }
  const X = (v) => pad + ((v - XR[0]) / (XR[1] - XR[0])) * (w - 2 * pad);
  const Y = (v) => h - pad - ((v - YR[0]) / (YR[1] - YR[0])) * (h - 2 * pad);
  const r = Math.max(2.5, Math.min(6, w / 150));
  const real = D.lineup.find((s) => s.id === D.id).real;
  const shuffles = D.shuffles.map((s) => ({ x: X(s[0]), y: Y(ratio(s)), r: r * 0.55, fill: COL.down, op: what === 'shuffles' ? 0.45 : 0 }));
  const series = D.lineup.map((s) => {
    const mine = s.id === D.id;
    return { x: X(s.real[0]), y: Y(ratio(s.real)), r: mine ? r * 1.5 : r,
      fill: mine || s.as_far === 0 ? COL.real : COL.ink, op: mine || what === 'lineup' ? 1 : 0,
      // the line-up draws a tail from where this series' own shuffles sit to the real dot
      from: what === 'lineup' ? [X(s.sh_up), Y(s.sh_ratio)] : null };
  });
  return { kind, X, Y, real, months: D.v.map(none), shuffles, series };
}
/* "2025-10" -> index into D.v */
export const monthIndex = (D, ym) => { const [y, m] = ym.split('-').map(Number), [y0, m0] = D.start.split('-').map(Number); return (y - y0) * 12 + m - m0; };
