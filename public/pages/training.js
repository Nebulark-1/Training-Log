// Training — the log. A week down the side, the selected day in front of you.
//
// One page holds what used to be two: the seven-day view and the single-day
// view were the same thing at two zoom levels, and moving between them cost
// a page load each way. Now the week is a rail; pick a day and it opens beside
// it. Arrow keys move the day, the rail's arrows move the week.
import { openLiftLog } from '../components/liftlog.js';
import { actualLine, openFeedback, openManual } from '../components/sessionlog.js';
import { clearDay, openSessionEdit, openSessionMove } from '../components/planedit.js';
import { scoreMeter } from '../components/charts.js';
import { SPORTS, ENDURANCE_SPORTS, formatVolume, isStrength, sportKey } from '../lib/sports.js';
import {
  DOW, MON, daysBetween, isoWeek, mondayOf, parseYmd, weekAdd, weekDates, ymd,
} from '../lib/dates.js';
import {
  coachBlock, coachLine, esc, hm, mmss, n0, n1, needsClaude, pageHead, shortDate,
  violationList,
} from '../lib/ui.js';

let dayOffset = 0;
let editing = false;

const viewDate = (ctx) => {
  const d = parseYmd(ctx.data.today);
  d.setDate(d.getDate() + dayOffset);
  return ymd(d);
};

