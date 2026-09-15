// Settings — goals, connections, and the profile the coach plans against.
import { SPORTS, ENDURANCE_SPORTS, goalMetricsFor, sportKey } from '../lib/sports.js';
import { DOW } from '../lib/dates.js';
import { closeSheet, esc, hms, openSheet, pageHead, toast } from '../lib/ui.js';

const METRIC_LABEL = {
  weeklyDistance: 'per week',
  weeklyDuration: 'minutes per week',
  weeklySessions: 'sessions per week',
  raceTime: 'race time',
  longestSession: 'longest single session',
};

function goalRow(g) {
  const info = SPORTS[sportKey(g.sport)];
  const value = g.metric === 'raceTime'
    ? `${g.distanceMi || '?'} mi in ${hms(g.target)}`
    : `${g.target} ${g.metric === 'weeklyDistance' ? info.unit : ''} ${METRIC_LABEL[g.metric] || ''}`.replace(/\s+/g, ' ');
  return '<tr>'
    + `<td class="name"><b>${esc(g.label || value)}</b>`
    + `${g.primary ? ' <span class="chip done">primary</span>' : ''}`
    + (g.note ? `<span class="mut"> ${esc(g.note)}</span>` : '')
    + '</td>'
    + `<td>${esc(info.label)}</td>`
    + `<td>${esc(value)}</td>`
    + `<td>${g.byDate ? esc(g.byDate) : '<span class="mut">no date</span>'}</td>`
    + '<td class="r">'
    + (g.primary ? '' : `<button class="link" data-primary="${esc(g.id)}">make primary</button> `)
    + `<button class="link" data-edit-goal="${esc(g.id)}">edit</button> `
    + `<button class="link" data-del-goal="${esc(g.id)}">remove</button></td>`
    + '</tr>';
}

function goalSheet(ctx, existing) {
  const g = existing || { sport: 'run', metric: 'weeklyDistance', target: 75, primary: false };
  const metrics = goalMetricsFor(g.sport);
  openSheet(
    `<div class="sheet-head"><div><h3>${existing ? 'Edit goal' : 'New goal'}</h3></div>`
    + '<button type="button" data-close="1">Close</button></div>'
    + '<div class="grid2" style="gap:14px">'
    + '<div class="field"><label for="gSport">Sport</label><select id="gSport">'
    + ENDURANCE_SPORTS.map((s) => `<option value="${s}"${s === sportKey(g.sport) ? ' selected' : ''}>${esc(SPORTS[s].label)}</option>`).join('')
    + '</select></div>'
    + '<div class="field"><label for="gMetric">Kind</label><select id="gMetric">'
    + metrics.map((m) => `<option value="${m.id}"${m.id === g.metric ? ' selected' : ''}>${esc(m.label)}</option>`).join('')
    + '</select></div>'
    + '</div>'
    + '<div class="grid2" style="gap:14px">'
    + `<div class="field"><label for="gTarget">Target</label><input type="number" id="gTarget" step="0.1" value="${esc(g.metric === 'raceTime' ? '' : g.target ?? '')}"></div>`
    + `<div class="field"><label for="gDate">By when (optional)</label><input type="date" id="gDate" value="${esc(g.byDate || '')}"></div>`
    + '</div>'
    + '<div class="grid2" style="gap:14px" id="raceFields"' + (g.metric === 'raceTime' ? '' : ' hidden') + '>'
    + `<div class="field"><label for="gDist">Race distance (miles)</label><input type="number" id="gDist" step="0.01" value="${esc(g.distanceMi || '')}" placeholder="26.22"></div>`
    + `<div class="field"><label for="gTime">Target time (h:mm:ss)</label><input type="text" id="gTime" value="${esc(g.metric === 'raceTime' && g.target ? hms(g.target) : '')}" placeholder="3:15:00"></div>`
    + '</div>'
    + `<div class="field"><label for="gLabel">Name it (optional)</label><input type="text" id="gLabel" value="${esc(g.label || '')}" placeholder="75 mile weeks, sustained"></div>`
    + `<div class="field"><label for="gNote">Note for the coach</label><textarea id="gNote">${esc(g.note || '')}</textarea></div>`
    + `<label class="check"><input type="checkbox" id="gPrimary"${g.primary ? ' checked' : ''}> Primary goal</label>`
    + '<div class="btnrow"><button class="solid" id="gSave">Save goal</button>'
    + '<button type="button" data-close="1">Cancel</button>'
    + '<span class="thinking" id="gStatus"></span></div>',
    (root) => {
      const metric = root.querySelector('#gMetric');
      metric.addEventListener('change', () => {
        root.querySelector('#raceFields').hidden = metric.value !== 'raceTime';
      });
      root.querySelector('#gSport').addEventListener('change', (e) => {
        const opts = goalMetricsFor(e.target.value);
        metric.innerHTML = opts.map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join('');
        root.querySelector('#raceFields').hidden = metric.value !== 'raceTime';
      });
      root.querySelector('#gSave').addEventListener('click', async () => {
        const status = root.querySelector('#gStatus');
        status.className = 'thinking';
        status.textContent = 'Saving…';
        const kind = metric.value;
        let target = Number(root.querySelector('#gTarget').value) || 0;
        if (kind === 'raceTime') {
          const parts = String(root.querySelector('#gTime').value).split(':').map(Number);
          target = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] || 0;
        }
        try {
          await ctx.api(`/api/goals/${existing ? encodeURIComponent(existing.id) : 'new'}`, {
            method: 'PUT',
            body: {
              sport: root.querySelector('#gSport').value,
              metric: kind,
              target,
              distanceMi: root.querySelector('#gDist').value,
              byDate: root.querySelector('#gDate').value,
              label: root.querySelector('#gLabel').value,
              note: root.querySelector('#gNote').value,
              primary: root.querySelector('#gPrimary').checked,
            },
          });
          closeSheet();
          await ctx.refresh({ fitness: true });
          toast('Goal saved.');
        } catch (err) {
          status.className = 'thinking err';
          status.textContent = err.message;
        }
      });
    },
  );
}

