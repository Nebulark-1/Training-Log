// Editing a planned week: move a session to another day, swap two sessions,
// change one, add one, remove one.
//
// Moving training around your own week is a scheduling decision, not a
// coaching one, so none of this is gated. The guardrails still run on the
// result and their warnings come back — a rearrangement that quietly becomes a
// 40% jump should still say so.
import { SPORTS, isStrength, sportKey } from '../lib/sports.js';
import { DOW, MON, parseYmd, weekDates } from '../lib/dates.js';
import { closeSheet, esc, openSheet, toast, violationList } from '../lib/ui.js';

const EDITABLE_SPORTS = ['run', 'bike', 'swim', 'lift', 'mobility', 'cross', 'walk', 'hike'];
const INTENSITIES = ['easy', 'steady', 'long', 'tempo', 'intervals', 'hills', 'recovery', 'technique', 'heavy'];

/** A deep-enough copy of the week's days to edit without touching state. */
function cloneDays(week) {
  return (week.days || []).map((d) => ({ ...d, sessions: (d.sessions || []).map((s) => ({ ...s })) }));
}

/** Send the edited days and report whatever the guardrails made of it. */
async function commit(ctx, weekKey, days, note) {
  const out = await ctx.api(`/api/weeks/${encodeURIComponent(weekKey)}`, {
    method: 'PATCH',
    body: { days, note },
  });
  await ctx.refresh();
  const warnings = (out.violations || []).filter((v) => v.severity !== 'block');
  toast(warnings.length
    ? `Saved. ${warnings.length} thing${warnings.length === 1 ? '' : 's'} worth knowing — see the week.`
    : 'Saved.');
  return out;
}

/** Titles repeat across sports ("45 min" is both a swim and a ride), so the
 *  sport is named too wherever an edit is described. */
const label = (s) => {
  const sport = SPORTS[sportKey(s.sport)]?.label || s.sport;
  return s.title ? `${sport} — ${s.title}` : sport;
};

