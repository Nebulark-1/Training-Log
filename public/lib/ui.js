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

/**
 * The coach speaking.
 *
 * Every word inside this block came from the model, and the byline says so.
 * Nothing else in the app uses this block or talks in this register, so the
 * line between "the coach said" and "the app shows" is always visible.
 */
export function coachBlock({
  body = '', title = 'Coach', when = '', verdict = '', list = [], flags = [], extra = '', cls = '',
} = {}) {
  const paras = String(body || '').split(/\n\n+/).filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`).join('');
  return `<section class="coach${cls ? ` ${cls}` : ''}">`
    + `<div class="coach-by"><i></i><b>${esc(title)}</b>`
    + (verdict ? `<span class="chip ${/back|hold/i.test(verdict) ? 'miss' : 'done'}">${esc(verdict)}</span>` : '')
    + (when ? `<span>${esc(when)}</span>` : '')
    + '</div>'
    + (paras ? `<div class="coachtext">${paras}</div>` : '')
    + (list.length ? `<ul class="adj">${list.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '')
    + (flags.length
      ? `<div class="flagbox"><b>Watch</b><ul>${flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`
      : '')
    + extra
    + '</section>';
}

/** A button that needs the coach, shown when coaching is not available. */
export function needsClaude(label) {
  return `<button disabled title="Coaching is not available on this server yet">${esc(label)}</button>`;
}

/** One coach-written line, inline, wearing the same mark as the block. */
export const coachLine = (text) => (text
  ? `<span class="coach-line"><i></i>${esc(text)}</span>`
  : '');

/**
 * A sheet opened to read, not to change.
 *
 * Every control inside is disabled and the save row is hidden; an Edit button
 * in the head unlocks it. Logging something new opens editable; reviewing a
 * record opens locked, because a record should not change by being looked at.
 */
export function lockSheet(root, locked) {
  root.classList.toggle('locked', locked);
  root.querySelectorAll('input, textarea, select, button').forEach((el) => {
    if (el.matches('[data-close], #sheetEdit')) return;
    el.disabled = locked;
  });
  const edit = root.querySelector('#sheetEdit');
  if (edit) edit.hidden = !locked;
}

/** The head of a sheet, with Edit beside Close when it opens locked. */
export function sheetHead(title, sub, { readOnly = false } = {}) {
  return `<div class="sheet-head"><div><h3>${esc(title)}</h3>`
    + (sub ? `<p>${sub}</p>` : '')
    + '</div><div class="sheet-tools">'
    + (readOnly ? '<button type="button" id="sheetEdit">Edit</button>' : '')
    + '<button type="button" data-close="1">Close</button></div></div>';
}
