# Volume Ledger

A training log that runs on your own machine. It pulls your real data from
Strava, shows what to do each day, takes your notes after every session, and
asks Claude to plan each week toward a goal you set — currently 75 running
miles a week, with bike and swim volume held alongside it.

```bash
npm install
npm start          # http://localhost:4317
```

Nothing in `.env` is required to boot. With no configuration you get the local
account, the seeded plan, and manual logging; Strava and Claude switch on as you
add credentials.

## How it fits together

```
                     ┌─────────────────────────────┐
  Google OAuth ────▶ │  localhost:4317  (Express)  │
  Strava OAuth ────▶ │                             │ ──▶ SQLite (data/ledger.db)
  Anthropic API ◀─── │  per-user tokens, encrypted │      every row keyed by user
                     └─────────────────────────────┘
                                   │
                          public/  browser app
```

Every table is keyed by `user_id`, so the same code serves one athlete on a
laptop or many signed-in accounts on a host. Provider tokens are encrypted at
rest with a key in `data/.app-secret` (generated on first run; set `APP_SECRET`
before running more than one instance).

| Path | What it is |
| --- | --- |
| `server/index.js` | Express app and the JSON API |
| `server/auth.js` | Google OAuth, sessions, the local dev account |
| `server/strava.js` | Strava OAuth, token refresh, sync and normalization |
| `server/coach.js` | Claude calls — context building and structured plans |
| `server/db.js` | SQLite schema and queries (`node:sqlite`, no native build) |
| `server/seed.js` | First-run seeding, re-based onto the current week |
| `public/` | The browser app (`app.js`, `app.css`, `lib/dates.js`) |
| `seed/` | The starting plan, from the original 12-month plan document |

`public/lib/dates.js` is imported by both the server and the browser, so ISO
week keys can never drift between them.

## Connecting Strava

1. Create an application at https://www.strava.com/settings/api.
   Set **Authorization Callback Domain** to `localhost`.
2. Put the credentials in `.env`:

   ```
   STRAVA_CLIENT_ID=12345
   STRAVA_CLIENT_SECRET=...
   ```

3. Restart, then **Setup → Connect Strava**. Approve the "view private
   activities" permission — without it the API hides your training.

Sync is a button, not a background job. It is incremental: each sync starts a
week before your newest stored activity, so edited and late-uploaded sessions
get picked up. **Full re-sync** reaches back 180 days.

Synced per session: distance, moving and elapsed time, pace (sec/mile, or per
100 yd for swims), elevation in feet, average and max heart rate, cadence, power
for rides, gear, the activity description, per-mile splits and laps for the last
28 days, and Strava's own long-run / workout / race labels.

**Lifting weights are the exception.** Strava records a weight session's
duration and heart rate but not what you lifted, so sets, reps and load are
entered in the app — open any lift session and the note sheet has a lift table.

## Connecting Claude

There is no OAuth flow for a Claude.ai subscription, so a web app cannot spend
your Claude plan. Coaching runs on the Anthropic API instead, and there are
three ways to pay for it:

| Option | Set up | Billed to |
| --- | --- | --- |
| An `ant auth login` profile on this machine | `ant auth login` | you, no key to manage |
| A server key | `ANTHROPIC_API_KEY` in `.env` | whoever runs the server |
| Each user's own key | **Setup → Your Anthropic API key** | that user |

The user's own key wins when present, then the server key, then an ambient
profile. User keys are stored encrypted and used only for that user's requests.
Set `ALLOW_USER_KEYS=0` to turn that off.

Requests use `claude-opus-5` with adaptive thinking, `effort: high`, structured
outputs validated against a schema before anything is stored, and server-side
refusal fallbacks (set `CLAUDE_FALLBACKS=0` to disable). Every call is recorded
in the `coach_runs` table with model, token usage and duration.

## Google sign-in

Optional, and only needed for more than one person.

1. Google Cloud console → APIs & Services → Credentials → **OAuth client ID**
   (Web application).
2. Authorized redirect URI: `http://localhost:4317/auth/google/callback`
3. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` and restart.

With those set the local account is disabled and the sign-in page offers Google.
The local account only works when `NODE_ENV` is not `production`, Google is not
configured, and the server is bound to a loopback address.

## Using it

**Every session** — the day's prescription sits at the top. Once Strava has the
activity, "How did it feel?" opens a note: RPE, how the body felt, knee pain
0–10 and where, plus free text. Those notes are what make the coaching worth
anything; the numbers alone can't tell a good week from a barely-survived one.

**Every Monday** — write the digest in the Coach section and send it. Claude
reads the week's plan against what you actually did, every session note, and the
digest, then returns a verdict (push / hold / back off), what it noticed in the
numbers, specific adjustments, and the coming week planned day by day.

**When the goal changes** — edit it in Setup, then **Rebuild from my history**.
Claude sets the timeline and the phases from the volume your recent weeks
actually show, rather than from an assumption about where you should be.

The coach works under fixed rules: volume rises at most ~10% or 5 miles a week,
every fourth week deloads, at most two hard running days and never back to back,
and any of the knee red flags (gait change, pain rising during a run,
next-morning swelling, pain at rest, anything above 3/10) drops volume back and
refers you out rather than programming through it. A week that felt great is
treated as a reason to hold the progression, not to exceed it.

## If you open this up to other people

Three things that are not code problems:

- **Strava's rate limits are per application, not per user** — about 200
  requests every 15 minutes and 2,000 a day by default. A handful of users is
  fine; past that you need an increased-quota request from Strava, and syncs
  need queueing. The Setup panel shows current usage after each sync.
- **Strava's API agreement** governs what you may store, display and share, and
  it restricts building products that replicate Strava. Read it before charging
  anyone.
- **Inference costs money.** Per-user keys ("bring your own key") is the setting
  that makes this sustainable — it is already built, and on by default.

Also worth knowing: auto-sync via Strava webhooks needs a public HTTPS endpoint,
which localhost is not. That is why sync is a button here. Behind a real domain,
add the webhook subscription and the same `syncUser()` runs on a push.

## Data

Everything lives in `data/ledger.db`. **Export everything** in Setup downloads
the whole log — plan, sessions, notes, digests — as JSON. Deleting `data/` resets
the app; the seeded plan comes back on the next sign-in.
