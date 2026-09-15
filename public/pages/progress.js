// Progress — accumulation over time, and what the derived numbers are made of.
import { lineChart, plannedVsActual, scoreMeter, stackedLoad } from '../components/charts.js';
import { SPORTS, ENDURANCE_SPORTS, formatVolume, sportKey } from '../lib/sports.js';
import { weekLabel } from '../lib/dates.js';
import {
  coachBlock, esc, n0, n1, needsClaude, pageHead, shortDate, signed, stat,
} from '../lib/ui.js';

let sport = 'run';

function cumulative(weekly, key) {
  let acc = 0;
  const actual = [];
  let tacc = 0;
  const target = [];
  for (const w of weekly) {
    acc += w.actual?.[key] || 0;
    actual.push({ x: weekLabel(w.week), y: acc });
    tacc += w.target?.[key] || w.actual?.[key] || 0;
    target.push({ x: weekLabel(w.week), y: tacc });
  }
  return { actual, target };
}

function scoreDetail(title, score, rows) {
  if (!score) return '';
  return '<details class="scorecard"><summary>'
    + `<b>${score.score ?? '—'}</b> ${esc(title)} <span>${esc(score.basis || '')}</span></summary>`
    + '<div class="tablewrap"><table class="kvtable"><tbody>'
    + rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${v}</td></tr>`).join('')
    + '</tbody></table></div></details>';
}


const WEIGHT_MARK = { major: '\u25CF\u25CF\u25CF', moderate: '\u25CF\u25CF', minor: '\u25CF' };

/**
 * The coach's read on the goal. This is the confidence the app means — the
 * arithmetic one is kept further down the page, labelled as what it is.
 */
function assessmentBlock(f, claudeOn) {
  const a = f.assessment;
  const button = (label, solid) => (claudeOn
    ? `<button${solid ? ' class="solid"' : ''} id="assessGoal"${f.primaryGoalId ? '' : ' disabled'}>${label}</button>`
    : needsClaude(label));
  if (!a) {
    return '<div class="emptystate"><p>The goal has not been assessed yet.</p>'
      + `<div class="btnrow">${button('Assess the goal', true)}`
      + '<span class="thinking" id="assessStatus"></span></div></div>';
  }

  const supports = a.drivers.filter((d) => d.direction === 'supports');
  const threatens = a.drivers.filter((d) => d.direction === 'threatens');
  const column = (title, list, cls) => (list.length
    ? `<div class="drv ${cls}"><h4>${title}</h4><ul>`
      + list.map((d) => `<li><b>${esc(d.factor)}</b> <s>${WEIGHT_MARK[d.weight] || ''}</s>`
        + `<span>${esc(d.note)}</span></li>`).join('')
      + '</ul></div>'
    : '');

  return coachBlock({
    title: 'On the goal',
    when: `${shortDate(a.asOf)} · ${a.evidenceQuality} evidence`,
    cls: 'assessment',
    extra: `<p class="as-head">${esc(a.headline)}</p>`
      + `<p class="as-limiter"><i>Limiter</i> ${esc(a.limiter)}</p>`
      + `<div class="drivers">${column('For', supports, 'up')}${column('Against', threatens, 'down')}</div>`
      + `<p class="as-reason">${esc(a.reasoning)}</p>`
      + '<div class="grid2 as-moves">'
      + `<div><i>Would raise it</i><p>${esc(a.wouldRaiseIt)}</p></div>`
      + `<div><i>Would lower it</i><p>${esc(a.wouldLowerIt)}</p></div></div>`
      + `<div class="btnrow">${button('Reassess', false)}`
      + '<span class="thinking" id="assessStatus"></span></div>',
  });
}

export default {
  path: '/progress',
  label: 'Progress',

  render(ctx) {
    const f = ctx.fitness;
    if (!f) {
      return pageHead({ eyebrow: 'Scores', title: 'Progress' })
        + '<div class="emptystate"><p>Loading…</p></div>';
    }

    const weekly = f.weekly || [];
    const key = sportKey(sport);
    const info = SPORTS[key];
    const rows = weekly.map((w) => ({
      label: weekLabel(w.week),
      actual: w.actual?.[key] || 0,
      target: w.target?.[key] || 0,
      deload: w.deload,
      now: w.week === ctx.data.week,
    }));
    const cum = cumulative(weekly, key);

    const loadRows = weekly.map((w) => ({
      label: weekLabel(w.week),
      now: w.week === ctx.data.week,
      values: Object.fromEntries(ENDURANCE_SPORTS.concat(['lift']).map((s) => {
        const v = w.actual?.[s] || 0;
        // Convert each sport to comparable minutes-of-load for the stack.
        const mins = SPORTS[s].metric === 'duration' ? v
          : s === 'swim' ? v / 60
            : s === 'lift' ? v * 45
              : v * 9;
        return [s, mins * (SPORTS[s].loadFactor ?? 0.5)];
      })),
    }));

    const primary = (ctx.data.goals || []).find((g) => g.primary);
    const goalLine = primary && primary.sport === key && /^weekly/.test(primary.metric)
      ? Number(primary.target) : null;

    const ratio = f.latest?.ratio;
    const ratioSeries = (f.rollingSeries || []).map((r) => ({ x: r.date.slice(5), y: r.acute7 }));
    const chronicSeries = (f.rollingSeries || []).map((r) => ({ x: r.date.slice(5), y: r.chronic28 }));

    const sportTabs = ENDURANCE_SPORTS
      .filter((s) => weekly.some((w) => w.actual?.[s]))
      .map((s) => `<button class="tab${s === key ? ' on' : ''}" data-sport="${s}">${esc(SPORTS[s].label)}</button>`)
      .join('');

    return pageHead({ eyebrow: 'Scores', title: 'Progress' })
      + '<div class="scores wide">'
      + scoreMeter(f.endurance?.score, { label: 'Endurance', color: 'var(--bike)', caption: 'accumulated aerobic work' })
      + scoreMeter(f.speed?.score, { label: 'Speed', color: 'var(--run)', caption: 'quality of that work' })
      + scoreMeter(f.assessment?.confidence, {
        label: 'Goal confidence',
        color: 'var(--swim)',
        caption: f.assessment ? `${f.assessment.evidenceQuality} evidence` : 'not assessed',
      })
      + '</div>'
      + assessmentBlock(f, Boolean(ctx.data.claude?.available))

      + '<section class="chartblock">'
      + `<div class="cb-head"><h2>Weekly ${esc(info.label.toLowerCase())} volume</h2>`
      + `<div class="tabs">${sportTabs}</div></div>`
      + '<div class="chartwrap">'
      + plannedVsActual(rows, {
        goal: goalLine,
        color: info.color,
        unit: info.unit,
        fmt: info.metric === 'duration' ? n0 : n1,
      })
      + '</div>'
      + '<p class="legend"><span><i style="background:' + info.color + '"></i>actual</span>'
      + `<span><i style="border:1px solid ${info.color}"></i>planned</span>`
      + (goalLine ? `<span><i style="border-top:2px dashed ${info.color};height:0;align-self:center"></i>goal</span>` : '')
      + '</p></section>'

      + '<section class="chartblock">'
      + `<div class="cb-head"><h2>Accumulation</h2><span class="cb-note">${esc(info.label)} total, season to date</span></div>`
      + `<div class="chartwrap">${lineChart(cum.actual, {
        color: info.color,
        second: cum.target,
        secondColor: 'var(--mut)',
        unit: ` ${info.unit}`,
        fmt: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : n0(v)),
      })}</div>`
      + '<p class="legend"><span><i style="background:' + info.color + '"></i>done</span>'
      + '<span><i style="border-top:2px dashed var(--mut);height:0;align-self:center"></i>if you had hit every target</span></p>'
      + '</section>'

      + '<section class="chartblock">'
      + '<div class="cb-head"><h2>Total load, all sports</h2>'
      + '<span class="cb-note">minutes weighted by impact, so a swim hour is not a run hour</span></div>'
      + `<div class="chartwrap">${stackedLoad(loadRows, ENDURANCE_SPORTS.concat(['lift']).map((s) => ({
        key: s, label: SPORTS[s].label, color: SPORTS[s].color,
      })))}</div>`
      + '<p class="legend">'
      + ENDURANCE_SPORTS.concat(['lift']).map((s) => `<span><i style="background:${SPORTS[s].color}"></i>${esc(SPORTS[s].label)}</span>`).join('')
      + '</p></section>'

      + '<section class="chartblock">'
      + '<div class="cb-head"><h2>Acute and chronic load</h2>'
      + `<span class="cb-note">7-day against 28-day${ratio ? `, currently ${ratio.toFixed(2)}` : ''}</span></div>`
      + `<div class="chartwrap">${lineChart(ratioSeries, {
        color: 'var(--run)', second: chronicSeries, secondColor: 'var(--swim)', area: false, height: 220,
      })}</div>`
      + '<p class="legend"><span><i style="background:var(--run)"></i>7-day</span>'
      + '<span><i style="border-top:2px dashed var(--swim);height:0;align-self:center"></i>28-day</span></p>'
      + '<p class="help">Reported because it is worth seeing, not as a verdict. The research linking '
      + 'acute:chronic ratios to injury is genuinely contested, so treat a spike as a prompt to think, '
      + 'not as a diagnosis.</p>'
      + '</section>'

      + '<div class="stats">'
      + stat('4-week average', n1((f.weekly.slice(-4).reduce((n, w) => n + (w.actual?.[key] || 0), 0)) / 4), info.unit)
      + stat('chronic load', n0(f.latest?.chronic28 || 0), '/day')
      + stat('monotony', (f.latest?.monotony || 0).toFixed(2), '', 'evenness of the last 7 days')
      + stat('active days, 28', String((f.daily || []).slice(-28).filter((d) => d.load > 0).length), '/28')
      + '</div>'

      + '<h2 class="sub-h">What the numbers are made of</h2>'
      + scoreDetail('Endurance', f.endurance,
        Object.entries(f.endurance?.inputs || {}).map(([k, v]) => [k, esc(String(v))]))
      + scoreDetail('Speed', f.speed,
        Object.entries(f.speed?.inputs || {}).map(([k, v]) => [k, esc(typeof v === 'object' ? JSON.stringify(v) : String(v))]));
  },

  async mount(ctx, root) {
    if (!ctx.fitness) {
      try { await ctx.loadFitness(); } catch (err) { ctx.toast(err.message, true); }
      return;
    }
    root.addEventListener('click', async (e) => {
      if (e.target.id === 'assessGoal') {
        const goalId = ctx.fitness?.primaryGoalId;
        if (!goalId) return;
        const { work } = await import('../app.js');
        const out = await work('Assessing the goal', (signal) => (
          ctx.api(`/api/goals/${encodeURIComponent(goalId)}/assess`, { method: 'POST', body: {}, signal })
        ), { statusId: 'assessStatus', kind: 'assess' });
        if (out && !out.error) await ctx.loadFitness();
        return;
      }
      const tab = e.target.closest('[data-sport]');
      if (!tab) return;
      sport = tab.getAttribute('data-sport');
      ctx.rerender();
    });
  },
};

export { signed };
