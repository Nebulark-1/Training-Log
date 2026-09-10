// Sheets for endurance sessions: the post-session note, and logging something
// Strava did not record.
import { mountBodyMap } from './bodymap.js';
import { SPORTS, sportKey } from '../lib/sports.js';
import {
  closeSheet, comma, esc, FEEL, hm, longDate, mmss, n0, n1, openSheet, toast,
} from '../lib/ui.js';

/** The measured facts of a session, as a compact strip. */
export function actualLine(session, feedback) {
  const s = session;
  const bits = [];
  if (s.miles) bits.push(`<i>dist</i>${n1(s.miles)} mi`);
  if (s.yards) bits.push(`<i>swim</i>${comma(s.yards)} yd`);
  if (s.movingMin) bits.push(`<i>time</i>${hm(s.movingMin)}`);
  if (s.paceSecPerMi) bits.push(`<i>pace</i>${mmss(s.paceSecPerMi)}/mi`);
  if (s.per100yd) bits.push(`<i>pace</i>${mmss(s.per100yd)}/100y`);
  if (s.speedMph) bits.push(`<i>speed</i>${n1(s.speedMph)} mph`);
  if (s.hrAvg) bits.push(`<i>hr</i>${n0(s.hrAvg)}${s.hrMax ? ` / ${n0(s.hrMax)}` : ''}`);
  if (s.elevFt) bits.push(`<i>elev</i>${comma(s.elevFt)} ft`);
  if (s.avgWatts) bits.push(`<i>watts</i>${n0(s.avgWatts)}`);
  if (feedback) {
    if (feedback.rpe) bits.push(`<i>rpe</i>${feedback.rpe}`);
    if (feedback.feel) bits.push(`<i>felt</i>${FEEL[feedback.feel] || feedback.feel}`);
    if (feedback.pain) bits.push(`<i>pain</i>${feedback.pain}/10`);
  }
  return bits.join('');
}

function scaleRow(key, label, from, to, val, note, labels) {
  let out = `<div class="field"><label>${esc(label)}</label><div class="scale" data-scale="${key}">`;
  for (let i = from; i <= to; i++) {
    out += `<button type="button" data-val="${i}" aria-pressed="${val === i}">${labels ? labels[i] : i}</button>`;
  }
  return `${out}</div>${note ? `<div class="scalenote">${esc(note)}</div>` : ''}</div>`;
}

/** Per-mile splits or laps, whichever the session has. */
function splitTable(s) {
  if (s.splits?.length > 1) {
    const paces = s.splits.map((x) => x.paceSecPerMi).filter(Boolean);
    const fastest = Math.min(...paces);
    const slowest = Math.max(...paces);
    return '<div class="splits"><div class="hd"><span>mi</span><span>pace</span><span></span><span>hr</span><span>elev</span></div>'
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
  }
  if (s.laps?.length > 1) {
    return '<div class="splits"><div class="hd"><span>lap</span><span>dist</span><span>pace</span><span>hr</span><span>time</span></div>'
      + s.laps.map((lp) => `<div><span>${esc(lp.n)}</span><span>${lp.miles ? `${n1(lp.miles)} mi` : ''}</span>`
        + `<span>${mmss(lp.paceSecPerMi)}</span><span>${lp.hrAvg ? n0(lp.hrAvg) : ''}</span>`
        + `<span>${hm(lp.minutes)}</span></div>`).join('') + '</div>';
  }
  return '';
}

