// Coach — the weekly digest, and what came back.
import { weekAdd } from '../lib/dates.js';
import { esc, localDay, pageHead } from '../lib/ui.js';

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

    let card = '';
    if (review || wk.coachNote) {
      const verdict = review?.verdict || wk.verdict;
      card = '<section class="coach"><div class="verdict">'
        + `<b>${review ? 'Week review' : 'This week'}</b>`
        + (verdict ? `<span class="chip ${/back|hold/i.test(verdict) ? 'miss' : 'done'}">${esc(verdict)}</span>` : '')
        + (review ? `<span class="mut">${localDay(review.generatedAt)}</span>` : '')
        + '</div>'
        + `<div class="coachtext">${(review?.summary || wk.coachNote || '').split(/\n\n+/)
          .map((p) => `<p>${esc(p)}</p>`).join('')}</div>`
        + ((review?.observations?.length || review?.adjustments?.length || wk.adjustments?.length)
          ? `<ul class="adj">${[...(review?.observations || []), ...(review?.adjustments || wk.adjustments || [])]
            .map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`
          : '')
        + (review?.flags?.length
          ? `<div class="flagbox"><b>Watch</b><ul>${review.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`
          : '')
        + '</section>';
    } else {
      card = '<section class="coach"><div class="coachtext"><p><em>No coaching note for this week yet.</em> '
        + 'Write the digest below and send it, or ask for a week plan straight from '
        + '<a href="/week" data-link>the week page</a>.</p></div></section>';
    }

    const history = Object.values(ctx.data.digests || {})
      .filter((d) => d.week !== week && d.text)
      .sort((a, b) => b.week.localeCompare(a.week))
      .slice(0, 8);

    return pageHead({
      eyebrow: isMonday ? 'Monday — digest day' : 'Weekly digest',
      title: 'Coach',
      note: 'The numbers say what happened. The digest says what it felt like, and that is what '
        + 'decides whether the coming week pushes or holds.',
    })
      + card
      + '<section class="digest">'
      + `<label for="digestBox">Digest for ${esc(week)} — how did last week (${esc(weekAdd(week, -1))}) feel?</label>`
      + `<textarea id="digestBox" placeholder="Sleep, legs, niggles, motivation, life load. What went well, what felt off, anything you cut or added, and how you want the coming week to go.">${esc(digest?.text || '')}</textarea>`
      + '<div class="btnrow" style="margin-top:11px">'
      + (available
        ? '<button class="solid" id="sendDigest">Send digest to Claude</button><button id="saveDigest">Save draft</button>'
        : '<button class="solid" id="saveDigest">Save draft</button>'
          + '<span class="thinking">No API key: save the draft, then run '
          + '<code>npm run coach -- prompt review @digest.txt</code> in a Claude Code session.</span>')
      + '</div>'
      + '<div class="thinking" id="workStatus" hidden></div>'
      + '</section>'
      + (history.length
        ? '<section class="chartblock"><div class="cb-head"><h2>Earlier digests</h2></div>'
          + history.map((d) => '<details class="digest-old">'
            + `<summary>${esc(d.week)}${d.review?.verdict ? ` — ${esc(d.review.verdict)}` : ''}</summary>`
            + `<blockquote>${esc(d.text)}</blockquote>`
            + (d.review?.summary ? `<div class="coachtext">${d.review.summary.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join('')}</div>` : '')
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
        ctx.toast(`Review saved and the week is planned — ${out.review.verdict}.`);
      }
    });
  },
};
