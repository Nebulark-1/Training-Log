// Small SVG chart builders.
//
// Hand-rolled rather than a library: the visual language here is specific
// (hairlines, tabular figures, the run/bike/swim palette) and the charts are
// simple enough that a dependency would cost more than it saves. Everything
// shares one scale helper so axes, ticks and marks cannot disagree.
import { esc, n0, n1 } from '../lib/ui.js';

const FONT = 'Barlow Condensed,sans-serif';

/** A linear scale from data space to pixel space. */
export function scale(domainMin, domainMax, rangeMin, rangeMax) {
  const span = domainMax - domainMin || 1;
  const fn = (v) => rangeMin + ((v - domainMin) / span) * (rangeMax - rangeMin);
  fn.invert = (px) => domainMin + ((px - rangeMin) / (rangeMax - rangeMin)) * span;
  fn.domain = [domainMin, domainMax];
  return fn;
}

/** A nice round step for about `count` gridlines across `max`. */
export function niceStep(max, count = 5) {
  const raw = max / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (raw <= mag * m) return mag * m;
  }
  return mag * 10;
}

function gridlines(y, max, step, x0, x1, fmt = n0) {
  const out = [];
  for (let v = step; v <= max + 0.001; v += step) {
    out.push(`<line x1="${x0}" y1="${y(v).toFixed(1)}" x2="${x1}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 4"/>`);
    out.push(`<text x="${x0 - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="12.5" fill="var(--mut)">${fmt(v)}</text>`);
  }
  return out.join('');
}

/**
 * Weekly bars: planned as an outline, actual filled, with an optional goal
 * line. `rows` are {label, actual, target, deload, now, future}.
 */
