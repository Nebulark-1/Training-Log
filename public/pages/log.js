// Log — everything, newest first.
import { openLiftLog } from '../components/liftlog.js';
import { openFeedback, openManual } from '../components/sessionlog.js';
import { prescriptionFor } from './training.js';
import { SPORTS, isStrength, sportKey } from '../lib/sports.js';
import { comma, esc, FEEL, hm, mmss, n0, n1, pageHead, shortDate } from '../lib/ui.js';

let filter = 'all';

export default {
  path: '/log',
  label: 'Log',

  render(ctx) {
    const all = ctx.data.sessions || [];
    const sessions = filter === 'all' ? all
      : filter === 'strength' ? all.filter((s) => isStrength(s.sport))
        : all.filter((s) => sportKey(s.sport) === filter);

    const present = [...new Set(all.map((s) => (isStrength(s.sport) ? 'strength' : sportKey(s.sport))))];
    const tabs = ['all', ...present]
      .map((k) => `<button class="tab${k === filter ? ' on' : ''}" data-filter="${k}">`
        + `${k === 'all' ? 'Everything' : esc(SPORTS[k]?.label || k)}</button>`)
      .join('');

    const rows = sessions.slice(0, 120).map((s) => {
      const f = ctx.data.feedback?.[s.id] || {};
      const key = sportKey(s.sport);
      const strength = isStrength(key);
      const dist = key === 'swim' ? (s.yards ? `${comma(s.yards)} yd` : '—')
        : s.miles ? `${n1(s.miles)} mi` : '—';
      const pace = s.paceSecPerMi ? mmss(s.paceSecPerMi)
        : s.per100yd ? mmss(s.per100yd)
          : s.speedMph ? `${n1(s.speedMph)} mph` : '—';
      const detail = strength && s.lifts?.length
        ? `${s.lifts.length} lifts, ${s.lifts.reduce((n, l) => n + l.sets.length, 0)} sets`
        : '';
      return `<tr class="row" data-open="${esc(s.id)}" tabindex="0">`
        + `<td>${shortDate(s.date)}</td>`
        + `<td><span class="sport ${esc(key)}"><s></s>${esc(SPORTS[key]?.label || key)}</span></td>`
        + `<td class="name">${esc(s.name || '')}${detail ? `<span class="mut"> · ${esc(detail)}</span>` : ''}</td>`
        + `<td class="r">${strength ? '—' : dist}</td>`
        + `<td class="r">${hm(s.movingMin)}</td>`
        + `<td class="r">${strength ? '—' : pace}</td>`
        + `<td class="r">${s.hrAvg ? n0(s.hrAvg) : '—'}</td>`
        + `<td class="r">${s.elevFt ? comma(s.elevFt) : '—'}</td>`
        + `<td class="r">${f.rpe || '—'}</td>`
        + `<td>${f.feel ? esc(FEEL[f.feel] || f.feel) : '—'}`
        + `${f.pain ? ` <span class="chip pain">pain ${f.pain}</span>` : ''}</td>`
        + '</tr>';
    }).join('');

    return pageHead({
      eyebrow: `${all.length} sessions in the window`,
      title: 'Log',
      actions: '<button id="logManual">Log a session</button>',
    })
      + `<div class="tabs spread">${tabs}</div>`
      + (sessions.length
        ? '<div class="tablewrap log"><table><thead><tr>'
          + '<th>Date</th><th>Sport</th><th>What</th><th class="r">Dist</th><th class="r">Time</th>'
          + '<th class="r">Pace</th><th class="r">HR</th><th class="r">Elev</th>'
          + '<th class="r">RPE</th><th>Feel</th>'
          + `</tr></thead><tbody>${rows}</tbody></table></div>`
        : '<div class="emptystate"><p>Nothing here yet. '
          + (ctx.data.connections?.strava?.connected
            ? 'Sync Strava, or log a session by hand.'
            : '<a href="/settings" data-link>Connect Strava</a>, or log a session by hand.')
          + '</p></div>');
  },

  mount(ctx, root) {
    // A row is a record: opening it reads, and editing is a deliberate step.
    const openRow = (id) => {
      const session = ctx.data.sessions.find((s) => s.id === id);
      if (!session) return;
      const fb = ctx.data.feedback?.[session.id] || {};
      if (isStrength(session.sport)) {
        openLiftLog(session, prescriptionFor(ctx, session), ctx, fb, { readOnly: Boolean(session.lifts?.length) });
      } else {
        openFeedback(session, ctx, { readOnly: Boolean(fb.loggedAt) });
      }
    };
    root.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-filter]');
      if (tab) { filter = tab.getAttribute('data-filter'); ctx.rerender(); return; }
      if (e.target.id === 'logManual') { openManual(ctx, {}); return; }
      const open = e.target.closest('[data-open]');
      if (open) openRow(open.getAttribute('data-open'));
    });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest?.('[data-open]');
      if (!row) return;
      e.preventDefault();
      openRow(row.getAttribute('data-open'));
    });
  },
};
