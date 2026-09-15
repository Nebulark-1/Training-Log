// Editing the strength program: swap a movement, change its sets and reps,
// add one, retire one.
//
// Unlike moving a swim to another day, this is a coaching decision, and the
// guardrails treat it as one. Dropping a core movement asks for a reason and
// the caps still apply — the point of a core program is that it does not churn.
import { CATALOG, PATTERNS, findMovement, guessPattern, movementId } from '../lib/movements.js';
import { closeSheet, esc, openSheet, toast, violationList } from '../lib/ui.js';

const clone = (program) => JSON.parse(JSON.stringify(program));

function catalogOptions(selectedId, preferredPattern) {
  const byPattern = new Map();
  for (const m of CATALOG) {
    if (!byPattern.has(m.pattern)) byPattern.set(m.pattern, []);
    byPattern.get(m.pattern).push(m);
  }
  // The same pattern first, so a swap preserves what the program covers.
  const order = [preferredPattern, ...[...byPattern.keys()].filter((p) => p !== preferredPattern)]
    .filter((p) => byPattern.has(p));
  return order.map((pattern) => `<optgroup label="${esc(PATTERNS[pattern]?.label || pattern)}${
    pattern === preferredPattern ? ' — same pattern' : ''}">`
    + byPattern.get(pattern).map((m) => `<option value="${m.id}"${m.id === selectedId ? ' selected' : ''}>`
      + `${esc(m.name)}</option>`).join('')
    + '</optgroup>').join('');
}

/** Push the changed program and report what the guardrails said. */
async function commit(ctx, program, reason, root) {
  const status = root.querySelector('#pmStatus');
  status.className = 'thinking';
  status.textContent = 'Saving…';
  try {
    const out = await ctx.api('/api/program', { method: 'PUT', body: { program, reason } });
    const warnings = out.violations || [];
    // The page re-renders into a fresh container, so the notes are handed over
    // as state rather than written into a node that is about to be replaced.
    window.__vlProgramNotes = warnings.length ? warnings : null;
    window.__vlStrength = null;
    closeSheet();
    await ctx.refresh();
    toast(warnings.length
      ? `Program is now v${out.program.version}. ${warnings.length} note${warnings.length === 1 ? '' : 's'} on the change.`
      : `Program is now v${out.program.version}.`);
    return true;
  } catch (err) {
    const blocked = err.payload?.violations;
    if (blocked?.length) {
      root.querySelector('#pmViolations').innerHTML = violationList(blocked, { title: 'Refused' });
      status.textContent = '';
    } else {
      status.className = 'thinking err';
      status.textContent = err.message;
    }
    return false;
  }
}

/**
 * @param mode 'swap' | 'edit' | 'add'
 */
