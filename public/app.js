// Volume Ledger — front end. Talks to the local server; no third-party calls.
import {
  DOW, MON, daysBetween, isoWeek, mondayOf, pad, parseYmd, weekAdd, weekLabel, ymd,
} from '/lib/dates.js';

const $ = (id) => document.getElementById(id);

const state = {
  auth: null,
  data: null,
  busy: false,
  abort: null,
};

const SPORTS = {
  run: 'Run', bike: 'Bike', swim: 'Swim', lift: 'Lift', strength: 'Strength',
  mobility: 'Mobility', walk: 'Walk', hike: 'Hike', cross: 'Cross', other: 'Other',
};
const FEEL = { 1: 'rough', 2: 'flat', 3: 'fine', 4: 'good', 5: 'great' };

const DEFAULTS = {
  goal: 'Build running volume to 75 miles a week and hold it, while keeping some bike and swim volume every week.',
  targetMpw: 75, targetDate: '', keep: '', limits: '',
};

// --- helpers ---------------------------------------------------------------
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const n1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const n0 = (x) => String(Math.round(x));
const comma = (x) => Math.round(x).toLocaleString('en-US');
function mmss(sec) {
  if (!sec || !isFinite(sec)) return '—';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
function hm(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${m ? pad(m) : ''}` : `${m}m`;
}
/** Stored timestamps are ISO/UTC; show the day the user was actually in. */
function localDay(iso) {
  const d = new Date(iso);
  return isFinite(d) ? ymd(d) : String(iso).slice(0, 10);
}
function sameSport(a, b) {
  if (a === b) return true;
  const g = { lift: 'strength', strength: 'strength', mobility: 'strength' };
  return (g[a] || a) === (g[b] || b);
}

const today = () => state.data?.today || ymd(new Date());
const thisWeekKey = () => state.data?.week || isoWeek(new Date());
const settings = () => ({ ...DEFAULTS, ...(state.data?.settings || {}) });
const sessions = () => state.data?.sessions || [];
const feedbackFor = (id) => state.data?.feedback?.[id] || null;
const weekDoc = (k) => state.data?.weeks?.[k] || null;
const plan = () => state.data?.plan || null;

let toastTimer = null;
function toast(message, isError = false) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = `toast${isError ? ' err' : ''}`;
  el.textContent = message;
  el.setAttribute('role', 'status');
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), isError ? 7000 : 3500);
}

async function api(path, { method = 'GET', body, signal } = {}) {
  const resp = await fetch(path, {
    method,
    signal,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!resp.ok) {
    const err = new Error(json?.message || json?.error || `Request failed (${resp.status})`);
    err.status = resp.status;
    err.code = json?.error;
    throw err;
  }
  return json;
}

async function refresh() {
  state.data = await api('/api/data?weeks=14');
  render();
}

// --- derived ---------------------------------------------------------------
function sessionsOn(date) {
  return sessions().filter((s) => s.date === date);
}

function rollup(weekKey) {
  const mon = mondayOf(weekKey);
  const from = ymd(mon);
  const end = new Date(mon);
  end.setDate(end.getDate() + 6);
  const to = ymd(end);
  const r = {
    runMi: 0, runs: 0, longest: 0, elevFt: 0, bikeMin: 0, bikes: 0,
    swimYd: 0, swims: 0, lifts: 0, hrSum: 0, hrN: 0, count: 0,
  };
  for (const s of sessions()) {
    if (s.date < from || s.date > to) continue;
    r.count++;
    if (s.sport === 'run') {
      r.runMi += s.miles || 0; r.runs++; r.elevFt += s.elevFt || 0;
      if ((s.miles || 0) > r.longest) r.longest = s.miles || 0;
      if (s.hrAvg) { r.hrSum += s.hrAvg; r.hrN++; }
    } else if (s.sport === 'bike') { r.bikeMin += s.movingMin || 0; r.bikes++; }
    else if (s.sport === 'swim') { r.swimYd += s.yards || 0; r.swims++; }
    else if (s.sport === 'lift' || s.sport === 'strength') r.lifts++;
  }
  r.hrAvg = r.hrN ? r.hrSum / r.hrN : null;
  return r;
}

function targetFor(weekKey) {
  const w = weekDoc(weekKey);
  if (w?.targets?.runMiles != null) return { ...w.targets, deload: w.deload };
  const t = plan()?.weekTargets?.find((x) => x.week === weekKey);
  return t || null;
}

function phaseFor(weekKey) {
  const p = plan();
  if (!p?.phases) return null;
  const idx = p.weekTargets?.find((t) => t.week === weekKey)?.index;
  if (idx == null) return null;
  return p.phases.find((ph) => ph.weekFrom <= idx && idx <= ph.weekTo) || null;
}

function needsFeedback() {
  const cut = ymd(new Date(Date.now() - 8 * 86400000));
  return sessions().filter((s) => (
    s.date >= cut && s.date <= today() && !feedbackFor(s.id)
    && ['run', 'bike', 'swim', 'lift', 'strength'].includes(s.sport)
  ));
}

// --- masthead --------------------------------------------------------------
function renderMast() {
  const s = settings();
  $('goalLine').textContent = s.goal || DEFAULTS.goal;

  const u = state.data?.user;
  $('who').innerHTML = u
    ? (u.picture ? `<img src="${esc(u.picture)}" alt="">` : '')
      + `<span>${esc(u.name || u.email || 'Signed in')}</span>`
    : '';

  const week = thisWeekKey();
  const ph = phaseFor(week);
  const idx = plan()?.weekTargets?.find((t) => t.week === week)?.index;
  $('phaseChip').innerHTML = ph
    ? `<s>Phase ${esc(ph.n)}</s><b>${esc(ph.name)}</b>${idx ? `<s>week ${idx}</s>` : ''}`
    : `<s>Plan</s><b>${plan() ? 'no target this week' : 'not built yet'}</b>`;

  const r = rollup(week);
  const t = targetFor(week);
  const tgt = t?.runMiles || 0;
  const pct = tgt ? Math.min(100, (r.runMi / tgt) * 100) : 0;
  const elapsed = Math.min(7, Math.max(0, daysBetween(ymd(mondayOf(week)), today()) + 1));
  $('weekMeter').innerHTML =
    `<div class="wm-top"><span class="wm-big">${n1(r.runMi)}`
    + (tgt ? ` <small>/ ${n0(tgt)} mi</small>` : ' <small>mi</small>')
    + '</span><span class="wm-lab">week to date</span></div>'
    + `<div class="wm-track"><div class="wm-fill" style="width:${pct.toFixed(1)}%`
    + `${t?.deload ? ';background:var(--warn)' : ''}"></div>`
    + (tgt ? `<div class="wm-tick" style="left:${((elapsed / 7) * 100).toFixed(1)}%"></div>` : '')
    + '</div>';

  const sync = state.data?.sync;
  const connected = state.data?.connections?.strava?.connected;
  const el = $('syncLine');
  if (!connected) {
    el.className = 'syncline stale';
    el.innerHTML = 'Strava: <b>not connected</b> — <a href="#setup">connect it</a>';
  } else if (sync?.newest) {
    const age = daysBetween(sync.newest, today());
    el.className = `syncline${age > 3 ? ' stale' : ''}`;
    el.innerHTML = `Strava: <b>${state.data.totals?.activities || 0} sessions, newest ${esc(sync.newest)}</b>`
      + (age > 3 ? ' — sync again' : '');
  } else {
    el.className = 'syncline stale';
    el.innerHTML = 'Strava: <b>connected, never synced</b> — <a href="#setup">sync now</a>';
  }
}

// --- today -----------------------------------------------------------------
function actualLine(s) {
  const bits = [];
  if (s.miles) bits.push(`<i>dist</i>${n1(s.miles)} mi`);
  if (s.movingMin) bits.push(`<i>time</i>${hm(s.movingMin)}`);
  if (s.paceSecPerMi) bits.push(`<i>pace</i>${mmss(s.paceSecPerMi)}/mi`);
  if (s.speedMph) bits.push(`<i>speed</i>${n1(s.speedMph)} mph`);
  if (s.per100yd) bits.push(`<i>pace</i>${mmss(s.per100yd)}/100y`);
  if (s.yards) bits.push(`<i>swim</i>${comma(s.yards)} yd`);
  if (s.hrAvg) bits.push(`<i>hr</i>${n0(s.hrAvg)}${s.hrMax ? ` / ${n0(s.hrMax)}` : ''}`);
  if (s.elevFt) bits.push(`<i>elev</i>${comma(s.elevFt)} ft`);
  if (s.avgWatts) bits.push(`<i>watts</i>${n0(s.avgWatts)}`);
  const f = feedbackFor(s.id);
  if (f) {
    if (f.rpe) bits.push(`<i>rpe</i>${f.rpe}`);
    if (f.feel) bits.push(`<i>felt</i>${FEEL[f.feel] || f.feel}`);
    if (f.pain) bits.push(`<i>pain</i>${f.pain}/10`);
  }
  return bits.join('');
}

function renderToday() {
  const week = thisWeekKey();
  const wk = weekDoc(week);
  const idx = daysBetween(ymd(mondayOf(week)), today());
  const day = wk?.days?.[idx] || null;
  const planned = day?.sessions || [];
  const actual = sessionsOn(today());
  const d = parseYmd(today());

  const head = '<div class="today-head"><span class="today-date">'
    + `${DOW[idx < 0 || idx > 6 ? 0 : idx]}, ${MON[d.getMonth()]} ${d.getDate()}`
    + `<span>${esc(week)}</span></span>`
    + `<span class="today-tag">${planned.length ? 'prescribed' : 'no session prescribed'}</span></div>`;

  let rows = '';
  for (const ps of planned) {
    const match = actual.filter((a) => sameSport(a.sport, ps.sport));
    const done = match.length > 0;
    rows += `<div class="slot ${esc(ps.sport)}"><div class="slot-rule"></div><div class="slot-main">`
      + `<div class="slot-sport">${esc(SPORTS[ps.sport] || ps.sport)}`
      + `${ps.intensity ? ` · ${esc(ps.intensity)}` : ''}</div>`
      + `<div class="slot-title">${esc(ps.title || '—')}</div>`
      + (ps.detail ? `<p class="slot-detail">${esc(ps.detail)}</p>` : '')
      + (done ? `<div class="slot-actual">${actualLine(match[0])}</div>` : '')
      + '</div><div class="slot-side">'
      + `<span class="chip ${done ? 'done' : ps.optional ? 'opt' : ''}">`
      + `${done ? 'done' : ps.optional ? 'optional' : 'planned'}</span>`
      + (done
        ? `<button data-fb="${esc(match[0].id)}">${feedbackFor(match[0].id) ? 'Edit note' : 'How did it feel?'}</button>`
        : `<button data-log="${esc(ps.sport)}">Log it</button>`)
      + '</div></div>';
  }

  for (const a of actual) {
    if (planned.some((ps) => sameSport(a.sport, ps.sport))) continue;
    rows += `<div class="slot ${esc(a.sport)}"><div class="slot-rule"></div><div class="slot-main">`
      + `<div class="slot-sport">${esc(SPORTS[a.sport] || a.sport)} · not on the plan</div>`
      + `<div class="slot-title">${esc(a.name || SPORTS[a.sport] || a.sport)}</div>`
      + `<div class="slot-actual">${actualLine(a)}</div></div>`
      + '<div class="slot-side"><span class="chip done">extra</span>'
      + `<button data-fb="${esc(a.id)}">${feedbackFor(a.id) ? 'Edit note' : 'How did it feel?'}</button>`
      + '</div></div>';
  }

  if (!rows) {
    rows = `<div class="rest">${wk
      ? "Rest day — nothing prescribed. Adaptation happens on the day you don't run."
      : 'No week planned yet. Ask the coach for one below.'}</div>`;
  }
  $('todayCard').innerHTML = head + `<div class="slots">${rows}</div>`;

  const nf = needsFeedback();
  $('todayNote').textContent = nf.length
    ? `${nf.length} session${nf.length === 1 ? '' : 's'} need${nf.length === 1 ? 's' : ''} a note`
    : '';

  const acts = [];
  if (nf.length) acts.push(`<button class="solid" id="fbNext">Add notes (${nf.length})</button>`);
  acts.push('<button id="logManual">Log a session</button>');
  if (state.data?.connections?.strava?.connected) {
    acts.push('<button id="syncNow">Sync Strava</button>');
  }
  $('todayActions').innerHTML = acts.join('');
}

// --- week ------------------------------------------------------------------
function renderWeek() {
  const week = thisWeekKey();
  const wk = weekDoc(week);
  const mon = mondayOf(week);
  const t = targetFor(week);
  const r = rollup(week);

  const note = [];
  if (t?.runMiles) note.push(`${n1(r.runMi)} of ${n0(t.runMiles)} mi`);
  if (t?.deload) note.push('deload week');
  if (r.bikes) note.push(`${r.bikes} bike · ${hm(r.bikeMin)}`);
  if (r.swims) note.push(`${r.swims} swim · ${comma(r.swimYd)} yd`);
  if (r.lifts) note.push(`${r.lifts} lift`);
  $('weekNote').textContent = note.join('   ·   ');

  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(d.getDate() + i);
    const date = ymd(d);
    const planned = wk?.days?.[i]?.sessions || [];
    const acts = sessionsOn(date);
    const isToday = date === today();
    const past = date < today();

    const planHtml = planned.length
      ? planned.map((ps) => `<span class="pl ${esc(ps.sport)}"><s></s>${esc(ps.title || SPORTS[ps.sport])}`
        + `${ps.optional ? ' <em>opt</em>' : ''}</span>`).join('')
      : `<span class="pl"><em>${wk ? 'off' : '—'}</em></span>`;

    const actHtml = acts.length
      ? acts.map((s) => {
        const v = s.sport === 'run' ? `${n1(s.miles)} mi ${mmss(s.paceSecPerMi)}`
          : s.sport === 'bike' ? `${hm(s.movingMin)}${s.miles ? ` · ${n0(s.miles)} mi` : ''}`
            : s.sport === 'swim' ? `${comma(s.yards || 0)} yd`
              : hm(s.movingMin);
        return `<span class="sport ${esc(s.sport)}"><s></s>${esc(v)}</span>`;
      }).join('')
      : past ? '<span class="dash">nothing recorded</span>' : '';

    const fb = acts.map((s) => {
      const f = feedbackFor(s.id);
      const title = f
        ? `rpe ${f.rpe || '?'}, felt ${FEEL[f.feel] || '?'}${f.pain ? `, pain ${f.pain}/10` : ''}`
        : 'no note yet';
      return `<span class="fbdot ${f ? (f.pain ? 'pain' : 'has') : ''}" title="${esc(title)}"></span>`;
    }).join('');

    html += `<div class="day${isToday ? ' is-today' : ''}${past ? ' past' : ''}">`
      + `<div class="day-name"><b>${DOW[i]}</b><span>${MON[d.getMonth()]} ${d.getDate()}</span></div>`
      + `<div class="day-plan">${planHtml}</div>`
      + `<div class="day-act">${actHtml}</div>`
      + `<div class="day-fb">${fb}</div></div>`;
  }
  $('weekList').innerHTML = html;

  const next = weekAdd(week, 1);
  const buttons = [];
  if (!wk?.days) buttons.push(`<button class="solid" data-plan="${week}">Plan this week</button>`);
  buttons.push(`<button data-plan="${next}">${weekDoc(next) ? 'Re-plan next week' : 'Plan next week'}</button>`);
  if (wk?.generatedAt) {
    buttons.push(`<span class="thinking">planned ${esc(localDay(wk.generatedAt))}`
      + `${wk.source === 'seed' ? ' from your plan document' : ' by the coach'}</span>`);
  }
  $('weekActions').innerHTML = buttons.join('');
}

