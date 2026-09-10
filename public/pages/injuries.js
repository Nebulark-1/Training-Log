// Injuries — everywhere it has hurt, and what keeps coming back.
//
// The point of mapping pain to a place rather than a sentence: three entries
// that all say "shin" only become a trouble point when they are the same shin,
// in the same spot, and you can see them stacked on the body.
import { renderHeatMap } from '../components/bodymap.js';
import { describeSite, troublePoints } from '../lib/body.js';
import { SPORTS, sportKey } from '../lib/sports.js';
import { esc, n1, pageHead, shortDate, stat } from '../lib/ui.js';

let windowDays = 365;

const KIND_LABEL = {
  muscle: 'muscle', tendon: 'tendon', bone: 'bone',
  joint: 'joint', nerve: 'nerve', other: '',
};

function troubleTable(rows) {
  if (!rows.length) return '';
  return '<div class="tablewrap"><table><thead><tr>'
    + '<th>Where</th><th>Kind</th><th class="r">Times</th><th class="r">Worst</th>'
    + '<th class="r">Average</th><th>Span</th><th>Last</th>'
    + '</tr></thead><tbody>'
    + rows.map((r) => {
      const recurring = r.count >= 3;
      return `<tr${recurring ? ' class="isnow"' : ''}>`
        + `<td class="name"><b>${esc(r.label)}</b>`
        + `${recurring ? ' <span class="chip miss">recurring</span>' : ''}</td>`
        + `<td>${esc(KIND_LABEL[r.structureKind] || '')}</td>`
        + `<td class="r">${r.count}</td>`
        + `<td class="r">${r.worst}/10</td>`
        + `<td class="r">${n1(r.mean)}</td>`
        + `<td>${shortDate(r.first)} – ${shortDate(r.last)}</td>`
        + `<td>${shortDate(r.last)}</td>`
        + '</tr>';
    }).join('')
    + '</tbody></table></div>';
}

export default {
  path: '/injuries',
  label: 'Injuries',

  render(ctx) {
    const loaded = window.__vlInjuries;
    if (!loaded) {
      return pageHead({ eyebrow: 'Where it hurts', title: 'Injuries' })
        + '<div class="emptystate"><p>Reading your pain history…</p></div>';
    }

    const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
    const entries = loaded.entries.filter((e) => e.date >= cutoff);
    const mapped = entries.filter((e) => e.site?.x != null);
    const unmapped = entries.filter((e) => !e.site?.x && e.painSite);
    const rows = troublePoints(entries);

    const recent = entries.slice(0, 14);
    const worst = entries.reduce((a, e) => Math.max(a, e.pain || 0), 0);
    const active = entries.filter((e) => e.date >= new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));

    const windows = [
      [90, '3 months'], [365, '12 months'], [3650, 'Everything'],
    ].map(([d, label]) => `<button class="tab${windowDays === d ? ' on' : ''}" data-window="${d}">${label}</button>`).join('');

    return pageHead({
      eyebrow: 'Where it hurts',
      title: 'Injuries',
      note: 'Every session where you logged pain above zero, placed on the body. Repeated spots '
        + 'are what matter — a single sore day is noise, the same spot three times is a pattern.',
      actions: `<div class="tabs">${windows}</div>`,
    })
      + '<div class="stats tight">'
      + stat('entries', String(entries.length), '', windowDays >= 3650 ? 'all time' : `last ${windowDays} days`)
      + stat('mapped', String(mapped.length), `of ${entries.length}`)
      + stat('distinct spots', String(rows.length), '')
      + stat('worst logged', worst ? `${worst}` : '—', worst ? '/10' : '')
      + stat('last 14 days', String(active.length), active.length === 1 ? 'entry' : 'entries')
      + '</div>'

      + (mapped.length
        ? `<section class="chartblock"><div class="cb-head"><h2>Heat map</h2>`
          + '<span class="cb-note">bigger and warmer means it hurt more</span></div>'
          + renderHeatMap(mapped)
          + '</section>'
        : '<div class="emptystate"><p>Nothing mapped in this window yet. Log pain above zero on a '
          + 'session and point at the spot — it will start building here.</p></div>')

      + (rows.length
        ? '<section class="chartblock"><div class="cb-head"><h2>Trouble points</h2>'
          + '<span class="cb-note">grouped by side and structure, most frequent first</span></div>'
          + troubleTable(rows) + '</section>'
        : '')

      + (recent.length
        ? '<section class="chartblock"><div class="cb-head"><h2>Recent entries</h2></div>'
          + '<div class="tablewrap"><table><thead><tr><th>Date</th><th>Sport</th><th>Where</th>'
          + '<th class="r">Pain</th><th>Note</th></tr></thead><tbody>'
          + recent.map((e) => '<tr>'
            + `<td>${shortDate(e.date)}</td>`
            + `<td><span class="sport ${esc(sportKey(e.sport))}"><s></s>`
            + `${esc(SPORTS[sportKey(e.sport)]?.label || e.sport || '')}</span></td>`
            + `<td class="name">${esc(e.site ? describeSite(e.site) : (e.painSite || '—'))}`
            + `${e.site?.freeText ? `<span class="mut"> · ${esc(e.site.freeText)}</span>` : ''}</td>`
            + `<td class="r">${e.pain}/10</td>`
            + `<td class="name mut">${esc((e.notes || '').slice(0, 90))}</td>`
            + '</tr>').join('')
          + '</tbody></table></div></section>'
        : '')

      + (unmapped.length
        ? '<section class="chartblock"><div class="cb-head"><h2>Logged before the body map</h2>'
          + `<span class="cb-note">${unmapped.length} written as text</span></div>`
          + '<p class="help">These were recorded as free text, so they cannot be placed on the body. '
          + 'They still count toward trouble points by their wording.</p>'
          + '<ul class="plainlist">'
          + unmapped.slice(0, 12).map((e) => `<li><span>${shortDate(e.date)}</span> `
            + `${esc(e.painSite)} — ${e.pain}/10</li>`).join('')
          + '</ul></section>'
        : '');
  },

  async mount(ctx, root) {
    if (!window.__vlInjuries) {
      try {
        window.__vlInjuries = await ctx.api('/api/injuries');
        ctx.rerender();
      } catch (err) {
        ctx.toast(err.message, true);
      }
      return;
    }
    root.addEventListener('click', (e) => {
      const win = e.target.closest('[data-window]');
      if (!win) return;
      windowDays = Number(win.getAttribute('data-window'));
      ctx.rerender();
    });
  },
};
