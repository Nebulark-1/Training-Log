// Strength — the core program, what it has produced, and what wants in.
//
// The program is the point of this page. It is meant to look stable: the same
// movements, session after session, with the load creeping up. Changes are
// deliberate and visible, which is why the change log sits right on the page.
import { sparkline } from '../components/charts.js';
import { openMovementSheet } from '../components/programedit.js';
import { PATTERNS, e1rm } from '../lib/movements.js';
import {
  coachBlock, esc, n0, n1, needsClaude, pageHead, shortDate, signed, toast, violationList,
} from '../lib/ui.js';

const roleChip = (role) => (role === 'trial'
  ? '<span class="chip trial">trial</span>'
  : '<span class="chip core">core</span>');

function movementRow(m, history, progress, sessionId) {
  const records = history[m.exId] || [];
  const last = records[0];
  const trend = progress.find((p) => p.exId === m.exId);
  const points = trend?.points?.map((p) => ({ x: p.date, y: p.e1rm })) || [];

  return '<tr>'
    + `<td class="m-name"><b>${esc(m.name)}</b>`
    + `<span class="m-meta">${esc(m.pattern)} ${roleChip(m.role)}</span>`
    + (m.note ? `<span class="m-cue">${esc(m.note)}</span>` : '')
    + '</td>'
    + `<td class="m-rx">${esc(m.sets)}&thinsp;&times;&thinsp;${esc(m.reps)}</td>`
    + `<td class="m-load">${m.loadLb ? `${n0(m.loadLb)} lb`
      : m.basis === 'bodyweight' ? '<span class="mut">bodyweight</span>' : '<span class="mut">calibrate</span>'}</td>`
    + `<td class="m-last">${last
      ? `${shortDate(last.date)}<span>${last.sets.map((s) => `${s.reps}${s.lb ? `×${n0(s.lb)}` : ''}`).join(', ')}</span>`
      : '<span class="mut">never logged</span>'}</td>`
    + `<td class="m-trend">${trend && points.length > 1
      ? `${sparkline(points)}<span>${signed(trend.changeLb)} lb</span>`
      : trend ? `<span class="mut">e1RM ${trend.latest.e1rm}</span>` : ''}</td>`
    + '<td class="m-act">'
    + `<button class="link" data-swap="${esc(sessionId)}:${esc(m.exId)}">Swap</button>`
    + `<button class="link" data-editmove="${esc(sessionId)}:${esc(m.exId)}">Edit</button>`
    + '</td>'
    + '</tr>';
}

function sessionCard(session, history, progress, prescription) {
  const rx = new Map((prescription?.exercises || []).map((e) => [e.exId, e]));
  return `<section class="progsession">`
    + '<header class="ps-head">'
    + `<div><span class="ps-id">${esc(session.id)}</span>`
    + `<h3>${esc(session.name)}</h3>`
    + `<p>${esc(session.focus || '')}${session.dayHint ? ` &middot; usually ${esc(session.dayHint)}` : ''}</p></div>`
    + `<span class="ps-count">${(session.movements || []).length} movements</span>`
    + '</header>'
    + '<div class="tablewrap"><table class="movements"><thead><tr>'
    + '<th>Movement</th><th>Sets</th><th>Next load</th><th>Last logged</th><th>Estimated 1RM</th><th></th>'
    + '</tr></thead><tbody>'
    + (session.movements || []).map((m) => movementRow(
      { ...m, loadLb: rx.get(m.exId)?.loadLb ?? m.loadLb, basis: rx.get(m.exId)?.basis },
      history,
      progress,
      session.id,
    )).join('')
    + '</tbody></table></div>'
    + `<div class="ps-foot"><button class="link" data-addmove="${esc(session.id)}">+ Add a movement</button>`
    + `<span class="mut">${(session.movements || []).length} of 6</span></div>`
    + '</section>';
}

function offProgramBlock(off) {
  if (!off?.length) return '';
  return '<section class="card offprog">'
    + '<h3>Logged off program</h3>'
    + '<div class="tablewrap"><table><thead><tr><th>Movement</th><th>Pattern</th>'
    + '<th class="r">Sessions</th><th>Seen</th><th class="r">Best</th></tr></thead><tbody>'
    + off.map((m) => '<tr>'
      + `<td class="name">${esc(m.name)}${m.previouslyRetired ? ' <span class="chip miss">was retired</span>' : ''}</td>`
      + `<td>${esc(m.pattern)}</td>`
      + `<td class="r">${m.timesLogged}</td>`
      + `<td>${shortDate(m.firstSeen)} – ${shortDate(m.lastSeen)}</td>`
      + `<td class="r">${m.best ? `${m.best.reps}&times;${n0(m.best.lb)} lb` : '—'}</td>`
      + '</tr>').join('')
    + '</tbody></table></div></section>';
}

function coverage(program) {
  const have = new Set();
  for (const s of program.sessions || []) for (const m of s.movements || []) have.add(m.pattern);
  return '<div class="coverage">'
    + Object.entries(PATTERNS).map(([key, meta]) => {
      const ok = have.has(key);
      return `<span class="cov ${ok ? 'on' : meta.required ? 'missing' : 'off'}" title="${esc(meta.note)}">`
        + `${esc(meta.label)}${meta.required && !ok ? ' — missing' : ''}</span>`;
    }).join('')
    + '</div>';
}

