// Strava webhooks: activities arrive, they are not fetched.
//
// Strava calls this within seconds of an activity being created, changed or
// deleted, and again if an athlete disconnects the app. Each event costs the
// app one API call to bring the activity in, against the dozens a polling
// sync spends to discover the same thing. With ten accounts on a 2,000-a-day
// allowance, this is the difference between comfortable and not.
//
// Two rules Strava enforces: the callback must answer 200 within two seconds,
// and it may be called more than once for the same event. So the event is
// acknowledged first and worked afterwards, one at a time, and the work is
// an upsert that does not mind repeating itself.
import express from 'express';
import { config } from './config.js';
import { deleteActivity, deleteConnection, userForStravaAthlete } from './db.js';
import { syncOne, verifyToken } from './strava.js';

export const webhookRouter = express.Router();

/** Strava's registration handshake: echo the challenge if the token is ours. */
webhookRouter.get('/strava', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === verifyToken() && challenge) {
    return res.json({ 'hub.challenge': challenge });
  }
  res.status(403).json({ error: 'bad_verify_token' });
});

// A small in-process queue: events are worked in order, one at a time, with a
// breath between them, so a burst of uploads does not become a burst of calls.
const queue = [];
let working = false;
const stats = { received: 0, handled: 0, failed: 0, lastAt: null, lastError: null };

async function drain() {
  if (working) return;
  working = true;
  try {
    while (queue.length) {
      const event = queue.shift();
      try {
        await handle(event);
        stats.handled += 1;
      } catch (err) {
        stats.failed += 1;
        stats.lastError = String(err?.message || err).slice(0, 200);
        console.error('[strava webhook]', event.object_type, event.aspect_type, event.object_id, err?.message);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    working = false;
  }
}

async function handle(event) {
  const userId = userForStravaAthlete(event.owner_id);
  if (!userId) return; // an athlete this server does not know

  if (event.object_type === 'athlete') {
    // The only athlete event that matters is the one where they turn us off.
    if (event.aspect_type === 'update' && String(event.updates?.authorized) === 'false') {
      deleteConnection(userId, 'strava');
    }
    return;
  }

  if (event.object_type !== 'activity') return;
  if (event.aspect_type === 'delete') {
    deleteActivity(userId, `s${event.object_id}`);
    return;
  }
  // create, and update — an edited title or a corrected sport both matter
  await syncOne(userId, event.object_id);
}

webhookRouter.post('/strava', (req, res) => {
  const event = req.body || {};
  stats.received += 1;
  stats.lastAt = new Date().toISOString();
  if (event.object_type && event.owner_id != null) {
    queue.push(event);
    setImmediate(drain);
  }
  // Acknowledge now; Strava retries anything it does not hear back on.
  res.status(200).json({ ok: true });
});

export const webhookStats = () => ({ ...stats, queued: queue.length, callback: `${config.baseUrl}/webhooks/strava` });
