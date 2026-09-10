// Per-set lift logging.
//
// Lifting is reps and weight, so the log is reps and weight: one row per set,
// prefilled from the prescription, and you correct what actually happened.
// That is what makes estimated 1RM, progression and honest history possible —
// a single "3x5 @ 225" row cannot tell you the third set only got three.
import { mountBodyMap } from './bodymap.js';
import { CATALOG, bestSet, e1rm, guessPattern, movementId } from '../lib/movements.js';
import { closeSheet, esc, longDate, n0, openSheet, toast } from '../lib/ui.js';

const blankSet = () => ({ reps: '', lb: '', rpe: '' });

/** Rows to start from: what was logged before, else the prescription. */
function seedRows(session, prescription) {
  if (session.lifts?.length) {
    return session.lifts.map((l) => ({
      exId: l.exId || movementId(l.ex),
      ex: l.ex,
      pattern: guessPattern(l.ex),
      sets: (l.sets || []).map((s) => ({
        reps: s.reps ?? '', lb: s.lb ?? '', rpe: s.rpe ?? '',
      })),
      prescribed: prescription.find((p) => (p.exId || movementId(p.ex)) === (l.exId || movementId(l.ex))) || null,
    }));
  }
  return prescription.map((p) => ({
    exId: p.exId || movementId(p.ex),
    ex: p.ex,
    pattern: p.pattern || guessPattern(p.ex),
    sets: Array.from({ length: Math.max(1, Number(p.sets) || 3) }, () => ({
      reps: parseInt(String(p.reps || ''), 10) || '',
      lb: p.loadLb || '',
      rpe: '',
    })),
    prescribed: p,
  }));
}

function setRow(row, i, s) {
  return `<tr data-set="${i}">`
    + `<td class="sn">${i + 1}</td>`
    + `<td><input type="number" inputmode="numeric" data-f="reps" value="${esc(s.reps)}" aria-label="Set ${i + 1} reps"></td>`
    + `<td><input type="number" inputmode="decimal" step="2.5" data-f="lb" value="${esc(s.lb)}" aria-label="Set ${i + 1} weight"></td>`
    + `<td><input type="number" inputmode="numeric" min="1" max="10" data-f="rpe" value="${esc(s.rpe)}" aria-label="Set ${i + 1} RPE"></td>`
    + `<td class="sx"><button type="button" class="icon" data-drop-set="${i}" aria-label="Remove set ${i + 1}" title="Remove set">&times;</button></td>`
    + '</tr>';
}

function exerciseBlock(row, idx) {
  const p = row.prescribed;
  const done = row.sets
    .map((s) => ({ reps: Number(s.reps) || 0, lb: Number(s.lb) || 0 }))
    .filter((s) => s.reps || s.lb);
  const best = bestSet(done);
  const volume = done.reduce((n, s) => n + s.reps * s.lb, 0);

  return `<section class="lx" data-ex="${idx}">`
    + '<header class="lx-head">'
    + `<div><h4>${esc(row.ex)}</h4>`
    + (p
      ? `<p class="lx-rx">plan: ${esc(p.sets ?? '?')}&times;${esc(p.reps ?? '?')}`
        + `${p.loadLb ? ` @ ${n0(p.loadLb)} lb`
          : p.basis === 'bodyweight' ? ' @ bodyweight' : ' @ work up to a weight'}`
        + `${p.basis === 'progress' ? ' <span class="up">progressed</span>' : ''}`
        + `${p.note ? `<span class="lx-cue">${esc(p.note)}</span>` : ''}</p>`
      : `<p class="lx-rx"><span class="off">off program</span> ${esc(row.pattern)}</p>`)
    + '</div>'
    + `<button type="button" class="icon" data-drop-ex="${idx}" aria-label="Remove ${esc(row.ex)}" title="Remove exercise">&times;</button>`
    + '</header>'
    + '<table class="setgrid"><thead><tr>'
    + '<th class="sn">set</th><th>reps</th><th>lb</th><th>rpe</th><th></th>'
    + '</tr></thead><tbody>'
    + row.sets.map((s, i) => setRow(row, i, s)).join('')
    + '</tbody></table>'
    + '<div class="lx-foot">'
    + `<button type="button" data-add-set="${idx}">Add set</button>`
    + `<button type="button" data-repeat-set="${idx}">Repeat last</button>`
    + '<span class="lx-sum">'
    + (best ? `best ${best.reps}&times;${n0(best.lb)} &middot; e1RM ${best.e1rm} lb` : 'no sets yet')
    + (volume ? ` &middot; ${n0(volume).toLocaleString?.() || n0(volume)} lb moved` : '')
    + '</span></div></section>';
}

