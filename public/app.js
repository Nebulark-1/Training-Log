// Volume Ledger — app shell and router.
//
// Real URLs, one module per page. The server serves index.html for every path,
// so /strength and /progress are bookmarkable and the back button works.
import { $, closeSheet, esc, initSheet, sheetOpen, toast } from './lib/ui.js';
import todayPage, { nudgeDay } from './pages/today.js';
import weekPage from './pages/week.js';
import strengthPage from './pages/strength.js';
import progressPage from './pages/progress.js';
import injuriesPage from './pages/injuries.js';
import planPage from './pages/plan.js';
import coachPage from './pages/coach.js';
import logPage from './pages/log.js';
import settingsPage from './pages/settings.js';

const PAGES = [todayPage, weekPage, strengthPage, progressPage, injuriesPage, planPage,
  coachPage, logPage, settingsPage];
const BY_PATH = new Map(PAGES.map((p) => [p.path, p]));

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
  return p === '/' ? '/today' : p;
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

function renderChrome() {
  const path = currentPath();
  $('nav').innerHTML = PAGES
    .filter((p) => !p.hidden)
    .map((p) => `<a href="${p.path}" data-link${p.path === path ? ' class="on" aria-current="page"' : ''}>${esc(p.label)}</a>`)
    .join('');

  const d = state.data;
  const user = d?.user;
  $('who').innerHTML = user
    ? (user.picture ? `<img src="${esc(user.picture)}" alt="">` : '')
      + `<span>${esc(user.name || user.email || 'Signed in')}</span>`
    : '';

  const sync = d?.sync;
  const connected = d?.connections?.strava?.connected;
  const bar = $('syncbar');
  if (!d) {
    bar.innerHTML = '';
  } else if (!connected) {
    bar.className = 'syncbar stale';
    bar.innerHTML = '<a href="/settings" data-link>Connect Strava</a>';
  } else if (sync?.newest) {
    const age = Math.round((Date.now() - Date.parse(`${sync.newest}T12:00:00`)) / 86400000);
    bar.className = `syncbar${age > 3 ? ' stale' : ''}`;
    bar.innerHTML = `<button id="syncTop" class="link">Sync</button>`
      + `<span>newest ${esc(sync.newest)}</span>`;
  } else {
    bar.className = 'syncbar stale';
    bar.innerHTML = '<button id="syncTop" class="link">Run first sync</button>';
  }
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
    document.title = 'Not found — Volume Ledger';
    view.innerHTML = '<div class="emptystate"><p>No such page. '
      + '<a href="/today" data-link>Back to today</a></p></div>';
    return;
  }
  if (!state.data) {
    view.innerHTML = '<div class="emptystate"><p>Loading your ledger…</p></div>';
    return;
  }

  document.title = `${page.label} — Volume Ledger`;
  state.page = page;
  view.innerHTML = page.render(ctx);
  page.mount?.(ctx, view);
}

// --- global events ---------------------------------------------------------
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (!t || typeof t.closest !== 'function') return;

  const link = t.closest('a[data-link]');
  if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && link.target !== '_blank') {
    e.preventDefault();
    go(link.getAttribute('href'));
    return;
  }
  if (t.closest('[data-close]')) { closeSheet(); return; }

  if (t.id === 'syncTop') { runSync(false); return; }
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
  if (currentPath() !== '/today') return;
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
 * Run a slow call with an elapsed timer and a Stop button, reported in the
 * page's own status slot when it has one.
 */
export async function work(label, fn, { statusId = 'workStatus' } = {}) {
  if (state.busy) return undefined;
  state.busy = true;
  const status = $(statusId);
  const started = Date.now();
  const controller = new AbortController();
  let tick = null;

  if (status) {
    status.hidden = false;
    status.className = 'thinking';
    status.innerHTML = `<span class="working">${esc(label)}…</span>`;
    tick = setInterval(() => {
      const s = Math.round((Date.now() - started) / 1000);
      status.innerHTML = `<span class="working">${esc(label)} — <span class="elapsed">${s}s</span></span>`
        + ' <button class="link" id="stopWork">Stop</button>';
    }, 250);
    status.addEventListener('click', (e) => {
      if (e.target.id === 'stopWork') controller.abort();
    }, { once: false });
  }
  document.querySelectorAll('button:not([data-close])').forEach((b) => { b.dataset.wasEnabled = b.disabled ? '' : '1'; b.disabled = true; });

  try {
    const out = await fn(controller.signal);
    if (status) { status.textContent = ''; status.hidden = true; }
    return out;
  } catch (err) {
    if (err.name === 'AbortError') {
      if (status) status.hidden = true;
      toast('Stopped.');
      return undefined;
    }
    if (status) {
      status.hidden = false;
      status.className = 'thinking err';
      status.textContent = err.message;
    }
    toast(err.message, true);
    return { error: err };
  } finally {
    if (tick) clearInterval(tick);
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
  ));
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
  if (a.google) actions.push('<a href="/auth/google/start"><button class="solid">Sign in with Google</button></a>');
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
  }[params.get('auth')];
  $('gateNote').innerHTML = authError ? `<span style="color:var(--flag)">${esc(authError)}</span>` : '';
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
  if (params.get('strava') || params.get('auth')) {
    window.history.replaceState({}, '', currentPath());
  }
}

(async function boot() {
  initSheet();
  try {
    state.auth = await api('/auth/status');
  } catch {
    document.body.innerHTML = '<div class="shell"><div class="gate"><h1>Volume Ledger</h1>'
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
