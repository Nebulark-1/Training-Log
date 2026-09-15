// Chaos Coaching — app shell and router.
//
// Real URLs, one module per page. The server serves index.html for every path,
// so /strength and /progress are bookmarkable and the back button works.
import { $, closeSheet, esc, initSheet, sheetOpen, toast } from './lib/ui.js';
import trainingPage, { nudgeDay } from './pages/training.js';
import planPage from './pages/plan.js';
import logPage from './pages/log.js';
import strengthPage from './pages/strength.js';
import progressPage from './pages/progress.js';
import injuriesPage from './pages/injuries.js';
import settingsPage from './pages/settings.js';

export const BRAND = 'Chaos Coaching';

/**
 * The top bar, in order. A group is a menu: one label, several pages beneath
 * it, lit when any of them is open.
 */
const NAV = [
  trainingPage,
  planPage,
  logPage,
  { label: 'Analysis', pages: [strengthPage, progressPage, injuriesPage] },
];
const PAGES = [trainingPage, planPage, logPage, strengthPage, progressPage, injuriesPage, settingsPage];
const BY_PATH = new Map(PAGES.map((p) => [p.path, p]));

/** Old addresses still land somewhere. */
const ALIASES = { '/': '/training', '/today': '/training', '/week': '/training', '/coach': '/plan' };

const state = {
  auth: null,
  data: null,
  fitness: null,
  page: null,
  busy: false,
};