// --- chart -----------------------------------------------------------------
function renderChart() {
  const week = thisWeekKey();
  const back = 10;
  const fwd = 4;
  const rows = [];
  for (let i = -back; i <= fwd; i++) {
    const k = weekAdd(week, i);
    const r = rollup(k);
    const t = targetFor(k);
    rows.push({
      k, actual: r.runMi, runs: r.runs, bikeHr: r.bikeMin / 60, swims: r.swims,
      target: t?.runMiles || null, deload: Boolean(t?.deload),
      future: k > week, now: k === week,
    });
  }

  const goal = Number(settings().targetMpw || 0);
  let max = Math.max(goal || 0, 10);
  for (const r of rows) max = Math.max(max, r.actual, r.target || 0);
  max = Math.ceil((max * 1.1) / 10) * 10;

  const W = 920; const L = 44; const R = 14; const T = 24; const AX = 208;
  const band = (W - L - R) / rows.length;
  const y = (v) => AX - (v / max) * (AX - T);
  const s = [];

  for (let g = 10; g <= max; g += 10) {
    s.push(`<line x1="${L}" y1="${y(g).toFixed(1)}" x2="${W - R}" y2="${y(g).toFixed(1)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 4"/>`);
    s.push(`<text x="${L - 8}" y="${(y(g) + 4).toFixed(1)}" text-anchor="end" font-family="Barlow Condensed,sans-serif" font-size="13" fill="var(--mut)">${g}</text>`);
  }
  if (goal) {
    s.push(`<line x1="${L}" y1="${y(goal).toFixed(1)}" x2="${W - R}" y2="${y(goal).toFixed(1)}" stroke="var(--run)" stroke-width="1.5" stroke-dasharray="6 4"/>`);
  }

  const bw = Math.min(22, band * 0.34);
  rows.forEach((r, i) => {
    const cx = L + band * i + band / 2;
    if (r.now) {
      s.push(`<rect x="${(L + band * i).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${AX - T}" fill="var(--ghost)"/>`);
    }
    if (r.target) {
      s.push(`<rect x="${(cx - bw - 2).toFixed(1)}" y="${y(r.target).toFixed(1)}" width="${bw.toFixed(1)}"`
        + ` height="${Math.max(1, AX - y(r.target)).toFixed(1)}" fill="none" stroke="var(--run)" stroke-width="1"`
        + `${r.deload ? ' stroke-dasharray="3 3"' : ''}><title>${r.k} planned ${n0(r.target)} mi${r.deload ? ' (deload)' : ''}</title></rect>`);
    }
    if (r.actual > 0.05) {
      s.push(`<rect x="${(cx + 2).toFixed(1)}" y="${y(r.actual).toFixed(1)}" width="${bw.toFixed(1)}"`
        + ` height="${Math.max(1, AX - y(r.actual)).toFixed(1)}" fill="var(--run)">`
        + `<title>${r.k} actual ${n1(r.actual)} mi over ${r.runs} run${r.runs === 1 ? '' : 's'}</title></rect>`);
    }
    s.push(`<text x="${cx.toFixed(1)}" y="${AX + 17}" text-anchor="middle" font-family="Barlow Condensed,sans-serif"`
      + ` font-size="12.5" fill="${r.now ? 'var(--ink)' : 'var(--mut)'}">${weekLabel(r.k)}</text>`);
  });

  let maxBike = 1;
  for (const r of rows) maxBike = Math.max(maxBike, r.bikeHr);
  const SB = AX + 30;
  const SS = AX + 48;
  s.push(`<text x="${L - 8}" y="${SB + 9}" text-anchor="end" font-family="Barlow Condensed,sans-serif" font-size="12" fill="var(--mut)">bike</text>`);
  s.push(`<text x="${L - 8}" y="${SS + 9}" text-anchor="end" font-family="Barlow Condensed,sans-serif" font-size="12" fill="var(--mut)">swim</text>`);
  rows.forEach((r, i) => {
    const x0 = L + band * i + band / 2 - bw;
    const w = bw * 2;
    if (r.bikeHr > 0.02) {
      const h = Math.max(2, (r.bikeHr / maxBike) * 12);
      s.push(`<rect x="${x0.toFixed(1)}" y="${(SB + 12 - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="var(--bike)">`
        + `<title>${r.k} bike ${n1(r.bikeHr)} h</title></rect>`);
    } else if (!r.future) {
      s.push(`<line x1="${x0.toFixed(1)}" y1="${SB + 12}" x2="${(x0 + w).toFixed(1)}" y2="${SB + 12}" stroke="var(--line)" stroke-width="1"/>`);
    }
    for (let k = 0; k < r.swims; k++) {
      s.push(`<rect x="${(x0 + k * 8).toFixed(1)}" y="${SS + 4}" width="6" height="6" fill="var(--swim)"><title>${r.k} ${r.swims} swims</title></rect>`);
    }
    if (!r.swims && !r.future) {
      s.push(`<line x1="${x0.toFixed(1)}" y1="${SS + 10}" x2="${(x0 + w).toFixed(1)}" y2="${SS + 10}" stroke="var(--line)" stroke-width="1"/>`);
    }
  });
  s.push(`<line x1="${L}" y1="${AX}" x2="${W - R}" y2="${AX}" stroke="var(--mut)" stroke-width="1"/>`);
  s.push(`<text x="${L - 8}" y="${T - 8}" text-anchor="end" font-family="Barlow Condensed,sans-serif" font-size="12" fill="var(--mut)">mi</text>`);

  $('chart').innerHTML = `<svg viewBox="0 0 ${W} ${SS + 22}" role="img" aria-label="Weekly running miles, planned against actual, for the last ten weeks and the next four.">${s.join('')}</svg>`;
  $('targetLeg').innerHTML = goal
    ? `<i style="border-top:2px dashed var(--run); height:0; align-self:center"></i>${n0(goal)} mi goal`
    : '';
  $('volNote').textContent = `last ${back} weeks and the next ${fwd}`;

  const d28 = ymd(new Date(Date.now() - 28 * 86400000));
  const d7 = ymd(new Date(Date.now() - 7 * 86400000));
  let mi28 = 0; let mi7 = 0; let long4 = 0; let elev28 = 0; let hrS = 0; let hrN = 0;
  for (const x of sessions()) {
    if (x.sport !== 'run' || x.date < d28) continue;
    mi28 += x.miles || 0;
    elev28 += x.elevFt || 0;
    if (x.date >= d7) mi7 += x.miles || 0;
    if ((x.miles || 0) > long4) long4 = x.miles || 0;
    if (x.hrAvg) { hrS += x.hrAvg; hrN++; }
  }
  const stats = [
    ['7-day run', n1(mi7), 'mi'],
    ['4-week average', n1(mi28 / 4), 'mi/wk'],
    ['longest run, 4 wk', n1(long4), 'mi'],
    ['4-week climb', comma(elev28), 'ft'],
    ['avg run HR', hrN ? n0(hrS / hrN) : '—', hrN ? 'bpm' : ''],
  ];
  $('stats').innerHTML = stats
    .map((x) => `<div class="stat"><b>${x[1]} <i>${x[2]}</i></b><span>${x[0]}</span></div>`)
    .join('');
}

