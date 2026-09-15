// Plan — the coach's side of the log.
//
// Two views of one conversation. "This week" is what the coach said about the
// week in full, and the reviews before it — each week keeping both voices,
// yours and the coach's. "Season" is the long arc that conversation is
// steering toward: phases, and the weeks ahead with their targets.
//
// The weekly digest asks for itself only while it is unwritten, from a panel
// at the side. Once sent, it lives with the review it produced.
import { SPORTS, ENDURANCE_SPORTS, formatVolume } from '../lib/sports.js';
import { weekAdd, weekLabel } from '../lib/dates.js';
import {
  closeSheet, coachBlock, esc, localDay, n0, needsClaude, openSheet, pageHead,
} from '../lib/ui.js';

let view = 'week';
let askOpen = true;

// --- this week -------------------------------------------------------------

/** One week of the exchange: what you wrote, what came back, each foldable. */
function exchange(d, { open = false } = {}) {
  const review = d.review;
  return `<details class="xw"${open ? ' open' : ''}>`
    + `<summary><b>${esc(d.week)}</b>`
    + (review?.verdict ? `<span class="chip ${/back|hold/i.test(review.verdict) ? 'miss' : 'done'}">${esc(review.verdict)}</span>` : '')
    + (review?.generatedAt ? `<span class="mut">${localDay(review.generatedAt)}</span>` : '')
    + '</summary>'
    + (d.text
      ? '<details class="xw-you" open><summary>You wrote</summary>'
        + `<blockquote>${esc(d.text)}</blockquote></details>`
      : '')
    + (review?.summary
      ? '<details class="xw-coach" open><summary>The coach said</summary>'
        + coachBlock({
          title: 'Week review',
          body: review.summary,
          list: [...(review.observations || []), ...(review.adjustments || [])],
          flags: review.flags || [],
        })
        + '</details>'
      : '')
    + '</details>';
}

function weekView(ctx) {
  const week = ctx.data.week;
  const wk = ctx.data.weeks?.[week] || {};
  const digest = ctx.data.digests?.[week];
  const review = digest?.review;

  const card = (review || wk.coachNote)
    ? coachBlock({
      title: review ? 'Week review' : 'This week',
      verdict: review?.verdict || wk.verdict,
      when: review ? localDay(review.generatedAt) : (wk.generatedAt ? localDay(wk.generatedAt) : ''),
      body: review?.summary || wk.coachNote || '',
      list: [...(review?.observations || []), ...(review?.adjustments || wk.adjustments || [])],
      flags: review?.flags || [],
    })
    : '<div class="emptystate"><p>Nothing from the coach this week yet.</p></div>';

  const previous = Object.values(ctx.data.digests || {})
    .filter((d) => d.week !== week && (d.text || d.review))
    .sort((a, b) => b.week.localeCompare(a.week))
    .slice(0, 12);

  return card
    + (previous.length
      ? '<section class="chartblock"><div class="cb-head"><h2>Previous weeks</h2></div>'
        + previous.map((d) => exchange(d)).join('')
        + '</section>'
      : '');
}

/** The digest, asked for from the side while it has not been written. */
function askPanel(ctx) {
  const week = ctx.data.week;
  const digest = ctx.data.digests?.[week];
  if (digest?.review) return '';
  const available = ctx.data.claude?.available;
  if (!askOpen) {
    return '<button type="button" class="ask-tab" id="askOpen">How did last week go?</button>';
  }
  return '<aside class="ask" id="askPanel">'
    + '<div class="ask-head"><b>How did last week go?</b>'
    + '<button type="button" class="x" id="askClose" aria-label="Close">&times;</button></div>'
    + `<p class="mut">${esc(weekAdd(week, -1))}</p>`
    + `<textarea id="digestBox" placeholder="Sleep, legs, niggles, motivation. What went well, what felt off, what you want next week to be.">${esc(digest?.text || '')}</textarea>`
    + '<div class="btnrow">'
    + (available
      ? '<button class="solid" id="sendDigest">Send to the coach</button><button id="saveDigest">Save draft</button>'
      : `<button id="saveDigest">Save draft</button>${needsClaude('Send to the coach')}`)
    + '</div>'
    + '<div class="thinking" id="workStatus" hidden></div>'
    + '</aside>';
}