// --- api -------------------------------------------------------------------
async function api(path, { method = 'GET', body, signal } = {}) {
  const resp = await fetch(path, {
    method,
    signal,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!resp.ok) {
    const err = new Error(json?.message || json?.error || `Request failed (${resp.status})`);
    err.status = resp.status;
    err.code = json?.error;
    err.payload = json;
    throw err;
  }
  return json;
}

/** Reload the core payload and re-render the current page. */
async function refresh({ fitness = false } = {}) {
  const [data, fit] = await Promise.all([
    api('/api/data?weeks=20'),
    fitness || state.fitness ? api('/api/fitness').catch(() => state.fitness) : Promise.resolve(state.fitness),
  ]);
  state.data = data;
  state.fitness = fit;
  // The injuries page reads its own full-history endpoint; a new pain entry
  // invalidates it.
  window.__vlInjuries = null;
  render();
}

/** Load the derived fitness layer on demand; it costs a full-history pass. */
async function loadFitness() {
  state.fitness = await api('/api/fitness');
  render();
  return state.fitness;
}

// --- routing ---------------------------------------------------------------
function currentPath() {
  const p = window.location.pathname.replace(/\/+$/, '') || '/';
  return ALIASES[p] || p;
}

function go(path, { replace = false } = {}) {
  if (path === currentPath()) return;
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

const ctx = {
  get data() { return state.data; },
  get fitness() { return state.fitness; },
  api,
  refresh,
  loadFitness,
  go,
  toast,
  /** Re-draw the current page without refetching. */
  rerender: () => render(),
  /**
   * Mapped pain from the loaded window, so the body map can show where things
   * have hurt before while you are logging a new one.
   */
  get painHistory() {
    return Object.values(state.data?.feedback || {})
      .filter((f) => (f.pain ?? 0) > 0 && f.site?.x != null)
      .map((f) => ({ date: f.date, pain: f.pain, site: f.site }));
  },
};

let pending = false;
function render() {
  if (pending) return;
  pending = true;
  // A timeout, not requestAnimationFrame: rAF never fires in a hidden tab, so
  // a page loaded in the background would sit blank until focused.
  setTimeout(() => {
    pending = false;
    try {
      renderChrome();
      renderPage();
    } catch (err) {
      console.error('render', err);
      $('view').innerHTML = '<div class="emptystate"><p>Something went wrong drawing this page. '
        + 'The details are in the browser console.</p></div>';
    }
  });
}

const shortDay = (ymd) => {
  const d = new Date(`${ymd}T12:00:00`);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getDate()}`;
};

function renderChrome() {
  const path = currentPath();
  const link = (p, extra = '') => `<a href="${p.path}" data-link${p.path === path ? ' class="on" aria-current="page"' : ''}${extra}>${esc(p.label)}</a>`;
  $('nav').innerHTML = NAV.map((item) => {
    if (!item.pages) return link(item);
    const open = item.pages.some((p) => p.path === path);
    const current = item.pages.find((p) => p.path === path);
    return `<div class="menu${open ? ' on' : ''}" data-menu>`
      + `<button type="button" class="menu-btn" aria-haspopup="true" aria-expanded="false">`
      + `${esc(item.label)}${current ? `<s>${esc(current.label)}</s>` : ''}<i></i></button>`
      + `<div class="menu-list" hidden>${item.pages.map((p) => link(p)).join('')}</div>`
      + '</div>';
  }).join('');

  const d = state.data;
  const user = d?.user;
  const name = user?.name || user?.email || 'Athlete';
  $('who').innerHTML = user
    ? '<div class="menu" data-menu>'
      + `<button type="button" class="menu-btn who-btn" aria-haspopup="true" aria-expanded="false" aria-label="${esc(name)}" title="${esc(name)}">`
      + (user.picture ? `<img src="${esc(user.picture)}" alt="">` : `<b>${esc(name.trim().charAt(0).toUpperCase() || 'A')}</b>`)
      + '</button>'
      + '<div class="menu-list right" hidden>'
      + `<a href="/settings" data-link${path === '/settings' ? ' class="on"' : ''}>Settings</a>`
      + '<a href="/api/export">Export</a>'
      + '<button type="button" class="menu-item" id="signOutTop">Sign out</button>'
      + '</div></div>'
    : '';

  const sync = d?.sync;
  const connected = d?.connections?.strava?.connected;
  const bar = $('syncbar');
  if (!d) {
    bar.innerHTML = '';
  } else if (!connected) {
    bar.innerHTML = '<a class="sync stale" href="/settings" data-link><b>Connect Strava</b></a>';
  } else if (sync?.newest) {
    const age = Math.round((Date.now() - Date.parse(`${sync.newest}T12:00:00`)) / 86400000);
    bar.innerHTML = `<button type="button" id="syncTop" class="sync${age > 3 ? ' stale' : ''}" title="Sync Strava">`
      + `<b>Sync</b><span>${esc(shortDay(sync.newest))}</span></button>`;
  } else {
    bar.innerHTML = '<button type="button" id="syncTop" class="sync stale"><b>Sync</b><span>first time</span></button>';
  }
}

/** Menus close on any click outside them, on Escape, and on navigation. */
function closeMenus(except = null) {
  document.querySelectorAll('[data-menu]').forEach((m) => {
    if (m === except) return;
    m.querySelector('.menu-list').hidden = true;
    m.querySelector('.menu-btn').setAttribute('aria-expanded', 'false');
  });
}

function renderPage() {
  const path = currentPath();
  const page = BY_PATH.get(path);

  // A fresh container each render. Pages attach listeners in mount(), and a
  // reused element would collect one set per render — every click then firing
  // as many times as the page had been drawn.
  const previous = $('view');
  const view = document.createElement('main');
  view.id = 'view';
  view.className = 'view';
  previous.replaceWith(view);

  if (!page) {
    document.title = `Not found — ${BRAND}`;
    view.innerHTML = '<div class="emptystate"><p>No such page. '
      + '<a href="/training" data-link>Back to training</a></p></div>';
    return;
  }
  if (!state.data) {
    view.innerHTML = '<div class="emptystate"><p>Loading…</p></div>';
    return;
  }

  document.title = `${page.label} — ${BRAND}`;
  state.page = page;
  view.innerHTML = page.render(ctx);
  page.mount?.(ctx, view);
}

// --- global events ---------------------------------------------------------
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (!t || typeof t.closest !== 'function') return;

  const menuBtn = t.closest('.menu-btn');
  if (menuBtn) {
    const menu = menuBtn.closest('[data-menu]');
    const list = menu.querySelector('.menu-list');
    const opening = list.hidden;
    closeMenus(menu);
    list.hidden = !opening;
    menuBtn.setAttribute('aria-expanded', String(opening));
    return;
  }
  if (!t.closest('[data-menu]')) closeMenus();

  const link = t.closest('a[data-link]');
  if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && link.target !== '_blank') {
    e.preventDefault();
    closeMenus();
    go(link.getAttribute('href'));
    return;
  }
  if (t.closest('[data-close]')) { closeSheet(); return; }

  if (t.closest('#syncTop')) { runSync(false); return; }
  if (t.id === 'signOutTop') {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* signing out anyway */ }
    window.location.reload();
    return;
  }
  if (t.id === 'devLogin') {
    try {
      await api('/auth/dev', { method: 'POST' });
      window.location.reload();
    } catch (err) { toast(err.message, true); }
  }
});

window.addEventListener('popstate', render);

// Left/right move the day on the Today page. Ignored while typing, while a
// sheet is open, or with modifiers held, so they never fight a field or the
// browser's own shortcuts.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeMenus(); return; }
  if (currentPath() !== '/training') return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  if (!state.data || sheetOpen()) return;
  const focused = document.activeElement;
  if (focused && (focused.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused.tagName))) return;
  e.preventDefault();
  nudgeDay(e.key === 'ArrowLeft' ? -1 : 1);
  render();
});

// --- shared long-running work ---------------------------------------------
/**
 * What the coach is doing while you wait, per kind of call.
 *
 * A model call takes half a minute to a minute, and nothing on screen for that
 * long reads as broken. These lines rotate through the panel so the wait has a
 * shape: what is being read, what is being weighed, what is being written.
 * They are honest about the order things happen in without pretending to
 * know progress that the request does not report.
 */
const PHASES = {
  'plan-week': [
    'Reading the last few weeks of training',
    'Checking what was planned against what happened',
    'Reading your notes and where it has hurt',
    'Weighing the volume step against the guardrails',
    'Laying out the seven days',
    'Writing the note',
  ],
  review: [
    'Reading your digest',
    'Comparing it with the numbers from the week',
    'Deciding whether next week pushes or holds',
    'Writing the review',
    'Planning next week from it',
  ],
  'build-plan': [
    'Reading your whole history',
    'Finding the volumes you have actually held',
    'Working out the phases between here and the goal',
    'Setting week-by-week targets',
    'Writing the rationale',
  ],
  'program-review': [
    'Reading every logged lift',
    'Checking which movements are progressing and which have stalled',
    'Ruling on anything you did off program',
    'Deciding what, if anything, to change',
  ],
  assess: [
    'Reading the log',
    'Measuring the ramp against the one you have held before',
    'Checking whether planned weeks are happening',
    'Reading the strength trend and where it has hurt',
    'Weighing it all against the goal',
    'Writing the assessment',
  ],
  sync: [
    'Asking Strava for new activities',
    'Pulling splits and heart rate',
    'Filing everything by week',
  ],
};

/**
 * Run a slow call with a visible sense of what is happening: a pulsing mark,
 * the current phase, the time elapsed, and a way to stop. Reported in the
 * page's own status slot when it has one; otherwise in a bar at the bottom.
 */
export async function work(label, fn, { statusId = 'workStatus', kind = null } = {}) {
  if (state.busy) return undefined;
  state.busy = true;
  const started = Date.now();
  const controller = new AbortController();
  const phases = PHASES[kind] || [label];
  let tick = null;

  let status = $(statusId);
  let floating = false;
  if (!status) {
    status = document.createElement('div');
    status.id = 'workFloat';
    document.body.appendChild(status);
    floating = true;
  }

  const draw = () => {
    const s = Math.round((Date.now() - started) / 1000);
    // Phases advance on a curve that slows down, so the last one does not
    // arrive long before the answer does.
    const idx = Math.min(phases.length - 1, Math.floor(Math.log1p(s / 6) * 2.2));
    status.innerHTML = '<div class="workpanel">'
      + '<span class="pulse"></span>'
      + `<div class="wp-text"><b>${esc(label)}</b><span>${esc(phases[idx])}…</span></div>`
      + `<span class="elapsed">${s}s</span>`
      + '<button type="button" class="link" id="stopWork">Stop</button>'
      + '</div>';
  };

  status.hidden = false;
  status.className = `thinking${floating ? ' floating' : ''}`;
  draw();
  tick = setInterval(draw, 1000);
  const onStop = (e) => { if (e.target.id === 'stopWork') controller.abort(); };
  status.addEventListener('click', onStop);

  document.querySelectorAll('button:not([data-close]):not(#stopWork)').forEach((b) => {
    b.dataset.wasEnabled = b.disabled ? '' : '1';
    b.disabled = true;
  });

  try {
    const out = await fn(controller.signal);
    status.textContent = '';
    status.hidden = true;
    return out;
  } catch (err) {
    if (err.name === 'AbortError') {
      status.hidden = true;
      toast('Stopped.');
      return undefined;
    }
    status.hidden = false;
    status.className = `thinking err${floating ? ' floating' : ''}`;
    status.textContent = err.message;
    toast(err.message, true);
    return { error: err };
  } finally {
    if (tick) clearInterval(tick);
    status.removeEventListener('click', onStop);
    if (floating) setTimeout(() => status.remove(), status.classList.contains('err') ? 6000 : 0);
    state.busy = false;
    document.querySelectorAll('button').forEach((b) => {
      if (b.dataset.wasEnabled === '1') b.disabled = false;
      delete b.dataset.wasEnabled;
    });
  }
}

export async function runSync(full = false) {
  const out = await work(full ? 'Re-syncing everything from Strava' : 'Syncing Strava', (signal) => (
    api('/api/strava/sync', { method: 'POST', body: { full }, signal })
  ), { kind: 'sync' });
  if (out && !out.error) {
    state.fitness = null;
    await refresh();
    const s = out.sync;
    toast(`${s.fetched} sessions checked, ${s.withDetail} with splits. Newest ${s.newest || '—'}.`);
  }
}

export { api, refresh, go, state };

// --- boot ------------------------------------------------------------------
function renderGate() {
  const a = state.auth || {};
  const actions = [];
  if (a.google) {
    // Both go through Google: an account is created on first sign-in. Two
    // buttons because a new person and a returning one are looking for
    // different words, not because the flows differ.
    actions.push('<a href="/auth/google/start?intent=signup"><button class="solid">Create an account</button></a>');
    actions.push('<a href="/auth/google/start?intent=signin"><button>Sign in</button></a>');
  }
  if (a.devLogin) actions.push(`<button ${a.google ? '' : 'class="solid"'} id="devLogin">Use the local account</button>`);
  if (!actions.length) {
    actions.push('<span class="thinking err">Sign-in is not set up yet.</span>');
  }
  $('gateActions').innerHTML = actions.join('');

  const params = new URLSearchParams(window.location.search);
  const authError = {
    denied: 'Sign-in was cancelled.',
    badstate: 'That sign-in link expired. Try again.',
    failed: 'Sign-in failed. Try again.',
    unverified: 'That Google account has no verified email address.',
    closed: 'Chaos Coaching is invitation-only for now. That address is not on the list yet.',
  }[params.get('auth')];
  $('gateNote').innerHTML = authError
    ? `<span style="color:var(--flag)">${esc(authError)}</span>`
    : (a.google ? 'A Google account is all you need.' : '');
}

function announceConnections() {
  const params = new URLSearchParams(window.location.search);
  const msg = {
    connected: ['Strava connected. Sync to pull your history.', false],
    denied: ['Strava authorization was cancelled.', true],
    scope: ['Strava needs the "view private activities" permission. Connect again and allow it.', true],
    badstate: ['That Strava link expired. Try connecting again.', true],
    failed: ['Connecting Strava failed. Try again.', true],
  }[params.get('strava')];
  if (msg) toast(msg[0], msg[1]);
  if (params.get('welcome')) toast('Welcome. Connect Strava in Settings to bring your history in.');
  if (params.get('strava') || params.get('auth') || params.get('welcome')) {
    window.history.replaceState({}, '', currentPath());
  }
}

(async function boot() {
  initSheet();
  try {
    state.auth = await api('/auth/status');
  } catch {
    document.body.innerHTML = `<div class="shell"><div class="gate"><h1>${BRAND}</h1>`
      + '<p>Can\'t connect right now. Try again in a moment.</p></div></div>';
    return;
  }

  if (!state.auth.signedIn) {
    $('gate').hidden = false;
    renderGate();
    return;
  }

  $('shell').hidden = false;
  try {
    await refresh();
    announceConnections();
  } catch (err) {
    toast(err.message, true);
  }
})();
