// Which Way Next? — the page. Pure logic lives in way-logic.js.
import * as L from './way-logic.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: play on, unsaved */ } },
};

let S = [], QS = [];
let game = null; // { key, day, practice, past, rounds, picks, showing, review }

const FILES = {}; // file -> promise of { S, QS }
const loadSeries = (f) => (FILES[f] ||= fetch(f).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((d) => ({ S: d.series, QS: L.questions(d.series) })));
const failed = (e) => { $('round').textContent = ''; $('out').textContent = `Could not load the data (${e.message}). Reload to try again.`; };

// A day plays the series list it was first dealt from (L.seriesFile).
function start(practice, past = null) {
  const day = past || L.dayKey();
  const key = practice ? `practice-${Date.now().toString(36)}` : day;
  return loadSeries(L.seriesFile(key)).then((p) => {
    S = p.S; QS = p.QS;
    game = { key, day, practice, past: !!past && !practice, rounds: L.roundsFor(S, key, QS), picks: practice ? [] : store.get('ww:' + day, []) };
    // a reload between answering and Next brings back that round's reveal, not the round after it
    if (!practice && store.get('ww:' + day + ':seen', game.picks.length) < game.picks.length) game.showing = game.picks.length - 1;
    $('daily').hidden = !practice && !game.past;
    render();
  });
}

function save() {
  if (game.practice) return;
  store.set('ww:' + game.day, game.picks);
  store.set('ww:' + game.day + ':seen', game.showing == null ? game.picks.length : game.showing);
  if (game.picks.length === game.rounds.length && !game.past) {
    const days = store.get('ww:days', []);
    if (!days.includes(game.day)) { days.push(game.day); store.set('ww:days', days.slice(-400)); }
  }
}

const at = (k) => { const [si, t] = game.rounds[k]; return [S[si], t]; };
const marks = () => game.picks.map((p, k) => L.isRight(...at(k), p));

function render() {
  const k = game.picks.length, done = k >= game.rounds.length;
  const showing = game.showing ?? game.review ?? null; // review: a finished round reopened from the recap
  $('play').hidden = done && showing == null;
  $('end').hidden = !($('play').hidden);
  drawMarks(showing ?? k);
  if (!$('play').hidden) drawRound(showing ?? k, showing != null);
  if (!$('end').hidden) drawEnd();
}

function drawMarks(now) {
  const m = marks();
  $('marks').replaceChildren(...game.rounds.map((_, k) => {
    const li = document.createElement('li');
    if (k < m.length) { li.className = m[k] ? 'y' : 'n'; li.title = m[k] ? 'right' : 'wrong'; }
    if (k === now) li.classList.add('now');
    return li;
  }));
  $('marks').setAttribute('aria-label', `${m.filter(Boolean).length} right of ${m.length} so far`);
}

function drawRound(k, answered) {
  const [s, t] = at(k);
  const month = L.monthLabel(L.monthKey(s.start, t));
  $('round').textContent = `${game.practice ? 'Practice · ' : game.past ? `${game.day} · ` : ''}Round ${k + 1} of ${game.rounds.length}`;
  $('name').textContent = s.name;
  $('asof').textContent = `${month}: ${L.fmt(s, s.v[t])}`;
  $('q').textContent = `A year later, in ${L.monthLabel(L.monthKey(s.start, t + L.H))} — higher or lower?`;
  const up = L.isUp(s, t) ? 1 : 0;
  for (const el of $('pick').querySelectorAll('button')) {
    const i = Number(el.dataset.i);
    el.disabled = answered;
    el.classList.toggle('right', answered && up === i);
    el.classList.toggle('wrong', answered && game.picks[k] === i && up !== i);
  }
  drawChart(s, t, answered);
  if (answered) {
    const right = L.isRight(s, t, game.picks[k]);
    const tag = document.createElement('b');
    tag.className = right ? 'y' : 'n';
    tag.textContent = right ? 'Right. ' : 'Not quite. ';
    $('out').replaceChildren(tag, L.verdict(s, t));
    $('next').hidden = false;
    $('next').textContent = game.review != null ? 'Back to your score' : k + 1 >= game.rounds.length ? 'See your score' : 'Next';
  } else {
    $('out').textContent = '';
    $('next').hidden = true;
  }
}

function pick(i) {
  if (!game || game.showing != null || game.picks.length >= game.rounds.length) return;
  game.showing = game.picks.length;
  game.picks.push(i);
  save();
  render();
  $('next').focus({ preventScroll: true });
}

function review(k) {
  game.review = k;
  render();
  scrollTo(0, 0);
  $('next').focus({ preventScroll: true });
}

function next() {
  if (game.review != null) {
    const k = game.review;
    game.review = null;
    render();
    $('recap').querySelectorAll('button')[k]?.focus();
    return;
  }
  if (game.showing == null) return;
  game.showing = null;
  save();
  render();
  if (!$('play').hidden) $('pick').querySelector('button').focus({ preventScroll: true }); else $('share').focus({ preventScroll: true });
}