// --- coach -----------------------------------------------------------------
function renderCoach() {
  const week = thisWeekKey();
  const wk = weekDoc(week) || {};
  const dg = state.data?.digests?.[week];
  const review = dg?.review;
  let html = '';

  if (review || wk.coachNote) {
    const verdict = review?.verdict || wk.verdict;
    html += '<div class="verdict"><b>'
      + `${review ? 'Week review' : 'This week'}</b>`
      + (verdict
        ? `<span class="chip ${/back|hold/i.test(verdict) ? 'miss' : 'done'}">${esc(verdict)}</span>`
        : '')
      + '</div>';
    const body = review?.summary || wk.coachNote || '';
    html += `<div class="coachtext">${body.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join('')}</div>`;
    const obs = review?.observations || [];
    const adj = review?.adjustments || wk.adjustments || [];
    if (obs.length || adj.length) {
      html += `<ul class="adj">${[...obs, ...adj].map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`;
    }
    if (review?.flags?.length) {
      html += `<div class="flagbox"><b>Watch</b><ul>${review.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`;
    }
  } else {
    html = '<div class="coachtext"><p><em>No coaching note for this week yet.</em> Write the digest below '
      + 'and send it, or ask for a week plan straight away.</p></div>';
  }
  $('coachCard').innerHTML = html;

  const isMonday = parseYmd(today()).getDay() === 1;
  $('coachNote2').textContent = isMonday ? 'Monday — digest day' : '';
  $('digestLabel').textContent = `Digest for ${week} — how did last week (${weekAdd(week, -1)}) feel?`;
  const box = $('digestBox');
  if (dg?.text && !box.value && document.activeElement !== box) box.value = dg.text;

  const claude = state.data?.claude;
  const btns = [];
  if (claude?.available) {
    btns.push('<button class="solid" id="sendDigest">Send digest to Claude</button>');
    btns.push('<button id="saveDigest">Save draft</button>');
  } else {
    btns.push('<button id="saveDigest">Save draft</button>');
    btns.push('<span class="thinking">Claude has no credentials — see Setup.</span>');
  }
  $('digestActions').innerHTML = btns.join('');
}

