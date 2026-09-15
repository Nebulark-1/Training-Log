# Moving Chaos Coaching off your laptop

This is the walk from "runs on my machine" to "runs on a server, for other
people, and survives me closing the lid." It is also, deliberately, a tour of
the ideas a small production service is built on — each section names the
principle, then does the thing.

The whole stack is one small VM, one Docker Compose file, and one volume.
That is not a compromise; for ten to a few hundred athletes it is the right
size, and every piece of it scales out later without being replaced.

---

## 0. The shape of it

```
   browser ──https──▶ Caddy ──http──▶ app (Node) ──▶ /data/ledger.db  (volume)
                     :443            :4317               │
                                                         └──▶ /data/backups ──rclone──▶ object storage
   Strava ──webhook──▶ /webhooks/strava
   Google ──oauth───▶ /auth/google/callback
```

Three containers. **Caddy** owns the public ports and TLS. **The app** owns
nothing public and holds no state of its own. **The volume** holds all the
state. A fourth, **backup**, copies snapshots off the machine nightly.

**Principle: separate the stateless from the stateful.** The app container
can be killed, rebuilt and replaced any time; nothing is lost because nothing
lives in it. The volume is the only thing that needs care, and it needs it in
exactly one place.

---

## 1. Pick a host

Anything that gives you a Linux VM with a persistent disk and a public IP:
Hetzner, DigitalOcean, Fly.io with a volume, a Lightsail box. The smallest
size is enough — the app idles at ~60 MB and a coaching call is a network wait,
not a CPU one.

Two things to avoid:

- **Ephemeral filesystems** (Heroku-style, Render free tier, Cloud Run without
  a mount). SQLite is a file; if the filesystem resets on deploy, the ledger
  resets on deploy.
- **Anything that runs two copies at once.** SQLite is single-writer. One
  container, one volume. (When that stops being enough, the migration is to
  Postgres, not to a second SQLite — and every query already goes through
  `server/db.js`, so it is one file's worth of change.)

**Principle: know your consistency model.** One writer, one file, WAL mode:
the simplest system that is actually correct.

---

## 2. Point the domain

At your DNS provider, one record:

```
A    coach.example.com    →   <the VM's public IP>
```

Wait for it to resolve (`dig coach.example.com` or `nslookup`). Caddy will
not get a certificate until it does.

---

## 3. Register the callbacks

Both OAuth providers need to know the public address before anyone can sign in.

**Google** — console.cloud.google.com → APIs & Services → Credentials →
Create OAuth client (Web application):
- Authorised redirect URI: `https://coach.example.com/auth/google/callback`
- Consent screen: leave it in **Testing**. Add each tester's Gmail under
  **Test users**. Testing mode allows 100 users with no verification review;
  that is your whole alpha.

**Strava** — strava.com/settings/api:
- Authorization Callback Domain: `coach.example.com` (host only, no `https://`)

**Principle: configuration lives outside the code.** Everything the deployment
knows that the repository must not — keys, secrets, the domain — is in `.env`,
read at start. The same image runs on a laptop, a staging box and production
with nothing but that file changed. (This is factor III of the twelve-factor
app; the rest of this guide follows several more.)

---

## 4. Put it on the box

```bash
# on the VM
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
git clone https://github.com/Nebulark-1/Training-Log.git chaos && cd chaos
cp .env.example .env
nano .env               # fill it in — see the file's own comments
export SITE=coach.example.com
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f app
```

You should see the banner: the database path (`/data/ledger.db`), `schema
0 -> 3`, and `backups 2 kept`. Open `https://coach.example.com`. The door
should show **Create an account** / **Sign in**.

Two `.env` lines matter more than the rest:

```
APP_SECRET=<openssl rand -hex 32>     # generate once, never change
OWNER_EMAIL=you@gmail.com             # this account is Expert, never metered
```

**Principle: immutable deploys.** A deploy is `git pull && docker compose up
-d --build`. It builds a fresh image and swaps it in; the old one is gone.
Nothing is edited in place on the server, so the server is never in a state
the repository does not describe.

---

## 5. Turn on the webhook

Once the site answers over https:

```bash
docker compose -f deploy/docker-compose.yml exec app \
  node --experimental-sqlite --no-warnings server/cli.js strava-webhook subscribe
```

Strava calls `GET /webhooks/strava` with a challenge, the app echoes it, and
from then on every activity an athlete records arrives within seconds for the
cost of one API call. The **Sync** button becomes a fallback rather than the
way data arrives.

**Principle: push over poll.** Ten accounts each polling Strava hourly is 240
calls a day for data that mostly has not changed. Ten accounts on a webhook is
one call per actual run. The nightly sync in `server/scheduler.js` stays on as
a safety net, because webhooks can be missed — and it checks the app's shared
Strava allowance before it starts, so it can never be the thing that tips the
whole app into a rate limit.

---

## 6. Backups, and the only test that counts

The app already snapshots itself: a daily `VACUUM INTO` copy and one before
any schema change, in `/data/backups`. That protects against a bad write. It
does not protect against the disk, the VM, or the account — the snapshots are
on the same volume as the database.

The `backup` service copies them off the machine nightly with `rclone`. Any
object store works; Backblaze B2 is the cheapest for this size.

```bash
docker run --rm -it -v $PWD/deploy/rclone:/config/rclone rclone/rclone config
# ... create a remote called e.g. "b2"
# then in .env:
RCLONE_REMOTE=b2:chaos-coaching
```

**Now do the restore.** A backup nobody has restored is a hope, not a backup:

```bash
rclone copy b2:chaos-coaching/backups/ledger-daily-<newest>.db /tmp/
docker compose -f deploy/docker-compose.yml run --rm -v /tmp:/restore app \
  node --experimental-sqlite -e "
    const {DatabaseSync}=require('node:sqlite');
    const d=new DatabaseSync('/restore/ledger-daily-<newest>.db',{readOnly:true});
    console.log(d.prepare('select count(*) n from activities').get())"
```

If that prints a count, you have a backup. Put it in your calendar: quarterly.

**Principle: 3-2-1.** Three copies (live, local snapshot, remote), on two
kinds of storage (the volume, object storage), one of them off-site. And the
corollary nobody writes down: *a restore you have not rehearsed is not a
restore.*

---

## 7. Watch it

`https://coach.example.com/healthz` says whether the database answers. Point
your host's uptime check at it (UptimeRobot's free tier is fine). `/api/ops`,
signed in as the owner, shows the Strava allowance, webhook counts and when
the scheduled jobs last ran.

