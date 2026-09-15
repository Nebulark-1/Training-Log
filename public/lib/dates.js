// ISO week helpers, shared by the server and the browser (plain ESM, no DOM).
//
// Week keys look like "2026-W37" and sort lexicographically in chronological
// order, including across year boundaries, which is why they are used as ids.

export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const pad = (n) => (n < 10 ? '0' : '') + n;

/** Local-date YYYY-MM-DD. */
export function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYmd(s) {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** ISO-8601 week key for a Date, e.g. "2026-W37". */
export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${pad(week)}`;
}

/** The Monday of a week key, as a local Date. */
export function mondayOf(weekKey) {
  const [y, w] = String(weekKey).split('-W').map(Number);
  const jan4 = new Date(y, 0, 4);
  const shift = (jan4.getDay() || 7) - 1;
  return new Date(y, 0, 4 - shift + (w - 1) * 7);
}

export function weekAdd(weekKey, n) {
  const m = mondayOf(weekKey);
  m.setDate(m.getDate() + n * 7);
  return isoWeek(m);
}

export function weekLabel(weekKey) {
  const m = mondayOf(weekKey);
  return `${MON[m.getMonth()]} ${m.getDate()}`;
}

export function daysBetween(a, b) {
  return Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
}

/** The seven local dates of a week, Monday first. */
export function weekDates(weekKey) {
  const mon = mondayOf(weekKey);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(d.getDate() + i);
    return ymd(d);
  });
}

export const todayYmd = () => ymd(new Date());
export const thisWeek = () => isoWeek(new Date());

/**
 * Today's date in a named timezone, as YYYY-MM-DD. An unknown or empty zone
 * falls back to the machine's own. The browser reports its zone with the
 * request, so an athlete's day starts when their day starts.
 */
export function todayIn(tz, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return ymd(now);
  }
}