function relLabel(ctx, date) {
  const diff = daysBetween(ctx.data.today, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = parseYmd(date);
  return `${DOW[(d.getDay() + 6) % 7]}, ${MON[d.getMonth()]} ${d.getDate()}`;
}

const sameSport = (a, b) => {
  const g = (x) => (isStrength(x) ? 'strength' : sportKey(x));
  return g(a) === g(b);
};

/** Prescribed exercises for a strength session, own snapshot or the plan. */
export function prescriptionFor(ctx, session) {
  if (session.prescribed?.length) return session.prescribed;
  const wkKey = isoWeek(parseYmd(session.date));
  const wk = ctx.data.weeks?.[wkKey];
  if (!wk?.days) return [];
  const idx = daysBetween(ymd(mondayOf(wkKey)), session.date);
  const match = wk.days[idx]?.sessions?.find((s) => isStrength(s.sport) && s.exercises?.length);
  return match?.exercises || [];
}

function rxTable(exercises) {
  if (!exercises?.length) return '';
  return '<table class="rx"><tbody>'
    + exercises.map((x) => '<tr>'
      + `<td class="rx-ex">${esc(x.ex)}${x.role === 'trial' ? ' <span class="trial">trial</span>' : ''}</td>`
      + `<td class="rx-vol">${esc(x.sets ?? '?')}&thinsp;&times;&thinsp;${esc(x.reps ?? '?')}</td>`
      + `<td class="rx-load">${x.loadLb ? `${n0(x.loadLb)} lb`
        : x.basis === 'bodyweight' ? '<span class="mut">bodyweight</span>' : '<span class="mut">calibrate</span>'}</td>`
      + `<td class="rx-note">${esc(x.note || '')}</td>`
      + '</tr>').join('')
    + '</tbody></table>';
}

function doneTable(session, prescription) {
  if (!session.lifts?.length) return '';
  const rx = new Map(prescription.map((x) => [x.exId || x.ex.toLowerCase(), x]));
  return '<table class="rx done"><tbody>'
    + session.lifts.map((l) => {
      const p = rx.get(l.exId) || rx.get(String(l.ex).toLowerCase());
      const top = l.sets.reduce((a, s) => (s.lb > (a?.lb ?? -1) ? s : a), null);
      const up = p?.loadLb && top?.lb && top.lb > p.loadLb;
      return '<tr>'
        + `<td class="rx-ex">${esc(l.ex)}${p ? '' : ' <span class="off">off program</span>'}</td>`
        + `<td class="rx-vol">${l.sets.map((s) => `${s.reps}${s.lb ? `&times;${n0(s.lb)}` : ''}`).join(', ')}</td>`
        + `<td class="rx-load">${top?.lb ? `${n0(top.lb)} lb${up ? ' ▲' : ''}` : 'bw'}</td>`
        + `<td class="rx-note">${p?.loadLb && top?.lb && top.lb !== p.loadLb ? `planned ${n0(p.loadLb)} lb` : ''}</td>`
        + '</tr>';
    }).join('')
    + '</tbody></table>';
}

function needsNotes(ctx) {
  const cut = ymd(new Date(Date.now() - 8 * 86400000));
  return (ctx.data.sessions || []).filter((s) => (
    s.date >= cut && s.date <= ctx.data.today && !ctx.data.feedback?.[s.id]
    && ['run', 'bike', 'swim', 'lift', 'strength'].includes(sportKey(s.sport))
  ));
}

function scoreStrip(ctx) {
  const f = ctx.fitness;
  if (!f) return '<div class="scores loading"></div>';
  const a = f.assessment;
  return '<div class="scores">'
    + scoreMeter(f.endurance?.score, {
      label: 'Endurance',
      color: 'var(--bike)',
      caption: f.endurance ? `chronic load ${n0(f.endurance.inputs.chronic28)} vs your peak ${n0(f.endurance.inputs.peakChronic28)}` : '',
    })
    + scoreMeter(f.speed?.score, {
      label: 'Speed',
      color: 'var(--run)',
      caption: f.speed ? `${Math.round((f.speed.inputs.qualityShare || 0) * 100)}% of time above easy` : '',
    })
    + scoreMeter(a?.confidence, {
      label: 'Goal confidence',
      color: 'var(--swim)',
      caption: a ? `${a.evidenceQuality} evidence, ${shortDate(a.asOf)}` : 'not assessed',
    })
    + '</div>';
}

// --- the week rail ---------------------------------------------------------

function volumes(ctx, weekKey) {
  const dates = new Set(weekDates(weekKey));
  const out = {};
  for (const s of ctx.data.sessions || []) {
    if (!dates.has(s.date)) continue;
    const key = sportKey(s.sport);
    const info = SPORTS[key];
    const add = info.metric === 'sessions' ? 1
      : info.metric === 'duration' ? (s.movingMin || 0)
        : key === 'swim' ? (s.yards || 0) : (s.miles || 0);
    out[key] = (out[key] || 0) + add;
  }
  return out;
}

function targetFor(ctx, weekKey) {
  const wk = ctx.data.weeks?.[weekKey];
  if (wk?.volumes) return wk.volumes;
  const t = ctx.data.plan?.weekTargets?.find((x) => x.week === weekKey);
  return t?.volumes || (t?.runMiles != null ? { run: t.runMiles } : null);
}

function volTiles(ctx, weekKey) {
  const actual = volumes(ctx, weekKey);
  const target = targetFor(ctx, weekKey) || {};
  return ENDURANCE_SPORTS.concat(['lift'])
    .filter((s) => actual[s] || target[s])
    .map((s) => {
      const a = actual[s] || 0;
      const t = target[s] || 0;
      const pct = t ? Math.min(100, (a / t) * 100) : 0;
      return '<div class="voltile">'
        + `<div class="vt-top"><b>${formatVolume(s, a)}</b>${t ? `<span>/ ${formatVolume(s, t)}</span>` : ''}</div>`
        + `<div class="vt-track"><div class="vt-fill" style="width:${pct.toFixed(0)}%;background:${SPORTS[s].color}"></div></div>`
        + `<span class="vt-label">${esc(SPORTS[s].label)}</span></div>`;
    }).join('');
}

function weekRail(ctx, weekKey, selected) {
  const wk = ctx.data.weeks?.[weekKey];
  const mon = mondayOf(weekKey);
  let rows = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(d.getDate() + i);
    const date = ymd(d);
    const planned = wk?.days?.[i]?.sessions || [];
    const acts = (ctx.data.sessions || []).filter((s) => s.date === date);
    const isToday = date === ctx.data.today;
    const past = date < ctx.data.today;
    const isSel = date === selected;

    const chip = (ps) => `<span class="pl ${esc(sportKey(ps.sport))}"><s></s>`
      + `${esc(ps.title || SPORTS[sportKey(ps.sport)]?.label)}${ps.optional ? ' <em>opt</em>' : ''}</span>`;

    const plan = editing
      ? `<div class="editrows">${planned.map((ps, si) => '<div class="editrow">'
        + chip(ps)
        + `<button class="link" data-move="${i}:${si}">Move</button>`
        + `<button class="link" data-editsession="${i}:${si}">Edit</button>`
        + '</div>').join('')
      }<div class="editrow add">`
        + `<button class="link" data-addsession="${i}">+ Add</button>`
        + (planned.length ? `<button class="link mutlink" data-clearday="${i}">Clear</button>` : '')
        + '</div></div>'
      : planned.length
        ? planned.map(chip).join('')
        : `<span class="pl"><em>${wk ? 'off' : '—'}</em></span>`;

    const done = acts.length
      ? acts.map((s) => {
        const key = sportKey(s.sport);
        const v = key === 'run' ? `${n1(s.miles)} mi ${mmss(s.paceSecPerMi)}`
          : key === 'bike' ? `${hm(s.movingMin)}${s.miles ? ` · ${n0(s.miles)} mi` : ''}`
            : key === 'swim' ? `${n0(s.yards || 0)} yd`
              : isStrength(key) && s.lifts?.length
                ? `${s.lifts.length} lifts · ${s.lifts.reduce((n, l) => n + l.sets.length, 0)} sets`
                : hm(s.movingMin);
        return `<span class="sport ${esc(key)}"><s></s>${esc(v)}</span>`;
      }).join('')
      : past ? '<span class="dash">nothing recorded</span>' : '';

    const dots = acts.map((s) => {
      const f = ctx.data.feedback?.[s.id];
      const title = f ? `rpe ${f.rpe || '?'}${f.pain ? `, pain ${f.pain}/10` : ''}` : 'no note yet';
      return `<span class="fbdot ${f ? (f.pain ? 'pain' : 'has') : ''}" title="${esc(title)}"></span>`;
    }).join('');

    rows += `<div class="day${isToday ? ' is-today' : ''}${past ? ' past' : ''}${isSel ? ' is-sel' : ''}${editing ? ' editing' : ''}"`
      + (editing ? '' : ` data-goday="${date}" role="button" tabindex="0"`
        + ` aria-label="${DOW[i]} ${MON[d.getMonth()]} ${d.getDate()}"`)
      + '>'
      + `<div class="day-name"><b>${DOW[i]}</b><span>${MON[d.getMonth()]} ${d.getDate()}</span></div>`
      + `<div class="day-plan">${plan}</div>`
      + `<div class="day-act">${done}</div>`
      + `<div class="day-fb">${dots}</div></div>`;
  }
  return rows;
}