/** The post-session note for an endurance session. */
export function openFeedback(session, ctx) {
  const f = ctx.data.feedback?.[session.id] || {};
  openSheet(
    `<div class="sheet-head"><div><h3>${esc(session.name || SPORTS[sportKey(session.sport)]?.label || session.sport)}</h3>`
    + `<p>${longDate(session.date)} &middot; ${esc(SPORTS[sportKey(session.sport)]?.label || session.sport)}`
    + `${session.source === 'manual' ? ' &middot; logged by hand' : ''}</p></div>`
    + '<button type="button" data-close="1">Close</button></div>'
    + (actualLine(session, null) ? `<div class="slot-actual" style="border-top:0;padding-top:0">${actualLine(session, null)}</div>` : '')
    + splitTable(session)
    + '<div style="height:16px"></div>'
    + scaleRow('rpe', 'Effort (RPE)', 1, 10, f.rpe, '1 walking, 5 steady, 7 working, 10 all out')
    + scaleRow('feel', 'How the body felt', 1, 5, f.feel, '', FEEL)
    + scaleRow('pain', 'Pain', 0, 10, f.pain, 'Above 3 means holding volume, not adding.')
    + '<div class="painmap" id="painMap" hidden></div>'
    + '<div class="field"><label for="fbNotes">Notes for the coach</label>'
    + `<textarea id="fbNotes" placeholder="Terrain, sleep, fuel, how it changed through the session.">${esc(f.notes || '')}</textarea></div>`
    + '<div class="btnrow"><button class="solid" id="fbSave">Save note</button>'
    + '<button type="button" data-close="1">Cancel</button>'
    + '<span class="thinking" id="fbStatus"></span></div>',
    (root) => {
      const chosen = { rpe: f.rpe ?? null, feel: f.feel ?? null, pain: f.pain ?? null };
      // The body map only earns its space when something actually hurts.
      const mapSlot = root.querySelector('#painMap');
      let bodyMap = null;
      const syncMap = () => {
        const hurts = (chosen.pain ?? 0) > 0;
        mapSlot.hidden = !hurts;
        if (hurts && !bodyMap) {
          bodyMap = mountBodyMap(mapSlot, { site: f.site || null, history: ctx.painHistory || [] });
        }
      };
      syncMap();

      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-val]');
        if (b) {
          const wrap = b.closest('[data-scale]');
          const key = wrap.getAttribute('data-scale');
          const v = Number(b.getAttribute('data-val'));
          chosen[key] = chosen[key] === v ? null : v;
          wrap.querySelectorAll('button').forEach((x) => {
            x.setAttribute('aria-pressed', String(Number(x.getAttribute('data-val')) === chosen[key]));
          });
          if (key === 'pain') syncMap();
          return;
        }
        if (e.target.id !== 'fbSave') return;
        const status = root.querySelector('#fbStatus');
        status.className = 'thinking';
        status.textContent = 'Saving…';
        try {
          await ctx.api(`/api/feedback/${encodeURIComponent(session.id)}`, {
            method: 'PUT',
            body: {
              ...chosen,
              site: chosen.pain > 0 ? bodyMap?.get() ?? null : null,
              notes: root.querySelector('#fbNotes').value,
            },
          });
          closeSheet();
          await ctx.refresh();
          toast('Note saved.');
        } catch (err) {
          status.className = 'thinking err';
          status.textContent = err.message;
        }
      });
    },
  );
}

/** Log a session Strava did not record. */
export function openManual(ctx, { date, sport = 'run' } = {}) {
  const day = date || ctx.data.today;
  openSheet(
    '<div class="sheet-head"><div><h3>Log a session</h3>'
    + "<p>For anything Strava didn't record</p></div>"
    + '<button type="button" data-close="1">Close</button></div>'
    + '<div class="field"><label for="mSport">Sport</label><select id="mSport">'
    + ['run', 'bike', 'swim', 'lift', 'mobility', 'cross', 'walk', 'hike', 'other']
      .map((k) => `<option value="${k}"${k === sport ? ' selected' : ''}>${SPORTS[sportKey(k)]?.label || k}</option>`).join('')
    + '</select></div>'
    + `<div class="field"><label for="mDate">Date</label><input type="date" id="mDate" value="${day}"></div>`
    + '<div class="field"><label for="mName">What was it</label>'
    + '<input type="text" id="mName" placeholder="Easy 6 with strides"></div>'
    + '<div class="grid2" style="gap:14px">'
    + '<div class="field"><label for="mDist">Distance (miles, or yards for a swim)</label>'
    + '<input type="number" id="mDist" step="0.01"></div>'
    + '<div class="field"><label for="mMin">Moving time (minutes)</label>'
    + '<input type="number" id="mMin" step="1"></div>'
    + '<div class="field"><label for="mElev">Elevation (ft)</label><input type="number" id="mElev" step="1"></div>'
    + '<div class="field"><label for="mHr">Average HR</label><input type="number" id="mHr" step="1"></div>'
    + '</div>'
    + '<p class="help">Logging a lift here creates the session; open it afterwards to record sets, '
    + 'reps and weight.</p>'
    + '<div class="btnrow"><button class="solid" id="mSave">Save session</button>'
    + '<button type="button" data-close="1">Cancel</button>'
    + '<span class="thinking" id="mStatus"></span></div>',
    (root) => {
      root.querySelector('#mSave').addEventListener('click', async () => {
        const status = root.querySelector('#mStatus');
        status.className = 'thinking';
        status.textContent = 'Saving…';
        try {
          await ctx.api('/api/sessions', {
            method: 'POST',
            body: {
              sport: root.querySelector('#mSport').value,
              date: root.querySelector('#mDate').value,
              name: root.querySelector('#mName').value,
              dist: root.querySelector('#mDist').value,
              minutes: root.querySelector('#mMin').value,
              elevFt: root.querySelector('#mElev').value,
              hrAvg: root.querySelector('#mHr').value,
            },
          });
          closeSheet();
          await ctx.refresh();
          toast('Session logged.');
        } catch (err) {
          status.className = 'thinking err';
          status.textContent = err.message;
        }
      });
    },
  );
}