// --- log -------------------------------------------------------------------
function renderLog() {
  const rows = sessions().slice(0, 40);
  if (!rows.length) {
    $('logBody').innerHTML = '<tr><td colspan="10" class="name"><span class="empty">'
      + (state.data?.connections?.strava?.connected
        ? 'No sessions yet. Sync Strava, or log one by hand.'
        : 'No sessions yet. Connect Strava in Setup, or log one by hand.')
      + '</span></td></tr>';
  } else {
    $('logBody').innerHTML = rows.map((s) => {
      const f = feedbackFor(s.id) || {};
      const dist = s.sport === 'swim'
        ? (s.yards ? `${comma(s.yards)} yd` : '—')
        : s.miles ? `${n1(s.miles)} mi` : '—';
      const pace = s.paceSecPerMi ? mmss(s.paceSecPerMi)
        : s.per100yd ? mmss(s.per100yd)
          : s.speedMph ? `${n1(s.speedMph)} mph` : '—';
      const d = parseYmd(s.date);
      return '<tr>'
        + `<td>${MON[d.getMonth()]} ${d.getDate()}</td>`
        + `<td><span class="sport ${esc(s.sport)}"><s></s>${esc(SPORTS[s.sport] || s.sport)}</span></td>`
        + `<td class="r">${dist}</td>`
        + `<td class="r">${hm(s.movingMin)}</td>`
        + `<td class="r">${pace}</td>`
        + `<td class="r">${s.hrAvg ? n0(s.hrAvg) : '—'}</td>`
        + `<td class="r">${s.elevFt ? comma(s.elevFt) : '—'}</td>`
        + `<td class="r">${f.rpe || '—'}</td>`
        + `<td>${f.feel ? esc(FEEL[f.feel] || f.feel) : '—'}`
        + `${f.pain ? ` <span class="chip pain">pain ${f.pain}</span>` : ''}</td>`
        + `<td class="r"><button class="link" data-fb="${esc(s.id)}">${f.loggedAt ? 'note' : 'add note'}</button></td>`
        + '</tr>';
    }).join('');
  }
  $('logNote').textContent = sessions().length ? `${sessions().length} sessions in the window` : '';
  $('logActions').innerHTML = '<button id="logManual2">Log a session</button>';
}