function changeLog(program) {
  const log = [...(program.changeLog || [])].reverse().slice(0, 8);
  if (!log.length) return '';
  return '<details class="changelog"><summary>Program history '
    + `(v${program.version}, ${log.length} recent change${log.length === 1 ? '' : 's'})</summary><ol>`
    + log.map((c) => `<li><span>${esc(String(c.at).slice(0, 10))}</span> <b>${esc(c.by)}</b> `
      + `${esc(c.summary)}${c.reason ? ` — <em>${esc(c.reason)}</em>` : ''}</li>`).join('')
    + '</ol></details>';
}

export default {
  path: '/strength',
  label: 'Strength',

  render(ctx) {
    const program = ctx.data.program;
    if (!program?.sessions?.length) {
      return pageHead({ eyebrow: 'Strength', title: 'Program' })
        + '<div class="emptystate"><p>No program yet.</p></div>';
    }

    const state = window.__vlStrength || {};
    const history = state.history || {};
    const progress = state.progress || [];
    const prescriptions = state.prescriptions || [];
    const off = state.offProgram || [];

    const total = (program.sessions || []).reduce((n, s) => n + (s.movements || []).length, 0);
    const trials = (program.sessions || []).flatMap((s) => s.movements || []).filter((m) => m.role === 'trial');

    return pageHead({
      eyebrow: 'Program',
      title: 'Strength',
      actions: ctx.data.claude?.available
        ? '<button class="solid" id="reviewProgram">Review the program</button>'
        : needsClaude('Review the program'),
    })
      + (program.philosophy ? coachBlock({ body: program.philosophy }) : '')
      + '<div class="stats tight">'
      + `<div class="stat"><b>${total}</b><span>movements</span></div>`
      + `<div class="stat"><b>${program.sessions.length}</b><span>sessions a week</span></div>`
      + `<div class="stat"><b>${trials.length}</b><span>on trial</span></div>`
      + `<div class="stat"><b>${progress.length}</b><span>logged</span></div>`
      + '</div>'
      + coverage(program)
      + '<div class="thinking" id="workStatus" hidden></div>'
      + `<div id="programViolations">${window.__vlProgramNotes
        ? violationList(window.__vlProgramNotes, { title: 'On the last change' }) : ''}</div>`
      + program.sessions.map((s) => sessionCard(
        s,
        history,
        progress,
        prescriptions.find((p) => p?.programSession === s.id),
      )).join('')
      + offProgramBlock(off)
      + (program.retired?.length
        ? '<section class="card retired"><h3>Retired</h3><ul>'
          + program.retired.map((r) => `<li><b>${esc(r.name)}</b> — ${esc(r.reason || 'no reason recorded')}`
            + `${r.removedAt ? ` <span class="mut">${esc(String(r.removedAt).slice(0, 10))}</span>` : ''}</li>`).join('')
          + '</ul></section>'
        : '')
      + changeLog(program);
  },

  async mount(ctx, root) {
    // The heavy per-movement history is its own request; fetch once and cache.
    if (!window.__vlStrength) {
      try {
        const out = await ctx.api('/api/program');
        const history = {};
        for (const p of out.progress || []) history[p.exId] = p.points.slice().reverse().map((pt) => ({
          date: pt.date,
          sets: [{ reps: pt.reps, lb: pt.top }],
        }));
        window.__vlStrength = {
          history,
          progress: out.progress || [],
          prescriptions: out.prescriptions || [],
          offProgram: out.offProgram || [],
        };
        ctx.rerender();
      } catch (err) {
        console.error('program', err);
      }
    }

    root.addEventListener('click', async (e) => {
      const swap = e.target.closest('[data-swap]');
      if (swap) {
        const [sessionId, exId] = swap.getAttribute('data-swap').split(':');
        openMovementSheet(ctx, { sessionId, exId, mode: 'swap' });
        return;
      }
      const editMove = e.target.closest('[data-editmove]');
      if (editMove) {
        const [sessionId, exId] = editMove.getAttribute('data-editmove').split(':');
        openMovementSheet(ctx, { sessionId, exId, mode: 'edit' });
        return;
      }
      const addMove = e.target.closest('[data-addmove]');
      if (addMove) {
        openMovementSheet(ctx, { sessionId: addMove.getAttribute('data-addmove'), mode: 'add' });
        return;
      }

      if (e.target.id !== 'reviewProgram') return;
      const { work } = await import('../app.js');
      const out = await work('Reviewing the program', (signal) => (
        ctx.api('/api/coach/program-review', { method: 'POST', signal })
      ), { kind: 'program-review' });
      if (!out) return;
      if (out.error) {
        const payload = out.error.payload;
        if (payload?.violations) {
          document.getElementById('programViolations').innerHTML = violationList(payload.violations, {
            title: 'The proposed program was refused',
          });
        }
        return;
      }
      window.__vlStrength = null;
      await ctx.refresh();
      const decided = (out.decisions || []).filter((d) => d.decision !== 'leave-out');
      toast(`Program is now v${out.program.version}`
        + (decided.length ? `, ${decided.length} off-program verdict${decided.length === 1 ? '' : 's'}.` : '.'));
    });
  },
};

export { e1rm, n1 };