const MODEL_NAME = { 'claude-opus-5': 'Opus', 'claude-sonnet-5': 'Sonnet' };

/** The plan this account is on, and how much of the month's coaching is used. */
function planCard(claude) {
  const p = claude.plan;
  if (!p) return '';
  const models = p.models.routine === p.models.key
    ? `${MODEL_NAME[p.models.key] || p.models.key} for everything`
    : `${MODEL_NAME[p.models.key] || p.models.key} for the goal and the program, `
      + `${MODEL_NAME[p.models.routine] || p.models.routine} for the week`;
  return '<div class="conn plan">'
    + `<h3><span class="dot ${claude.available ? 'on' : 'off'}"></span>${esc(p.label)}`
    + `${p.owner ? '<span class="chip done">owner</span>' : `<span class="mut">$${p.price}/mo</span>`}</h3>`
    + `<p class="mut">${esc(models)}.</p>`
    + (p.owner
      ? '<p class="mut">Coaching is not metered on this account.</p>'
      : '<div class="meter-line"><div class="wm-track"><div class="wm-fill" style="width:'
        + `${p.pct}%${p.pct >= 90 ? ';background:var(--flag)' : ''}"></div></div>`
        + `<span>${p.pct}% of this month's coaching used · resets ${esc(p.resets)}</span></div>`)
    + (claude.available ? '' : '<p class="mut">Coaching is not set up on this server yet.</p>')
    + '</div>';
}