function dayName(date) {
  const d = parseYmd(date);
  return `${DOW[(d.getDay() + 6) % 7]} ${MON[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Move a session to another day, or trade places with one already there.
 * The swap list is the direct answer to "the swim is on Friday and I can only
 * swim on Thursday".
 */
export function openSessionMove(ctx, { weekKey, dayIndex, sessionIndex }) {
  const week = ctx.data.weeks?.[weekKey];
  if (!week) return;
  const days = cloneDays(week);
  const moving = days[dayIndex].sessions[sessionIndex];
  const dates = weekDates(weekKey);

  const swaps = [];
  days.forEach((day, di) => {
    if (di === dayIndex) return;
    day.sessions.forEach((s, si) => {
      swaps.push({ di, si, text: `${dayName(dates[di])} — ${label(s)}` });
    });
  });

  openSheet(
    `<div class="sheet-head"><div><h3>Move ${esc(label(moving))}</h3>`
    + `<p>currently ${dayName(dates[dayIndex])}</p></div>`
    + '<button type="button" data-close="1">Close</button></div>'
    + '<div class="field"><label>Move it to</label><div class="movegrid">'
    + dates.map((date, di) => `<button type="button" data-to="${di}"${di === dayIndex ? ' disabled' : ''}>`
      + `${DOW[di]}<span>${days[di].sessions.length
        ? `${days[di].sessions.length} session${days[di].sessions.length === 1 ? '' : 's'}` : 'free'}</span></button>`).join('')
    + '</div></div>'
    + (swaps.length
      ? '<div class="field"><label>Or trade places with</label><div class="swaplist">'
        + swaps.map((s) => `<button type="button" class="swapbtn" data-swap="${s.di}:${s.si}">${esc(s.text)}</button>`).join('')
        + '</div></div>'
      : '')
    + '<div class="thinking" id="moveStatus"></div>',
    (root) => {
      root.addEventListener('click', async (e) => {
        const to = e.target.closest('[data-to]');
        const swap = e.target.closest('[data-swap]');
        if (!to && !swap) return;
        const status = root.querySelector('#moveStatus');
        status.className = 'thinking';
        status.textContent = 'Saving…';
        try {
          let note;
          if (to) {
            const di = Number(to.getAttribute('data-to'));
            days[dayIndex].sessions.splice(sessionIndex, 1);
            days[di].sessions.push(moving);
            note = `moved ${label(moving)} to ${DOW[di]}`;
          } else {
            const [di, si] = swap.getAttribute('data-swap').split(':').map(Number);
            const other = days[di].sessions[si];
            days[di].sessions[si] = moving;
            days[dayIndex].sessions[sessionIndex] = other;
            note = `swapped ${label(moving)} and ${label(other)}`;
          }
          await commit(ctx, weekKey, days, note);
          closeSheet();
        } catch (err) {
          status.className = 'thinking err';
          status.textContent = err.message;
        }
      });
    },
  );
}

/** Add a session to a day, or change one that is already there. */
export function openSessionEdit(ctx, { weekKey, dayIndex, sessionIndex = null }) {
  const week = ctx.data.weeks?.[weekKey];
  if (!week) return;
  const days = cloneDays(week);
  const dates = weekDates(weekKey);
  const existing = sessionIndex == null ? null : days[dayIndex].sessions[sessionIndex];
  const s = existing || { sport: 'run', title: '', intensity: 'easy', optional: false };
  const program = ctx.data.program;

  openSheet(
    `<div class="sheet-head"><div><h3>${existing ? 'Edit session' : 'Add a session'}</h3>`
    + `<p>${dayName(dates[dayIndex])}</p></div>`
    + '<button type="button" data-close="1">Close</button></div>'
    + '<div class="grid2" style="gap:14px">'
    + '<div class="field"><label for="seSport">Sport</label><select id="seSport">'
    + EDITABLE_SPORTS.map((k) => `<option value="${k}"${sportKey(s.sport) === k ? ' selected' : ''}>`
      + `${esc(SPORTS[sportKey(k)]?.label || k)}</option>`).join('')
    + '</select></div>'
    + '<div class="field"><label for="seIntensity">Intensity</label><select id="seIntensity">'
    + INTENSITIES.map((k) => `<option value="${k}"${s.intensity === k ? ' selected' : ''}>${k}</option>`).join('')
    + '</select></div>'
    + '</div>'
    + `<div class="field"><label for="seTitle">Prescription</label>`
    + `<input type="text" id="seTitle" value="${esc(s.title || '')}" placeholder="8 mi easy"></div>`
    + '<div class="grid2" style="gap:14px">'
    + `<div class="field"><label for="seMiles">Miles (yards for a swim)</label>`
    + `<input type="number" id="seMiles" step="0.1" value="${esc(s.yards || s.miles || '')}"></div>`
    + `<div class="field"><label for="seMinutes">Minutes</label>`
    + `<input type="number" id="seMinutes" step="1" value="${esc(s.minutes || '')}"></div>`
    + '</div>'
    + '<div class="field" id="seProgramWrap"' + (isStrength(s.sport) ? '' : ' hidden') + '>'
    + '<label for="seProgram">Strength session</label><select id="seProgram">'
    + (program?.sessions || []).map((ps) => `<option value="${esc(ps.id)}"${s.programSession === ps.id ? ' selected' : ''}>`
      + `${esc(ps.id)} — ${esc(ps.name)}</option>`).join('')
    + '</select></div>'
    + `<div class="field"><label for="seDetail">Instruction</label>`
    + `<textarea id="seDetail">${esc(s.detail || '')}</textarea></div>`
    + `<label class="check"><input type="checkbox" id="seOptional"${s.optional ? ' checked' : ''}> Optional — drop it if the week gets tight</label>`
    + '<div class="btnrow"><button class="solid" id="seSave">Save</button>'
    + '<button type="button" data-close="1">Cancel</button>'
    + (existing ? '<button id="seRemove" class="danger">Remove from the week</button>' : '')
    + '<span class="thinking" id="seStatus"></span></div>',
    (root) => {
      const sportSel = root.querySelector('#seSport');
      sportSel.addEventListener('change', () => {
        root.querySelector('#seProgramWrap').hidden = !isStrength(sportSel.value);
      });

      root.addEventListener('click', async (e) => {
        if (e.target.id !== 'seSave' && e.target.id !== 'seRemove') return;
        const status = root.querySelector('#seStatus');
        status.className = 'thinking';
        status.textContent = 'Saving…';
        try {
          let note;
          if (e.target.id === 'seRemove') {
            note = `removed ${label(existing)} from ${DOW[dayIndex]}`;
            days[dayIndex].sessions.splice(sessionIndex, 1);
          } else {
            const sport = sportSel.value;
            const amount = Number(root.querySelector('#seMiles').value) || null;
            const next = {
              sport,
              title: root.querySelector('#seTitle').value.trim(),
              minutes: Number(root.querySelector('#seMinutes').value) || null,
              intensity: root.querySelector('#seIntensity').value,
              detail: root.querySelector('#seDetail').value.trim(),
              optional: root.querySelector('#seOptional').checked,
            };
            if (sport === 'swim') next.yards = amount;
            else next.miles = amount;
            if (isStrength(sport)) next.programSession = root.querySelector('#seProgram').value;
            if (existing) days[dayIndex].sessions[sessionIndex] = next;
            else days[dayIndex].sessions.push(next);
            note = `${existing ? 'edited' : 'added'} ${next.title || sport} on ${DOW[dayIndex]}`;
          }
          await commit(ctx, weekKey, days, note);
          closeSheet();
        } catch (err) {
          status.className = 'thinking err';
          status.textContent = err.message;
        }
      });
    },
  );
}

/** Clear a whole day. */
export async function clearDay(ctx, weekKey, dayIndex) {
  const week = ctx.data.weeks?.[weekKey];
  if (!week) return;
  const days = cloneDays(week);
  days[dayIndex].sessions = [];
  await commit(ctx, weekKey, days, `cleared ${DOW[dayIndex]}`);
}

export { violationList };
