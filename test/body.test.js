// Body-map geometry.
//
// Three bugs shipped here in a row, and each one is a case below: structures
// laid out against the zone box instead of the limb, a midline point treated
// as one wide limb, and a verification pass that only ever walked left and
// right. The invariants are cheap to state and were expensive to miss.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CENTERLINE, LIMBS, MIRRORED, ZONES, describeSite, getZone, limbsFor,
  quadsBounds, sideAt, sideLetters, siteAt, structureQuads, troublePoints, zoneAt,
} from '../public/lib/body.js';

const sides = (zone) => (zone.sided === false ? ['center'] : ['left', 'right', 'center']);
const centroid = (quad) => [
  quad.reduce((a, p) => a + p[0], 0) / 4,
  quad.reduce((a, p) => a + p[1], 0) / 4,
];

// --- which side of the body -----------------------------------------------

test('the front view is a mirror, so screen-left is the athlete right', () => {
  assert.equal(MIRRORED.front, true);
  assert.equal(sideAt('front', CENTERLINE.front - 40, getZone('front', 'shin')), 'right');
  assert.equal(sideAt('front', CENTERLINE.front + 40, getZone('front', 'shin')), 'left');
});

test('the back view is not mirrored', () => {
  assert.equal(MIRRORED.back, false);
  assert.equal(sideAt('back', CENTERLINE.back - 40, getZone('back', 'calf')), 'left');
  assert.equal(sideAt('back', CENTERLINE.back + 40, getZone('back', 'calf')), 'right');
});

test('a point on the midline has no side', () => {
  assert.equal(sideAt('back', CENTERLINE.back, getZone('back', 'upper-back')), 'center');
});

test('a midline zone has no side even away from the centre', () => {
  assert.equal(sideAt('front', CENTERLINE.front - 30, getZone('front', 'head')), 'center');
});

test('the L and R letters follow the view, not the screen', () => {
  assert.deepEqual(sideLetters('front'), { viewerLeft: 'R', viewerRight: 'L' });
  assert.deepEqual(sideLetters('back'), { viewerLeft: 'L', viewerRight: 'R' });
});

test('a click resolves to a zone, a side and a readable description', () => {
  const site = siteAt('back', 272, 665);
  assert.equal(site.zone, 'calf');
  assert.equal(site.side, 'left');
  assert.equal(describeSite(site), 'Left calf');
});

test('a click always lands somewhere, even off the figure', () => {
  assert.ok(zoneAt('front', 0, 0), 'a click outside the body still resolves to the nearest zone');
});

// --- every structure has geometry ------------------------------------------

test('every zone has a measured limb', () => {
  for (const z of ZONES) {
    assert.ok(LIMBS[`${z.view}:${z.id}`], `${z.view}:${z.id} was never measured`);
  }
});

test('every structure has an area', () => {
  for (const z of ZONES) {
    for (const s of z.structures) {
      assert.ok(Array.isArray(s.area) && s.area.length === 4, `${z.id}/${s.id} has no area`);
    }
  }
});

test('structure ids are unique across the whole body', () => {
  // Trouble points group by structure id, so a duplicate would silently merge
  // two different places into one row.
  const seen = new Set();
  for (const z of ZONES) {
    for (const s of z.structures) {
      assert.equal(seen.has(s.id), false, `${s.id} is used twice`);
      seen.add(s.id);
    }
  }
});

// --- shapes land where they should ----------------------------------------

test('every structure produces a shape on every side, with real area', () => {
  for (const z of ZONES) {
    for (const side of sides(z)) {
      for (const s of z.structures) {
        const quads = structureQuads(z.view, z.id, s.id, side);
        assert.ok(quads.length, `${z.id}/${s.id}/${side} produced no shape`);
        for (const q of quads) {
          const [x0, y0, x1, y1] = quadsBounds([q]);
          assert.ok(x1 > x0 && y1 > y0, `${z.id}/${s.id}/${side} is empty`);
        }
      }
    }
  }
});

test('a shape never escapes the limb it belongs to', () => {
  for (const z of ZONES) {
    for (const side of sides(z)) {
      const limbs = limbsFor(z.view, z.id, side);
      const span = quadsBounds(limbs.map(({ limb }) => [
        [limb.top[0], limb.y[0]], [limb.top[1], limb.y[0]],
        [limb.bottom[1], limb.y[1]], [limb.bottom[0], limb.y[1]],
      ]));
      for (const s of z.structures) {
        const [x0, y0, x1, y1] = quadsBounds(structureQuads(z.view, z.id, s.id, side));
        assert.ok(x0 >= span[0] - 0.01 && x1 <= span[2] + 0.01,
          `${z.id}/${s.id}/${side} runs outside its limb horizontally`);
        assert.ok(y0 >= span[1] - 0.01 && y1 <= span[3] + 0.01,
          `${z.id}/${s.id}/${side} runs outside its limb vertically`);
      }
    }
  }
});

