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
| `server/program.js` | The strength program: progression, prescriptions, off-program queue |
| `server/guardrails.js` | The training rules, enforced in code |
| `server/fitness.js` | Derived metrics and the endurance / speed / confidence scores |
| `server/db.js` | SQLite schema and queries (`node:sqlite`, no native build) |
| `server/cli.js` | `npm run coach` — the same loop without an API key |
| `public/app.js` | App shell and router |
| `public/pages/` | One module per page: today, week, strength, progress, injuries, plan, coach, log, settings |
| `public/components/` | Lift log, session sheets, charts |
| `public/lib/` | Shared with the server: dates, sports, movements, body zones, UI helpers |
| `pocketpt/` | The upstream body-map pen, kept with its MIT licence |
| `seed/` | The starting plan, from the original 12-month plan document |

`public/lib/` is imported by both sides, so ISO week keys, sport units and the
movement catalog can never drift between server and browser.

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
duration and heart rate but not what you lifted, so strength is logged in the
app. See the next section — it works differently from everything else.

## Strength: a program, not a weekly guess

Endurance work is planned week to week. Strength is not, because tendons adapt
over months and a program that churns its exercise list never loads anything
long enough to matter. So there are two separate mechanisms:

**The core program** (`/strength`) is a small, stable set of movements grouped
into sessions. Each movement has a pattern (hinge, single-leg, calf, trunk...),
a role (`core` or `trial`), a set and rep target, and a cue. A weekly plan does
not contain exercises at all — it assigns a *program session* to a day, and the
app resolves the movements from the program.

**Load progression is deterministic and needs no AI.** Hit every set at the
target reps at RPE 8 or below and the weight goes up next session: 10 lb on a
hinge or squat, 5 on a press or single-leg lift. Miss reps, or grind at RPE 9,
and it holds. A movement with no logged history is prescribed as a *calibration
set* — work up to the rep target and log what you used. Genuinely unloaded work
(isometrics, planks, band work) is marked bodyweight and progresses by time or
reps instead.

**Changing the movement list goes through a review**, and the guardrails are
deliberately tight:

| Limit | Value |
| --- | --- |
| Movements added per review | 2 |
| Core movements removed per review | 1, and never without a stated reason |
| Movements per session | 6 |
| Load jump | 15% warns, 30% is refused |
| Weeks before a core movement can be judged | 6 |

**Logging is per set.** Reps, weight and optional RPE for every set, prefilled
from the prescription so you are correcting numbers rather than typing a session
from scratch. That is what makes estimated 1RM, honest progression and the
strength trend possible — a single "3×5 @ 225" row cannot tell you the third set
only got three.

**Anything you log that is not in the program** — a farmer's carry you felt like
doing — is recorded as off-program and queued on the Strength page. At the next
review the coach rules on each one: promote it into the program, give it a trial
with a review date, or leave it out and say why. Doing something once is not a
reason to program it.

## Where it hurts

Pain is logged against a place on the body, not a sentence. When you record
pain above zero, a front-and-back figure appears; tap the spot and the app
works out the zone and — because the front view is a mirror — which side of
*your* body that is. It then offers the structures in that zone so you can be
specific: not "shin" but *tibialis anterior, upper third*, *medial tibial
border*, or *anterior compartment*. Muscles, tendons, bones, joints and nerves
are all listed, colour-keyed by kind, and there is a free-text box for anything
the list misses.

The click stores a **point**, not just a label. That is what makes `/injuries`
possible: a heat map of everywhere that has ever hurt, and a trouble-points
table that groups by side and structure so three entries on the same spot read
as a pattern rather than three separate bad days. It also means a zone can be
re-cut later without invalidating old entries.

Pain of zero shows no map at all — nothing to point at.