Logs: `docker compose logs -f app`. Every coaching call is a row in
`coach_runs` with model, tokens, duration, cost and outcome — that table *is*
the observability for the expensive part.

**Principle: observe the expensive thing.** You do not need a metrics stack
for a service this size. You need to know when it is down, and what the one
thing that costs money is doing. Both of those are answered above.

---

## 8. Updating

```bash
git pull
docker compose -f deploy/docker-compose.yml up -d --build
```

The app takes SIGTERM cleanly: it stops accepting connections, lets in-flight
requests finish, checkpoints the write-ahead log and exits. Compose waits ten
seconds for that. Migrations run on start, after a snapshot, one step at a
time; a failed step rolls back and the server refuses to start rather than
run against a half-changed schema.

**Principle: fail closed on the data.** The one thing worse than being down is
being up and wrong.

---

## 9. What this does not do yet, on purpose

- **Zero-downtime deploys.** A redeploy is a few seconds of 502. For an alpha
  that is fine. The fix later is a second app container behind Caddy with a
  health-gated swap — and Postgres, because two writers need it.
- **Rate limiting at the edge.** The app limits per address itself. Caddy can
  do it too, and should when the traffic is not all friends.
- **Secrets manager.** `.env` on the box, mode 600, is proportionate. When
  there is a team, move to the host's secret store and inject at start.
- **Multi-region.** No.

---

## Cheat sheet for the interview

| Principle | Where it shows up here |
|---|---|
| Stateless app, stateful volume | app container disposable; `/data` is the only state |
| Config in the environment | `.env.example`; same image everywhere |
| Immutable deploys | `up -d --build` swaps images; nothing edited on the box |
| Push over poll | Strava webhooks; nightly sync only as a safety net |
| Shared-resource awareness | app-wide Strava budget; syncs decline before they tip the app into 429 |
| Metering and quotas | per-plan monthly budget, daily cap, cooldown — cost is a first-class signal |
| Graceful shutdown | SIGTERM → drain → WAL checkpoint → exit |
| Migrations as code | ordered, versioned, snapshot-first, rollback per step |
| 3-2-1 backups, rehearsed restore | local snapshot + off-site copy + a documented restore |
| Health and observability proportionate to scale | `/healthz`, `/api/ops`, `coach_runs` |
| Least privilege | non-root container; systemd unit with `ProtectSystem=strict` |
| Fail closed on data | refuse to start on a failed migration |
