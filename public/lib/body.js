// Where it hurts.
//
// The silhouette (silhouette.js) is artwork. The meaning lives here: a set of
// zones defined over the same 595.28 x 841.89 viewBox, each carrying the
// structures you might actually name in that part of the body — muscles,
// tendons, bones and joints, not just muscle groups. "Shin" is a zone;
// "tibialis anterior", "medial tibial border" and "anterior compartment" are
// structures inside it.
//
// A pain entry stores the click point as well as the zone, so a heat map can
// be drawn from the raw points and a zone can be re-cut later without losing
// the original data.
//
// Sidedness is the easy thing to get wrong. The front view is a mirror: the
// figure faces the viewer, so the viewer's left is the athlete's RIGHT. The
// back view is not mirrored. Both are encoded below rather than assumed.

export const VIEWS = ['front', 'back'];
export const CENTERLINE = { front: 297.5, back: 305.5 };
/** Front is mirrored (facing you); back is not. */
export const MIRRORED = { front: true, back: false };

export const KINDS = {
  muscle: 'muscle',
  tendon: 'tendon',
  bone: 'bone',
  joint: 'joint',
  nerve: 'nerve',
  other: 'other',
};

const s = (id, label, kind) => ({ id, label, kind });

/**
 * Zones, as boxes over the viewBox. Ordered most-specific first: `zoneAt`
 * takes the first box containing the point, then falls back to the nearest.
 * `sided: false` means the structure is midline and has no left or right.
 */