// --- the day pane ----------------------------------------------------------

function dayPane(ctx, date) {
  const d = parseYmd(date);
  const wkKey = isoWeek(d);
  const wk = ctx.data.weeks?.[wkKey];
  const idx = daysBetween(ymd(mondayOf(wkKey)), date);
  const planned = wk?.days?.[idx]?.sessions || [];
  const actual = (ctx.data.sessions || []).filter((s) => s.date === date);
  const isFuture = date > ctx.data.today;

  let rows = '';
  for (const ps of planned) {
    const match = actual.filter((a) => sameSport(a.sport, ps.sport));
    const done = match.length > 0;
    const strength = isStrength(ps.sport);
    rows += `<div class="slot ${esc(sportKey(ps.sport))}"><div class="slot-rule"></div><div class="slot-main">`
      + `<div class="slot-sport">${esc(SPORTS[sportKey(ps.sport)]?.label || ps.sport)}`
      + `${ps.intensity ? ` · ${esc(ps.intensity)}` : ''}`
      + `${ps.programSession ? ` · session ${esc(ps.programSession)}` : ''}</div>`
      + `<div class="slot-title">${esc(ps.title || '—')}</div>`
      + (ps.detail ? `<p class="slot-detail">${esc(ps.detail)}</p>` : '')
      + (strength ? rxTable(ps.exercises) : '')
      + (done && !strength ? `<div class="slot-actual">${actualLine(match[0], ctx.data.feedback?.[match[0].id])}</div>` : '')
      + (done && strength ? doneTable(match[0], ps.exercises || []) : '')
      + '</div><div class="slot-side">'
      + `<span class="chip ${done ? 'done' : ps.optional ? 'opt' : ''}">`
      + `${done ? 'done' : ps.optional ? 'optional' : 'planned'}</span>`
      + (done
        ? strength
          ? `<button data-lift="${esc(match[0].id)}">Edit sets</button>`
          : `<button data-fb="${esc(match[0].id)}">${ctx.data.feedback?.[match[0].id] ? 'Edit note' : 'How did it feel?'}</button>`
        : isFuture ? ''
          : strength
            ? `<button class="solid" data-lift-new="${esc(ps.programSession || '')}" data-date="${date}" data-title="${esc(ps.title || '')}">Log the lift</button>`
            : `<button data-log="${esc(sportKey(ps.sport))}" data-date="${date}">Log it</button>`)
      + '</div></div>';
  }

  for (const a of actual) {
    if (planned.some((ps) => sameSport(a.sport, ps.sport))) continue;
    const strength = isStrength(a.sport);
    rows += `<div class="slot ${esc(sportKey(a.sport))}"><div class="slot-rule"></div><div class="slot-main">`
      + `<div class="slot-sport">${esc(SPORTS[sportKey(a.sport)]?.label || a.sport)} · not on the plan</div>`
      + `<div class="slot-title">${esc(a.name || SPORTS[sportKey(a.sport)]?.label || a.sport)}</div>`
      + (strength ? doneTable(a, prescriptionFor(ctx, a)) : `<div class="slot-actual">${actualLine(a, ctx.data.feedback?.[a.id])}</div>`)
      + '</div><div class="slot-side"><span class="chip done">extra</span>'
      + (strength
        ? `<button data-lift="${esc(a.id)}">Edit sets</button>`
        : `<button data-fb="${esc(a.id)}">${ctx.data.feedback?.[a.id] ? 'Edit note' : 'How did it feel?'}</button>`)
      + '</div></div>';
  }

  if (!rows) {
    rows = `<div class="rest">${!wk ? 'No plan for this week yet.' : 'Rest day.'}</div>`;
  }

  const rel = relLabel(ctx, date);
  const full = `${DOW[(d.getDay() + 6) % 7]}, ${MON[d.getMonth()]} ${d.getDate()}`;
  const nav = '<div class="daynav">'
    + '<button data-day="-1" aria-label="Previous day">&lsaquo;</button>'
    + `<span class="today-date">${rel}${rel === full ? '' : `<span>${full}</span>`}</span>`
    + '<button data-day="1" aria-label="Next day">&rsaquo;</button>'
    + (dayOffset !== 0 ? '<button data-day="0" class="today-reset">Today</button>' : '')
    + '</div>';

  const actions = [];
  if (!isFuture) actions.push(`<button id="logManual" data-date="${date}">Log a session</button>`);

  return `<section class="card today">${nav}<div class="slots">${rows}</div>`
    + (actions.length ? `<div class="btnrow day-actions">${actions.join('')}</div>` : '')
    + '</section>';
}

