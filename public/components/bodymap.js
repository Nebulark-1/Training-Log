// The body map: point at where it hurts, then name the structure.
//
// Three steps, because a 190px silhouette is too small to pick a tendon on.
// Both figures sit in framed boxes; opening one blows it up to full height;
// picking a spot crops in on that part of the body, where the structure list
// can actually light up the region it names.
//
// Left and right are marked on every frame. The front view is a mirror — the
// figure faces you, so its screen-left is the athlete's right — which is the
// single easiest thing to get wrong when logging a side.
//
// Silhouette artwork: PocketPT alpha pen by Johny Bravo, MIT licensed. See
// pocketpt/pocketpt-alpha-build-v1/LICENSE.txt.
import { BACK, FRONT, VIEWBOX } from '../lib/silhouette.js';
import {
  KINDS, describeSite, getZone, sideLetters, siteArea, siteAt, troublePoints,
} from '../lib/body.js';
import { esc } from '../lib/ui.js';

const FULL = [0, 0, 595.28, 841.89];
/** Frames keep this shape, so changing stage does not resize the panel. */
const FRAME_RATIO = 3 / 4;

let uid = 0;

/** The art with the pen's own <svg> wrapper stripped; sizing and events are ours. */
const innerArt = (view) => (view === 'front' ? FRONT : BACK)
  .replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

/** Where a pointer event lands in viewBox coordinates, whatever the crop. */
function toViewBox(svg, event) {
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const [vx, vy, vw, vh] = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  return {
    x: vx + ((event.clientX - rect.left) / rect.width) * vw,
    y: vy + ((event.clientY - rect.top) / rect.height) * vh,
  };
}

/**
 * A viewBox cropped to one side of one zone, padded enough to keep the
 * neighbouring body visible, then squared off to the frame's shape.
 */