export default {
  path: '/settings',
  label: 'Settings',

  render(ctx) {
    const strava = ctx.data.connections?.strava || {};
    const sync = ctx.data.sync;
    const claude = ctx.data.claude || {};
    const s = ctx.data.settings || {};
    const goals = ctx.data.goals || [];

    return pageHead({ eyebrow: 'Setup', title: 'Settings' })

      + '<section class="chartblock"><div class="cb-head"><h2>Goals</h2>'
      + '<button id="newGoal">Add a goal</button></div>'
      + (goals.length
        ? '<div class="tablewrap"><table><thead><tr><th>Goal</th><th>Sport</th><th>Target</th>'
          + '<th>By</th><th></th></tr></thead><tbody>'
          + goals.map(goalRow).join('') + '</tbody></table></div>'
        : '<div class="emptystate"><p>No goals yet.</p></div>')
      + '</section>'

      + '<div class="grid2">'
      + '<div>'
      + '<div class="conn">'
      + `<h3><span class="dot ${strava.connected ? 'on' : 'off'}"></span>Strava</h3>`
      + (strava.connected
        ? '<dl class="kv">'
          + `<dt>athlete</dt><dd>${esc(strava.athlete?.name || strava.athlete?.id || 'connected')}</dd>`
          + `<dt>sessions</dt><dd>${ctx.data.totals?.activities || 0}</dd>`
          + (sync?.lastSync ? `<dt>last sync</dt><dd>${esc(new Date(sync.lastSync).toLocaleString())}</dd>` : '')
          + (sync?.newest ? `<dt>newest</dt><dd>${esc(sync.newest)}</dd>` : '')
          + '</dl>'
          + '<div class="btnrow"><button class="solid" id="syncNow">Sync now</button>'
          + '<button id="syncFull">Full re-sync (180 days)</button>'
          + '<button id="stravaOff">Disconnect</button></div>'
        : strava.configured === false
          ? '<p class="mut">Not available yet.</p>'
          : '<div class="btnrow"><a href="/auth/strava/connect"><button class="solid">Connect Strava</button></a>'
            + '<span class="mut">Read-only</span></div>')
      + '</div>'

      + planCard(claude)
      + '</div>'

      + '<div>'
      + '<h3 class="sub-h">How you train</h3>'
      + '<div class="field"><label for="goalText">The goal, in your words</label>'
      + `<textarea id="goalText" style="min-height:74px">${esc(s.goal || '')}</textarea></div>`
      + '<div class="field"><label for="goalKeep">Keep every week</label>'
      + `<input type="text" id="goalKeep" value="${esc(s.keep || '')}" placeholder="2 bike sessions, 1-2 swims, 2 lifts"></div>`
      + '<div class="field"><label>Rest days</label><div class="daypick">'
      + DOW.map((d) => `<label class="check inline"><input type="checkbox" data-rest="${d}"`
        + `${(s.restDays || []).includes(d) ? ' checked' : ''}> ${d}</label>`).join('')
      + '</div></div>'
      + '<div class="field"><label for="goalLimits">Limits</label>'
      + `<textarea id="goalLimits" style="min-height:88px">${esc(s.limits || '')}</textarea></div>`
      + '<div class="btnrow"><button id="saveProfile">Save</button>'
      + '<span class="thinking" id="profileStatus"></span></div>'
      + '<div class="btnrow" style="margin-top:24px">'
      + '<a href="/api/export"><button>Export</button></a>'
      + '<button id="signOut">Sign out</button></div>'
      + '</div></div>'
      + '<div class="thinking" id="workStatus" hidden></div>';
  },

  mount(ctx, root) {
    root.addEventListener('click', async (e) => {
      const t = e.target;

      if (t.id === 'newGoal') { goalSheet(ctx, null); return; }
      const edit = t.closest('[data-edit-goal]');
      if (edit) {
        goalSheet(ctx, ctx.data.goals.find((g) => g.id === edit.getAttribute('data-edit-goal')));
        return;
      }
      const primary = t.closest('[data-primary]');
      if (primary) {
        await ctx.api(`/api/goals/${encodeURIComponent(primary.getAttribute('data-primary'))}/primary`, { method: 'POST' });
        await ctx.refresh({ fitness: true });
        toast('Primary goal changed.');
        return;
      }
      const del = t.closest('[data-del-goal]');
      if (del) {
        await ctx.api(`/api/goals/${encodeURIComponent(del.getAttribute('data-del-goal'))}`, { method: 'DELETE' });
        await ctx.refresh({ fitness: true });
        toast('Goal removed.');
        return;
      }

      if (t.id === 'syncNow' || t.id === 'syncFull') {
        const { runSync } = await import('../app.js');
        runSync(t.id === 'syncFull');
        return;
      }
      if (t.id === 'stravaOff') {
        await ctx.api('/auth/strava/disconnect', { method: 'POST' });
        await ctx.refresh();
        toast('Strava disconnected.');
        return;
      }
      if (t.id === 'saveProfile') {
        const status = root.querySelector('#profileStatus');
        status.className = 'thinking';
        status.textContent = 'Saving…';
        try {
          await ctx.api('/api/settings', {
            method: 'PUT',
            body: {
              goal: root.querySelector('#goalText').value,
              keep: root.querySelector('#goalKeep').value,
              limits: root.querySelector('#goalLimits').value,
              restDays: [...root.querySelectorAll('[data-rest]')]
                .filter((c) => c.checked).map((c) => c.getAttribute('data-rest')),
              targetMpw: ctx.data.settings?.targetMpw,
              targetDate: ctx.data.settings?.targetDate,
            },
          });
          status.textContent = 'Saved.';
          await ctx.refresh();
        } catch (err) {
          status.className = 'thinking err';
          status.textContent = err.message;
        }
        return;
      }
      if (t.id === 'signOut') {
        await ctx.api('/auth/logout', { method: 'POST' });
        window.location.reload();
      }
    });
  },
};