// --- the season ------------------------------------------------------------

function seasonView(ctx) {
  const plan = ctx.data.plan;
  const week = ctx.data.week;
  const claudeOn = ctx.data.claude?.available;

  if (!plan) {
    return '<div class="emptystate"><p>No plan yet.</p>'
      + `<div class="btnrow">${claudeOn
        ? '<button class="solid" id="buildPlan">Build the plan</button>'
        : needsClaude('Build the plan')}</div></div>`
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

  // Rebuilding is deliberately out of the way. A season plan is meant to be
  // held to; a button in the header invites the opposite.
  const rebuild = '<div class="quiet-actions">'
    + `<span class="mut">Built ${localDay(plan.generatedAt)}</span>`
    + (claudeOn
      ? '<button type="button" class="link mutlink" id="rebuildAsk">Rebuild the plan…</button>'
      : '')
    + '</div>';

  return (plan.rationale ? coachBlock({ body: plan.rationale, when: localDay(plan.generatedAt) }) : '')
    + `<div class="phases">${phases}</div>`
    + table
    + rebuild
    + '<div class="thinking" id="workStatus" hidden></div>';
}

/** The one place rebuilding happens, after saying what it costs. */
function confirmRebuild(ctx) {
  openSheet(
    '<div class="sheet-head"><div><h3>Rebuild the plan</h3></div>'
    + '<button type="button" data-close="1">Close</button></div>'
    + '<p>This replaces the whole season: every phase and every weekly target from here to '
    + 'the goal. The weeks already planned stay as they are.</p>'
    + '<p>A plan works by being held to. Rebuild when the goal has changed or a long '
    + 'interruption has made the old arc impossible — not because a week went badly.</p>'
    + '<div class="btnrow"><button class="solid" id="rebuildGo">Rebuild the plan</button>'
    + '<button type="button" data-close="1">Keep the plan</button></div>',
    (root) => {
      root.querySelector('#rebuildGo').addEventListener('click', async () => {
        closeSheet();
        const { work } = await import('../app.js');
        const out = await work('Building the plan', (signal) => (
          ctx.api('/api/coach/build-plan', { method: 'POST', signal })
        ), { kind: 'build-plan' });
        if (out && !out.error) {
          await ctx.refresh();
          ctx.toast('Plan rebuilt.');
        }
      });
    },
  );
}

// --- the page --------------------------------------------------------------

export default {
  path: '/plan',
  label: 'Plan',

  render(ctx) {
    const plan = ctx.data.plan;
    const goals = ctx.data.goals || [];
    const primary = goals.find((g) => g.primary) || goals[0];

    const tabs = '<div class="seg">'
      + `<button type="button" class="${view === 'week' ? 'on' : ''}" data-view="week">This week</button>`
      + `<button type="button" class="${view === 'season' ? 'on' : ''}" data-view="season">Season</button>`
      + '</div>';

    return pageHead({
      eyebrow: 'Coach',
      title: 'Plan',
      note: primary
        ? `${esc(primary.label || primary.target)}${plan?.targetDate ? ` by ${esc(plan.targetDate)}` : ''}`
        : '',
    })
      + tabs
      + (view === 'week' ? weekView(ctx) : seasonView(ctx))
      + (view === 'week' ? askPanel(ctx) : '');
  },

  mount(ctx, root) {
    root.addEventListener('click', async (e) => {
      const tab = e.target.closest('[data-view]');
      if (tab) { view = tab.getAttribute('data-view'); ctx.rerender(); return; }
      if (e.target.id === 'askClose') { askOpen = false; ctx.rerender(); return; }
      if (e.target.id === 'askOpen') { askOpen = true; ctx.rerender(); return; }

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
        ), { kind: 'review' });
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
        ), { kind: 'build-plan' });
        if (out && !out.error) {
          await ctx.refresh();
          ctx.toast('Plan built.');
        }
        return;
      }
      if (e.target.id === 'rebuildAsk') confirmRebuild(ctx);
    });
  },
};
