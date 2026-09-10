// Today — the day you are in, and the days either side of it.
import { openLiftLog } from '../components/liftlog.js';
import { actualLine, openFeedback, openManual } from '../components/sessionlog.js';
import { scoreMeter } from '../components/charts.js';
import { SPORTS, isStrength, sportKey } from '../lib/sports.js';
import {
  DOW, MON, daysBetween, isoWeek, mondayOf, parseYmd, ymd,
} from '../lib/dates.js';
import {
  esc, n0, pageHead, shortDate, violationList,
} from '../lib/ui.js';

let dayOffset = 0;

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

/** The prescription table for a planned strength session. */
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

/** What was actually lifted, per set. */
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
  if (!f) {
    return '<div class="scores loading"><button id="loadFitness" class="link">Show endurance, speed and goal confidence</button></div>';
  }
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
      caption: a ? `${a.evidenceQuality} evidence, ${shortDate(a.asOf)}` : 'not assessed yet',
    })
    + (a?.headline ? `<p class="scores-note lead">${esc(a.headline)}</p>` : '')
    + '<p class="scores-note">Endurance and speed are computed from your log. Confidence is the '
    + "coach's judgement. <a href=\"/progress\" data-link>How these are built</a></p>"
    + '</div>';
}

export default {
  path: '/today',
  label: 'Today',

  render(ctx) {
    const date = viewDate(ctx);
    const d = parseYmd(date);
    const wkKey = isoWeek(d);
    const wk = ctx.data.weeks?.[wkKey];
    const idx = daysBetween(ymd(mondayOf(wkKey)), date);
    const planned = wk?.days?.[idx]?.sessions || [];
    const actual = (ctx.data.sessions || []).filter((s) => s.date === date);
    const isFuture = date > ctx.data.today;
    const nf = needsNotes(ctx);

    const nav = '<div class="daynav">'
      + '<button data-day="-1" aria-label="Previous day" title="Previous day (left arrow)">&lsaquo;</button>'
      + `<span class="today-date">${DOW[(d.getDay() + 6) % 7]}, ${MON[d.getMonth()]} ${d.getDate()}`
      + `<span>${esc(wkKey)}</span></span>`
      + '<button data-day="1" aria-label="Next day" title="Next day (right arrow)">&rsaquo;</button>'
      + (dayOffset !== 0 ? '<button data-day="0" class="today-reset">Back to today</button>' : '')
      + '</div>';

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
      rows = `<div class="rest">${
        !wk ? `No plan for ${esc(wkKey)} yet.`
          : isFuture ? 'Rest day. Nothing prescribed.'
            : "Rest day — nothing prescribed. Adaptation happens on the day you don't train."
      }</div>`;
    }

    const actions = [];
    if (nf.length) actions.push(`<button class="solid" id="notesNext">Add notes (${nf.length})</button>`);
    if (!isFuture) actions.push(`<button id="logManual" data-date="${date}">Log a session</button>`);
    if (!wk) actions.push(`<a href="/week" data-link><button>Plan ${esc(wkKey)}</button></a>`);

    return pageHead({
      eyebrow: relLabel(ctx, date) === 'Today' ? 'The day' : 'Looking ahead',
      title: relLabel(ctx, date),
      note: wk?.focus ? esc(wk.focus) : (nf.length ? `${nf.length} session${nf.length === 1 ? '' : 's'} still need a note` : ''),
      actions: '<span class="kbdhint">← → to change day</span>',
    })
      + scoreStrip(ctx)
      + `<section class="card today">${nav}<div class="slots">${rows}</div></section>`
      + (actions.length ? `<div class="btnrow" style="margin-top:16px">${actions.join('')}</div>` : '')
      + '<div class="thinking" id="workStatus" hidden></div>'
      + violationList(wk?.violations, { title: `Guardrails on ${wkKey}` });
  },

  mount(ctx, root) {
    root.addEventListener('click', async (e) => {
      const t = e.target;
      const day = t.closest('[data-day]');
      if (day) {
        const n = Number(day.getAttribute('data-day'));
        dayOffset = n === 0 ? 0 : Math.max(-120, Math.min(120, dayOffset + n));
        ctx.rerender();
        return;
      }
      const lift = t.closest('[data-lift]');
      if (lift) {
        const session = ctx.data.sessions.find((s) => s.id === lift.getAttribute('data-lift'));
        if (session) {
          openLiftLog(session, prescriptionFor(ctx, session), ctx, ctx.data.feedback?.[session.id] || {});
        }
        return;
      }
      const liftNew = t.closest('[data-lift-new]');
      if (liftNew) {
        // Create the session, then open the set grid against it.
        const date = liftNew.getAttribute('data-date');
        const title = liftNew.getAttribute('data-title') || 'Strength';
        try {
          const out = await ctx.api('/api/sessions', {
            method: 'POST',
            body: { sport: 'lift', date, name: title },
          });
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
        return;
      }
      if (t.id === 'loadFitness') {
        t.textContent = 'Working it out…';
        try { await ctx.loadFitness(); } catch (err) { ctx.toast(err.message, true); }
      }
    });
  },
};

/** Nudge the viewed day. Exported so the keyboard handler can reach it. */
export function nudgeDay(step) {
  dayOffset = Math.max(-120, Math.min(120, dayOffset + step));
}

/** Jump straight to a date, used by the week page. */
export function setDay(ctx, date) {
  dayOffset = Math.max(-120, Math.min(120, daysBetween(ctx.data.today, date)));
}