// Limbs were measured off the rendered artwork at two samples per viewBox
// unit, so an edge can sit half a unit past a hand-drawn boundary. That is one
// pixel of measurement, not a placement error; anything larger is.
const PIXEL = 0.5;

test('the measured limbs themselves stay on their own side', () => {
  for (const z of ZONES) {
    if (z.sided === false) continue;
    const centre = CENTERLINE[z.view];
    for (const side of ['left', 'right']) {
      const [{ limb }] = limbsFor(z.view, z.id, side);
      const viewerLeft = MIRRORED[z.view] ? side === 'right' : side === 'left';
      const inner = viewerLeft
        ? Math.max(limb.top[1], limb.bottom[1]) - centre
        : centre - Math.min(limb.top[0], limb.bottom[0]);
      assert.ok(inner <= PIXEL, `${z.view}/${z.id}/${side} reaches ${inner.toFixed(1)} past the midline`);
    }
  }
});

test('a one-sided pick stays on its own side of the body', () => {
  for (const z of ZONES) {
    if (z.sided === false) continue;
    const centre = CENTERLINE[z.view];
    for (const side of ['left', 'right']) {
      const viewerLeft = MIRRORED[z.view] ? side === 'right' : side === 'left';
      for (const s of z.structures) {
        const [x0, , x1] = quadsBounds(structureQuads(z.view, z.id, s.id, side));
        const over = viewerLeft ? x1 - centre : centre - x0;
        assert.ok(over <= PIXEL, `${z.id}/${s.id}/${side} crosses the midline by ${over.toFixed(1)}`);
      }
    }
  }
});

test('a limb structure clears the torso beside it', () => {
  // The arm zones are wide enough to catch a click near the chest, so a shape
  // laid out across the whole zone would sit on the ribs.
  for (const z of ZONES) {
    if (!z.outsideOnly) continue;
    for (const side of ['left', 'right']) {
      const viewerLeft = MIRRORED[z.view] ? side === 'right' : side === 'left';
      for (const s of z.structures) {
        const [x0, , x1] = quadsBounds(structureQuads(z.view, z.id, s.id, side));
        const into = viewerLeft ? x1 - z.outsideOnly[0] : z.outsideOnly[1] - x0;
        assert.ok(into <= PIXEL, `${z.id}/${s.id}/${side} reaches ${into.toFixed(1)} into the torso`);
      }
    }
  }
});

// --- the midline case, which is the one that got missed -------------------

test('a midline pick lights up both sides', () => {
  const quads = structureQuads('back', 'upper-back', 'thoracic-spine', 'center');
  assert.equal(quads.length, 2, 'the spine should be drawn either side of the midline');
});

test('a midline pick straddles the centre instead of drifting to one edge', () => {
  // The bug: both halves were merged into one limb spanning the body, so
  // "medial" landed against the far side. The spine came out at x 352 on a
  // body whose midline is 305.
  for (const view of ['front', 'back']) {
    const centre = CENTERLINE[view];
    for (const z of ZONES.filter((x) => x.view === view && x.sided !== false)) {
      for (const s of z.structures) {
        const [x0, , x1] = quadsBounds(structureQuads(view, z.id, s.id, 'center'));
        assert.ok(x0 < centre && x1 > centre,
          `${z.id}/${s.id} on the midline sits at ${x0.toFixed(0)}-${x1.toFixed(0)}, not across ${centre}`);
      }
    }
  }
});

test('a midline pick is the mirror of picking each side', () => {
  const left = structureQuads('back', 'lower-back', 'lumbar-spine', 'left');
  const right = structureQuads('back', 'lower-back', 'lumbar-spine', 'right');
  const both = structureQuads('back', 'lower-back', 'lumbar-spine', 'center');
  assert.deepEqual(both, [...left, ...right]);
});

test('a genuinely midline zone stays a single shape', () => {
  assert.equal(structureQuads('front', 'head', 'skull', 'center').length, 1);
  assert.equal(structureQuads('back', 'head-back', 'occiput', 'center').length, 1);
});

// --- lateral and medial ----------------------------------------------------

