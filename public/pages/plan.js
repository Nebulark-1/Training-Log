// The plan — the macrocycle, its phases, and the weeks ahead.
import { SPORTS, ENDURANCE_SPORTS, formatVolume } from '../lib/sports.js';
import { weekLabel } from '../lib/dates.js';
import { esc, localDay, n0, pageHead } from '../lib/ui.js';

export default {
  path: '/plan',
  label: 'Plan',

  render(ctx) {
    const plan = ctx.data.plan;
    const week = ctx.data.week;
    const goals = ctx.data.goals || [];
    const primary = goals.find((g) => g.primary) || goals[0];

    const actions = ctx.data.claude?.available
      ? `<button class="solid" id="buildPlan">${plan ? 'Rebuild from my history' : 'Build the plan'}</button>`
      : '<span class="thinking">No API key — <code>npm run coach -- prompt build-plan</code></span>';

    if (!plan) {
      return pageHead({ eyebrow: 'Macrocycle', title: 'The plan', actions })
        + '<div class="emptystate"><p>No macrocycle yet. Sync your Strava history, then let the coach '
        + 'build the phases from where you actually are rather than from an assumption.</p></div>'
        + '<div class="thinking" id="workStatus" hidden></div>';
    }

    const currentIdx = plan.weekTargets?.find((t) => t.week === week)?.index;
    const phase = plan.phases?.find((p) => currentIdx != null && p.weekFrom <= currentIdx && currentIdx <= p.weekTo);

    const phases = (plan.phases || []).map((p) => {
      const wt = (plan.weekTargets || []).filter((t) => t.index >= p.weekFrom && t.index <= p.weekTo);
      const runs = wt.map((t) => t.volumes?.run ?? t.runMiles).filter((v) => v != null);
      const lo = runs.length ? Math.min(...runs) : null;
      const hi = runs.length ? Math.max(...runs) : null;
      const isNow = phase?.n === p.n;
      return `<div class="ph${isNow ? ' now' : ''}">`
        + `<div class="ph-n">${esc(p.n)}</div><div><h3>${esc(p.name)}</h3>`
        + `<div class="ph-meta"><span>weeks ${esc(p.weekFrom)}–${esc(p.weekTo)}</span>`
        + (wt.length ? `<s></s><span>${weekLabel(wt[0].week)} – ${weekLabel(wt[wt.length - 1].week)}</span>` : '')
        + (lo != null ? `<s></s><span>${n0(lo)}–${n0(hi)} mi/wk</span>` : '')
        + (isNow ? '<s></s><span class="chip done">current</span>' : '')
        + `</div><p>${esc(p.job || '')}</p></div></div>`;
    }).join('');

    const upcoming = (plan.weekTargets || []).filter((t) => t.week >= week).slice(0, 20);
    const sports = ENDURANCE_SPORTS.concat(['lift'])
      .filter((s) => upcoming.some((t) => t.volumes?.[s]));

    const table = upcoming.length
      ? '<section class="chartblock"><div class="cb-head"><h2>The weeks ahead</h2>'
        + `<span class="cb-note">${upcoming.length} weeks of targets</span></div>`
        + '<div class="tablewrap"><table><thead><tr><th>Week</th><th>Starts</th><th>Phase</th>'
        + sports.map((s) => `<th class="r">${esc(SPORTS[s].label)}</th>`).join('')
        + '<th></th></tr></thead><tbody>'
        + upcoming.map((t) => `<tr${t.week === week ? ' class="isnow"' : ''}>`
          + `<td>${esc(t.week)}</td><td>${weekLabel(t.week)}</td><td>${t.phase ?? '—'}</td>`
          + sports.map((s) => `<td class="r">${t.volumes?.[s] ? formatVolume(s, t.volumes[s]) : '—'}</td>`).join('')
          + `<td>${t.deload ? '<span class="chip deload">deload</span>' : ''}</td></tr>`).join('')
        + '</tbody></table></div></section>'
      : '';

    return pageHead({
      eyebrow: `Macrocycle, built ${localDay(plan.generatedAt)}${plan.source === 'seed' ? ' from your plan document' : ''}`,
      title: 'The plan',
      note: primary ? `Toward ${esc(primary.label || primary.target)}${plan.targetDate ? ` by ${esc(plan.targetDate)}` : ''}` : '',
      actions,
    })
      + (plan.rationale ? `<section class="coach"><div class="coachtext"><p>${esc(plan.rationale)}</p></div></section>` : '')
      + `<div class="phases">${phases}</div>`
      + table
      + '<div class="thinking" id="workStatus" hidden></div>';
  },

  mount(ctx, root) {
    root.addEventListener('click', async (e) => {
      if (e.target.id !== 'buildPlan') return;
      const { work } = await import('../app.js');
      const out = await work('Building the macrocycle', (signal) => (
        ctx.api('/api/coach/build-plan', { method: 'POST', signal })
      ));
      if (out && !out.error) {
        await ctx.refresh();
        ctx.toast(`Plan rebuilt — ${out.plan.phases?.length || 0} phases`
          + `${out.plan.targetDate ? `, target ${out.plan.targetDate}` : ''}.`);
      }
    });
  },
};