// --- plan ------------------------------------------------------------------
function renderPlan() {
  const p = plan();
  $('planRationale').innerHTML = p?.rationale
    ? `<p>${esc(p.rationale)}</p>`
    : '<p><em>No macrocycle built yet. Sync your Strava history, then let the coach build the phases '
      + 'from where you actually are.</em></p>';

  const week = thisWeekKey();
  if (!p?.phases) {
    $('phaseList').innerHTML = '';
  } else {
    const cur = phaseFor(week);
    $('phaseList').innerHTML = p.phases.map((ph) => {
      const wt = (p.weekTargets || []).filter((t) => t.index >= ph.weekFrom && t.index <= ph.weekTo);
      let lo = null; let hi = null;
      for (const t of wt) {
        if (lo == null || t.runMiles < lo) lo = t.runMiles;
        if (hi == null || t.runMiles > hi) hi = t.runMiles;
      }
      return `<div class="ph${cur && cur.n === ph.n ? ' now' : ''}">`
        + `<div class="ph-n">${esc(ph.n)}</div><div><h3>${esc(ph.name)}</h3>`
        + `<div class="ph-meta"><span>weeks ${esc(ph.weekFrom)}–${esc(ph.weekTo)}</span>`
        + (wt.length ? `<s></s><span>${weekLabel(wt[0].week)} – ${weekLabel(wt[wt.length - 1].week)}</span>` : '')
        + (lo != null ? `<s></s><span>${n0(lo)}–${n0(hi)} mi/wk</span>` : '')
        + (cur && cur.n === ph.n ? '<s></s><span class="chip done">current</span>' : '')
        + `</div><p>${esc(ph.job || '')}</p></div></div>`;
    }).join('');
  }

  const upcoming = (p?.weekTargets || []).filter((t) => t.week >= week).slice(0, 16);
  $('planExtras').innerHTML = upcoming.length
    ? `<details><summary>Week-by-week targets ahead (${upcoming.length})</summary>`
      + '<div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>Week</th><th>Starts</th>'
      + '<th class="r">Run</th><th class="r">Bike</th><th class="r">Swim</th><th class="r">Lift</th><th></th>'
      + '</tr></thead><tbody>'
      + upcoming.map((t) => `<tr><td>${esc(t.week)}</td><td>${weekLabel(t.week)}</td>`
        + `<td class="r">${n0(t.runMiles || 0)} mi</td>`
        + `<td class="r">${t.bikeHours ? `${n1(t.bikeHours)} h` : '—'}</td>`
        + `<td class="r">${t.swimSessions || '—'}</td>`
        + `<td class="r">${t.strengthSessions || '—'}</td>`
        + `<td>${t.deload ? '<span class="chip deload">deload</span>' : ''}</td></tr>`).join('')
      + '</tbody></table></div></details>'
    : '';

  $('planNote').textContent = p?.generatedAt
    ? `built ${localDay(p.generatedAt)}${p.source === 'seed' ? ' from your plan document' : ''}`
    : '';
  $('planActions').innerHTML = state.data?.claude?.available
    ? `<button class="solid" id="buildPlan">${p ? 'Rebuild from my history' : 'Build the plan'}</button>`
    : '<span class="thinking">Add Claude credentials in Setup to build a plan.</span>';
}

// --- setup -----------------------------------------------------------------
function renderSetup() {
  const strava = state.data?.connections?.strava || {};
  const sync = state.data?.sync;
  $('stravaConn').innerHTML = '<h3>'
    + `<span class="dot ${strava.connected ? 'on' : 'off'}"></span>Strava</h3>`
    + (strava.connected
      ? '<dl class="kv">'
        + `<dt>athlete</dt><dd>${esc(strava.athlete?.name || strava.athlete?.id || 'connected')}</dd>`
        + `<dt>sessions</dt><dd>${state.data?.totals?.activities || 0}</dd>`
        + (sync?.lastSync ? `<dt>last sync</dt><dd>${esc(new Date(sync.lastSync).toLocaleString())}</dd>` : '')
        + (sync?.newest ? `<dt>newest</dt><dd>${esc(sync.newest)}</dd>` : '')
        + (sync?.rateUsage ? `<dt>api usage</dt><dd>${esc(sync.rateUsage)} of 200 / 2000</dd>` : '')
        + '</dl>'
        + '<div class="btnrow"><button class="solid" id="syncNow2">Sync now</button>'
        + '<button id="syncFull">Full re-sync (180 days)</button>'
        + '<button id="stravaOff">Disconnect</button></div>'
      : strava.configured === false
        ? '<p>This server has no Strava API credentials. Add <code>STRAVA_CLIENT_ID</code> and '
          + '<code>STRAVA_CLIENT_SECRET</code> to <code>.env</code> and restart.</p>'
        : '<p>Connect your Strava account to pull mileage, pace, elevation, heart rate and '
          + 'per-mile splits. Read-only; tokens are encrypted on this machine.</p>'
          + '<div class="btnrow"><a href="/auth/strava/connect"><button class="solid">Connect Strava</button></a></div>');

  const claude = state.data?.claude || {};
  const sourceLabel = {
    'user-key': 'your own API key',
    'server-key': "this server's ANTHROPIC_API_KEY",
    'ant-profile': 'an ant auth login profile on this machine',
    'auth-token': 'ANTHROPIC_AUTH_TOKEN',
  }[claude.source] || 'unknown';
  $('claudeConn').innerHTML = '<h3>'
    + `<span class="dot ${claude.available ? 'on' : 'off'}"></span>Claude</h3>`
    + (claude.available
      ? `<dl class="kv"><dt>model</dt><dd>${esc(claude.model)}</dd>`
        + `<dt>billed to</dt><dd>${esc(sourceLabel)}</dd></dl>`
      : '<p>No Claude credentials found. Either run <code>ant auth login</code> on this machine, '
        + 'set <code>ANTHROPIC_API_KEY</code> in <code>.env</code>, or paste your own key below.</p>')
    + (claude.allowUserKeys
      ? '<div class="field" style="margin-top:10px"><label for="claudeKey">'
        + `Your Anthropic API key${claude.hasUserKey ? ' (saved)' : ''}</label>`
        + `<input type="password" id="claudeKey" placeholder="${claude.hasUserKey ? '•••••••• saved, paste to replace' : 'sk-ant-...'}" autocomplete="off"></div>`
        + '<div class="btnrow"><button id="saveKey">Save key</button>'
        + (claude.hasUserKey ? '<button id="clearKey">Remove</button>' : '')
        + '<span class="thinking" id="keyStatus"></span></div>'
        + '<p class="help" style="margin-top:10px">Stored encrypted on this machine and used only for '
        + 'your own coaching requests. Get one at console.anthropic.com.</p>'
      : '');

  if (document.activeElement?.closest?.('#setup')) return;
  const s = settings();
  $('goalText').value = s.goal || '';
  $('goalMpw').value = s.targetMpw || '';
  $('goalDate').value = s.targetDate || '';
  $('goalKeep').value = s.keep || '';
  $('goalLimits').value = s.limits || '';
}

