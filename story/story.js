/* The scrolling story: each <section class="step"> names a layout in data-step; as the
 * reader scrolls into a step, the marks move to their place in that layout. Numbers in
 * the prose are not typed in: a <b data-fact="..."> is computed here from story.json's
 * rows, and test/story.test.mjs checks each against the `check` block build_story.py
 * computed in python. Modelled on shaken/site/story. */
import { layout, ratio, change, when, STEPS, XR, YR, RATE, CHG, COL } from './layout.js';

const fmt = (n) => n.toLocaleString('en-US');
const pct = (v) => `${Math.round(v * 100)}%`;
const pts = (v) => `${v.toFixed(2)} points`;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

export function numbers(D) {
  const ch = D.v.map((_, i) => change(D, i)).filter((c) => c != null);
  const up = ch.filter((c) => c > 1e-9), dn = ch.filter((c) => c < -1e-9).map((c) => -c);
  const real = [up.length / ch.length, up.reduce((a, b) => a + b, 0) / up.length, dn.reduce((a, b) => a + b, 0) / dn.length];
  const sh = D.shuffles;
  const others = D.lineup.filter((s) => s.id !== D.id);
  const peak = D.v.reduce((b, v, i) => (v != null && v > D.v[b] ? i : b), 0);
  return {
    up: real[0], rise: real[1], fall: real[2], ratio: ratio(real), n_years: ch.length,
    down: ch.filter((c) => c < -1e-9).length / ch.length,
    sh_up_med: median(sh.map((s) => s[0])), sh_ratio_med: median(sh.map(ratio)),
    sh_up_min: Math.min(...sh.map((s) => s[0])), sh_ratio_max: Math.max(...sh.map(ratio)),
    as_low: sh.filter((s) => s[0] <= real[0]).length, as_high: sh.filter((s) => ratio(s) >= ratio(real)).length,
    as_far: sh.filter((s) => s[0] <= real[0] && ratio(s) >= ratio(real)).length,
    n_sh: sh.length, n_series: D.lineup.length,
    lone: others.filter((s) => s.as_far === 0).map((s) => s.name),
    n_middle: others.filter((s) => s.as_far >= s.n / 20).length,
    nc_ratio: ratio(D.nocovid), peak: [D.v[peak], when(D, peak)],
  };
}