| Where | What |
| --- | --- |
| `public/lib/body.js` | Zones and their structures, defined over the silhouette's viewBox |
| `public/lib/silhouette.js` | The artwork (generated — see below) |
| `public/components/bodymap.js` | The picker and the heat map |
| `public/pages/injuries.js` | Heat map, trouble points, history |

The silhouette comes from the [PocketPT alpha
pen](https://codepen.io/Johny-Bravo-the-solid/pen/mdvRWbO) by Johny Bravo, MIT
licensed — the original is kept in `pocketpt/` with its licence. The pen's own
classes are muscle groups, which are coarser and less consistent than this
needs, so they survive only as a hover hint; meaning comes from the zone map
instead. `silhouette.js` is generated from the pen, not hand-edited.

Nothing here diagnoses anything. It records where it hurt and how often, which
is what makes a pattern visible and a conversation with a physio shorter.

## Guardrails

The coaching prompt states the training rules, but a prompt is a request. For
anything that could get someone hurt the check runs in code, in
`server/guardrails.js`, where it can actually stop a plan being stored.

`block` refuses the plan; `warn` stores it with the violation attached and shown
on the page. Blocking rules: a volume jump more than 50% past the step ceiling,
more than two hard days, and any volume increase after pain of 4/10 or worse was
logged. Warnings cover the deload cadence, back-to-back hard days, a long run
over a third of the week, and using a declared rest day.

## The fitness model

`/progress` computes everything from the log. Two layers, and the distinction
matters:

**Primitives** are arithmetic — daily and rolling load, intensity distribution,
efficiency factor (metres per minute per heartbeat), aerobic decoupling
(pace-to-HR drift across a long run), per-sport volume. These are either right
or they are a bug.

**Scores** are opinions expressed as numbers, and they are v0:

- **Endurance** — how much aerobic work the body is currently carrying, against
  the most it has ever carried. Chronic 28-day load does most of the work.
- **Speed** — the quality of that work, independent of amount: share of time
  above aerobic base, whether easy pace at a given heart rate is improving,
  whether best efforts are trending faster. Six easy hours a day scores high on
  endurance and low here, by design.
- **Goal confidence** — the odds of arriving. Volume goals compare the ramp
  still required against the ramp you have actually sustained; race-time goals
  compare a Riegel projection against the target. Both are penalized by logged
  pain.

Every score is measured **against your own history**, not a population, because
this app has no population data. Every input is shown on the page next to the
number, so the formula can be argued with. Acute:chronic load ratio is reported
descriptively and never as a risk verdict — that literature is genuinely
contested.

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

## Coaching without an API key

The same loop runs from a Claude Code session instead of the API, which costs
nothing beyond your Claude plan. `npm run coach` prints exactly what the API
would send and takes the answer back through exactly the same validation and
storage, so the two routes cannot drift apart.

```bash
npm run coach -- prompt plan-week 2026-W38     # rules + your data + the JSON schema
npm run coach -- apply week 2026-W38 plan.json # validated, then stored
```

The weekly rhythm:

```bash
npm run coach -- apply digest digest.txt            # keep what you wrote
npm run coach -- prompt review @digest.txt          # hand this to Claude Code
npm run coach -- apply review digest.txt review.json
npm run coach -- apply week 2026-W38 plan.json
```

Other commands: `context` (just the data the coach reads), `schema <kind>` (the
reply shape), `prompt build-plan` / `apply plan` for the macrocycle. Add
`--user=<id>` when the database holds more than one account.

Weeks written this way are stored with `source: "claude-code"`, so the app can
tell them apart from API-generated ones. Anything malformed is rejected with
per-field errors before it reaches the database.

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
activity, "How did it feel?" opens a note: RPE, how the body felt, pain 0–10,
plus free text. Log any pain above zero and a body map appears (see below). Those notes are what make the coaching worth
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
and any of the red flags (pain that changes how you move, pain rising during a
session, next-morning swelling, pain at rest, anything above 3/10) drops volume
back and refers you out rather than programming through it. A week that felt great is
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