function cropFor(site) {
  const area = siteArea({ ...site, structure: null });
  if (!area) return FULL;
  const [ax0, ay0, ax1, ay1] = area;
  const padX = Math.max(26, (ax1 - ax0) * 0.45);
  const padY = Math.max(26, (ay1 - ay0) * 0.2);
  let x0 = ax0 - padX;
  let y0 = ay0 - padY;
  let w = (ax1 - ax0) + padX * 2;
  let h = (ay1 - ay0) + padY * 2;
  if (w / h > FRAME_RATIO) {
    const next = w / FRAME_RATIO;
    y0 -= (next - h) / 2;
    h = next;
  } else {
    const next = h * FRAME_RATIO;
    x0 -= (next - w) / 2;
    w = next;
  }
  return [x0, y0, w, h].map((v) => Math.round(v * 10) / 10);
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

function heatLayer(view, heat) {
  return heat
    .filter((h) => h.site?.view === view && h.site.x != null)
    .map((h) => {
      const pain = Math.max(1, Math.min(10, h.pain || 1));
      const r = 9 + pain * 2.2;
      return `<circle class="bm-heat" cx="${h.site.x}" cy="${h.site.y}" r="${r}"`
        + ` style="--pain:${pain / 10}"><title>${esc(describeSite(h.site))} — ${pain}/10`
        + ` on ${esc(h.date)}</title></circle>`;
    }).join('');
}

/** The rect attributes for a highlight, or a zero-size one when nothing is lit. */
function litAttrs(lit) {
  if (!lit) return 'x="0" y="0" width="0" height="0"';
  return `x="${lit[0].toFixed(1)}" y="${lit[1].toFixed(1)}"`
    + ` width="${Math.max(0, lit[2] - lit[0]).toFixed(1)}"`
    + ` height="${Math.max(0, lit[3] - lit[1]).toFixed(1)}"`;
}

/**
 * One framed figure. `lit` is the area to highlight, in viewBox coordinates:
 * the silhouette is drawn a second time through a clip of that rectangle, so
 * the highlight takes the shape of the body rather than sitting on it as a box.
 */
function frame(view, {
  site = null, heat = [], crop = FULL, lit = null, role = 'static',
  caption = '', clipId = '',
} = {}) {
  const letters = sideLetters(view);
  const pin = site?.view === view && site.x != null
    ? `<g class="bm-pin"><circle cx="${site.x}" cy="${site.y}" r="15"/>`
      + `<circle cx="${site.x}" cy="${site.y}" r="5" class="bm-pin-dot"/></g>`
    : '';
  const rect = litAttrs(lit);
  const highlight = clipId
    ? `<defs><clipPath id="${clipId}"><rect ${rect} rx="5" ry="5"/></clipPath></defs>`
      + `<g class="bm-lit" clip-path="url(#${clipId})">${innerArt(view)}</g>`
      + `<rect class="bm-litbox" ${rect} rx="5" ry="5"/>`
    : '';

  const open = role === 'open';
  const label = view === 'front' ? 'front' : 'back';
  return `<${open ? 'button' : 'div'} class="bm-frame ${role}"`
    + (open ? ` type="button" data-open="${view}" aria-label="Open the ${label} of the body"` : '')
    + '>'
    + `<span class="bm-side l" aria-hidden="true">${letters.viewerLeft}</span>`
    + `<span class="bm-side r" aria-hidden="true">${letters.viewerRight}</span>`
    + `<svg viewBox="${crop.join(' ')}" class="bm-svg" data-view="${view}"`
    + ` role="${role === 'pick' ? 'button' : 'img'}"`
    + ` aria-label="${role === 'pick' ? `Point at where it hurts, ${label} of the body` : `${label} of the body`}">`
    + innerArt(view) + highlight
    + `<g class="bm-heatlayer">${heatLayer(view, heat)}</g>${pin}</svg>`
    + `<span class="bm-viewlabel">${esc(caption || (view === 'front' ? 'Front' : 'Back'))}</span>`
    + `</${open ? 'button' : 'div'}>`;
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
  // 'both' shows the two frames, 'view' one whole figure, 'zone' a crop of it.
  let stage = current ? 'zone' : 'both';
  let openView = current?.view || 'front';
  let hover = null;
  const clipId = `bmlit-${++uid}`;

  const crumbs = () => {
    const bits = ['<button type="button" class="link" data-goto="both">Both</button>'];
    if (stage !== 'both') {
      bits.push(`<button type="button" class="link" data-goto="view">${openView === 'front' ? 'Front' : 'Back'}</button>`);
    }
    if (stage === 'zone' && current) {
      bits.push(`<span>${esc(describeSite({ ...current, structureLabel: null }))}</span>`);
    }
    return `<nav class="bm-crumbs">${bits.join('<i>&rsaquo;</i>')}</nav>`;
  };

  const stageMarkup = () => {
    if (stage === 'both') {
      return '<div class="bm-views">'
        + frame('front', { site: current, heat: history, role: 'open', caption: 'Front · tap to open' })
        + frame('back', { site: current, heat: history, role: 'open', caption: 'Back · tap to open' })
        + '</div>';
    }
    if (stage === 'view') {
      return `<div class="bm-views one">${frame(openView, {
        site: current, heat: history, role: 'pick', caption: 'Tap where it hurts',
      })}</div>`;
    }
    return `<div class="bm-views one">${frame(current.view, {
      site: current,
      heat: history,
      crop: cropFor(current),
      lit: siteArea(current, hover ?? current.structure),
      role: 'pick',
      caption: 'Tap to move the pin',
      clipId,
    })}</div>`;
  };

  const draw = () => {
    const zone = current ? getZone(current.view, current.zone) : null;
    container.innerHTML = `<div class="bodymap" data-stage="${stage}">`
      + crumbs()
      + '<div class="bm-body">'
      + `<div class="bm-stage">${stageMarkup()}</div>`
      + '<div class="bm-readout">'
      + (stage === 'both'
        ? '<p class="bm-hint">Open a figure to point at the spot. <b>L</b> and <b>R</b> are marked '
          + 'from your point of view, not the screen’s — the front figure faces you, so its left '
          + 'side is your right.</p>'
        : '')
      + (stage === 'view'
        ? '<p class="bm-hint">Tap anywhere on the figure. It zooms in on that part of the body so '
          + 'you can name the structure.</p>'
        : '')
      + (stage === 'zone' && current
        ? `<p class="bm-where"><b>${esc(describeSite(current))}</b>`
          + '<button type="button" class="link" id="bmClear">clear</button></p>'
          + '<p class="bm-hint">Narrow it down if you can — the more specific it is, the more '
          + 'useful the pattern becomes later. Hovering a name lights up the area it covers.</p>'
          + structureChips(zone, current.structure)
          + '<div class="field bm-free"><label for="bmNote">Or describe it yourself</label>'
          + `<input type="text" id="bmNote" value="${esc(current.structure ? '' : (current.freeText || ''))}"`
          + ' placeholder="e.g. just behind the medial malleolus"></div>'
        : '')
      + '</div></div></div>';
  };

  const emit = () => { onChange?.(current); };

  /**
   * Move the highlight without redrawing the art — hovering down a list of a
   * dozen structures should not re-parse a hundred paths a dozen times.
   */
  const paintHighlight = () => {
    if (stage !== 'zone' || !current) return;
    const box = siteArea(current, hover ?? current.structure);
    if (!box) return;
    container.querySelectorAll(`#${clipId} rect, .bm-litbox`).forEach((r) => {
      r.setAttribute('x', box[0].toFixed(1));
      r.setAttribute('y', box[1].toFixed(1));
      r.setAttribute('width', Math.max(0, box[2] - box[0]).toFixed(1));
      r.setAttribute('height', Math.max(0, box[3] - box[1]).toFixed(1));
    });
  };

  container.addEventListener('click', (e) => {
    const open = e.target.closest?.('[data-open]');
    if (open) {
      openView = open.getAttribute('data-open');
      stage = 'view';
      hover = null;
      draw();
      return;
    }
    const crumb = e.target.closest?.('[data-goto]');
    if (crumb) {
      const next = crumb.getAttribute('data-goto');
      // Going back to a single figure with nothing picked is the 'view' stage.
      stage = next === 'view' && !current ? 'view' : next;
      hover = null;
      draw();
      return;
    }
    const svg = e.target.closest?.('.bm-svg');
    if (svg && stage !== 'both') {
      const pt = toViewBox(svg, e);
      if (!pt) return;
      const picked = siteAt(svg.getAttribute('data-view'), pt.x, pt.y);
      // Keep the named structure only if the pin stayed in the same zone and side.
      const same = current && current.zone === picked.zone && current.side === picked.side;
      current = {
        ...picked,
        structure: same ? current.structure : null,
        structureLabel: same ? current.structureLabel : null,
        structureKind: same ? current.structureKind : null,
        freeText: current?.freeText || '',
      };
      stage = 'zone';
      hover = null;
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
      hover = null;
      draw();
      emit();
      return;
    }
    if (e.target.id === 'bmClear') {
      current = null;
      stage = 'both';
      hover = null;
      draw();
      emit();
    }
  });

  // Hover and keyboard focus both preview the area, so it works without a mouse.
  const preview = (e, on) => {
    const chip = e.target.closest?.('[data-structure]');
    if (!chip) return;
    const id = chip.getAttribute('data-structure');
    if (on) hover = id;
    else if (hover === id) hover = null;
    paintHighlight();
  };
  container.addEventListener('mouseover', (e) => preview(e, true));
  container.addEventListener('mouseout', (e) => preview(e, false));
  container.addEventListener('focusin', (e) => preview(e, true));
  container.addEventListener('focusout', (e) => preview(e, false));

  container.addEventListener('input', (e) => {
    if (e.target.id !== 'bmNote' || !current) return;
    current = { ...current, freeText: e.target.value.slice(0, 160) };
    emit();
  });

  draw();
  return {
    get: () => current,
    set: (next) => {
      current = next ? { ...next } : null;
      stage = current ? 'zone' : 'both';
      if (current) openView = current.view;
      draw();
    },
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
  return '<div class="bodymap heat" data-stage="both">'
    + (title ? `<p class="bm-hint">${esc(title)}</p>` : '')
    + '<div class="bm-views">'
    + frame('front', { heat: withSite })
    + frame('back', { heat: withSite })
    + '</div></div>';
}

export { describeSite, troublePoints, KINDS, VIEWBOX };