// Ten years up to the question month, and a shaded year after it that fills in on answer.
// The y range is the history's, widened to the answer's on reveal.
function drawChart(s, t, answered) {
  // the viewBox follows the box's own width, so 12px labels stay 12px on a phone
  // and on a narrow screen it is taller than it is wide-ish: at 0.42 a phone got a 181 px strip
  // with a third of the screen empty below, and the answer year was hard to read.
  const W = Math.round(Math.max(320, Math.min(600, $('chart').clientWidth - 16 || 600))), Hh = Math.round(W * (W < 480 ? 0.62 : 0.42)) + 20;
  const pl = 8, pr = 8, pt = 14, pb = 26;
  const lo = t - L.HIST + 1, hi = t + L.H;
  const past = L.points(s, lo, t), fut = L.points(s, t, hi);
  const ys = (answered ? past.concat(fut) : past).map((p) => p[1]);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = (y1 - y0 || Math.abs(y1) || 1) * 0.08; y0 -= pad; y1 += pad;
  const X = (i) => pl + ((i - lo) / (hi - lo)) * (W - pl - pr);
  const Y = (v) => pt + (1 - (v - y0) / (y1 - y0)) * (Hh - pt - pb);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
  svg.setAttribute('role', 'img');
  const el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; svg.append(e); return e; };
  el('rect', { class: 'fut', x: X(t), y: pt - 6, width: X(hi) - X(t), height: Hh - pt - pb + 6 });
  if (!answered) el('text', { class: 'qm', x: (X(t) + X(hi)) / 2, y: (pt + Hh - pb) / 2 + 12, 'text-anchor': 'middle' }, '?');
  // a tick each January in an even year, labelled
  for (let i = lo; i <= hi; i++) {
    const key = L.monthKey(s.start, i);
    if (key.endsWith('-01') && Number(key.slice(0, 4)) % 2 === 0) {
      el('line', { class: 'tick', x1: X(i), x2: X(i), y1: Hh - pb, y2: Hh - pb + 4 });
      el('text', { class: 'ax', x: X(i), y: Hh - 8, 'text-anchor': 'middle' }, key.slice(0, 4));
    }
  }
  if (y0 < 0 && y1 > 0) el('line', { class: 'zero', x1: pl, x2: W - pr, y1: Y(0), y2: Y(0) });
  el('line', { class: 'level', x1: X(t), x2: X(hi), y1: Y(s.v[t]), y2: Y(s.v[t]) });
  const path = (pts) => pts.map(([i, v], n) => `${n ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  el('path', { class: 'hist', d: path(past) });
  if (answered) {
    el('path', { class: 'ans ' + (L.isUp(s, t) ? 'up' : 'down'), d: path(fut) });
    el('circle', { class: 'ans-dot ' + (L.isUp(s, t) ? 'up' : 'down'), cx: X(hi), cy: Y(s.v[hi]), r: 5 });
  }
  el('circle', { class: 'now', cx: X(t), cy: Y(s.v[t]), r: 5 });
  // the y range, top and bottom, at the left
  el('text', { class: 'ax', x: pl + 2, y: pt + 4 }, L.fmt(s, y1 - pad));
  el('text', { class: 'ax', x: pl + 2, y: Hh - pb - 4 }, L.fmt(s, y0 + pad));
  const month = L.monthLabel(L.monthKey(s.start, t));
  svg.setAttribute('aria-label', `${s.name}, ten years to ${month}, ending at ${L.fmt(s, s.v[t])}; range ${L.fmt(s, y0 + pad)} to ${L.fmt(s, y1 - pad)}`
    + (answered ? `. ${L.verdict(s, t)}` : ''));
  $('chart').replaceChildren(svg);
}

function drawEnd() {
  const m = marks(), score = m.filter(Boolean).length;
  $('endday').textContent = game.practice ? 'Practice ten' : `${game.past ? 'Earlier' : 'Today\'s'} ten · ${game.day}`;
  $('score').textContent = `${score} / ${m.length}`;
  const st = L.streak(store.get('ww:days', []), game.day);
  $('streak').textContent = game.practice ? 'Practice rounds do not count toward your streak.'
    : game.past ? 'Earlier days do not count toward your streak.'
    : `${st === 1 ? 'First day of a streak' : `${st}-day streak`}. A new ten tomorrow.`;
  $('rules').textContent = L.rulesLine(score, L.ruleScores(S, game.rounds));
  drawRecord(game, score);
  $('share').hidden = game.practice;
  $('share').textContent = sheet() ? 'Share result' : 'Copy result';
  const miss = game.practice ? null : L.missedDay(game.day, (k) => store.get('ww:' + k, []).length >= game.rounds.length);
  $('earlier').hidden = !miss;
  if (miss) { $('earlier').href = `?day=${miss}`; $('earlier').textContent = miss === L.prevDay(L.dayKey()) ? "Missed yesterday? Play yesterday's ten" : `Play the ten from ${miss}`; }
  $('copied').textContent = '';
  $('recap').replaceChildren(...game.rounds.map((_, k) => {
    const [s, t] = at(k);
    const li = document.createElement('li');
    const mk = document.createElement('span'); mk.className = 'm ' + (m[k] ? 'y' : 'n'); mk.textContent = m[k] ? '✓' : '✗';
    mk.setAttribute('aria-label', m[k] ? 'right' : 'wrong');
    const tx = document.createElement('span'); tx.className = 't';
    tx.textContent = `${s.name}, ${L.monthLabel(L.monthKey(s.start, t), true)}`;
    const d = document.createElement('span'); d.className = 'd';
    d.textContent = `${L.fmt(s, s.v[t])} → ${L.fmt(s, s.v[t + L.H])} ${L.isUp(s, t) ? '▲' : '▼'}`;
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.k = k;
    b.append(mk, tx, d);
    li.append(b);
    return li;
  }));
}

// Every daily ten finished in this browser, re-scored from its stored picks against the list
// that day was dealt from (L.dayResult). Shown from the second day on; practice has none.
let recordFor = null;
function drawRecord(g, score) {
  $('record').hidden = true;
  $('days').hidden = true;
  if (g.practice) return;
  recordFor = g;
  const days = [];
  for (let d = L.dayKey(); d >= L.FIRST_DAY; d = L.prevDay(d)) {
    const picks = store.get('ww:' + d, []);
    if (picks.length >= L.ROUNDS) days.push([d, picks]);
  }
  Promise.all(days.map(([d, picks]) => loadSeries(L.seriesFile(d))
    .then((p) => L.dayResult(p.S, L.roundsFor(p.S, d, p.QS), picks)))).then((res) => {
    if (recordFor !== g || $('end').hidden) return;
    drawDays(g, Object.fromEntries(days.map(([d], k) => [d, res[k].score])));
    if (res.length < 2) return;
    const rec = L.record(res), top = Math.max(...rec.hist);
    $('recline').textContent = L.recordLine(rec);
    $('hist').setAttribute('aria-label', 'Days by score: ' + rec.hist.map((c, k) => `${k} right, ${c}`).join('; '));
    $('hist').replaceChildren(...rec.hist.map((c, k) => {
      const col = document.createElement('span');
      col.className = k === score ? 'now' : '';
      col.title = `${c} day${c === 1 ? '' : 's'} with ${k} right`;
      const bar = document.createElement('i');
      bar.style.height = `${Math.round(44 * c / top)}px`;
      col.append(bar, String(k));
      return col;
    }));
    $('record').hidden = false;
  }).catch(() => {});
}

// Every earlier ten as a link, with your score on the ones you finished, so any day is a tap
// away rather than only the newest one missed (or a ?day= typed by hand).
function drawDays(g, scores) {
  const P = L.pastDays(L.dayKey(), scores);
  $('days').hidden = !P.length;
  $('dayssum').textContent = L.pastSummary(P);
  $('daygrid').replaceChildren(...P.map(({ day, label, score }) => {
    const a = document.createElement('a');
    a.href = `?day=${day}`;
    a.dataset.day = day;
    if (day === g.day) a.className = 'now';
    if (score != null) a.classList.add('done');
    const b = document.createElement('b'); b.textContent = label;
    const sc = document.createElement('span'); sc.textContent = score == null ? 'play' : `${score}/${L.ROUNDS}`;
    a.append(b, sc);
    a.setAttribute('aria-label', `${day}: ${score == null ? 'not played' : `${score} of ${L.ROUNDS} right`}`);
    return a;
  }));
}

// A phone gets its share sheet (straight to Messages), a desktop the clipboard. Read at click
// time as well as at render, so the label and the action never disagree.
const sheet = () => matchMedia('(pointer: coarse)').matches && typeof navigator.share === 'function';

async function share() {
  const text = L.shareText(game.day, marks(), L.ruleScores(S, game.rounds)) + '\nhttps://matmat202.github.io/which-way/';
  if (sheet()) {
    try { await navigator.share({ text }); $('copied').textContent = ''; return; }
    catch (e) { if (e && e.name === 'AbortError') return; } // dismissed; anything else falls back to copying
  }
  try { await navigator.clipboard.writeText(text); $('copied').textContent = 'Copied.'; }
  catch { $('copied').textContent = text; }
}

$('pick').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pick(Number(b.dataset.i)); });
$('next').addEventListener('click', next);
$('recap').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) review(Number(b.dataset.k)); });
$('share').addEventListener('click', share);
$('practice').addEventListener('click', () => start(true).catch(failed));
$('daily').addEventListener('click', () => { if (location.search) history.replaceState(null, '', location.pathname); start(false).catch(failed); });
document.addEventListener('keydown', (e) => {
  if (!game || e.metaKey || e.ctrlKey || e.altKey) return;
  if (game.review != null) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); next(); }
  } else if (game.showing == null && !$('play').hidden) {
    if (e.key === 'ArrowUp' || e.key === '1') { e.preventDefault(); pick(1); }
    else if (e.key === 'ArrowDown' || e.key === '2') { e.preventDefault(); pick(0); }
  } else if (game.showing != null && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault(); next();
  }
});

loadSeries('data/series.json').then(({ S: now }) => {
  $('count').textContent = String(now.length);
  return start(false, L.pastDay(new URLSearchParams(location.search).get('day'), L.dayKey()));
}).catch(failed);
