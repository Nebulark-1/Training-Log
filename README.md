# Chaos Coaching

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
| `server/db.js` | SQLite queries (`node:sqlite`, no native build) |
| `server/migrations.js` | The schema, versioned — every change ordered and recorded |
| `server/backup.js` | Snapshots: daily, and before any schema change |
| `server/evidence.js` | The case for and against a goal, assembled and left unjudged |
| `server/backtest.js` | Scores the predictions against what actually happened |
| `server/cli.js` | `npm run coach` — the same loop without an API key |
| `test/` | `npm test` — the pure modules, no database or network needed |
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
- **Goal confidence** — no longer a score at all. See below.

Every score is measured **against your own history**, not a population, because
this app has no population data. Every input is shown on the page next to the
number, so the formula can be argued with. Acute:chronic load ratio is reported
descriptively and never as a risk verdict — that literature is genuinely
contested.

Two v0 mistakes are fixed and worth knowing about, because they show the shape
of the rest:

- **A quality share off almost no training is noise.** One hard half-hour in an
  otherwise empty month is a share of 1.0, which used to score a perfect mark
  on the heaviest input — so being injured made you look fast. The share is now
  trusted in proportion to the volume behind it and shrunk toward neutral when
  there is not enough, because a quiet month is unknown, not slow.
- **Decoupling needs a run long enough to mean something.** Six splits was too
  low a bar: a 6-mile run flagged at 15.4% said nothing, because ordinary
  early-run drift and one hilly mile move the number more than aerobic fitness
  does. It now wants 50 minutes of steady running, and skips workouts and races
  entirely — those drift by design.

### Goal confidence is a judgement, not a formula

The arithmetic version is still in the code and still on the page, labelled as
what it is, because it is the reason the rest exists: backtesting found it
correlated with what actually happened at **-0.82**, while last month's volume
on its own managed **-0.95**. A number built out of current volume can only
restate current volume.

So the question goes to the coach. `server/evidence.js` assembles the case and
reaches no verdict — deliberately leading with what mileage cannot see:

| Evidence | The question it answers |
|---|---|
| ramp | Is the required climb one you have ever actually held? |
| adherence | Are planned weeks happening, or quietly not? |
| strength | Is the bar still moving, or is RPE rising at the same load? |
| symptoms | Is the same site coming back? Recurrence ends goals. |
| fatigue | Is the same pace costing more than it did? |
| history | How much of this is real, and how much is a small sample? |

The coach reads that and returns a confidence out of 100, the single biggest
limiter, three to six weighted drivers split into what supports and what
threatens, and what would move the number either way. Assessments are kept
rather than replaced: one figure says little, the same goal reassessed month
after month shows whether it is drifting away.

Two moments matter, and they are different questions. A **baseline** when the
goal is new asks whether it is a reasonable thing to aim at. A **check-in**
later asks whether it is still on track, and the coach sees its own previous
answers, so a number that drifts down has to be explained.

```
npm run coach -- prompt goal-confidence [goalId] [--baseline]
npm run coach -- apply confidence <answer.json> [goalId] [--baseline]
```

Assessing costs a model call, so it never happens on page load. The stored
judgement is what the app shows; **Reassess** on `/progress` refreshes it.

### Checking the scores against what happened

```
npm run backtest                      # 8 weeks ahead, 8 weeks of lead-in
npm run backtest -- --horizon=6
```

This rewinds the model week by week, recomputes each score from only the data
available at the time, and lines it up against how the following weeks actually
went. It reports one column that matters more than the others: **last month's
volume**, the no-model predictor. Volume that is low goes up and volume that is
high comes down, so any score that tracks current volume will correlate with
what follows whether or not it knows anything. A score earns its place by
beating that column, and right now confidence does not.

## Accounts, plans, and who pays

The server pays for every account's coaching, from `ANTHROPIC_API_KEY` in
`.env` (or an `ant auth login` profile on the machine). The plan an account is
on decides which model coaches it and how much coaching it gets a month.

| Plan | Routine work (weekly plan, digest review) | Key work (goal, program, season) | Monthly coaching budget | Price |
| --- | --- | --- | --- | --- |
| Basic | Sonnet | Sonnet | $1.50 of compute | $5 |
| Plus | Sonnet | Opus | $3 | $10 |
| Expert | Opus | Opus | $8 | $20 |

Effort is `high` on every plan. Sonnet is cheap enough that thinking less is
not where the saving is, and the weekly plan is the product; it should not be
the thing that is worse on the entry tier. Budgets are metered in what calls
actually cost — every run is priced at write time into `coach_runs.cost` — and
a plan's month is about three normal months of coaching, so the only way to
run out is to keep pressing Re-plan. When it happens the button says so and
names the date it resets.

Plans live in `server/tiers.js`. Nothing takes money yet: accounts land on
Basic, and while the door is closed the tier is whatever you set it to.

```
OWNER_EMAIL=you@gmail.com          # this account is Expert and never metered
ALLOWED_EMAILS=a@gmail.com,b@...   # optional: who may create an account
```

Signing in is Google only, so every account has a verified address. With no
Google credentials set, the local account stands in for the owner. Bring-your-
own-key is gone: a plan that pays for coaching cannot also let a user route
around it.

Requests use adaptive thinking, structured outputs validated against a schema
before anything is stored, and server-side refusal fallbacks (set
`CLAUDE_FALLBACKS=0` to disable). Every call is recorded in `coach_runs` with
model, token usage, duration and cost.

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

### Backups

The ledger is the only copy of the training history, and every score is derived
from it. Snapshots go in `data/backups/`, beside the database:

- a **daily** one on startup, at most one a day, seven kept
- a **pre-migration** one before the schema is ever touched, ten kept

They are taken with `VACUUM INTO`, which is the part that matters: in WAL mode
the newest writes live in the `-wal` file beside the database, so copying the
bare `.db` silently leaves them behind. A snapshot is a complete database — open
it, or swap it in, with nothing else needed.

`GET /api/backups` lists them and `POST /api/backups` takes one on demand.

### Schema changes

`PRAGMA user_version` records where a database is, and `server/migrations.js`
holds the ordered steps to bring it forward. Each step runs in its own
transaction with its version bump, so a failure leaves the database on the last
version that fully applied rather than half-way through one.

To add a change, append a step with the next version number. Never edit or
renumber one that has shipped — someone's database has already run it.

## Tests

```
npm test
```

No database, no network, no fixtures to maintain: the suite covers the pure
modules, which are the ones that decide things. Guardrails (is this week
allowed), progression (does the bar go up), the fitness scores, the body-map
geometry, and the migration and backup machinery itself.