/* "up" -> "35%". Unknown names throw: a typo must not render as blank */
export function fact(D, spec) {
  const N = numbers(D);
  switch (spec) {
    case 'up': return pct(N.up);
    case 'down': return pct(N.down);
    case 'rise': return pts(N.rise);
    case 'fall': return pts(N.fall);
    case 'ratio': return `${N.ratio.toFixed(2)}`;
    case 'n_years': return fmt(N.n_years);
    case 'since': return D.start.slice(0, 4);
    case 'h': return `${D.h} months`;
    case 'n_sh': return fmt(N.n_sh);
    case 'sh_up_med': return pct(N.sh_up_med);
    case 'sh_ratio_med': return N.sh_ratio_med.toFixed(2);
    case 'sh_up_min': return pct(N.sh_up_min);
    case 'sh_ratio_max': return N.sh_ratio_max.toFixed(2);
    case 'as_far': return fmt(N.as_far);
    case 'n_series': return fmt(N.n_series);
    case 'n_middle': return fmt(N.n_middle);
    case 'n_others': return fmt(N.n_series - 1);
    case 'lone': return N.lone.join(' and ').replace(/^./, (c) => c.toLowerCase());
    case 'nc_ratio': return N.nc_ratio.toFixed(2);
    case 'covid': return `${D.covid[0].slice(0, 4)} to ${D.covid[1].slice(0, 4)}`;
    default: throw new Error(`unknown fact ${spec}`);
  }
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
/* series labelled on the line-up: the headline and every one no shuffle matched */
export const labelled = (D) => D.lineup.map((s, k) => [s, k]).filter(([s]) => s.id === D.id || s.as_far === 0);
const short = { UNRATE: 'unemployment', MORTGAGE30US: 'mortgage rate' };

async function main() {
  const D = await (await fetch('story.json')).json();
  for (const e of document.querySelectorAll('[data-fact]')) e.textContent = fact(D, e.dataset.fact);
  const steps = [...document.querySelectorAll('.step')];
  for (const s of steps) if (!STEPS[s.dataset.step]) throw new Error(`unknown step ${s.dataset.step}`);
  const plot = document.getElementById('plot');
  const svg = el('svg', { id: 'chart' });
  const gAxis = el('g', { class: 'axis' }), gM = el('g'), gS = el('g'), gL = el('g'), gLab = el('g', { class: 'labels' });
  svg.append(gAxis, gS, gM, gL, gLab);
  plot.append(svg);
  const mk = (g, rows, title) => rows.map((r, k) => {
    const c = g.appendChild(el('circle', { r: 0 }));
    c.append(el('title')); c.firstChild.textContent = title(r, k);
    return c;
  });
  const mDots = mk(gM, D.v, (v, i) => { const c = change(D, i); const t = when(D, i);
    return `${Math.floor(t)}-${String(Math.round((t % 1) * 12) + 1).padStart(2, '0')}: ${v == null ? 'not reported' : `${v}%`}${c == null ? '' : `, ${c > 0 ? '+' : ''}${c.toFixed(1)} a year later`}`; });
  const sDots = mk(gS, D.shuffles, (s, k) => `shuffle ${k + 1}: ${pct(s[0])} of years up, rises ${ratio(s).toFixed(2)}x the falls`);
  const lDots = mk(gL, D.lineup, (s) => `${s.name}: ${pct(s.real[0])} of years up, rises ${ratio(s.real).toFixed(2)}x the falls; ${s.as_far} of ${s.n} shuffles as lopsided`);
  const tick = (x, y, text, cls = 'tick') => { const t = el('text', { x, y, class: cls }); t.textContent = text; gAxis.append(t); };
  const grid = (W, y) => gAxis.append(el('line', { x1: 0, x2: W, y1: y, y2: y, class: 'grid' }));

  let shown = -1;
  const draw = (i) => {
    const name = steps[i].dataset.step;
    const box = plot.getBoundingClientRect(), W = box.width, H = box.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const L = layout(name, D, W, H);
    for (const [dots, lay] of [[mDots, L.months], [sDots, L.shuffles], [lDots, L.series]]) lay.forEach((d, k) => {
      const c = dots[k];
      c.style.transform = `translate(${d.x}px, ${d.y}px)`;
      c.setAttribute('r', d.r);
      c.style.fill = d.fill;
      c.style.opacity = d.op;
    });
    gAxis.replaceChildren(); gLab.replaceChildren();
    const labs = [];
    if (L.kind === 'time') {
      const step = 4;
      for (let v = Math.ceil(L.lo / step) * step; v <= L.hi; v += step) {
        grid(W, L.Y(v));
        tick(-6, L.Y(v) + 4, name === 'line' ? `${v}%` : `${v > 0 ? '+' : ''}${v}`, 'tick end');
      }
      if (name === 'years') gAxis.append(el('line', { x1: 0, x2: W, y1: L.Y(0), y2: L.Y(0), class: 'zero' }));
      for (let y = 1950; y <= 2020; y += 10) tick(L.X(y), H + 16, String(y), 'tick mid');
      tick(W / 2, H + 32, name === 'line' ? 'unemployment rate, each month' : 'change over the next 12 months, in points', 'tick mid');
    } else {
      for (let v = 1; v <= YR[1]; v += 0.5) { grid(W, L.Y(v)); tick(-6, L.Y(v) + 4, `${v}×`, 'tick end'); }
      gAxis.append(el('line', { x1: 0, x2: W, y1: L.Y(1), y2: L.Y(1), class: 'zero' }));
      for (let v = XR[0]; v <= XR[1] + 1e-9; v += 0.1) tick(L.X(v), H + 16, pct(v), 'tick mid');
      tick(W / 2, H + 32, 'share of years that ended higher', 'tick mid');
      tick(0, -6, 'average rise ÷ average fall', 'tick');
      L.series.forEach((d) => { if (d.from) gAxis.append(el('line', { x1: d.from[0], y1: d.from[1], x2: d.x, y2: d.y, class: 'tail' })); });
      for (const [s, k] of name === 'lineup' ? labelled(D) : [[D.lineup.find((s) => s.id === D.id), D.lineup.findIndex((s) => s.id === D.id)]]) labs.push([L.series[k], short[s.id] || s.name]);
    }
    for (const [d, text] of labs) {
      gLab.append(el('circle', { cx: d.x, cy: d.y, r: d.r + 2.5, class: 'ring' }));
      const right = d.x < W * 0.6;
      const tx = el('text', { x: d.x + (right ? 1 : -1) * (d.r + 5), y: d.y - d.r - 3, class: `lab${right ? '' : ' end'}` });
      tx.textContent = text;
      gLab.append(tx);
    }
    document.body.dataset.step = i;
    window.__story = { step: i, name, shown: [...L.months, ...L.shuffles, ...L.series].filter((d) => d.op > 0).length };
  };

  const pick = () => {
    const line = innerHeight * 0.5;
    let i = 0;
    for (let k = 0; k < steps.length; k++) if (steps[k].getBoundingClientRect().top < line) i = k;
    if (i !== shown) { shown = i; draw(i); }
  };
  addEventListener('scroll', pick, { passive: true });
  addEventListener('resize', () => { shown = -1; pick(); });
  pick();
}

export { COL, RATE, CHG };

if (typeof document !== 'undefined') main().catch((e) => {
  document.body.classList.add('failed');
  document.getElementById('err').textContent = String(e.message || e);
  console.error(e);
});