export function openMovementSheet(ctx, { sessionId, exId = null, mode = 'edit' }) {
  const program = ctx.data.program;
  const session = (program.sessions || []).find((s) => s.id === sessionId);
  if (!session) return;
  const index = exId ? session.movements.findIndex((m) => m.exId === exId) : -1;
  const current = index >= 0 ? session.movements[index] : null;
  const pattern = current?.pattern || 'hinge';

  const title = mode === 'swap' ? `Swap out ${current.name}`
    : mode === 'add' ? `Add a movement to ${session.name}`
      : `Edit ${current.name}`;

  const needsReason = mode === 'swap' || (mode === 'edit' && current?.role === 'core');

  const picker = mode === 'edit' ? '' : '<div class="field"><label for="pmPick">'
    + `${mode === 'swap' ? 'Replace it with' : 'Movement'}</label>`
    + `<select id="pmPick">${catalogOptions(null, pattern)}</select>`
    + '</div>'
    + '<div class="field"><label for="pmCustom">Or something not on the list</label>'
    + '<input type="text" id="pmCustom" placeholder="Leave blank to use the choice above"></div>';

  openSheet(
    `<div class="sheet-head"><div><h3>${esc(title)}</h3>`
    + `<p>session ${esc(session.id)} — ${esc(session.name)}</p></div>`
    + '<button type="button" data-close="1">Close</button></div>'
    + '<div id="pmViolations"></div>'
    + picker
    + '<div class="grid2" style="gap:14px">'
    + `<div class="field"><label for="pmSets">Sets</label>`
    + `<input type="number" id="pmSets" min="1" max="10" value="${esc(current?.sets ?? 3)}"></div>`
    + `<div class="field"><label for="pmReps">Reps</label>`
    + `<input type="text" id="pmReps" value="${esc(current?.reps ?? '')}" placeholder="5, 8 each, 45 sec"></div>`
    + '</div>'
    + `<div class="field"><label for="pmNote">Cue</label>`
    + `<input type="text" id="pmNote" value="${esc(current?.note || '')}" placeholder="What it is for, or how to do it"></div>`
    + '<div class="field"><label>Role</label><div class="scale" data-scale="role">'
    + `<button type="button" data-val="core" aria-pressed="${(current?.role || 'core') === 'core'}">Core — a permanent fixture</button>`
    + `<button type="button" data-val="trial" aria-pressed="${current?.role === 'trial'}">Trial — judge it later</button>`
    + '</div></div>'
    + `<div class="field" id="pmTrialWrap"${current?.role === 'trial' ? '' : ' hidden'}>`
    + '<label for="pmWeeks">Judge it after how many weeks</label>'
    + '<input type="number" id="pmWeeks" min="2" max="16" value="6"></div>'
    + (needsReason
      ? '<div class="field"><label for="pmReason">Why</label>'
        + '<textarea id="pmReason"></textarea></div>'
      : '<div class="field"><label for="pmReason">Note (optional)</label>'
        + '<input type="text" id="pmReason"></div>')
    + '<div class="btnrow"><button class="solid" id="pmSave">'
    + `${mode === 'swap' ? 'Swap it' : mode === 'add' ? 'Add it' : 'Save'}</button>`
    + '<button type="button" data-close="1">Cancel</button>'
    + (mode === 'edit' && current
      ? '<button id="pmRetire" class="danger">Retire this movement</button>'
      : '')
    + '<span class="thinking" id="pmStatus"></span></div>',
    (root) => {
      let role = current?.role || 'core';
      root.addEventListener('click', async (e) => {
        const roleBtn = e.target.closest('[data-scale="role"] [data-val]');
        if (roleBtn) {
          role = roleBtn.getAttribute('data-val');
          root.querySelectorAll('[data-scale="role"] button').forEach((b) => {
            b.setAttribute('aria-pressed', String(b.getAttribute('data-val') === role));
          });
          root.querySelector('#pmTrialWrap').hidden = role !== 'trial';
          return;
        }
        if (e.target.id !== 'pmSave' && e.target.id !== 'pmRetire') return;

        const reason = (root.querySelector('#pmReason')?.value || '').trim();
        const retiring = e.target.id === 'pmRetire';
        if ((retiring || mode === 'swap') && !reason) {
          const status = root.querySelector('#pmStatus');
          status.className = 'thinking err';
          status.textContent = 'Give a reason — a core movement leaving the program needs one on the record.';
          return;
        }

        const next = clone(program);
        const target = next.sessions.find((s) => s.id === sessionId);
        next.retired = [];

        if (retiring || mode === 'swap') {
          next.retired.push({ exId: current.exId, name: current.name, reason });
        }

        if (retiring) {
          target.movements.splice(index, 1);
        } else if (mode === 'edit') {
          Object.assign(target.movements[index], {
            sets: Number(root.querySelector('#pmSets').value) || 3,
            reps: root.querySelector('#pmReps').value.trim() || '8',
            note: root.querySelector('#pmNote').value.trim(),
            role,
            reviewWeeks: role === 'trial' ? Number(root.querySelector('#pmWeeks').value) || 6 : 0,
          });
        } else {
          const custom = (root.querySelector('#pmCustom')?.value || '').trim();
          const pickedId = custom ? movementId(custom) : root.querySelector('#pmPick').value;
          const known = findMovement(pickedId);
          const movement = {
            exId: pickedId,
            name: custom || known?.name || pickedId,
            pattern: known?.pattern || guessPattern(custom || pickedId),
            role,
            sets: Number(root.querySelector('#pmSets').value) || 3,
            reps: root.querySelector('#pmReps').value.trim() || known?.defaultReps || '8',
            note: root.querySelector('#pmNote').value.trim(),
            reviewWeeks: role === 'trial' ? Number(root.querySelector('#pmWeeks').value) || 6 : 0,
          };
          if (mode === 'swap') target.movements.splice(index, 1, movement);
          else target.movements.push(movement);
        }

        await commit(ctx, next, reason || `${mode} on session ${sessionId}`, root);
      });
    },
  );
}
