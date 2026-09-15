// Plan — the coach's side of the log.
//
// Two views of one conversation. "This week" is the exchange: what the coach
// said about the week, your digest back, and the reviews before it. "Season"
// is the long arc that exchange is steering toward — phases, and the weeks
// ahead with their targets.
import { SPORTS, ENDURANCE_SPORTS, formatVolume } from '../lib/sports.js';
import { weekAdd, weekLabel } from '../lib/dates.js';
import { coachBlock, esc, localDay, n0, needsClaude, pageHead } from '../lib/ui.js';

let view = 'week';

// --- this week -------------------------------------------------------------

function weekView(ctx) {
  const week = ctx.data.week;
  const wk = ctx.data.weeks?.[week] || {};
  const digest = ctx.data.digests?.[week];
  const review = digest?.review;
  const available = ctx.data.claude?.available;

  const card = (review || wk.coachNote)
    ? coachBlock({
      title: review ? 'Week review' : 'This week',
      verdict: review?.verdict || wk.verdict,
      when: review ? localDay(review.generatedAt) : '',
      body: review?.summary || wk.coachNote || '',
      list: [...(review?.observations || []), ...(review?.adjustments || wk.adjustments || [])],
      flags: review?.flags || [],
    })
    : '<div class="emptystate"><p>Nothing from the coach this week yet.</p></div>';

  const history = Object.values(ctx.data.digests || {})
    .filter((d) => d.week !== week && d.text)
    .sort((a, b) => b.week.localeCompare(a.week))
    .slice(0, 8);

  return card
    + '<section class="digest">'
    + `<label for="digestBox">How did ${esc(weekAdd(week, -1))} go?</label>`
    + `<textarea id="digestBox" placeholder="Sleep, legs, niggles, motivation. What went well, what felt off, what you want next week to be.">${esc(digest?.text || '')}</textarea>`
    + '<div class="btnrow" style="margin-top:11px">'
    + (available
      ? '<button class="solid" id="sendDigest">Send to the coach</button><button id="saveDigest">Save draft</button>'
      : `<button id="saveDigest">Save draft</button>${needsClaude('Send to the coach')}`)
    + '</div>'
    + '<div class="thinking" id="workStatus" hidden></div>'
    + '</section>'
    + (history.length
      ? '<section class="chartblock"><div class="cb-head"><h2>Earlier</h2></div>'
        + history.map((d) => '<details class="digest-old">'
          + `<summary>${esc(d.week)}${d.review?.verdict ? ` — ${esc(d.review.verdict)}` : ''}</summary>`
          + `<blockquote>${esc(d.text)}</blockquote>`
          + (d.review?.summary ? coachBlock({ body: d.review.summary }) : '')
          + '</details>').join('')
        + '</section>'
      : '');
}

// --- the season ------------------------------------------------------------

function seasonView(ctx) {
  const plan = ctx.data.plan;
  const week = ctx.data.week;
  if (!plan) {
    return '<div class="emptystate"><p>No plan yet.</p></div>'
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
  const sports = ENDURANCE_SPORTS.concat(['lift']).filter((s) => upcoming.some((t) => t.volumes?.[s]));

  const table = upcoming.length
    ? '<section class="chartblock"><div class="cb-head"><h2>Weeks ahead</h2></div>'
      + '<div class="tablewrap"><table><thead><tr><th>Week</th><th>Starts</th><th>Phase</th>'
      + sports.map((s) => `<th class="r">${esc(SPORTS[s].label)}</th>`).join('')
      + '<th></th></tr></thead><tbody>'
      + upcoming.map((t) => `<tr${t.week === week ? ' class="isnow"' : ''}>`
        + `<td>${esc(t.week)}</td><td>${weekLabel(t.week)}</td><td>${t.phase ?? '—'}</td>`
        + sports.map((s) => `<td class="r">${t.volumes?.[s] ? formatVolume(s, t.volumes[s]) : '—'}</td>`).join('')
        + `<td>${t.deload ? '<span class="chip deload">deload</span>' : ''}</td></tr>`).join('')
      + '</tbody></table></div></section>'
    : '';

  return (plan.rationale ? coachBlock({ body: plan.rationale, when: localDay(plan.generatedAt) }) : '')
    + `<div class="phases">${phases}</div>`
    + table
    + '<div class="thinking" id="workStatus" hidden></div>';
}

// --- the page --------------------------------------------------------------

export default {
  path: '/plan',
  label: 'Plan',

  render(ctx) {
    const plan = ctx.data.plan;
    const goals = ctx.data.goals || [];
    const primary = goals.find((g) => g.primary) || goals[0];
    const claudeOn = ctx.data.claude?.available;

    const tabs = '<div class="tabs">'
      + `<button class="tab${view === 'week' ? ' on' : ''}" data-view="week">This week</button>`
      + `<button class="tab${view === 'season' ? ' on' : ''}" data-view="season">Season</button>`
      + '</div>';

    const label = plan ? 'Rebuild the plan' : 'Build the plan';
    const actions = view === 'season'
      ? (claudeOn ? `<button class="solid" id="buildPlan">${label}</button>` : needsClaude(label))
      : '';

    return pageHead({
      eyebrow: 'Coach',
      title: 'Plan',
      note: primary
        ? `${esc(primary.label || primary.target)}${plan?.targetDate ? ` by ${esc(plan.targetDate)}` : ''}`
        : '',
      actions: `${tabs}${actions ? `<div class="btnrow">${actions}</div>` : ''}`,
    })
      + (view === 'week' ? weekView(ctx) : seasonView(ctx));
  },

  mount(ctx, root) {
    root.addEventListener('click', async (e) => {
      const tab = e.target.closest('[data-view]');
      if (tab) { view = tab.getAttribute('data-view'); ctx.rerender(); return; }

      if (e.target.id === 'saveDigest') {
        try {
          await ctx.api(`/api/digests/${ctx.data.week}`, {
            method: 'PUT',
            body: { text: root.querySelector('#digestBox').value },
          });
          ctx.toast('Draft saved.');
        } catch (err) { ctx.toast(err.message, true); }
        return;
      }
      if (e.target.id === 'sendDigest') {
        const text = root.querySelector('#digestBox').value.trim();
        if (!text) { ctx.toast('Write the digest first.', true); return; }
        const { work } = await import('../app.js');
        const out = await work('Reviewing your week', (signal) => (
          ctx.api('/api/coach/review-digest', { method: 'POST', body: { text }, signal })
        ));
        if (out && !out.error) {
          await ctx.refresh();
          ctx.toast(`Reviewed. Next week: ${out.review.verdict}.`);
        }
        return;
      }
      if (e.target.id === 'buildPlan') {
        const { work } = await import('../app.js');
        const out = await work('Building the plan', (signal) => (
          ctx.api('/api/coach/build-plan', { method: 'POST', signal })
        ));
        if (out && !out.error) {
          await ctx.refresh();
          ctx.toast('Plan rebuilt.');
        }
      }
    });
  },
};
