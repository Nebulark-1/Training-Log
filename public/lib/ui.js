// Shared UI primitives: formatting, the sheet (modal), and toasts.
import { DOW, MON, pad, parseYmd, ymd } from './dates.js';

export const $ = (id) => document.getElementById(id);
export const el = (sel, root = document) => root.querySelector(sel);
export const els = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const n1 = (x) => (Math.round((Number(x) || 0) * 10) / 10).toFixed(1);
export const n0 = (x) => String(Math.round(Number(x) || 0));
export const comma = (x) => Math.round(Number(x) || 0).toLocaleString('en-US');
export const signed = (x, digits = 0) => `${x > 0 ? '+' : ''}${digits ? (Math.round(x * 10) / 10).toFixed(digits) : Math.round(x)}`;

export function mmss(sec) {
  if (!sec || !isFinite(sec)) return '—';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export function hm(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${m ? pad(m) : ''}` : `${m}m`;
}

export function hms(sec) {
  const s = Math.round(Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

export function shortDate(dateStr) {
  const d = parseYmd(dateStr);
  return `${MON[d.getMonth()]} ${d.getDate()}`;
}

export function longDate(dateStr) {
  const d = parseYmd(dateStr);
  return `${DOW[(d.getDay() + 6) % 7]}, ${MON[d.getMonth()]} ${d.getDate()}`;
}

/** Stored timestamps are ISO/UTC; show the day the viewer was actually in. */
export function localDay(iso) {
  const d = new Date(iso);
  return isFinite(d) ? ymd(d) : String(iso || '').slice(0, 10);
}

export const FEEL = { 1: 'rough', 2: 'flat', 3: 'fine', 4: 'good', 5: 'great' };

// --- toast -----------------------------------------------------------------
let toastTimer = null;
export function toast(message, isError = false) {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = `toast${isError ? ' err' : ''}`;
  node.textContent = message;
  node.setAttribute('role', 'status');
  document.body.appendChild(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), isError ? 8000 : 3800);
}

// --- sheet -----------------------------------------------------------------
let sheetPrev = null;

/** Open the modal sheet. A fresh inner node each time, so listeners never accumulate. */
export function openSheet(html, afterOpen) {
  sheetPrev = document.activeElement;
  $('sheetIn')?.remove();
  const inner = document.createElement('div');
  inner.className = 'sheet-in';
  inner.id = 'sheetIn';
  inner.innerHTML = html;
  $('sheet').appendChild(inner);
  $('sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  afterOpen?.(inner);
  inner.querySelector('button, input, textarea, select')?.focus();
  return inner;
}

export function closeSheet() {
  $('sheet').hidden = true;
  $('sheetIn')?.remove();
  document.body.style.overflow = '';
  sheetPrev?.focus?.();
}

export const sheetOpen = () => !$('sheet').hidden;

export function initSheet() {
  $('sheet').addEventListener('click', (e) => {
    if (e.target === $('sheet')) closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetOpen()) closeSheet();
  });
}

// --- small building blocks -------------------------------------------------
export function chip(label, kind = '') {
  return `<span class="chip ${kind}">${esc(label)}</span>`;
}

export function pageHead({ eyebrow, title, note, actions }) {
  return '<header class="phead-main">'
    + `<div><p class="eyebrow">${esc(eyebrow || '')}</p><h1>${esc(title)}</h1>`
    + (note ? `<p class="phead-note">${note}</p>` : '')
    + '</div>'
    + (actions ? `<div class="phead-actions">${actions}</div>` : '')
    + '</header>';
}

export function empty(message, action = '') {
  return `<div class="emptystate"><p>${message}</p>${action}</div>`;
}

/** A labelled statistic. `big` is the number, `unit` its unit. */
export function stat(label, big, unit = '', extra = '') {
  return `<div class="stat"><b>${big}${unit ? ` <i>${esc(unit)}</i>` : ''}</b>`
    + `<span>${esc(label)}</span>${extra ? `<em>${extra}</em>` : ''}</div>`;
}

/** Violations from the guardrails, rendered as a block. */
export function violationList(violations, { title = 'Guardrails' } = {}) {
  if (!violations?.length) return '';
  const blocking = violations.some((v) => v.severity === 'block');
  return `<div class="guard ${blocking ? 'blocking' : ''}">`
    + `<b>${esc(title)}</b><ul>`
    + violations.map((v) => `<li><span class="gsev ${esc(v.severity)}">${esc(v.severity)}</span>`
      + `${esc(v.message)}</li>`).join('')
    + '</ul></div>';
}
