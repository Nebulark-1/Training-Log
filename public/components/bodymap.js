// The body map: point at where it hurts, then name the structure.
//
// Front and back sit side by side so a click never needs a view toggle first.
// The click stores a point, not just a label, which is what lets the same
// component draw a heat map of everywhere that has ever hurt.
//
// Silhouette artwork: PocketPT alpha pen by Johny Bravo, MIT licensed. See
// pocketpt/pocketpt-alpha-build-v1/LICENSE.txt.
import { BACK, FRONT, VIEWBOX } from '../lib/silhouette.js';
import { KINDS, describeSite, getZone, siteAt, troublePoints } from '../lib/body.js';
import { esc } from '../lib/ui.js';

const VB = { w: 595.28, h: 841.89 };

/** Where a pointer event lands in viewBox coordinates. */
function toViewBox(svg, event) {
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: ((event.clientX - rect.left) / rect.width) * VB.w,
    y: ((event.clientY - rect.top) / rect.height) * VB.h,
  };
}

const KIND_ORDER = ['muscle', 'tendon', 'bone', 'joint', 'nerve', 'other'];

function structureChips(zone, chosen) {
  if (!zone?.structures?.length) return '';
  const sorted = [...zone.structures]
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return '<div class="bm-structures">'
    + sorted.map((st) => `<button type="button" class="bm-chip k-${esc(st.kind)}`
      + `${chosen === st.id ? ' on' : ''}" data-structure="${esc(st.id)}"`
      + ` title="${esc(st.kind)}">${esc(st.label)}</button>`).join('')
    + '</div>';
}

/** One silhouette, with any pins drawn over it. */
function svgFor(view, { site, heat = [], interactive = true }) {
  const art = view === 'front' ? FRONT : BACK;
  // The pen's <svg> wrapper is replaced so sizing and events are ours.
  const inner = art.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

  const heatDots = heat
    .filter((h) => h.site?.view === view && h.site.x != null)
    .map((h) => {
      const pain = Math.max(1, Math.min(10, h.pain || 1));
      const r = 9 + pain * 2.2;
      return `<circle class="bm-heat" cx="${h.site.x}" cy="${h.site.y}" r="${r}"`
        + ` style="--pain:${pain / 10}"><title>${esc(describeSite(h.site))} — ${pain}/10 on ${esc(h.date)}</title></circle>`;
    }).join('');

  const pin = site?.view === view && site.x != null
    ? `<g class="bm-pin"><circle cx="${site.x}" cy="${site.y}" r="15"/>`
      + `<circle cx="${site.x}" cy="${site.y}" r="5" class="bm-pin-dot"/></g>`
    : '';

  return `<div class="bm-view${interactive ? ' pick' : ''}">`
    + `<svg viewBox="${VIEWBOX}" class="bm-svg" data-view="${view}"`
    + ` role="${interactive ? 'button' : 'img'}"`
    + ` aria-label="${interactive ? `Point at where it hurts, ${view} of the body` : `${view} of the body`}"`
    + `>${inner}<g class="bm-heatlayer">${heatDots}</g>${pin}</svg>`
    + `<span class="bm-viewlabel">${view === 'front' ? 'Front' : 'Back'}</span>`
    + '</div>';
}

/**
 * Mount the picker into a container.
 *
 * @param container  element to render into
 * @param options    { site, history, onChange }
 * @returns          { get(), set(site) }
 */
export function mountBodyMap(container, { site = null, history = [], onChange = null } = {}) {
  let current = site ? { ...site } : null;

  const draw = () => {
    const zone = current ? getZone(current.view, current.zone) : null;
    container.innerHTML = '<div class="bodymap">'
      + '<div class="bm-views">'
      + svgFor('front', { site: current, heat: history })
      + svgFor('back', { site: current, heat: history })
      + '</div>'
      + '<div class="bm-readout">'
      + (current
        ? `<p class="bm-where"><b>${esc(describeSite(current))}</b>`
          + '<button type="button" class="link" id="bmClear">clear</button></p>'
          + '<p class="bm-hint">Narrow it down if you can — the more specific it is, the more '
          + 'useful the pattern becomes later.</p>'
          + structureChips(zone, current.structure)
          + '<div class="field bm-free"><label for="bmNote">Or describe it yourself</label>'
          + `<input type="text" id="bmNote" value="${esc(current.structure ? '' : (current.freeText || ''))}"`
          + ' placeholder="e.g. just behind the medial malleolus"></div>'
        : '<p class="bm-hint">Tap the spot on either figure. Front is on the left — it faces you, '
          + 'so its left side is your right.</p>')
      + '</div></div>';
  };

  const emit = () => {
    onChange?.(current);
  };

  container.addEventListener('click', (e) => {
    const svg = e.target.closest?.('.bm-svg');
    if (svg) {
      const pt = toViewBox(svg, e);
      if (!pt) return;
      const view = svg.getAttribute('data-view');
      const picked = siteAt(view, pt.x, pt.y);
      // Keep a free-text note if the athlete already typed one.
      current = { ...picked, freeText: current?.freeText || '' };
      draw();
      emit();
      return;
    }
    const chip = e.target.closest?.('[data-structure]');
    if (chip && current) {
      const zone = getZone(current.view, current.zone);
      const id = chip.getAttribute('data-structure');
      const st = zone?.structures.find((x) => x.id === id);
      const same = current.structure === id;
      current = {
        ...current,
        structure: same ? null : id,
        structureLabel: same ? null : st?.label || null,
        structureKind: same ? null : st?.kind || null,
      };
      draw();
      emit();
      return;
    }
    if (e.target.id === 'bmClear') {
      current = null;
      draw();
      emit();
    }
  });

  container.addEventListener('input', (e) => {
    if (e.target.id !== 'bmNote' || !current) return;
    current = { ...current, freeText: e.target.value.slice(0, 160) };
    emit();
  });

  draw();
  return {
    get: () => current,
    set: (next) => { current = next ? { ...next } : null; draw(); },
  };
}

/**
 * A read-only heat map of everywhere that has hurt, for the injuries page.
 * `entries` are {date, pain, site}.
 */
export function renderHeatMap(entries, { title = '' } = {}) {
  const withSite = entries.filter((e) => e.site?.x != null);
  if (!withSite.length) {
    return '<div class="emptystate"><p>No mapped pain yet. When you log pain above zero, '
      + 'point at where it was and it will start building a picture here.</p></div>';
  }
  return '<div class="bodymap heat">'
    + (title ? `<p class="bm-hint">${esc(title)}</p>` : '')
    + '<div class="bm-views">'
    + svgFor('front', { heat: withSite, interactive: false })
    + svgFor('back', { heat: withSite, interactive: false })
    + '</div></div>';
}

export { describeSite, troublePoints, KINDS };
