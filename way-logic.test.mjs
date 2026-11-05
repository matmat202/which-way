// node site/way-logic.test.mjs — the page's pure logic on made-up series, plus the shipped
// data checked against facts known independently of this build. Exit 1 on any failure.
//   test/plant.sh   # mutates a copy of the logic; each mutant must FAIL this suite
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const L = await import(process.env.LOGIC ? pathToFileURL(process.env.LOGIC).href : './way-logic.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// --- the pieces ------------------------------------------------------------------------
eq('hash is stable', L.hash('2026-11-02'), L.hash('2026-11-02'));
ok('hash differs by day', L.hash('2026-11-02') !== L.hash('2026-11-03'));
ok('rng stays in [0,1)', Array.from({ length: 2000 }, L.rng(1)).every((x) => x >= 0 && x < 1));
eq('months count across years', [L.monthKey('2007-11', 0), L.monthKey('2007-11', 2), L.monthKey('2007-11', 14), L.monthKey('1948-01', 11)],
  ['2007-11', '2008-01', '2009-01', '1948-12']);
eq('month labels', [L.monthLabel('2008-03'), L.monthLabel('2008-12', true)], ['March 2008', 'Dec 2008']);
eq('change sd of a steady +1/month line is 0', L.changeSd([...Array(40).keys()]), 0);
{
  // alternating 12-month changes of +12 and -12 around a zigzag: sd 12
  const v = Array.from({ length: 60 }, (_, i) => (Math.floor(i / 12) % 2 ? 12 : 0));
  ok('change sd of a +/-12 year zigzag is 12', Math.abs(L.changeSd(v) - 12) < 1e-9, L.changeSd(v));
}

// a made-up series: a sine wave, so every month has a known answer
const sine = (id, n = 400, gap = null) => ({ id, name: id, unit: '%', fmt: '{}%', dp: 1, start: '1950-01',
  v: Array.from({ length: n }, (_, i) => (gap && i >= gap[0] && i < gap[1] ? null : Math.round(1000 * (5 + 3 * Math.sin(i / 9))) / 1000)) });
const s = sine('S');
const q = L.questions([s])[0];
ok('questions start after a full chart', q.every(([t]) => t >= L.HIST - 1) && q[0][0] < L.HIST + 5, q[0]);
ok('questions leave the answer year inside the data', q.every(([t]) => t + L.H < s.v.length));
ok('questions skip near-flat years', q.every(([, z]) => z >= L.MIN_Z));
{
  const sd = L.changeSd(s.v);
  const flat = [];
  for (let t = L.HIST - 1; t + L.H < s.v.length; t++) if (Math.abs(s.v[t + L.H] - s.v[t]) / sd < L.MIN_Z) flat.push(t);
  ok('the sine has near-flat years to skip', flat.length > 0);
  ok('and every other month is asked', q.length === s.v.length - L.H - (L.HIST - 1) - flat.length, `${q.length}`);
}
{
  const g = sine('G', 400, [150, 200]);
  const qg = L.questions([g])[0].map(([t]) => t);
  ok('no question whose answer month is missing', qg.every((t) => g.v[t + L.H] != null && g.v[t] != null));
  ok('no question whose chart is mostly missing', !qg.some((t) => t >= 200 && t < 200 + 40), qg.filter((t) => t >= 200 && t < 260).slice(0, 3));
}
eq('up is the answer year being higher', [L.isUp({ v: [1, ...Array(11).fill(0), 2] }, 0), L.isUp({ v: [2, ...Array(11).fill(0), 1] }, 0)], [true, false]);
eq('a pick is right or wrong', [L.isRight({ v: [1, ...Array(11).fill(0), 2] }, 0, 1), L.isRight({ v: [1, ...Array(11).fill(0), 2] }, 0, 0)], [true, false]);

// formats
const pct = { unit: '%', fmt: '{}%', dp: 1 }, oil = { unit: '$ a barrel', fmt: '${}', dp: 2 }, pts = { unit: 'points', fmt: '{} pts', dp: 2 };
eq('values format by template', [L.fmt(pct, 5.1), L.fmt(oil, 1234.5), L.fmt(pts, -0.44)], ['5.1%', '$1,234.50', '-0.44 pts']);
eq('rates move in points, levels in percent', [L.isRate(pct), L.isRate(pts), L.isRate(oil)], [true, true, false]);
const yr = (a, b) => [a, ...Array(11).fill(null), b];
eq('a rate change', L.change({ ...pct, v: yr(5.1, 8.7) }, 0), 'up 3.6 points');
eq('a one-point change is singular', L.change({ ...pct, v: yr(5, 4) }, 0), 'down 1.0 point');
eq('a level change', L.change({ ...oil, v: yr(74.12, 133.37) }, 0), 'up 80%');
eq('a small level change keeps a decimal', L.change({ ...oil, v: yr(100, 100.5) }, 0), 'up 0.5%');
eq('the verdict names the answer month', L.verdict({ ...pct, start: '2008-03', v: yr(5.1, 8.7) }, 0), 'By March 2009 it was 8.7%, up 3.6 points from 5.1%.');

// --- the day's ten ---------------------------------------------------------------------
const many = Array.from({ length: 12 }, (_, i) => ({ ...sine('S' + i), v: sine('x').v.map((x, j) => x + Math.sin((j + 7 * i) / 5)) }));
const qs = L.questions(many);
const day = L.roundsFor(many, '2026-11-02', qs);
eq('ten rounds', day.length, 10);
eq('the same day gives the same ten', L.roundsFor(many, '2026-11-02', qs), day);
ok('another day gives another ten', JSON.stringify(L.roundsFor(many, '2026-11-03', qs)) !== JSON.stringify(day));
eq('no series twice in a day', new Set(day.map(([si]) => si)).size, 10);
{
  const zs = day.map(([si, t]) => qs[si].find((x) => x[0] === t)[1]);
  ok('every round is an askable question', zs.every((z) => z >= L.MIN_Z));
  ok('round 1 moves more than round 10', zs[0] > zs[9], zs.map((z) => z.toFixed(2)).join(' '));
}
eq('more rounds than series repeats a series rather than stopping', L.roundsFor(many.slice(0, 3), 'x', L.questions(many.slice(0, 3))).length, 10);

// --- days, share, streak ---------------------------------------------------------------
eq('day key pads', L.dayKey(new Date(2026, 0, 5, 12)), '2026-01-05');
eq('prev day crosses a month', L.prevDay('2026-12-01'), '2026-11-30');
eq('a past day is honoured', L.pastDay('2026-11-03', '2026-11-05'), '2026-11-03');
eq('today is not a past day', L.pastDay('2026-11-05', '2026-11-05'), null);
eq('before the first day is not', L.pastDay('2026-11-01', '2026-11-05'), null);
eq('an impossible date is not', L.pastDay('2026-11-31', '2026-12-05'), null);
eq('missed day skips played days', L.missedDay('2026-11-05', (d) => d === '2026-11-04'), '2026-11-03');
eq('share text', L.shareText('2026-11-02', [true, false, true]), 'Which Way Next? 2026-11-02: 2/3\n🟩🟥🟩');
eq('streak counts back from today', L.streak(['2026-11-01', '2026-11-02', '2026-11-03'], '2026-11-03'), 3);
eq('streak survives not yet playing today', L.streak(['2026-11-01', '2026-11-02'], '2026-11-03'), 2);
eq('streak breaks on a gap', L.streak(['2026-11-01', '2026-11-03'], '2026-11-03'), 1);
eq('points skip gaps', L.points({ v: [1, null, 3, 4] }, -2, 9), [[0, 1], [2, 3], [3, 4]]);

// --- the shipped data, against facts known apart from this build -----------------------
const S = JSON.parse(readFileSync(new URL('./data/series.json', import.meta.url))).series;
const val = (id, key) => { const s = S.find((x) => x.id === id); const i = (Number(key.slice(0, 4)) - Number(s.start.slice(0, 4))) * 12 + Number(key.slice(5)) - Number(s.start.slice(5)); return s.v[i]; };
eq('unemployment peaked at 14.8% in April 2020', val('UNRATE', '2020-04'), 14.8);
eq('and was 10.0% in October 2009', val('UNRATE', '2009-10'), 10);
eq('fed funds was 19.1% in June 1981 (Volcker)', Math.round(val('FEDFUNDS', '1981-06') * 10) / 10, 19.1);
eq('oil averaged $133.37 in July 2008', val('MCOILWTICO', '2008-07'), 133.37);
eq('inflation was 9.0% (seasonally adjusted) in June 2022', Math.round(val('CPIAUCSL', '2022-06') * 10) / 10, 9);
eq('sentiment hit its record low of 50.0 in June 2022', val('UMCSENT', '2022-06'), 50);
eq('Arctic sea ice averaged 3.57M km² in September 2012 (NSIDC record low)', Math.round(val('SEAICE', '2012-09') * 100) / 100, 3.57);
{
  const sep = S.find((x) => x.id === 'SEAICE').v.map((v, i) => [v, i]).filter(([v], i) => v !== null && (i + 10) % 12 === 8);
  eq('and September 2012 is the lowest September on record', val('SEAICE', '2012-09'), Math.min(...sep.map(([v]) => v)));
}
eq('sea ice is missing for December 1987 (the satellite gap), not zero', val('SEAICE', '1987-12'), null);
eq('15 series', S.length, 15);
ok('every series has a template and a name', S.every((s) => s.fmt.includes('{}') && s.name && s.unit));
{
  const QS = L.questions(S);
  ok('every series has questions to ask', QS.every((q) => q.length > 100), QS.map((q) => q.length).join(' '));
  const R = L.roundsFor(S, '2026-11-02', QS);
  eq('the shipped day has ten rounds from ten series', [R.length, new Set(R.map(([si]) => si)).size], [10, 10]);
  // real moves are fat-tailed, so every band is reachable: a round outside its band means
  // the picker widened, or ignored the band
  let inBand = 0, n = 0;
  for (let d = 0; d < 30; d++) {
    L.roundsFor(S, 'day' + d, QS).forEach(([si, t], k) => { n++; const z = QS[si].find((x) => x[0] === t)[1]; if (z >= L.BANDS[k][0] && z <= L.BANDS[k][1]) inBand++; });
  }
  eq('every shipped round falls in its band', inBand, n);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