// --- the page --------------------------------------------------------------

export default {
  path: '/training',
  label: 'Training',

  render(ctx) {
    const date = viewDate(ctx);
    const weekKey = isoWeek(parseYmd(date));
    const wk = ctx.data.weeks?.[weekKey];
    const isThis = weekKey === ctx.data.week;
    const nf = needsNotes(ctx);

    const weekActions = [];
    if (wk) {
      weekActions.push(`<button id="toggleEdit"${editing ? ' class="solid"' : ''}>${editing ? 'Done' : 'Edit'}</button>`);
    }
    if (ctx.data.claude?.available) {
      weekActions.push(`<button class="${wk ? '' : 'solid'}" data-plan="${weekKey}">${wk ? 'Re-plan' : 'Plan this week'}</button>`);
      if (isThis) weekActions.push(`<button data-plan="${weekAdd(weekKey, 1)}">Plan next week</button>`);
    } else {
      weekActions.push(needsClaude(wk ? 'Re-plan' : 'Plan this week'));
    }
    if (nf.length) weekActions.unshift(`<button class="solid" id="notesNext">Add notes (${nf.length})</button>`);

    const tiles = volTiles(ctx, weekKey);

    return pageHead({
      eyebrow: 'Training',
      title: isThis ? 'This week' : weekKey,
      note: wk?.focus ? coachLine(wk.focus) : (wk?.deload ? 'Deload week' : ''),
      actions: '<div class="daynav">'
        + '<button data-week="-1" aria-label="Previous week">&lsaquo;</button>'
        + `<span class="wk-label">${esc(weekKey)}</span>`
        + '<button data-week="1" aria-label="Next week">&rsaquo;</button>'
        + (isThis ? '' : '<button data-week="0" class="today-reset">This week</button>')
        + '</div>',
    })
      + scoreStrip(ctx)
      + (tiles ? `<div class="voltiles">${tiles}</div>` : '')
      + '<div class="training">'
      + `<section class="card wk rail">${weekRail(ctx, weekKey, date)}</section>`
      + `<div class="pane">${dayPane(ctx, date)}</div>`
      + '</div>'
      + (wk?.coachNote
        ? coachBlock({ body: wk.coachNote, verdict: wk.verdict, list: wk.adjustments || [] })
        : '')
      + violationList(wk?.violations)
      + `<div class="btnrow" style="margin-top:18px">${weekActions.join('')}</div>`
      + '<div class="thinking" id="workStatus" hidden></div>';
  },

  mount(ctx, root) {
    if (!ctx.fitness && !window.__vlFitnessLoading) {
      window.__vlFitnessLoading = true;
      ctx.loadFitness().catch(() => {}).finally(() => { window.__vlFitnessLoading = false; });
    }

    root.addEventListener('click', async (e) => {
      const t = e.target;

      // --- day -------------------------------------------------------------
      const day = t.closest('[data-day]');
      if (day) {
        const n = Number(day.getAttribute('data-day'));
        dayOffset = n === 0 ? 0 : Math.max(-365, Math.min(365, dayOffset + n));
        ctx.rerender();
        return;
      }
      const goday = t.closest('[data-goday]');
      if (goday && !t.closest('button')) {
        setDay(ctx, goday.getAttribute('data-goday'));
        ctx.rerender();
        return;
      }

      // --- week ------------------------------------------------------------
      const wkBtn = t.closest('[data-week]');
      if (wkBtn) {
        const n = Number(wkBtn.getAttribute('data-week'));
        if (n === 0) dayOffset = 0;
        else dayOffset = Math.max(-365, Math.min(365, dayOffset + n * 7));
        ctx.rerender();
        return;
      }
      if (t.id === 'toggleEdit') { editing = !editing; ctx.rerender(); return; }

      const weekKey = isoWeek(parseYmd(viewDate(ctx)));
      const move = t.closest('[data-move]');
      if (move) {
        const [dayIndex, sessionIndex] = move.getAttribute('data-move').split(':').map(Number);
        openSessionMove(ctx, { weekKey, dayIndex, sessionIndex });
        return;
      }
      const edit = t.closest('[data-editsession]');
      if (edit) {
        const [dayIndex, sessionIndex] = edit.getAttribute('data-editsession').split(':').map(Number);
        openSessionEdit(ctx, { weekKey, dayIndex, sessionIndex });
        return;
      }
      const add = t.closest('[data-addsession]');
      if (add) {
        openSessionEdit(ctx, { weekKey, dayIndex: Number(add.getAttribute('data-addsession')) });
        return;
      }
      const clear = t.closest('[data-clearday]');
      if (clear) {
        await clearDay(ctx, weekKey, Number(clear.getAttribute('data-clearday')));
        return;
      }
      const planBtn = t.closest('[data-plan]');
      if (planBtn) {
        const week = planBtn.getAttribute('data-plan');
        const { work } = await import('../app.js');
        const out = await work(`Planning ${week}`, (signal) => (
          ctx.api('/api/coach/plan-week', { method: 'POST', body: { week }, signal })
        ));
        if (out && !out.error) {
          await ctx.refresh();
          ctx.toast(`${week} planned: ${out.week.verdict}.`);
        }
        return;
      }

      // --- sessions --------------------------------------------------------
      const lift = t.closest('[data-lift]');
      if (lift) {
        const session = ctx.data.sessions.find((s) => s.id === lift.getAttribute('data-lift'));
        if (session) openLiftLog(session, prescriptionFor(ctx, session), ctx, ctx.data.feedback?.[session.id] || {});
        return;
      }
      const liftNew = t.closest('[data-lift-new]');
      if (liftNew) {
        const date = liftNew.getAttribute('data-date');
        const title = liftNew.getAttribute('data-title') || 'Strength';
        try {
          const out = await ctx.api('/api/sessions', { method: 'POST', body: { sport: 'lift', date, name: title } });
          await ctx.refresh();
          const session = ctx.data.sessions.find((s) => s.id === out.session.id) || out.session;
          openLiftLog(session, prescriptionFor(ctx, session), ctx, {});
        } catch (err) {
          ctx.toast(err.message, true);
        }
        return;
      }
      const fb = t.closest('[data-fb]');
      if (fb) {
        const session = ctx.data.sessions.find((s) => s.id === fb.getAttribute('data-fb'));
        if (session) openFeedback(session, ctx);
        return;
      }
      const log = t.closest('[data-log]');
      if (log) {
        openManual(ctx, { date: log.getAttribute('data-date'), sport: log.getAttribute('data-log') });
        return;
      }
      if (t.id === 'logManual') {
        openManual(ctx, { date: t.getAttribute('data-date') });
        return;
      }
      if (t.id === 'notesNext') {
        const next = needsNotes(ctx)[0];
        if (!next) return;
        if (isStrength(next.sport)) openLiftLog(next, prescriptionFor(ctx, next), ctx, {});
        else openFeedback(next, ctx);
      }
    });

    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest?.('[data-goday]');
      if (!row) return;
      e.preventDefault();
      setDay(ctx, row.getAttribute('data-goday'));
      ctx.rerender();
    });
  },
};

/** Nudge the viewed day. Exported so the keyboard handler can reach it. */
export function nudgeDay(step) {
  dayOffset = Math.max(-365, Math.min(365, dayOffset + step));
}

/** Jump straight to a date. */
export function setDay(ctx, date) {
  dayOffset = Math.max(-365, Math.min(365, daysBetween(ctx.data.today, date)));
}
