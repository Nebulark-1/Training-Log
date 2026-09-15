// Coach — the weekly digest, and what came back.
import { weekAdd } from '../lib/dates.js';
import { coachBlock, esc, localDay, needsClaude, pageHead } from '../lib/ui.js';

export default {
  path: '/coach',
  label: 'Coach',

  render(ctx) {
    const week = ctx.data.week;
    const wk = ctx.data.weeks?.[week] || {};
    const digest = ctx.data.digests?.[week];
    const review = digest?.review;
    const isMonday = new Date().getDay() === 1;
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

    return pageHead({
      eyebrow: isMonday ? 'Monday' : 'Weekly',
      title: 'Coach',
    })
      + card
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
        ? '<section class="chartblock"><div class="cb-head"><h2>Earlier digests</h2></div>'
          + history.map((d) => '<details class="digest-old">'
            + `<summary>${esc(d.week)}${d.review?.verdict ? ` — ${esc(d.review.verdict)}` : ''}</summary>`
            + `<blockquote>${esc(d.text)}</blockquote>`
            + (d.review?.summary ? coachBlock({ title: 'Coach', body: d.review.summary }) : '')
            + '</details>').join('')
          + '</section>'
        : '');
  },

  mount(ctx, root) {
    root.addEventListener('click', async (e) => {
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
      if (e.target.id !== 'sendDigest') return;
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
    });
  },
};