// --- render ----------------------------------------------------------------
let pending = false;
function render() {
  if (pending) return;
  pending = true;
  // A timeout, not requestAnimationFrame: rAF never fires in a hidden tab, so
  // a page loaded in the background would sit on "Loading..." until focused.
  setTimeout(() => {
    pending = false;
    try {
      renderMast(); renderToday(); renderWeek(); renderChart();
      renderCoach(); renderLog(); renderPlan(); renderSetup();
    } catch (err) {
      console.error('render', err);
    }
  });
}

// --- sheet -----------------------------------------------------------------
let sheetPrev = null;
function openSheet(html, afterOpen) {
  sheetPrev = document.activeElement;
  $('sheetIn')?.remove();
  const inner = document.createElement('div');
  inner.className = 'sheet-in';
  inner.id = 'sheetIn';
  inner.innerHTML = html;
  $('sheet').appendChild(inner);
  $('sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  afterOpen?.(inner);
  inner.querySelector('button, input, textarea, select')?.focus();
}
function closeSheet() {
  $('sheet').hidden = true;
  $('sheetIn')?.remove();
  document.body.style.overflow = '';
  sheetPrev?.focus?.();
}
$('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeSheet(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('sheet').hidden) closeSheet();
});

// --- feedback sheet --------------------------------------------------------
function feedbackSheet(sessionId) {
  const s = sessions().find((x) => x.id === sessionId);
  if (!s) return;
  const f = feedbackFor(sessionId) || {};
  const d = parseYmd(s.date);

  const scale = (key, label, from, to, val, note, labels) => {
    let out = `<div class="field"><label>${label}</label><div class="scale" data-scale="${key}">`;
    for (let i = from; i <= to; i++) {
      out += `<button type="button" data-val="${i}" aria-pressed="${val === i}">${labels ? labels[i] : i}</button>`;
    }
    return `${out}</div>${note ? `<div class="scalenote">${note}</div>` : ''}</div>`;
  };

  let detail = '';
  if (s.splits?.length > 1) {
    const paces = s.splits.map((x) => x.paceSecPerMi).filter(Boolean);
    const fastest = Math.min(...paces);
    const slowest = Math.max(...paces);
    detail = '<div class="splits"><div class="hd"><span>mi</span><span>pace</span><span></span><span>hr</span><span>elev</span></div>'
      + s.splits.map((sp) => {
        const w = sp.paceSecPerMi && slowest > fastest
          ? 12 + 88 * (1 - (sp.paceSecPerMi - fastest) / (slowest - fastest))
          : 60;
        return `<div><span>${esc(sp.mi)}</span>`
          + `<span><span class="bar" style="display:block;width:${w.toFixed(0)}%"></span></span>`
          + `<span>${mmss(sp.paceSecPerMi)}</span>`
          + `<span>${sp.hrAvg ? n0(sp.hrAvg) : ''}</span>`
          + `<span>${sp.elevFt ? `${n0(sp.elevFt)}'` : ''}</span></div>`;
      }).join('') + '</div>';
  } else if (s.laps?.length > 1) {
    detail = '<div class="splits"><div class="hd"><span>lap</span><span>dist</span><span>pace</span><span>hr</span><span>time</span></div>'
      + s.laps.map((lp) => `<div><span>${esc(lp.n)}</span><span>${lp.miles ? `${n1(lp.miles)} mi` : ''}</span>`
        + `<span>${mmss(lp.paceSecPerMi)}</span><span>${lp.hrAvg ? n0(lp.hrAvg) : ''}</span>`
        + `<span>${hm(lp.minutes)}</span></div>`).join('') + '</div>';
  }

  const isLift = s.sport === 'lift' || s.sport === 'strength';
  const lifts = (s.lifts?.length ? s.lifts : [{}, {}, {}]).concat([{}]);
  const liftRows = isLift
    ? '<div class="field"><label>Lifts &mdash; exercise, sets, reps, weight</label>'
      + '<table class="lifts" id="liftTable"><tbody>'
      + lifts.map((l) => '<tr>'
        + `<td><input type="text" data-l="ex" value="${esc(l.ex || '')}" placeholder="Trap bar deadlift"></td>`
        + `<td style="width:58px"><input type="number" data-l="sets" value="${esc(l.sets || '')}" placeholder="3"></td>`
        + `<td style="width:58px"><input type="number" data-l="reps" value="${esc(l.reps || '')}" placeholder="5"></td>`
        + `<td style="width:78px"><input type="number" data-l="lb" value="${esc(l.lb || '')}" placeholder="lb"></td></tr>`).join('')
      + '</tbody></table></div>'
    : '';

  openSheet(
    `<div class="sheet-head"><div><h3>${esc(s.name || SPORTS[s.sport] || s.sport)}</h3>`
    + `<p>${DOW[(d.getDay() + 6) % 7]} ${MON[d.getMonth()]} ${d.getDate()}  ·  ${esc(SPORTS[s.sport] || s.sport)}`
    + `${s.source === 'manual' ? '  ·  logged by hand' : ''}</p></div>`
    + '<button type="button" data-close="1">Close</button></div>'
    + (actualLine(s) ? `<div class="slot-actual" style="border-top:0; padding-top:0">${actualLine(s)}</div>` : '')
    + detail
    + '<div style="height:18px"></div>'
    + scale('rpe', 'Effort (RPE)', 1, 10, f.rpe, '1 walking, 5 steady, 7 working, 10 all out')
    + scale('feel', 'How the body felt', 1, 5, f.feel, '', FEEL)
    + scale('pain', 'Knee / niggle pain', 0, 10, f.pain, '0 none. Above 3 means stop and hold volume.')
    + `<div class="field"><label for="fbSite">Where, if anywhere</label>`
    + `<input type="text" id="fbSite" value="${esc(f.painSite || '')}" placeholder="left knee, medial"></div>`
    + '<div class="field"><label for="fbNotes">Notes for the coach</label>'
    + `<textarea id="fbNotes" placeholder="Terrain, sleep, fuel, how it changed through the run.">${esc(f.notes || '')}</textarea></div>`
    + liftRows
    + '<div class="btnrow"><button class="solid" id="fbSave">Save note</button>'
    + '<button type="button" data-close="1">Cancel</button>'
    + '<span class="thinking" id="fbStatus"></span></div>',
    (inner) => {
      const chosen = { rpe: f.rpe ?? null, feel: f.feel ?? null, pain: f.pain ?? null };
      inner.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-val]');
        if (b) {
          const wrap = b.closest('[data-scale]');
          const key = wrap.getAttribute('data-scale');
          const v = Number(b.getAttribute('data-val'));
          chosen[key] = chosen[key] === v ? null : v;
          wrap.querySelectorAll('button').forEach((x) => {
            x.setAttribute('aria-pressed', String(Number(x.getAttribute('data-val')) === chosen[key]));
          });
        }
        if (e.target.id === 'fbSave') {
          const status = $('fbStatus');
          status.className = 'thinking';
          status.textContent = 'Saving…';
          try {
            await api(`/api/feedback/${encodeURIComponent(s.id)}`, {
              method: 'PUT',
              body: {
                ...chosen,
                painSite: $('fbSite').value,
                notes: $('fbNotes').value,
              },
            });
            if (isLift) {
              const rows = [...$('liftTable').querySelectorAll('tr')].map((tr) => ({
                ex: tr.querySelector('[data-l="ex"]').value,
                sets: tr.querySelector('[data-l="sets"]').value,
                reps: tr.querySelector('[data-l="reps"]').value,
                lb: tr.querySelector('[data-l="lb"]').value,
              }));
              await api(`/api/sessions/${encodeURIComponent(s.id)}`, { method: 'PATCH', body: { lifts: rows } });
            }
            closeSheet();
            await refresh();
            toast('Note saved.');
          } catch (err) {
            status.className = 'thinking err';
            status.textContent = err.message;
          }
        }
      });
    },
  );
}