/**
 * Open the lift log for a session.
 * @param session      the activity document being logged
 * @param prescription resolved exercises from the strength program
 * @param ctx          { api, refresh }
 */
export function openLiftLog(session, prescription, ctx, existingFeedback = {}) {
  const rows = seedRows(session, prescription || []);
  const fb = { ...existingFeedback };

  const datalist = `<datalist id="movementList">${CATALOG
    .map((m) => `<option value="${esc(m.name)}">${esc(m.pattern)}</option>`).join('')}</datalist>`;

  const body = () => rows.map(exerciseBlock).join('')
    + '<section class="lx addex">'
    + '<label for="newEx">Add a lift you did</label>'
    + '<div class="filerow">'
    + '<input type="text" id="newEx" list="movementList" placeholder="Farmer’s carry" autocomplete="off">'
    + '<button type="button" id="addEx">Add</button>'
    + '</div>'
    + '<p class="help" style="margin:8px 0 0">Anything you add is logged as off-program. '
    + 'The coach sees it at the next program review and decides whether it earns a permanent place, '
    + 'a trial run, or stays a one-off.</p>'
    + '</section>';

  const inner = openSheet(
    `<div class="sheet-head"><div><h3>${esc(session.name || 'Strength')}</h3>`
    + `<p>${longDate(session.date)}${session.movingMin ? ` &middot; ${n0(session.movingMin)} min` : ''}`
    + `${prescription?.length ? ` &middot; program session ${esc(prescription[0]?.programSession || '')}` : ''}</p></div>`
    + '<button type="button" data-close="1">Close</button></div>'
    + datalist
    + `<div id="lxBody">${body()}</div>`
    + '<div class="lx-fb">'
    + '<div class="field"><label for="lfPain">Any pain? 0-10</label>'
    + `<input type="number" id="lfPain" min="0" max="10" value="${esc(fb.pain ?? '')}" placeholder="0"></div>`
    + '<div class="field" style="grid-column:1/-1"><div class="painmap" id="liftPainMap" hidden></div></div>'
    + '<div class="field" style="grid-column:1/-1"><label for="lfNotes">Notes for the coach</label>'
    + `<textarea id="lfNotes" placeholder="What felt strong, what felt off, anything you changed.">${esc(fb.notes || '')}</textarea></div>`
    + '</div>'
    + '<div class="btnrow"><button class="solid" id="lxSave">Save session</button>'
    + '<button type="button" data-close="1">Cancel</button>'
    + '<span class="thinking" id="lxStatus"></span></div>',
    (root) => {
      const bodyEl = root.querySelector('#lxBody');

      // Same rule as the endurance sheet: no pain, no map.
      const mapSlot = root.querySelector('#liftPainMap');
      let bodyMap = null;
      const syncMap = () => {
        const hurts = Number(root.querySelector('#lfPain').value) > 0;
        mapSlot.hidden = !hurts;
        if (hurts && !bodyMap) {
          bodyMap = mountBodyMap(mapSlot, { site: fb.site || null, history: ctx.painHistory || [] });
        }
      };
      syncMap();
      root.querySelector('#lfPain').addEventListener('input', syncMap);

      // Pull every input back into state before any structural re-render.
      const sync = () => {
        for (const section of bodyEl.querySelectorAll('[data-ex]')) {
          const row = rows[Number(section.getAttribute('data-ex'))];
          if (!row) continue;
          for (const tr of section.querySelectorAll('[data-set]')) {
            const s = row.sets[Number(tr.getAttribute('data-set'))];
            if (!s) continue;
            for (const f of ['reps', 'lb', 'rpe']) {
              const input = tr.querySelector(`[data-f="${f}"]`);
              if (input) s[f] = input.value;
            }
          }
        }
      };
      const redraw = () => { sync(); bodyEl.innerHTML = body(); };

      bodyEl.addEventListener('click', (e) => {
        const add = e.target.closest('[data-add-set]');
        if (add) {
          const row = rows[Number(add.getAttribute('data-add-set'))];
          sync();
          row.sets.push(blankSet());
          bodyEl.innerHTML = body();
          return;
        }
        const rep = e.target.closest('[data-repeat-set]');
        if (rep) {
          const row = rows[Number(rep.getAttribute('data-repeat-set'))];
          sync();
          const last = row.sets[row.sets.length - 1];
          row.sets.push(last ? { ...last, rpe: '' } : blankSet());
          bodyEl.innerHTML = body();
          return;
        }
        const dropSet = e.target.closest('[data-drop-set]');
        if (dropSet) {
          const row = rows[Number(dropSet.closest('[data-ex]').getAttribute('data-ex'))];
          sync();
          row.sets.splice(Number(dropSet.getAttribute('data-drop-set')), 1);
          if (!row.sets.length) row.sets.push(blankSet());
          bodyEl.innerHTML = body();
          return;
        }
        const dropEx = e.target.closest('[data-drop-ex]');
        if (dropEx) {
          sync();
          rows.splice(Number(dropEx.getAttribute('data-drop-ex')), 1);
          bodyEl.innerHTML = body();
        }
      });

      // Live summary as numbers are typed.
      bodyEl.addEventListener('input', (e) => {
        if (!e.target.matches('[data-f]')) return;
        const section = e.target.closest('[data-ex]');
        const row = rows[Number(section.getAttribute('data-ex'))];
        sync();
        const done = row.sets.map((s) => ({ reps: Number(s.reps) || 0, lb: Number(s.lb) || 0 }))
          .filter((s) => s.reps || s.lb);
        const best = bestSet(done);
        const volume = done.reduce((n, s) => n + s.reps * s.lb, 0);
        const sum = section.querySelector('.lx-sum');
        if (sum) {
          sum.innerHTML = (best ? `best ${best.reps}&times;${n0(best.lb)} &middot; e1RM ${best.e1rm} lb` : 'no sets yet')
            + (volume ? ` &middot; ${Math.round(volume).toLocaleString('en-US')} lb moved` : '');
        }
      });

      const addExercise = () => {
        const input = root.querySelector('#newEx');
        const name = input.value.trim();
        if (!name) return;
        sync();
        rows.push({
          exId: movementId(name),
          ex: name,
          pattern: guessPattern(name),
          sets: [blankSet()],
          prescribed: null,
        });
        input.value = '';
        bodyEl.innerHTML = body();
        bodyEl.querySelector('[data-ex]:last-of-type [data-f="reps"]')?.focus();
      };
      root.addEventListener('click', (e) => {
        if (e.target.id === 'addEx') addExercise();
        if (e.target.id === 'lxSave') save();
      });
      root.addEventListener('keydown', (e) => {
        if (e.target.id === 'newEx' && e.key === 'Enter') { e.preventDefault(); addExercise(); }
      });

      async function save() {
        sync();
        const status = root.querySelector('#lxStatus');
        status.className = 'thinking';
        status.textContent = 'Saving…';
        const lifts = rows.map((row) => ({
          exId: row.exId,
          ex: row.ex,
          sets: row.sets
            .map((s) => ({ reps: Number(s.reps) || 0, lb: Number(s.lb) || 0, rpe: Number(s.rpe) || null }))
            .filter((s) => s.reps > 0 || s.lb > 0),
        })).filter((row) => row.sets.length);

        const rpes = lifts.flatMap((l) => l.sets.map((s) => s.rpe)).filter(Boolean);
        try {
          await ctx.api(`/api/sessions/${encodeURIComponent(session.id)}`, { method: 'PATCH', body: { lifts } });
          const pain = Number(root.querySelector('#lfPain').value);
          const notes = root.querySelector('#lfNotes').value.trim();
          const site = pain > 0 ? bodyMap?.get() ?? null : null;
          if (rpes.length || notes || site || Number.isFinite(pain)) {
            await ctx.api(`/api/feedback/${encodeURIComponent(session.id)}`, {
              method: 'PUT',
              body: {
                rpe: rpes.length ? Math.max(...rpes) : fb.rpe ?? null,
                feel: fb.feel ?? null,
                pain: Number.isFinite(pain) ? pain : null,
                site,
                notes,
              },
            });
          }
          closeSheet();
          await ctx.refresh();
          const total = lifts.reduce((n, l) => n + l.sets.length, 0);
          toast(`Logged ${lifts.length} lift${lifts.length === 1 ? '' : 's'}, ${total} sets.`);
        } catch (err) {
          status.className = 'thinking err';
          status.textContent = err.message;
        }
      }
    },
  );
  return inner;
}

export { e1rm };