const MEDIAL = ['tibia', 'medial-tibia', 'ulna', 'ulna-b', 'sternum', 'medial-malleolus',
  'medial-epicondyle', 'vastus-medialis', 'vmo', 'gastroc-medial', 'pes-anserine', 'mcl',
  'medial-joint-line', 'thoracic-spine', 'lumbar-spine', 'cervical-spine', 'cervical-spine-b',
  'deltoid-lig', 'tib-post-tendon', 'adductor', 'adductor-mid', 'adductor-tendon',
  'semimembranosus', 'semitendinosus', 'erectors-lumbar', 'erectors-thoracic', 'scapula-medial',
  'pubic', 'rectus-abdominis', 'rectus-lower', 'throat'];
const LATERAL = ['fibula', 'peroneals', 'peroneal-tendon', 'lateral-malleolus', 'lateral-epicondyle',
  'it-band-upper', 'it-band-lower', 'it-band-back', 'vastus-lateralis', 'lcl', 'lateral-joint-line',
  'gerdys', 'radius', 'radius-b', 'glute-med', 'tfl', 'atfl', 'biceps-femoris', 'obliques',
  'obliques-lower', 'deltoid-ant', 'deltoid-post', 'scalene', 'lats'];

test('structures named medial or lateral land on that half of their limb', () => {
  let checked = 0;
  for (const z of ZONES) {
    if (z.sided === false) continue;
    const centre = CENTERLINE[z.view];
    for (const s of z.structures) {
      const want = MEDIAL.includes(s.id) ? 'medial' : LATERAL.includes(s.id) ? 'lateral' : null;
      if (!want) continue;
      for (const side of ['left', 'right']) {
        const [{ limb }] = limbsFor(z.view, z.id, side);
        const [cx] = centroid(structureQuads(z.view, z.id, s.id, side)[0]);
        const limbMid = (limb.top[0] + limb.top[1] + limb.bottom[0] + limb.bottom[1]) / 4;
        const got = Math.abs(cx - centre) < Math.abs(limbMid - centre) ? 'medial' : 'lateral';
        assert.equal(got, want, `${z.view}/${z.id}/${s.id} on the ${side} came out ${got}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 100, `expected to check a lot of structures, only did ${checked}`);
});

test('the shin bones sit on opposite edges of the same leg', () => {
  const [tibia] = structureQuads('front', 'shin', 'medial-tibia', 'right');
  const [fibula] = structureQuads('front', 'shin', 'fibula', 'right');
  const centre = CENTERLINE.front;
  // The athlete's right leg is screen-left, so medial means the higher x.
  assert.ok(centroid(tibia)[0] > centroid(fibula)[0], 'the tibia should be the inner bone');
  assert.ok(quadsBounds([tibia])[2] < centre, 'both should stay on their own leg');
});

test('a limb narrows with the body it follows', () => {
  // A rectangle cannot fit a tapering shin; the shape has to close up too.
  const [q] = structureQuads('front', 'shin', 'tibialis-anterior', 'right');
  const topWidth = q[1][0] - q[0][0];
  const bottomWidth = q[2][0] - q[3][0];
  assert.ok(bottomWidth < topWidth, 'the shin narrows toward the ankle');
});

// --- trouble points --------------------------------------------------------

test('trouble points group by side and structure, keeping the tissue kind', () => {
  const entries = [
    { date: '2026-09-01', pain: 3, site: { view: 'front', zone: 'shin', zoneLabel: 'Shin and lower leg, front', side: 'right', structure: 'tibialis-anterior', structureLabel: 'Tibialis anterior', structureKind: 'muscle' } },
    { date: '2026-09-08', pain: 5, site: { view: 'front', zone: 'shin', zoneLabel: 'Shin and lower leg, front', side: 'right', structure: 'tibialis-anterior', structureLabel: 'Tibialis anterior', structureKind: 'muscle' } },
    { date: '2026-09-09', pain: 2, site: { view: 'front', zone: 'shin', zoneLabel: 'Shin and lower leg, front', side: 'left', structure: 'tibialis-anterior', structureLabel: 'Tibialis anterior', structureKind: 'muscle' } },
  ];
  const rows = troublePoints(entries);
  assert.equal(rows.length, 2, 'the two legs are different trouble points');
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].worst, 5);
  assert.equal(rows[0].structureKind, 'muscle', 'the tissue kind has to survive grouping');
  assert.equal(rows[0].first, '2026-09-01');
  assert.equal(rows[0].last, '2026-09-08');
});

test('entries logged as free text before the map still group', () => {
  const rows = troublePoints([
    { date: '2026-08-01', pain: 3, painSite: 'Right knee, bottom' },
    { date: '2026-08-04', pain: 4, painSite: 'Right knee, bottom' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 2);
});