// --- manual session sheet --------------------------------------------------
function manualSheet(sport) {
  openSheet(
    '<div class="sheet-head"><div><h3>Log a session</h3>'
    + "<p>For anything Strava didn't record</p></div>"
    + '<button type="button" data-close="1">Close</button></div>'
    + '<div class="field"><label for="mSport">Sport</label><select id="mSport">'
    + ['run', 'bike', 'swim', 'lift', 'strength', 'mobility', 'cross', 'other']
      .map((k) => `<option value="${k}"${k === sport ? ' selected' : ''}>${SPORTS[k]}</option>`).join('')
    + '</select></div>'
    + `<div class="field"><label for="mDate">Date</label><input type="date" id="mDate" value="${today()}"></div>`
    + '<div class="field"><label for="mName">What was it</label>'
    + '<input type="text" id="mName" placeholder="Easy 6 with strides"></div>'
    + '<div class="grid2" style="gap:14px">'
    + '<div class="field"><label for="mDist">Distance (miles, or yards for swim)</label>'
    + '<input type="number" id="mDist" step="0.01"></div>'
    + '<div class="field"><label for="mMin">Moving time (minutes)</label>'
    + '<input type="number" id="mMin" step="1"></div>'
    + '<div class="field"><label for="mElev">Elevation (ft)</label><input type="number" id="mElev" step="1"></div>'
    + '<div class="field"><label for="mHr">Average HR</label><input type="number" id="mHr" step="1"></div>'
    + '</div>'
    + '<div class="btnrow"><button class="solid" id="mSave">Save session</button>'
    + '<button type="button" data-close="1">Cancel</button>'
    + '<span class="thinking" id="mStatus"></span></div>',
    (inner) => {
      inner.querySelector('#mSave').addEventListener('click', async () => {
        const status = $('mStatus');
        status.className = 'thinking';
        status.textContent = 'Saving…';
        try {
          await api('/api/sessions', {
            method: 'POST',
            body: {
              sport: $('mSport').value,
              date: $('mDate').value,
              name: $('mName').value,
              dist: $('mDist').value,
              minutes: $('mMin').value,
              elevFt: $('mElev').value,
              hrAvg: $('mHr').value,
            },
          });
          closeSheet();
          await refresh();
          toast('Session logged.');
        } catch (err) {
          status.className = 'thinking err';
          status.textContent = err.message;
        }
      });
    },
  );
}

// --- long-running actions --------------------------------------------------
/** Runs a coach or sync call with an elapsed timer and a Stop button. */
async function work(label, fn) {
  if (state.busy) return;
  state.busy = true;
  const status = $('coachStatus');
  const started = Date.now();
  state.abort = new AbortController();

  status.hidden = false;
  status.className = 'thinking';
  const tick = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    status.innerHTML = `<span class="working">${esc(label)} — <span class="elapsed">${s}s</span></span>`
      + ' <button class="link" id="stopWork">Stop</button>';
  }, 250);
  status.innerHTML = `<span class="working">${esc(label)}…</span>`;

  document.querySelectorAll('[data-plan], #sendDigest, #buildPlan, #syncNow, #syncNow2, #syncFull')
    .forEach((b) => { b.disabled = true; });

  try {
    const result = await fn(state.abort.signal);
    clearInterval(tick);
    status.className = 'thinking';
    status.textContent = '';
    status.hidden = true;
    return result;
  } catch (err) {
    clearInterval(tick);
    if (err.name === 'AbortError') {
      status.hidden = true;
      toast('Stopped.');
      return undefined;
    }
    status.className = 'thinking err';
    status.textContent = err.message;
    toast(err.message, true);
    return undefined;
  } finally {
    state.busy = false;
    state.abort = null;
    document.querySelectorAll('[data-plan], #sendDigest, #buildPlan, #syncNow, #syncNow2, #syncFull')
      .forEach((b) => { b.disabled = false; });
  }
}