export const ZONES = [
  // ---------------------------------------------------------------- front
  {
    id: 'head', view: 'front', label: 'Head and face', box: [255, 50, 342, 150], sided: false,
    structures: [s('jaw', 'Jaw / TMJ', 'joint'), s('sinus', 'Sinus', 'other'), s('skull', 'Skull', 'bone')],
  },
  {
    id: 'neck-front', view: 'front', label: 'Neck, front', box: [255, 148, 342, 186], sided: true,
    structures: [
      s('scalene', 'Scalenes', 'muscle'), s('scm', 'Sternocleidomastoid', 'muscle'),
      s('throat', 'Throat / trachea', 'other'), s('cervical-spine', 'Cervical spine', 'bone'),
    ],
  },
  {
    id: 'shoulder-front', view: 'front', label: 'Shoulder, front', box: [190, 172, 405, 245], sided: true,
    outsideOnly: [232, 364],
    structures: [
      s('deltoid-ant', 'Anterior deltoid', 'muscle'), s('rotator-cuff', 'Rotator cuff', 'tendon'),
      s('biceps-tendon', 'Long head of biceps tendon', 'tendon'), s('ac-joint', 'AC joint', 'joint'),
      s('gh-joint', 'Glenohumeral joint', 'joint'), s('labrum', 'Labrum', 'other'),
    ],
  },
  {
    id: 'chest', view: 'front', label: 'Chest', box: [228, 180, 368, 262], sided: true,
    structures: [
      s('pec-major', 'Pectoralis major', 'muscle'), s('pec-minor', 'Pectoralis minor', 'muscle'),
      s('sternum', 'Sternum', 'bone'), s('ribs', 'Ribs / costal cartilage', 'bone'),
      s('intercostal', 'Intercostals', 'muscle'),
    ],
  },
  {
    id: 'upper-arm-front', view: 'front', label: 'Upper arm, front', box: [180, 225, 415, 315], sided: true,
    outsideOnly: [232, 364],
    structures: [
      s('biceps', 'Biceps brachii', 'muscle'), s('brachialis', 'Brachialis', 'muscle'),
      s('triceps', 'Triceps', 'muscle'), s('humerus', 'Humerus', 'bone'),
    ],
  },
  {
    id: 'elbow-front', view: 'front', label: 'Elbow', box: [175, 300, 420, 340], sided: true,
    outsideOnly: [232, 364],
    structures: [
      s('lateral-epicondyle', 'Lateral epicondyle (tennis elbow)', 'tendon'),
      s('medial-epicondyle', 'Medial epicondyle (golfer’s elbow)', 'tendon'),
      s('biceps-distal', 'Distal biceps tendon', 'tendon'), s('elbow-joint', 'Elbow joint', 'joint'),
      s('ulnar-nerve', 'Ulnar nerve', 'nerve'),
    ],
  },
  {
    id: 'forearm-front', view: 'front', label: 'Forearm', box: [170, 335, 425, 425], sided: true,
    outsideOnly: [240, 356],
    structures: [
      s('wrist-flexors', 'Wrist flexors', 'muscle'), s('wrist-extensors', 'Wrist extensors', 'muscle'),
      s('brachioradialis', 'Brachioradialis', 'muscle'), s('radius', 'Radius', 'bone'),
      s('ulna', 'Ulna', 'bone'),
    ],
  },
  {
    id: 'hand', view: 'front', label: 'Wrist and hand', box: [165, 420, 430, 485], sided: true,
    outsideOnly: [245, 350],
    structures: [
      s('wrist-joint', 'Wrist joint', 'joint'), s('carpal-tunnel', 'Carpal tunnel', 'nerve'),
      s('thumb-base', 'Thumb base / CMC joint', 'joint'), s('fingers', 'Fingers', 'joint'),
    ],
  },
  {
    id: 'abdomen-upper', view: 'front', label: 'Upper abdomen', box: [236, 258, 360, 332], sided: true,
    structures: [
      s('rectus-abdominis', 'Rectus abdominis', 'muscle'), s('obliques', 'Obliques', 'muscle'),
      s('diaphragm', 'Diaphragm / side stitch', 'muscle'), s('lower-ribs', 'Lower ribs', 'bone'),
    ],
  },
  {
    id: 'abdomen-lower', view: 'front', label: 'Lower abdomen', box: [236, 330, 360, 392], sided: true,
    structures: [
      s('rectus-lower', 'Lower rectus abdominis', 'muscle'), s('obliques-lower', 'Lower obliques', 'muscle'),
      s('inguinal', 'Inguinal region', 'other'),
    ],
  },
  {
    id: 'hip-front', view: 'front', label: 'Hip and groin', box: [230, 386, 366, 452], sided: true,
    structures: [
      s('hip-flexor', 'Hip flexor / psoas', 'muscle'), s('adductor', 'Adductors / groin', 'muscle'),
      s('adductor-tendon', 'Adductor tendon', 'tendon'), s('hip-joint', 'Hip joint', 'joint'),
      s('labrum-hip', 'Hip labrum', 'other'), s('tfl', 'TFL', 'muscle'),
      s('pubic', 'Pubic symphysis', 'bone'),
    ],
  },
  {
    id: 'thigh-front-upper', view: 'front', label: 'Upper thigh, front', box: [220, 448, 376, 512], sided: true,
    structures: [
      s('rectus-femoris', 'Rectus femoris', 'muscle'), s('vastus-lateralis', 'Vastus lateralis', 'muscle'),
      s('vastus-medialis', 'Vastus medialis', 'muscle'), s('adductor-mid', 'Adductors', 'muscle'),
      s('it-band-upper', 'IT band, upper', 'tendon'), s('femur', 'Femur', 'bone'),
    ],
  },
  {
    id: 'thigh-front-lower', view: 'front', label: 'Lower thigh, above the knee', box: [220, 510, 376, 566], sided: true,
    structures: [
      s('quad-tendon', 'Quad tendon', 'tendon'), s('vmo', 'VMO', 'muscle'),
      s('it-band-lower', 'IT band, lower', 'tendon'), s('distal-quad', 'Distal quadriceps', 'muscle'),
    ],
  },
  {
    id: 'knee-front', view: 'front', label: 'Knee, front', box: [220, 562, 376, 612], sided: true,
    structures: [
      s('patella', 'Patella / kneecap', 'bone'), s('patellar-tendon', 'Patellar tendon', 'tendon'),
      s('medial-joint-line', 'Medial joint line', 'joint'), s('lateral-joint-line', 'Lateral joint line', 'joint'),
      s('mcl', 'MCL', 'other'), s('lcl', 'LCL', 'other'), s('meniscus', 'Meniscus', 'other'),
      s('fat-pad', 'Fat pad', 'other'), s('gerdys', 'IT band insertion (Gerdy’s tubercle)', 'tendon'),
      s('pes-anserine', 'Pes anserine', 'tendon'),
    ],
  },
  {
    id: 'shin', view: 'front', label: 'Shin and lower leg, front', box: [220, 608, 376, 722], sided: true,
    structures: [
      s('tibialis-anterior', 'Tibialis anterior', 'muscle'),
      s('tibialis-anterior-sup', 'Tibialis anterior, upper third', 'muscle'),
      s('medial-tibia', 'Medial tibial border (shin splints)', 'bone'),
      s('tibia', 'Tibia', 'bone'), s('fibula', 'Fibula', 'bone'),
      s('anterior-compartment', 'Anterior compartment', 'other'),
      s('peroneals', 'Peroneals / fibularis', 'muscle'),
      s('extensor-tendons', 'Extensor tendons', 'tendon'),
    ],
  },
  {
    id: 'ankle-front', view: 'front', label: 'Ankle', box: [220, 718, 376, 764], sided: true,
    structures: [
      s('ankle-joint', 'Ankle joint', 'joint'), s('atfl', 'ATFL / lateral ligaments', 'other'),
      s('deltoid-lig', 'Deltoid ligament (medial)', 'other'),
      s('tib-post-tendon', 'Tibialis posterior tendon', 'tendon'),
      s('peroneal-tendon', 'Peroneal tendons', 'tendon'),
      s('medial-malleolus', 'Medial malleolus', 'bone'), s('lateral-malleolus', 'Lateral malleolus', 'bone'),
    ],
  },
  {
    id: 'foot-top', view: 'front', label: 'Foot, top', box: [215, 760, 380, 800], sided: true,
    structures: [
      s('metatarsal', 'Metatarsals', 'bone'), s('navicular', 'Navicular', 'bone'),
      s('extensor-foot', 'Extensor tendons', 'tendon'), s('toes', 'Toes', 'joint'),
      s('midfoot', 'Midfoot / Lisfranc', 'joint'), s('bunion', 'Great toe / bunion', 'joint'),
    ],
  },

  // ----------------------------------------------------------------- back
  {
    id: 'head-back', view: 'back', label: 'Back of head', box: [265, 55, 350, 145], sided: false,
    structures: [s('occiput', 'Occiput', 'bone'), s('suboccipital', 'Suboccipital muscles', 'muscle')],
  },
  {
    id: 'neck-back', view: 'back', label: 'Neck, back', box: [262, 118, 352, 190], sided: true,
    structures: [
      s('upper-trap', 'Upper trapezius', 'muscle'), s('levator', 'Levator scapulae', 'muscle'),
      s('cervical-spine-b', 'Cervical spine', 'bone'), s('nuchal', 'Nuchal line', 'other'),
    ],
  },
  {
    id: 'shoulder-back', view: 'back', label: 'Shoulder, back', box: [196, 178, 415, 256], sided: true,
    outsideOnly: [242, 369],
    structures: [
      s('deltoid-post', 'Posterior deltoid', 'muscle'), s('supraspinatus', 'Supraspinatus', 'tendon'),
      s('infraspinatus', 'Infraspinatus', 'muscle'), s('teres', 'Teres major / minor', 'muscle'),
      s('scapula', 'Scapula', 'bone'),
    ],
  },
  {
    id: 'upper-back', view: 'back', label: 'Upper back', box: [238, 186, 372, 262], sided: true,
    structures: [
      s('trapezius-mid', 'Mid trapezius', 'muscle'), s('rhomboid', 'Rhomboids', 'muscle'),
      s('thoracic-spine', 'Thoracic spine', 'bone'), s('scapula-medial', 'Medial scapular border', 'bone'),
    ],
  },
  {
    id: 'mid-back', view: 'back', label: 'Mid back', box: [238, 258, 372, 322], sided: true,
    structures: [
      s('lats', 'Latissimus dorsi', 'muscle'), s('erectors-thoracic', 'Erector spinae', 'muscle'),
      s('ribs-back', 'Ribs', 'bone'), s('serratus', 'Serratus posterior', 'muscle'),
    ],
  },
  {
    id: 'lower-back', view: 'back', label: 'Lower back', box: [238, 318, 372, 398], sided: true,
    structures: [
      s('erectors-lumbar', 'Lumbar erectors', 'muscle'), s('ql', 'Quadratus lumborum', 'muscle'),
      s('lumbar-spine', 'Lumbar spine', 'bone'), s('si-joint', 'SI joint', 'joint'),
      s('disc', 'Disc', 'other'), s('sciatic', 'Sciatic nerve', 'nerve'),
    ],
  },
  {
    id: 'upper-arm-back', view: 'back', label: 'Upper arm, back', box: [186, 228, 425, 315], sided: true,
    outsideOnly: [242, 369],
    structures: [
      s('triceps-b', 'Triceps', 'muscle'), s('triceps-tendon', 'Triceps tendon', 'tendon'),
      s('humerus-b', 'Humerus', 'bone'),
    ],
  },
  {
    id: 'forearm-back', view: 'back', label: 'Forearm, back', box: [178, 312, 432, 448], sided: true,
    outsideOnly: [248, 362],
    structures: [
      s('extensors-b', 'Wrist extensors', 'muscle'), s('elbow-back', 'Elbow / olecranon', 'joint'),
      s('radius-b', 'Radius', 'bone'), s('ulna-b', 'Ulna', 'bone'),
    ],
  },
  {
    id: 'hand-back', view: 'back', label: 'Hand, back', box: [175, 444, 436, 500], sided: true,
    outsideOnly: [252, 358],
    structures: [s('wrist-back', 'Wrist', 'joint'), s('knuckles', 'Knuckles', 'joint')],
  },
  {
    id: 'glute', view: 'back', label: 'Glutes', box: [238, 394, 374, 462], sided: true,
    structures: [
      s('glute-max', 'Gluteus maximus', 'muscle'), s('glute-med', 'Gluteus medius', 'muscle'),
      s('piriformis', 'Piriformis', 'muscle'),
      s('high-hamstring', 'High hamstring tendon', 'tendon'),
      s('ischial', 'Sit bone (ischial tuberosity)', 'bone'),
      s('sciatic-glute', 'Sciatic nerve', 'nerve'),
    ],
  },
  {
    id: 'hamstring', view: 'back', label: 'Hamstring', box: [232, 458, 380, 570], sided: true,
    structures: [
      s('biceps-femoris', 'Biceps femoris', 'muscle'), s('semitendinosus', 'Semitendinosus', 'muscle'),
      s('semimembranosus', 'Semimembranosus', 'muscle'),
      s('hamstring-mid', 'Hamstring belly', 'muscle'),
      s('it-band-back', 'IT band', 'tendon'),
    ],
  },
  {
    id: 'knee-back', view: 'back', label: 'Knee, back', box: [232, 566, 380, 616], sided: true,
    structures: [
      s('popliteal', 'Popliteal fossa', 'other'), s('hamstring-insertion', 'Hamstring insertion', 'tendon'),
      s('gastroc-origin', 'Gastrocnemius origin', 'tendon'), s('bakers', 'Baker’s cyst', 'other'),
      s('pcl', 'PCL', 'other'),
    ],
  },
  {
    id: 'calf', view: 'back', label: 'Calf', box: [232, 612, 380, 722], sided: true,
    structures: [
      s('gastrocnemius', 'Gastrocnemius', 'muscle'),
      s('gastroc-medial', 'Medial gastrocnemius', 'muscle'),
      s('soleus', 'Soleus', 'muscle'),
      s('posterior-compartment', 'Deep posterior compartment', 'other'),
      s('tib-post', 'Tibialis posterior', 'muscle'),
    ],
  },
  {
    id: 'achilles', view: 'back', label: 'Achilles', box: [232, 718, 380, 762], sided: true,
    structures: [
      s('achilles-mid', 'Achilles, mid-portion', 'tendon'),
      s('achilles-insertion', 'Achilles insertion', 'tendon'),
      s('retrocalcaneal', 'Retrocalcaneal bursa', 'other'),
      s('calcaneus', 'Calcaneus', 'bone'),
    ],
  },
  {
    id: 'foot-back', view: 'back', label: 'Heel and sole', box: [228, 758, 384, 800], sided: true,
    structures: [
      s('plantar-fascia', 'Plantar fascia', 'tendon'), s('heel-pad', 'Heel pad', 'other'),
      s('heel-spur', 'Heel / calcaneal spur', 'bone'), s('arch', 'Arch', 'other'),
    ],
  },
];

