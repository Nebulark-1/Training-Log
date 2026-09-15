// This week — the seven days, against what was planned.
import { setDay } from './today.js';
import { clearDay, openSessionEdit, openSessionMove } from '../components/planedit.js';
import { SPORTS, ENDURANCE_SPORTS, formatVolume, isStrength, sportKey } from '../lib/sports.js';
import { DOW, MON, isoWeek, mondayOf, weekAdd, weekDates, ymd } from '../lib/dates.js';
import {
  coachBlock, coachLine, esc, hm, mmss, n0, n1, needsClaude, pageHead, violationList,
} from '../lib/ui.js';

let weekOffset = 0;
let editing = false;
const activeWeek = (ctx) => weekAdd(ctx.data.week, weekOffset);

function volumes(ctx, weekKey) {
  const dates = new Set(weekDates(weekKey));
  const out = {};
  let strength = 0;
  for (const s of ctx.data.sessions || []) {
    if (!dates.has(s.date)) continue;
    const key = sportKey(s.sport);
    const info = SPORTS[key];
    const add = info.metric === 'sessions' ? 1
      : info.metric === 'duration' ? (s.movingMin || 0)
        : key === 'swim' ? (s.yards || 0) : (s.miles || 0);
    out[key] = (out[key] || 0) + add;
    if (isStrength(key)) strength += 1;
  }
  return { out, strength };
}

function targetFor(ctx, weekKey) {
  const wk = ctx.data.weeks?.[weekKey];
  if (wk?.volumes) return wk.volumes;
  const t = ctx.data.plan?.weekTargets?.find((x) => x.week === weekKey);
  return t?.volumes || (t?.runMiles != null ? { run: t.runMiles } : null);
}