async function doSync(full = false) {
  const out = await work(full ? 'Re-syncing everything from Strava' : 'Syncing Strava', (signal) => (
    api('/api/strava/sync', { method: 'POST', body: { full }, signal })
  ));
  if (out) {
    await refresh();
    const s = out.sync;
    toast(`${s.fetched} sessions checked, ${s.withDetail} with splits. Newest ${s.newest || '—'}.`);
  }
}

async function doPlanWeek(week) {
  const out = await work(`Planning ${week}`, (signal) => (
    api('/api/coach/plan-week', { method: 'POST', body: { week }, signal })
  ));
  if (out) {
    await refresh();
    toast(`${week} planned — ${out.week.verdict}.`);
  }
}

async function doDigest() {
  const text = $('digestBox').value.trim();
  if (!text) { toast('Write the digest first.', true); return; }
  const out = await work('Reviewing your week', (signal) => (
    api('/api/coach/review-digest', { method: 'POST', body: { text }, signal })
  ));
  if (out) {
    await refresh();
    toast(`Review saved and the week is planned — ${out.review.verdict}.`);
    document.getElementById('coach')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function doBuildPlan() {
  const out = await work('Building the macrocycle', (signal) => (
    api('/api/coach/build-plan', { method: 'POST', signal })
  ));
  if (out) {
    await refresh();
    const n = out.plan.phases?.length || 0;
    toast(`Plan rebuilt — ${n} phases${out.plan.targetDate ? `, target ${out.plan.targetDate}` : ''}.`);
  }
}

// --- events ----------------------------------------------------------------
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (!t || typeof t.closest !== 'function') return;

  if (t.closest('[data-close]')) { closeSheet(); return; }
  if (t.id === 'stopWork') { state.abort?.abort(); return; }

  const fb = t.closest('[data-fb]');
  if (fb) { feedbackSheet(fb.getAttribute('data-fb')); return; }
  const lg = t.closest('[data-log]');
  if (lg) { manualSheet(lg.getAttribute('data-log')); return; }
  const pw = t.closest('[data-plan]');
  if (pw) { doPlanWeek(pw.getAttribute('data-plan')); return; }

  switch (t.id) {
    case 'fbNext': {
      const n = needsFeedback();
      if (n.length) feedbackSheet(n[0].id);
      return;
    }
    case 'logManual':
    case 'logManual2':
      manualSheet('run');
      return;
    case 'syncNow':
    case 'syncNow2':
      doSync(false);
      return;
    case 'syncFull':
      doSync(true);
      return;
    case 'sendDigest':
      doDigest();
      return;
    case 'buildPlan':
      doBuildPlan();
      return;
    case 'saveDigest':
      try {
        await api(`/api/digests/${thisWeekKey()}`, { method: 'PUT', body: { text: $('digestBox').value } });
        toast('Draft saved.');
      } catch (err) { toast(err.message, true); }
      return;
    case 'saveGoal':
      try {
        $('goalStatus').textContent = 'Saving…';
        await api('/api/settings', {
          method: 'PUT',
          body: {
            goal: $('goalText').value,
            targetMpw: $('goalMpw').value,
            targetDate: $('goalDate').value,
            keep: $('goalKeep').value,
            limits: $('goalLimits').value,
          },
        });
        $('goalStatus').textContent = 'Saved. Rebuild the plan to apply it.';
        await refresh();
      } catch (err) {
        $('goalStatus').textContent = err.message;
      }
      return;
    case 'saveKey':
    case 'clearKey':
      try {
        const key = t.id === 'clearKey' ? '' : $('claudeKey').value.trim();
        $('keyStatus').textContent = 'Saving…';
        await api('/api/claude-key', { method: 'PUT', body: { key } });
        await refresh();
        toast(t.id === 'clearKey' ? 'Key removed.' : 'Key saved.');
      } catch (err) {
        $('keyStatus').textContent = err.message;
      }
      return;
    case 'stravaOff':
      try {
        await api('/auth/strava/disconnect', { method: 'POST' });
        await refresh();
        toast('Strava disconnected.');
      } catch (err) { toast(err.message, true); }
      return;
    case 'exportBtn':
      window.location.href = '/api/export';
      return;
    case 'signOut':
      await api('/auth/logout', { method: 'POST' });
      window.location.reload();
      return;
    case 'devLogin':
      try {
        await api('/auth/dev', { method: 'POST' });
        window.location.reload();
      } catch (err) { toast(err.message, true); }
      return;
    default:
  }
});

// --- boot ------------------------------------------------------------------
function renderGate() {
  const a = state.auth || {};
  const actions = [];
  if (a.google) {
    actions.push('<a href="/auth/google/start"><button class="solid glogo">Sign in with Google</button></a>');
  }
  if (a.devLogin) {
    actions.push(`<button ${a.google ? '' : 'class="solid"'} id="devLogin">Use the local account</button>`);
  }
  if (!actions.length) {
    actions.push('<span class="thinking err">No sign-in method is configured. '
      + 'Add Google credentials to .env, or bind the server to localhost to enable the local account.</span>');
  }
  $('gateActions').innerHTML = actions.join('');

  const params = new URLSearchParams(window.location.search);
  const authError = {
    denied: 'Sign-in was cancelled.',
    badstate: 'That sign-in link expired. Try again.',
    failed: 'Sign-in failed. Check the server log.',
  }[params.get('auth')];
  $('gateNote').innerHTML = authError
    ? `<span style="color:var(--flag)">${esc(authError)}</span>`
    : a.devLogin && !a.google
      ? 'Running without Google credentials, so the local account is enabled. '
        + 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env for real sign-in.'
      : '';
}

function showStravaResult() {
  const params = new URLSearchParams(window.location.search);
  const msg = {
    connected: ['Strava connected. Sync to pull your history.', false],
    denied: ['Strava authorization was cancelled.', true],
    scope: ['Strava needs the "view private activities" permission to read your training. Connect again and allow it.', true],
    badstate: ['That Strava link expired. Try connecting again.', true],
    failed: ['Connecting Strava failed. Check the server log.', true],
  }[params.get('strava')];
  if (msg) toast(msg[0], msg[1]);
  if (params.get('strava') || params.get('auth')) {
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }
}

(async function boot() {
  try {
    state.auth = await api('/auth/status');
  } catch {
    document.body.innerHTML = '<div class="shell"><div class="gate"><h1>Server unreachable</h1>'
      + '<p>The Volume Ledger server is not responding. Start it with <code>npm start</code>.</p></div></div>';
    return;
  }

  if (!state.auth.signedIn) {
    $('gate').hidden = false;
    renderGate();
    return;
  }

  $('app').hidden = false;
  try {
    await refresh();
    showStravaResult();
  } catch (err) {
    toast(err.message, true);
  }
})();