const BY_ID = new Map(ZONES.map((z) => [`${z.view}:${z.id}`, z]));
export const zonesFor = (view) => ZONES.filter((z) => z.view === view);
export const getZone = (view, id) => BY_ID.get(`${view}:${id}`) || null;

const inBox = (x, y, [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** Distance from a point to a box, 0 when inside. */
function boxDistance(x, y, [x0, y0, x1, y1]) {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dy = Math.max(y0 - y, 0, y - y1);
  return Math.hypot(dx, dy);
}

/**
 * The zone a point falls in. Limb zones carry `outsideOnly`, the torso x-range
 * they must fall outside of, so a click on the chest is not read as an arm.
 * Nothing ever returns null: the nearest zone wins, because a click on the
 * silhouette always means somewhere.
 */
export function zoneAt(view, x, y) {
  const candidates = zonesFor(view);
  const hits = candidates.filter((z) => {
    if (!inBox(x, y, z.box)) return false;
    if (z.outsideOnly && x > z.outsideOnly[0] && x < z.outsideOnly[1]) return false;
    return true;
  });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    // Prefer the smallest box: the more specific zone.
    return hits.sort((a, b) => area(a.box) - area(b.box))[0];
  }
  return candidates
    .map((z) => ({ z, d: boxDistance(x, y, z.box) }))
    .sort((a, b) => a.d - b.d)[0].z;
}

const area = ([x0, y0, x1, y1]) => (x1 - x0) * (y1 - y0);

/**
 * Which side of the body, from the athlete's point of view. The front view is
 * a mirror, so a click left-of-centre is the athlete's right.
 */
export function sideAt(view, x, zone) {
  if (zone && zone.sided === false) return 'center';
  const centre = CENTERLINE[view];
  if (Math.abs(x - centre) < 12) return 'center';
  const viewerLeft = x < centre;
  return MIRRORED[view] ? (viewerLeft ? 'right' : 'left') : (viewerLeft ? 'left' : 'right');
}

/** Everything a click means, ready to store. */
export function siteAt(view, x, y) {
  const zone = zoneAt(view, x, y);
  return {
    view,
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    zone: zone.id,
    zoneLabel: zone.label,
    side: sideAt(view, x, zone),
    structure: null,
    structureLabel: null,
  };
}

const SIDE_WORD = { left: 'Left', right: 'Right', center: '' };

/** A readable one-liner: "Right shin — tibialis anterior, upper third". */
export function describeSite(site) {
  if (!site) return '';
  if (typeof site === 'string') return site;
  const side = SIDE_WORD[site.side] || '';
  const zone = site.zoneLabel || getZone(site.view, site.zone)?.label || site.zone || 'unspecified';
  const head = side ? `${side} ${zone.charAt(0).toLowerCase()}${zone.slice(1)}` : zone;
  return site.structureLabel ? `${head} — ${site.structureLabel}` : head;
}

/** Group a list of pain entries into trouble points, worst first. */
export function troublePoints(entries) {
  const byKey = new Map();
  for (const e of entries) {
    const site = e.site || (e.painSite ? { zone: 'unmapped', zoneLabel: e.painSite, side: 'center' } : null);
    if (!site) continue;
    const key = `${site.side || 'center'}:${site.zone}:${site.structure || ''}`;
    const row = byKey.get(key) || {
      key,
      side: site.side,
      zone: site.zone,
      zoneLabel: site.zoneLabel,
      structure: site.structure,
      structureLabel: site.structureLabel,
      structureKind: site.structureKind || null,
      view: site.view,
      count: 0,
      worst: 0,
      total: 0,
      first: e.date,
      last: e.date,
      dates: [],
    };
    row.count += 1;
    row.worst = Math.max(row.worst, e.pain || 0);
    row.total += e.pain || 0;
    if (e.date < row.first) row.first = e.date;
    if (e.date > row.last) row.last = e.date;
    row.dates.push({ date: e.date, pain: e.pain });
    byKey.set(key, row);
  }
  return [...byKey.values()]
    .map((r) => ({ ...r, mean: r.total / r.count, label: describeSite(r) }))
    .sort((a, b) => b.count - a.count || b.worst - a.worst);
}