export default {
  path: '/week',
  label: 'Week',

  render(ctx) {
    const weekKey = activeWeek(ctx);
    const wk = ctx.data.weeks?.[weekKey];
    const mon = mondayOf(weekKey);
    const { out: actual } = volumes(ctx, weekKey);
    const target = targetFor(ctx, weekKey) || {};
    const isThis = weekKey === ctx.data.week;

    const tiles = ENDURANCE_SPORTS.concat(['lift'])
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

    let days = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(d.getDate() + i);
      const date = ymd(d);
      const planned = wk?.days?.[i]?.sessions || [];
      const acts = (ctx.data.sessions || []).filter((s) => s.date === date);
      const isToday = date === ctx.data.today;
      const past = date < ctx.data.today;

      const chip = (ps) => `<span class="pl ${esc(sportKey(ps.sport))}"><s></s>`
        + `${esc(ps.title || SPORTS[sportKey(ps.sport)]?.label)}${ps.optional ? ' <em>opt</em>' : ''}</span>`;

      const plan = editing
        ? `<div class="editrows">${planned.map((ps, si) => '<div class="editrow">'
          + chip(ps)
          + `<button class="link" data-move="${i}:${si}">Move</button>`
          + `<button class="link" data-editsession="${i}:${si}">Edit</button>`
          + '</div>').join('')
          }<div class="editrow add">`
          + `<button class="link" data-addsession="${i}">+ Add a session</button>`
          + (planned.length ? `<button class="link mutlink" data-clearday="${i}">Clear the day</button>` : '')
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
        const title = f
          ? `rpe ${f.rpe || '?'}${f.pain ? `, pain ${f.pain}/10` : ''}`
          : 'no note yet';
        return `<span class="fbdot ${f ? (f.pain ? 'pain' : 'has') : ''}" title="${esc(title)}"></span>`;
      }).join('');

      days += `<div class="day${isToday ? ' is-today' : ''}${past ? ' past' : ''}${editing ? ' editing' : ''}"`
        + (editing ? '' : ` data-goday="${date}" role="button" tabindex="0"`
          + ` aria-label="Open ${DOW[i]} ${MON[d.getMonth()]} ${d.getDate()}"`)
        + '>'
        + `<div class="day-name"><b>${DOW[i]}</b><span>${MON[d.getMonth()]} ${d.getDate()}</span></div>`
        + `<div class="day-plan">${plan}</div>`
        + `<div class="day-act">${done}</div>`
        + `<div class="day-fb">${dots}</div></div>`;
    }

    const actions = [];
    if (wk) {
      actions.push(`<button id="toggleEdit"${editing ? ' class="solid"' : ''}>`
        + `${editing ? 'Done editing' : 'Edit week'}</button>`);
    }
    if (ctx.data.claude?.available) {
      actions.push(`<button class="${wk ? '' : 'solid'}" data-plan="${weekKey}">${wk ? 'Re-plan this week' : `Plan ${weekKey}`}</button>`);
      if (isThis) actions.push(`<button data-plan="${weekAdd(weekKey, 1)}">Plan next week</button>`);
    } else {
      actions.push(needsClaude(wk ? 'Re-plan this week' : `Plan ${weekKey}`));
    }

    return pageHead({
      eyebrow: isThis ? 'This week' : weekOffset > 0 ? 'Ahead' : 'Behind',
      title: weekKey,
      note: wk?.focus ? coachLine(wk.focus) : (wk?.deload ? 'Deload week' : ''),
      actions: '<div class="daynav">'
        + '<button data-week="-1" aria-label="Previous week">&lsaquo;</button>'
        + `<span class="wk-label">${esc(weekKey)}</span>`
        + '<button data-week="1" aria-label="Next week">&rsaquo;</button>'
        + (weekOffset !== 0 ? '<button data-week="0" class="today-reset">This week</button>' : '')
        + '</div>',
    })
      + (tiles ? `<div class="voltiles">${tiles}</div>` : '')
      + `<section class="card wk">${days}</section>`
      + (wk?.coachNote
        ? coachBlock({ body: wk.coachNote, verdict: wk.verdict, list: wk.adjustments || [] })
        : '')
      + violationList(wk?.violations)
      + `<div class="btnrow" style="margin-top:18px">${actions.join('')}</div>`
      + '<div class="thinking" id="workStatus" hidden></div>';
  },

  mount(ctx, root) {
    const openDay = (date) => {
      setDay(ctx, date);
      ctx.go('/today');
    };
    root.addEventListener('click', async (e) => {
      if (e.target.id === 'toggleEdit') { editing = !editing; ctx.rerender(); return; }

      const move = e.target.closest('[data-move]');
      if (move) {
        const [dayIndex, sessionIndex] = move.getAttribute('data-move').split(':').map(Number);
        openSessionMove(ctx, { weekKey: activeWeek(ctx), dayIndex, sessionIndex });
        return;
      }
      const edit = e.target.closest('[data-editsession]');
      if (edit) {
        const [dayIndex, sessionIndex] = edit.getAttribute('data-editsession').split(':').map(Number);
        openSessionEdit(ctx, { weekKey: activeWeek(ctx), dayIndex, sessionIndex });
        return;
      }
      const add = e.target.closest('[data-addsession]');
      if (add) {
        openSessionEdit(ctx, { weekKey: activeWeek(ctx), dayIndex: Number(add.getAttribute('data-addsession')) });
        return;
      }
      const clear = e.target.closest('[data-clearday]');
      if (clear) {
        await clearDay(ctx, activeWeek(ctx), Number(clear.getAttribute('data-clearday')));
        return;
      }

      const wkBtn = e.target.closest('[data-week]');
      if (wkBtn) {
        const n = Number(wkBtn.getAttribute('data-week'));
        weekOffset = n === 0 ? 0 : Math.max(-52, Math.min(52, weekOffset + n));
        ctx.rerender();
        return;
      }
      const goday = e.target.closest('[data-goday]');
      if (goday && !e.target.closest('button')) { openDay(goday.getAttribute('data-goday')); return; }

      const planBtn = e.target.closest('[data-plan]');
      if (planBtn) {
        const week = planBtn.getAttribute('data-plan');
        const { work } = await import('../app.js');
        const out = await work(`Planning ${week}`, (signal) => (
          ctx.api('/api/coach/plan-week', { method: 'POST', body: { week }, signal })
        ));
        if (out && !out.error) {
          await ctx.refresh();
          ctx.toast(`${week} planned — ${out.week.verdict}.`);
        }
      }
    });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest?.('[data-goday]');
      if (!row) return;
      e.preventDefault();
      openDay(row.getAttribute('data-goday'));
    });
  },
};

export { isoWeek };
