# Volume Ledger

A training log that pulls real data out of Strava, shows what to do each day, and
asks Claude to plan each week toward a stated goal — currently 75 running miles a
week, with bike and swim volume held alongside it.

**The tracker:** https://claude.ai/code/artifact/70790b1b-8471-4c10-ac2b-3986c80df434

## How the pieces fit

A published Claude artifact can't make network calls to Strava — the sandbox blocks
everything except a few script CDNs. So the sync runs here, on your machine, and the
page imports the file it writes.

```
Strava API ──> sync/strava_sync.py ──> data/import.json ──> [Import] in the page ──> artifact database
                                                                                          │
                                        page reads plan + sessions + your feedback  <──────┘
                                                          │
                                                          └──> Claude (in the page) writes the next week back
```

Everything the page shows lives in the artifact's own database: the goal, the
macrocycle, each planned week, every session, your per-run notes, and the Monday
digests. Claude Code can read and write that same store, so plans can also be built
from a terminal session.

## One-time setup

1. **Create a Strava API application** at https://www.strava.com/settings/api.
   Name it anything. Set **Authorization Callback Domain** to `127.0.0.1` — the auth
   step catches the redirect locally, so this must match.

2. **Put the credentials in `sync/.env`** (copy `sync/.env.example`). This file is
   gitignored and never leaves your machine.

   ```
   STRAVA_CLIENT_ID=12345
   STRAVA_CLIENT_SECRET=your-secret
   ```

3. **Authorize once.** A browser window opens; approve, and the token is cached in
   `sync/.tokens.json` and refreshed automatically from then on.

   ```
   python sync/strava_sync.py auth
   ```

## Each sync

```
python sync/strava_sync.py pull
```

Pulls the last 180 days, and fetches per-mile splits, laps and HR for sessions in the
last 28 days. Then open the tracker, go to **Setup**, and import `data/import.json`.
Re-importing is cheap: only new or changed sessions are written.

Useful flags:

| flag | does |
| --- | --- |
| `--days 365` | pull further back |
| `--since 2026-01-01` | pull from a date |
| `--detail-days 45` | splits and laps for a wider recent window |
| `--detail-max 60` | raise the per-run cap on detail API calls |
| `--refresh` | ignore the cached activity detail |

`python sync/strava_sync.py status` shows credential, token and last-pull state.
Strava allows roughly 100 requests per 15 minutes; the detail cache in `data/cache/`
means a re-run only spends calls on genuinely new activities.

## What gets synced

Distance, moving and elapsed time, pace (sec/mile, or per 100 yd for swims), elevation
in feet, average and max heart rate, cadence, power for rides, gear, the activity
description, per-mile splits and laps, and Strava's own long-run / workout / race
labels.

**Lifting weights are the exception.** Strava records a weight session's duration and
heart rate but not what you actually lifted, so sets, reps and load are entered in the
page — open any lift session and the note sheet has a lift table.

## Using it

**Every session** — the day's prescription sits at the top. Once Strava has the
activity, "How did it feel?" opens a note: RPE, how the body felt, knee pain 0–10 and
where, plus free text. Those notes are what make the coaching worth anything; the
numbers alone can't tell a good week from a barely-survived one.

**Every Monday** — write the digest in the Coach section and send it. Claude reads the
week's plan against what you actually did, every session note, and the digest, then
returns a verdict (push / hold / back off), what it noticed in the numbers, specific
adjustments, and the coming week's plan written day by day.

**When the goal changes** — edit it in Setup, then **Rebuild from my history** in The
plan. Claude sets the timeline and the phases from the volume your recent weeks
actually show, rather than from an assumption about where you should be.

The coach works under fixed rules: volume rises at most ~10% or 5 miles a week,
every fourth week deloads, at most two hard running days and never back to back, and
any of the knee red flags (gait change, pain rising during a run, next-morning
swelling, pain at rest, anything above 3/10) drops volume back and refers you out
rather than programming through it. A week that felt great is treated as a reason to
hold the progression, not to exceed it.

## Layout

```
app/volume-ledger.html      the tracker (published as the artifact above)
sync/strava_sync.py         Strava OAuth + pull + normalize (standard library only)
sync/.env                   your Strava credentials — gitignored
sync/sync.cmd               double-click wrapper for a pull
seed/                       the starting plan, taken from the 12-month plan document
data/                       synced output and caches — gitignored
```

## Notes

- The seeded plan is the 52-week ramp from the original plan document, which assumes a
  start near 28 miles a week. It is a placeholder: sync, then rebuild the plan.
- The page keeps roughly the last 14 weeks in view. Older sessions stay in the database
  and are still exportable; the database caps at 5,000 documents, which is years of
  training.
- **Export as JSON** in the Log section downloads everything — plan, sessions, notes,
  digests — as a backup.