export function plannedVsActual(rows, {
  width = 940, height = 300, goal = null, color = 'var(--run)', unit = '', fmt = n1,
} = {}) {
  const L = 46;
  const R = 16;
  const T = 22;
  const AX = height - 46;
  let max = Math.max(goal || 0, 1, ...rows.map((r) => Math.max(r.actual || 0, r.target || 0)));
  const step = niceStep(max);
  max = Math.ceil(max / step) * step;
  const y = scale(0, max, AX, T);
  const band = (width - L - R) / Math.max(1, rows.length);
  const bw = Math.min(20, band * 0.36);
  const s = [gridlines(y, max, step, L, width - R)];

  if (goal) {
    s.push(`<line x1="${L}" y1="${y(goal).toFixed(1)}" x2="${width - R}" y2="${y(goal).toFixed(1)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
    s.push(`<text x="${width - R}" y="${(y(goal) - 6).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="12.5" fill="${color}">goal ${fmt(goal)}</text>`);
  }

  rows.forEach((r, i) => {
    const cx = L + band * i + band / 2;
    if (r.now) {
      s.push(`<rect x="${(L + band * i).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${AX - T}" fill="var(--ghost)"/>`);
    }
    if (r.target) {
      s.push(`<rect x="${(cx - bw - 2).toFixed(1)}" y="${y(r.target).toFixed(1)}" width="${bw.toFixed(1)}"`
        + ` height="${Math.max(1, AX - y(r.target)).toFixed(1)}" fill="none" stroke="${color}" stroke-width="1"`
        + `${r.deload ? ' stroke-dasharray="3 3"' : ''}>`
        + `<title>${esc(r.label)} planned ${fmt(r.target)}${unit}${r.deload ? ' (deload)' : ''}</title></rect>`);
    }
    if (r.actual > 0) {
      s.push(`<rect x="${(cx + 2).toFixed(1)}" y="${y(r.actual).toFixed(1)}" width="${bw.toFixed(1)}"`
        + ` height="${Math.max(1, AX - y(r.actual)).toFixed(1)}" fill="${color}">`
        + `<title>${esc(r.label)} actual ${fmt(r.actual)}${unit}</title></rect>`);
    }
    if (i % Math.ceil(rows.length / 14) === 0 || r.now) {
      s.push(`<text x="${cx.toFixed(1)}" y="${AX + 17}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${r.now ? 'var(--ink)' : 'var(--mut)'}">${esc(r.label)}</text>`);
    }
  });

  s.push(`<line x1="${L}" y1="${AX}" x2="${width - R}" y2="${AX}" stroke="var(--mut)" stroke-width="1"/>`);
  if (unit) s.push(`<text x="${L - 8}" y="${T - 6}" text-anchor="end" font-family="${FONT}" font-size="12" fill="var(--mut)">${esc(unit)}</text>`);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Planned against actual by week">${s.join('')}</svg>`;
}

/**
 * Stacked weekly load by sport — what the whole training week costs, not just
 * the headline sport.
 */
export function stackedLoad(rows, series, { width = 940, height = 260 } = {}) {
  const L = 46;
  const R = 16;
  const T = 22;
  const AX = height - 46;
  const totals = rows.map((r) => series.reduce((n, s) => n + (r.values[s.key] || 0), 0));
  let max = Math.max(1, ...totals);
  const step = niceStep(max);
  max = Math.ceil(max / step) * step;
  const y = scale(0, max, AX, T);
  const band = (width - L - R) / Math.max(1, rows.length);
  const bw = Math.min(26, band * 0.6);
  const s = [gridlines(y, max, step, L, width - R)];

  rows.forEach((r, i) => {
    const cx = L + band * i + band / 2;
    let acc = 0;
    for (const sp of series) {
      const v = r.values[sp.key] || 0;
      if (v <= 0) continue;
      const y0 = y(acc + v);
      const y1 = y(acc);
      s.push(`<rect x="${(cx - bw / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}"`
        + ` height="${Math.max(1, y1 - y0).toFixed(1)}" fill="${sp.color}">`
        + `<title>${esc(r.label)} ${esc(sp.label)} ${Math.round(v)}</title></rect>`);
      acc += v;
    }
    if (i % Math.ceil(rows.length / 14) === 0 || r.now) {
      s.push(`<text x="${cx.toFixed(1)}" y="${AX + 17}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${r.now ? 'var(--ink)' : 'var(--mut)'}">${esc(r.label)}</text>`);
    }
  });
  s.push(`<line x1="${L}" y1="${AX}" x2="${width - R}" y2="${AX}" stroke="var(--mut)" stroke-width="1"/>`);
  s.push(`<text x="${L - 8}" y="${T - 6}" text-anchor="end" font-family="${FONT}" font-size="12" fill="var(--mut)">load</text>`);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Weekly training load by sport">${s.join('')}</svg>`;
}

/**
 * A line over time, with an optional second line and a filled area under the
 * first. `points` are {x: label, y: number}.
 */
export function lineChart(points, {
  width = 940, height = 240, color = 'var(--run)', second = null, secondColor = 'var(--bike)',
  unit = '', fmt = n0, area = true, zeroBased = true,
} = {}) {
  if (!points.length) return '';
  const L = 46;
  const R = 16;
  const T = 22;
  const AX = height - 42;
  const all = [...points.map((p) => p.y), ...(second || []).map((p) => p.y)];
  const lo = zeroBased ? 0 : Math.min(...all) * 0.95;
  let hi = Math.max(...all, lo + 1);
  const step = niceStep(hi - lo);
  hi = lo + Math.ceil((hi - lo) / step) * step;
  const y = scale(lo, hi, AX, T);
  const x = scale(0, Math.max(1, points.length - 1), L, width - R);

  const s = [];
  for (let v = lo + step; v <= hi + 0.001; v += step) {
    s.push(`<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${width - R}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 4"/>`);
    s.push(`<text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="12.5" fill="var(--mut)">${fmt(v)}</text>`);
  }

  const path = (list) => list.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  if (area) {
    s.push(`<path d="${path(points)} L${x(points.length - 1).toFixed(1)},${AX} L${x(0).toFixed(1)},${AX} Z" fill="${color}" opacity="0.1"/>`);
  }
  if (second?.length) {
    s.push(`<path d="${path(second)}" fill="none" stroke="${secondColor}" stroke-width="1.5" stroke-dasharray="4 3"/>`);
  }
  s.push(`<path d="${path(points)}" fill="none" stroke="${color}" stroke-width="2"/>`);

  // Emphasized endpoint — where you are now is the point of the chart.
  const last = points[points.length - 1];
  s.push(`<circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(last.y).toFixed(1)}" r="3.5" fill="${color}"/>`);
  s.push(`<text x="${(x(points.length - 1) - 8).toFixed(1)}" y="${(y(last.y) - 10).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="13" fill="var(--ink)">${fmt(last.y)}${esc(unit)}</text>`);

  const stride = Math.ceil(points.length / 8);
  points.forEach((p, i) => {
    if (i % stride && i !== points.length - 1) return;
    s.push(`<text x="${x(i).toFixed(1)}" y="${AX + 16}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="var(--mut)">${esc(p.x)}</text>`);
  });
  s.push(`<line x1="${L}" y1="${AX}" x2="${width - R}" y2="${AX}" stroke="var(--mut)" stroke-width="1"/>`);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend over time">${s.join('')}</svg>`;
}

/** A compact 0-100 dial for the fitness scores. */
export function scoreMeter(score, { label, color = 'var(--run)', caption = '' } = {}) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  return '<div class="meter">'
    + `<div class="meter-top"><b>${score == null ? '—' : Math.round(value)}</b><span>${esc(label)}</span></div>`
    + `<div class="meter-track"><div class="meter-fill" style="width:${value}%;background:${color}"></div></div>`
    + (caption ? `<p class="meter-cap">${esc(caption)}</p>` : '')
    + '</div>';
}

/** Estimated 1RM over time for one movement, as a sparkline. */
export function sparkline(points, { width = 180, height = 40, color = 'var(--lift)' } = {}) {
  if (points.length < 2) return '';
  const lo = Math.min(...points.map((p) => p.y));
  const hi = Math.max(...points.map((p) => p.y));
  const y = scale(lo === hi ? lo - 1 : lo, hi, height - 4, 4);
  const x = scale(0, points.length - 1, 2, width - 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">`
    + `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"/>`
    + `<circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(points[points.length - 1].y).toFixed(1)}" r="2.5" fill="${color}"/>`
    + '</svg>';
}
