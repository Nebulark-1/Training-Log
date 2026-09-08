#!/usr/bin/env python3
"""Strava -> Training Log sync.

Pulls your activities out of Strava, normalizes them into training-log
sessions (imperial units, pace in sec/mile, elevation in feet, HR, per-mile
splits and laps for recent work), and writes:

    data/import.json            one blob to import in the tracker page
    data/db/sessions/<id>.json  one file per session (for Claude Code pushes)
    data/cache/                 raw Strava detail cache, so re-runs are cheap

Commands
    auth      one-time browser authorization (loopback on 127.0.0.1:8721)
    pull      fetch + normalize + write
    status    show credential / token / last-sync state

Credentials live in sync/.env (see .env.example). Tokens live in
sync/.tokens.json. Neither is committed. Standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(DATA, "cache")
DB_OUT = os.path.join(DATA, "db")
ENV_PATH = os.path.join(HERE, ".env")
TOKEN_PATH = os.path.join(HERE, ".tokens.json")
STATE_PATH = os.path.join(DATA, "sync-state.json")

REDIRECT_PORT = 8721
REDIRECT_URI = "http://127.0.0.1:{}/callback".format(REDIRECT_PORT)
SCOPE = "read,activity:read_all,profile:read_all"
API = "https://www.strava.com/api/v3"
OAUTH = "https://www.strava.com/oauth"

METERS_PER_MILE = 1609.344
FEET_PER_METER = 3.280839895
METERS_PER_100YD = 91.44
KG_PER_LB = 0.45359237

# Strava sport_type -> our sport bucket
SPORT_MAP = {
    "Run": "run", "TrailRun": "run", "VirtualRun": "run",
    "Ride": "bike", "VirtualRide": "bike", "GravelRide": "bike",
    "MountainBikeRide": "bike", "EBikeRide": "bike", "Handcycle": "bike",
    "Velomobile": "bike",
    "Swim": "swim",
    "WeightTraining": "lift", "Crossfit": "lift",
    "Workout": "strength", "HighIntensityIntervalTraining": "strength",
    "Yoga": "mobility", "Pilates": "mobility",
    "Walk": "walk", "Hike": "hike",
    "Elliptical": "cross", "StairStepper": "cross", "Rowing": "cross",
    "VirtualRow": "cross", "NordicSki": "cross", "BackcountrySki": "cross",
    "AlpineSki": "cross", "Snowshoe": "cross", "IceSkate": "cross",
    "InlineSkate": "cross", "Kayaking": "cross", "Canoeing": "cross",
    "StandUpPaddling": "cross", "Surfing": "cross", "RockClimbing": "cross",
    "Soccer": "cross", "Golf": "cross", "Badminton": "cross",
    "Tennis": "cross", "Pickleball": "cross", "Squash": "cross",
    "Racquetball": "cross", "TableTennis": "cross", "Skateboard": "cross",
    "Wheelchair": "cross", "Sail": "cross", "Windsurf": "cross",
    "Kitesurf": "cross", "Snowboard": "cross",
}
# Sports worth spending a detail API call on
DETAIL_SPORTS = {"run", "bike", "swim", "lift", "strength"}

RUN_TYPES = {0: "easy", 1: "race", 2: "long", 3: "workout"}


# --------------------------------------------------------------------------
# plumbing

def die(msg, code=1):
    sys.stderr.write("\n  " + msg + "\n\n")
    sys.exit(code)


def load_env():
    env = {}
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8-sig") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def creds():
    env = load_env()
    cid = env.get("STRAVA_CLIENT_ID", "")
    secret = env.get("STRAVA_CLIENT_SECRET", "")
    if not cid or not secret:
        die("No Strava credentials found.\n"
            "  Copy sync/.env.example to sync/.env and put your Client ID and\n"
            "  Client Secret from https://www.strava.com/settings/api in it.")
    return cid, secret


def read_json(path, default=None):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def write_json(path, obj):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def http(url, data=None, token=None, method=None):
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method or ("POST" if body else "GET"))
    req.add_header("Accept", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.loads(resp.read().decode("utf-8") or "null")
            return payload, resp.headers.get("X-RateLimit-Usage")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        if e.code == 401:
            die("Strava rejected the token (401). Run:  python sync/strava_sync.py auth")
        if e.code == 429:
            die("Strava rate limit hit (429). Wait 15 minutes and re-run pull.\n"
                "  Detail already fetched is cached, so the re-run resumes where it stopped.")
        die("Strava API error {} on {}\n  {}".format(e.code, url, detail))
    except urllib.error.URLError as e:
        die("Could not reach Strava: {}".format(e.reason))


# --------------------------------------------------------------------------
# auth

SUCCESS_PAGE = (
    "<!doctype html><meta charset=utf-8><title>Training Log</title>"
    "<style>body{font:16px/1.5 system-ui,sans-serif;background:#E9EBE3;color:#18212A;"
    "display:grid;place-items:center;height:100vh;margin:0}"
    "div{max-width:30rem;padding:2rem;text-align:center}"
    "strong{display:block;font-size:1.4rem;margin-bottom:.5rem}</style>"
    "<div><strong>{head}</strong>{body}</div>"
)


class _CallbackHandler(BaseHTTPRequestHandler):
    result = {}

    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/callback":
            self.send_error(404)
            return
        q = urllib.parse.parse_qs(parsed.query)
        _CallbackHandler.result = dict((k, v[0]) for k, v in q.items())
        ok = "code" in _CallbackHandler.result
        page = SUCCESS_PAGE.replace(
            "{head}", "Connected" if ok else "Not connected"
        ).replace(
            "{body}",
            "Strava is connected. Close this tab and return to your terminal."
            if ok else
            "Authorization failed or was declined. Close this tab and try again.",
        )
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(page.encode())

    def log_message(self, *_args):
        pass


def cmd_auth(_args):
    cid, secret = creds()
    url = OAUTH + "/authorize?" + urllib.parse.urlencode({
        "client_id": cid,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "approval_prompt": "auto",
        "scope": SCOPE,
    })
    print("\n  Opening Strava authorization in your browser.")
    print("  If it does not open, paste this URL yourself:\n")
    print("  " + url + "\n")
    print("  Waiting for the redirect on " + REDIRECT_URI + " ...")
    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        server = HTTPServer(("127.0.0.1", REDIRECT_PORT), _CallbackHandler)
    except OSError as e:
        die("Could not listen on port {}: {}".format(REDIRECT_PORT, e))
    server.timeout = 300
    server.handle_request()
    server.server_close()

    res = _CallbackHandler.result
    if "code" not in res:
        die("No authorization code received ({}).".format(res.get("error", "timed out")))

    granted = res.get("scope", "")
    if "activity:read_all" not in granted:
        print("\n  Warning: activity:read_all was not granted, so private activities stay hidden.")

    payload, _ = http(OAUTH + "/token", data={
        "client_id": cid, "client_secret": secret,
        "code": res["code"], "grant_type": "authorization_code",
    })
    athlete = payload.get("athlete") or {}
    write_json(TOKEN_PATH, {
        "access_token": payload["access_token"],
        "refresh_token": payload["refresh_token"],
        "expires_at": payload["expires_at"],
        "scope": granted,
        "athlete_id": athlete.get("id"),
    })
    name = " ".join(x for x in (athlete.get("firstname"), athlete.get("lastname")) if x)
    print("\n  Connected" + (" as " + name if name else "") + ". Token saved to sync/.tokens.json")
    print("  Next:  python sync/strava_sync.py pull\n")


def access_token():
    tok = read_json(TOKEN_PATH)
    if not tok:
        die("Not authorized yet. Run:  python sync/strava_sync.py auth")
    if tok.get("expires_at", 0) - 120 > time.time():
        return tok["access_token"]
    cid, secret = creds()
    payload, _ = http(OAUTH + "/token", data={
        "client_id": cid, "client_secret": secret,
        "refresh_token": tok["refresh_token"], "grant_type": "refresh_token",
    })
    tok.update({
        "access_token": payload["access_token"],
        "refresh_token": payload["refresh_token"],
        "expires_at": payload["expires_at"],
    })
    write_json(TOKEN_PATH, tok)
    return tok["access_token"]


# --------------------------------------------------------------------------
# normalize

def _r(x, n=2):
    return None if x is None else round(float(x), n)


def _clean(d):
    return dict((k, v) for k, v in d.items() if v is not None)


def _pace_from(meters, seconds):
    """Seconds per mile, or None when the leg is too short to mean anything."""
    if not meters or float(meters) < 80 or not seconds:
        return None
    return round(seconds / (float(meters) / METERS_PER_MILE), 1)


def normalize(a, detail=None):
    raw = a.get("sport_type") or a.get("type") or "Workout"
    sport = SPORT_MAP.get(raw, "other")
    meters = float(a.get("distance") or 0)
    moving = int(a.get("moving_time") or 0)
    elapsed = int(a.get("elapsed_time") or 0)
    start_local = (a.get("start_date_local") or "").replace("Z", "")

    s = {
        "id": "s{}".format(a["id"]),
        "source": "strava",
        "stravaId": a["id"],
        "sport": sport,
        "sportRaw": raw,
        "name": (a.get("name") or "").strip()[:160],
        "date": start_local[:10],
        "startLocal": start_local,
        "miles": _r(meters / METERS_PER_MILE, 3) if meters else 0,
        "movingMin": _r(moving / 60.0, 1),
        "elapsedMin": _r(elapsed / 60.0, 1),
        "elevFt": _r((a.get("total_elevation_gain") or 0) * FEET_PER_METER, 0),
        "hrAvg": _r(a.get("average_heartrate"), 1),
        "hrMax": _r(a.get("max_heartrate"), 0),
        "cadence": _r(a.get("average_cadence"), 1),
        "sufferScore": a.get("suffer_score"),
        "trainer": bool(a.get("trainer")),
        "commute": bool(a.get("commute")),
        "race": a.get("workout_type") == 1,
        "hasHr": bool(a.get("has_heartrate")),
    }

    if sport in ("run", "walk", "hike"):
        s["paceSecPerMi"] = _pace_from(meters, moving)
        s["runType"] = RUN_TYPES.get(a.get("workout_type"))
    if sport == "bike":
        s["speedMph"] = _r((meters / METERS_PER_MILE) / (moving / 3600.0), 2) if moving else None
        s["avgWatts"] = _r(a.get("average_watts"), 0)
        s["normWatts"] = _r(a.get("weighted_average_watts"), 0)
        s["deviceWatts"] = bool(a.get("device_watts"))
    if sport == "swim":
        s["yards"] = _r(meters / 0.9144, 0)
        s["per100yd"] = _r(moving / (meters / METERS_PER_100YD), 1) if meters and moving else None

    if detail:
        s["calories"] = _r(detail.get("calories"), 0)
        desc = (detail.get("description") or "").strip()
        if desc:
            s["description"] = desc[:1200]
        if detail.get("device_name"):
            s["device"] = detail["device_name"]
        gear = detail.get("gear") or {}
        if gear.get("name"):
            s["gear"] = gear["name"]

        splits = []
        for sp in (detail.get("splits_standard") or []):
            splits.append(_clean({
                "mi": sp.get("split"),
                "miles": _r((sp.get("distance") or 0) / METERS_PER_MILE, 2),
                "paceSecPerMi": _pace_from(sp.get("distance"), sp.get("moving_time")),
                "hrAvg": _r(sp.get("average_heartrate"), 0),
                "elevFt": _r((sp.get("elevation_difference") or 0) * FEET_PER_METER, 0),
            }))
        if splits:
            s["splits"] = splits[:40]

        laps = []
        for lp in (detail.get("laps") or []):
            laps.append(_clean({
                "n": lp.get("lap_index"),
                "name": (lp.get("name") or "").strip()[:40],
                "miles": _r((lp.get("distance") or 0) / METERS_PER_MILE, 2),
                "minutes": _r((lp.get("moving_time") or 0) / 60.0, 1),
                "paceSecPerMi": _pace_from(lp.get("distance"), lp.get("moving_time")),
                "hrAvg": _r(lp.get("average_heartrate"), 0),
                "hrMax": _r(lp.get("max_heartrate"), 0),
                "elevFt": _r((lp.get("total_elevation_gain") or 0) * FEET_PER_METER, 0),
                "avgWatts": _r(lp.get("average_watts"), 0),
            }))
        if len(laps) > 1:
            s["laps"] = laps[:40]

        efforts = detail.get("best_efforts") or []
        if efforts:
            s["bestEfforts"] = [{"name": b.get("name"), "sec": b.get("moving_time")}
                                for b in efforts[:8] if b.get("name")]

    return dict((k, v) for k, v in s.items() if v is not None)


# --------------------------------------------------------------------------
# pull

def fetch_page(token, after_epoch, page):
    q = urllib.parse.urlencode({"after": after_epoch, "per_page": 100, "page": page})
    return http(API + "/athlete/activities?" + q, token=token)


def fetch_detail(token, activity_id):
    payload, usage = http(
        API + "/activities/{}?include_all_efforts=false".format(activity_id), token=token)
    write_json(os.path.join(CACHE, "{}.json".format(activity_id)), payload)
    return payload, usage


def cmd_pull(args):
    token = access_token()
    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    if args.since:
        try:
            since = datetime.strptime(args.since, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            die("--since must look like 2026-06-01")

    athlete_raw, _ = http(API + "/athlete", token=token)
    athlete = {
        "id": athlete_raw.get("id"),
        "name": " ".join(x for x in (athlete_raw.get("firstname"),
                                     athlete_raw.get("lastname")) if x),
        "weightLb": _r((athlete_raw.get("weight") or 0) / KG_PER_LB, 1) or None,
        "ftp": athlete_raw.get("ftp"),
        "city": athlete_raw.get("city"),
    }
    athlete = dict((k, v) for k, v in athlete.items() if v)

    print("  Pulling activities since {:%Y-%m-%d} ...".format(since))
    activities, page, usage = [], 1, None
    while page <= 30:
        batch, usage = fetch_page(token, int(since.timestamp()), page)
        if not batch:
            break
        activities.extend(batch)
        print("    page {}: {} activities".format(page, len(batch)))
        if len(batch) < 100:
            break
        page += 1

    activities.sort(key=lambda a: a.get("start_date_local") or "", reverse=True)

    # Per-mile splits and laps cost one API call each, so only recent work gets them.
    cutoff = (datetime.now() - timedelta(days=args.detail_days)).strftime("%Y-%m-%d")
    want = [a["id"] for a in activities
            if SPORT_MAP.get(a.get("sport_type") or a.get("type") or "", "other") in DETAIL_SPORTS
            and (a.get("start_date_local") or "")[:10] >= cutoff][: args.detail_max]
    if want:
        print("  Fetching splits and laps for {} recent sessions ...".format(len(want)))

    details, fetched = {}, 0
    for aid in want:
        cached = None if args.refresh else read_json(os.path.join(CACHE, "{}.json".format(aid)))
        if cached:
            details[aid] = cached
            continue
        details[aid], usage = fetch_detail(token, aid)
        fetched += 1
        time.sleep(0.35)

    sessions = [normalize(a, details.get(a["id"])) for a in activities]

    for s in sessions:
        write_json(os.path.join(DB_OUT, "sessions", s["id"] + ".json"), s)

    generated = datetime.now().astimezone().isoformat(timespec="seconds")
    write_json(os.path.join(DATA, "import.json"), {
        "kind": "training-log-import",
        "version": 1,
        "generatedAt": generated,
        "athlete": athlete,
        "range": {"from": since.strftime("%Y-%m-%d"),
                  "to": datetime.now().strftime("%Y-%m-%d"),
                  "days": args.days},
        "detailDays": args.detail_days,
        "sessions": sessions,
    })
    write_json(STATE_PATH, {
        "lastRun": generated,
        "sessions": len(sessions),
        "detailFetched": fetched,
        "rateUsage": usage,
        "newest": sessions[0]["date"] if sessions else None,
        "athlete": athlete,
    })

    counts = {}
    for s in sessions:
        counts[s["sport"]] = counts.get(s["sport"], 0) + 1
    summary = ", ".join("{} {}".format(v, k)
                        for k, v in sorted(counts.items(), key=lambda kv: -kv[1]))
    print("\n  {} sessions written ({})".format(len(sessions), summary or "none"))
    if usage:
        print("  Strava rate usage (15 min, day): " + usage)
    print("  Import file: " + os.path.join("data", "import.json"))
    print("\n  Open the tracker, click Sync, and choose that file.\n")


def cmd_status(_args):
    env = load_env()
    tok = read_json(TOKEN_PATH)
    state = read_json(STATE_PATH, {})
    have = env.get("STRAVA_CLIENT_ID") and env.get("STRAVA_CLIENT_SECRET")
    print()
    print("  credentials  " + ("set" if have else "MISSING (see sync/.env.example)"))
    if tok:
        exp = datetime.fromtimestamp(tok.get("expires_at", 0))
        fresh = "valid" if tok.get("expires_at", 0) > time.time() else "expired (auto-refreshes)"
        print("  token        {}, expires {:%Y-%m-%d %H:%M}".format(fresh, exp))
        print("  scope        " + str(tok.get("scope", "?")))
        print("  athlete      " + str(tok.get("athlete_id", "?")))
    else:
        print("  token        none - run:  python sync/strava_sync.py auth")
    if state:
        print("  last pull    {}  ({} sessions, newest {})".format(
            state.get("lastRun"), state.get("sessions"), state.get("newest")))
    else:
        print("  last pull    never")
    print()


def main():
    p = argparse.ArgumentParser(prog="strava_sync", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("auth", help="one-time browser authorization").set_defaults(fn=cmd_auth)
    sub.add_parser("status", help="show credential and sync state").set_defaults(fn=cmd_status)

    pull = sub.add_parser("pull", help="fetch and normalize activities")
    pull.add_argument("--days", type=int, default=180,
                      help="how far back to pull (default 180)")
    pull.add_argument("--since", help="pull from this date instead, YYYY-MM-DD")
    pull.add_argument("--detail-days", type=int, default=28,
                      help="fetch splits and laps for sessions newer than this (default 28)")
    pull.add_argument("--detail-max", type=int, default=30,
                      help="cap detail API calls per run (default 30)")
    pull.add_argument("--refresh", action="store_true", help="ignore the detail cache")
    pull.set_defaults(fn=cmd_pull)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
