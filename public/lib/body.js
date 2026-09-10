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

const s = (id, label, kind, area = null) => ({ id, label, kind, area });

/**
 * Zones, as boxes over the viewBox. Ordered most-specific first: `zoneAt`
 * takes the first box containing the point, then falls back to the nearest.
 * `sided: false` means the structure is midline and has no left or right.
 *
 * Every structure carries an `area`: [x0, y0, x1, y1] as fractions of the LIMB
 * box — the half of the zone on the side that was clicked. x runs LATERAL to
 * MEDIAL, so a single definition lights up the correct part of either limb
 * without being written twice. Omit it and the whole zone lights up, which is
 * the honest answer for something like a joint that has no sub-region.
 */
export const ZONES = [
  // ---------------------------------------------------------------- front
  {
    id: 'head', view: 'front', label: 'Head and face', box: [255, 50, 342, 150], sided: false,
    structures: [
      s('jaw', 'Jaw / TMJ', 'joint', [0.1, 0.6, 0.9, 0.95]),
      s('sinus', 'Sinus', 'other', [0.2, 0.3, 0.8, 0.6]),
      s('skull', 'Skull', 'bone', [0.05, 0, 0.95, 0.45]),
    ],
  },
  {
    id: 'neck-front', view: 'front', label: 'Neck, front', box: [255, 148, 342, 186], sided: true,
    structures: [
      s('scalene', 'Scalenes', 'muscle', [0, 0.2, 0.55, 1]),
      s('scm', 'Sternocleidomastoid', 'muscle', [0.2, 0, 0.8, 1]),
      s('throat', 'Throat / trachea', 'other', [0.7, 0.2, 1, 1]),
      s('cervical-spine', 'Cervical spine', 'bone', [0.6, 0, 1, 0.8]),
    ],
  },
  {
    id: 'shoulder-front', view: 'front', label: 'Shoulder, front', box: [190, 172, 405, 245], sided: true,
    outsideOnly: [232, 364],
    structures: [
      s('deltoid-ant', 'Anterior deltoid', 'muscle', [0.05, 0.15, 0.75, 0.85]),
      s('rotator-cuff', 'Rotator cuff', 'tendon', [0.3, 0.05, 0.95, 0.5]),
      s('biceps-tendon', 'Long head of biceps tendon', 'tendon', [0.35, 0.3, 0.7, 0.95]),
      s('ac-joint', 'AC joint', 'joint', [0.5, 0, 1, 0.3]),
      s('gh-joint', 'Glenohumeral joint', 'joint', [0.25, 0.2, 0.75, 0.65]),
      s('labrum', 'Labrum', 'other', [0.3, 0.25, 0.8, 0.6]),
    ],
  },
  {
    id: 'chest', view: 'front', label: 'Chest', box: [228, 180, 368, 262], sided: true,
    structures: [
      s('pec-major', 'Pectoralis major', 'muscle', [0.05, 0.15, 0.95, 0.9]),
      s('pec-minor', 'Pectoralis minor', 'muscle', [0.1, 0.1, 0.6, 0.6]),
      s('sternum', 'Sternum', 'bone', [0.82, 0.05, 1, 1]),
      s('ribs', 'Ribs / costal cartilage', 'bone', [0.3, 0.55, 1, 1]),
      s('intercostal', 'Intercostals', 'muscle', [0.1, 0.5, 0.85, 1]),
    ],
  },
  {
    id: 'upper-arm-front', view: 'front', label: 'Upper arm, front', box: [180, 225, 415, 315], sided: true,
    outsideOnly: [232, 364],
    structures: [
      s('biceps', 'Biceps brachii', 'muscle', [0.25, 0.1, 0.9, 0.85]),
      s('brachialis', 'Brachialis', 'muscle', [0.15, 0.45, 0.7, 1]),
      s('triceps', 'Triceps', 'muscle', [0, 0.1, 0.4, 0.9]),
      s('humerus', 'Humerus', 'bone', [0.35, 0, 0.7, 1]),
    ],
  },
  {
    id: 'elbow-front', view: 'front', label: 'Elbow', box: [175, 300, 420, 340], sided: true,
    outsideOnly: [232, 364],
    structures: [
      s('lateral-epicondyle', 'Lateral epicondyle (tennis elbow)', 'tendon', [0, 0.15, 0.35, 0.85]),
      s('medial-epicondyle', 'Medial epicondyle (golfer’s elbow)', 'tendon', [0.65, 0.15, 1, 0.85]),
      s('biceps-distal', 'Distal biceps tendon', 'tendon', [0.3, 0, 0.75, 0.6]),
      s('elbow-joint', 'Elbow joint', 'joint', [0.2, 0.25, 0.85, 0.95]),
      s('ulnar-nerve', 'Ulnar nerve', 'nerve', [0.72, 0.25, 1, 1]),
    ],
  },
  {
    id: 'forearm-front', view: 'front', label: 'Forearm', box: [170, 335, 425, 425], sided: true,
    outsideOnly: [240, 356],
    structures: [
      s('wrist-flexors', 'Wrist flexors', 'muscle', [0.5, 0.1, 1, 0.95]),
      s('wrist-extensors', 'Wrist extensors', 'muscle', [0, 0.1, 0.5, 0.95]),
      s('brachioradialis', 'Brachioradialis', 'muscle', [0, 0, 0.45, 0.5]),
      s('radius', 'Radius', 'bone', [0.08, 0.2, 0.36, 1]),
      s('ulna', 'Ulna', 'bone', [0.66, 0.2, 0.94, 1]),
    ],
  },
  {
    id: 'hand', view: 'front', label: 'Wrist and hand', box: [165, 420, 430, 485], sided: true,
    outsideOnly: [245, 350],
    structures: [
      s('wrist-joint', 'Wrist joint', 'joint', [0.05, 0, 0.95, 0.3]),
      s('carpal-tunnel', 'Carpal tunnel', 'nerve', [0.35, 0.15, 0.85, 0.5]),
      s('thumb-base', 'Thumb base / CMC joint', 'joint', [0.6, 0.2, 1, 0.6]),
      s('fingers', 'Fingers', 'joint', [0, 0.55, 1, 1]),
    ],
  },
  {
    id: 'abdomen-upper', view: 'front', label: 'Upper abdomen', box: [236, 258, 360, 332], sided: true,
    structures: [
      s('rectus-abdominis', 'Rectus abdominis', 'muscle', [0.55, 0, 1, 1]),
      s('obliques', 'Obliques', 'muscle', [0, 0.1, 0.55, 1]),
      s('diaphragm', 'Diaphragm / side stitch', 'muscle', [0.1, 0, 1, 0.35]),
      s('lower-ribs', 'Lower ribs', 'bone', [0, 0, 0.8, 0.4]),
    ],
  },
  {
    id: 'abdomen-lower', view: 'front', label: 'Lower abdomen', box: [236, 330, 360, 392], sided: true,
    structures: [
      s('rectus-lower', 'Lower rectus abdominis', 'muscle', [0.55, 0, 1, 1]),
      s('obliques-lower', 'Lower obliques', 'muscle', [0, 0, 0.55, 1]),
      s('inguinal', 'Inguinal region', 'other', [0.1, 0.6, 0.8, 1]),
    ],
  },
  {
    id: 'hip-front', view: 'front', label: 'Hip and groin', box: [230, 386, 366, 452], sided: true,
    structures: [
      s('hip-flexor', 'Hip flexor / psoas', 'muscle', [0.3, 0, 0.85, 0.6]),
      s('adductor', 'Adductors / groin', 'muscle', [0.6, 0.35, 1, 1]),
      s('adductor-tendon', 'Adductor tendon', 'tendon', [0.75, 0.25, 1, 0.7]),
      s('hip-joint', 'Hip joint', 'joint', [0.2, 0.15, 0.7, 0.65]),
      s('labrum-hip', 'Hip labrum', 'other', [0.25, 0.2, 0.65, 0.6]),
      s('tfl', 'TFL', 'muscle', [0, 0.05, 0.35, 0.6]),
      s('pubic', 'Pubic symphysis', 'bone', [0.85, 0.45, 1, 0.9]),
    ],
  },
  {
    id: 'thigh-front-upper', view: 'front', label: 'Upper thigh, front', box: [220, 448, 376, 512], sided: true,
    structures: [
      s('rectus-femoris', 'Rectus femoris', 'muscle', [0.35, 0, 0.75, 1]),
      s('vastus-lateralis', 'Vastus lateralis', 'muscle', [0, 0.1, 0.4, 1]),
      s('vastus-medialis', 'Vastus medialis', 'muscle', [0.7, 0.35, 1, 1]),
      s('adductor-mid', 'Adductors', 'muscle', [0.75, 0, 1, 0.8]),
      s('it-band-upper', 'IT band, upper', 'tendon', [0, 0, 0.22, 1]),
      s('femur', 'Femur', 'bone', [0.4, 0, 0.7, 1]),
    ],
  },
  {
    id: 'thigh-front-lower', view: 'front', label: 'Lower thigh, above the knee', box: [220, 510, 376, 566], sided: true,
    structures: [
      s('quad-tendon', 'Quad tendon', 'tendon', [0.3, 0.5, 0.8, 1]),
      s('vmo', 'VMO', 'muscle', [0.65, 0.3, 1, 1]),
      s('it-band-lower', 'IT band, lower', 'tendon', [0, 0, 0.22, 1]),
      s('distal-quad', 'Distal quadriceps', 'muscle', [0.25, 0, 0.85, 0.7]),
    ],
  },
  {
    id: 'knee-front', view: 'front', label: 'Knee, front', box: [220, 562, 376, 612], sided: true,
    structures: [
      s('patella', 'Patella / kneecap', 'bone', [0.3, 0.1, 0.75, 0.6]),
      s('patellar-tendon', 'Patellar tendon', 'tendon', [0.35, 0.55, 0.7, 1]),
      s('medial-joint-line', 'Medial joint line', 'joint', [0.72, 0.35, 1, 0.75]),
      s('lateral-joint-line', 'Lateral joint line', 'joint', [0, 0.35, 0.28, 0.75]),
      s('mcl', 'MCL', 'other', [0.78, 0.2, 1, 0.9]),
      s('lcl', 'LCL', 'other', [0, 0.2, 0.22, 0.9]),
      s('meniscus', 'Meniscus', 'other', [0.15, 0.45, 0.9, 0.7]),
      s('fat-pad', 'Fat pad', 'other', [0.35, 0.6, 0.7, 0.85]),
      s('gerdys', 'IT band insertion (Gerdy’s tubercle)', 'tendon', [0, 0.55, 0.3, 0.95]),
      s('pes-anserine', 'Pes anserine', 'tendon', [0.72, 0.7, 1, 1]),
    ],
  },
  {
    id: 'shin', view: 'front', label: 'Shin and lower leg, front', box: [220, 608, 376, 722], sided: true,
    structures: [
      s('tibialis-anterior', 'Tibialis anterior', 'muscle', [0.25, 0.05, 0.7, 0.75]),
      s('tibialis-anterior-sup', 'Tibialis anterior, upper third', 'muscle', [0.25, 0.02, 0.7, 0.34]),
      s('medial-tibia', 'Medial tibial border (shin splints)', 'bone', [0.7, 0.1, 0.95, 0.9]),
      s('tibia', 'Tibia', 'bone', [0.55, 0, 0.9, 1]),
      s('fibula', 'Fibula', 'bone', [0, 0.05, 0.25, 1]),
      s('anterior-compartment', 'Anterior compartment', 'other', [0.2, 0.05, 0.65, 0.85]),
      s('peroneals', 'Peroneals / fibularis', 'muscle', [0, 0.15, 0.3, 0.9]),
      s('extensor-tendons', 'Extensor tendons', 'tendon', [0.25, 0.75, 0.75, 1]),
    ],
  },
  {
    id: 'ankle-front', view: 'front', label: 'Ankle', box: [220, 718, 376, 764], sided: true,
    structures: [
      s('ankle-joint', 'Ankle joint', 'joint', [0.15, 0.2, 0.9, 0.75]),
      s('atfl', 'ATFL / lateral ligaments', 'other', [0, 0.35, 0.3, 0.9]),
      s('deltoid-lig', 'Deltoid ligament (medial)', 'other', [0.72, 0.35, 1, 0.9]),
      s('tib-post-tendon', 'Tibialis posterior tendon', 'tendon', [0.75, 0.15, 1, 0.7]),
      s('peroneal-tendon', 'Peroneal tendons', 'tendon', [0, 0.15, 0.28, 0.7]),
      s('medial-malleolus', 'Medial malleolus', 'bone', [0.75, 0.25, 1, 0.65]),
      s('lateral-malleolus', 'Lateral malleolus', 'bone', [0, 0.25, 0.25, 0.65]),
    ],
  },
  {
    id: 'foot-top', view: 'front', label: 'Foot, top', box: [215, 760, 380, 800], sided: true,
    structures: [
      s('metatarsal', 'Metatarsals', 'bone', [0.1, 0.3, 0.95, 0.8]),
      s('navicular', 'Navicular', 'bone', [0.6, 0.05, 0.95, 0.45]),
      s('extensor-foot', 'Extensor tendons', 'tendon', [0.2, 0.1, 0.8, 0.7]),
      s('toes', 'Toes', 'joint', [0, 0.75, 1, 1]),
      s('midfoot', 'Midfoot / Lisfranc', 'joint', [0.35, 0.15, 0.85, 0.55]),
      s('bunion', 'Great toe / bunion', 'joint', [0.75, 0.7, 1, 1]),
    ],
  },

  // ----------------------------------------------------------------- back
  {
    id: 'head-back', view: 'back', label: 'Back of head', box: [265, 55, 350, 145], sided: false,
    structures: [
      s('occiput', 'Occiput', 'bone', [0.1, 0.55, 0.9, 0.9]),
      s('suboccipital', 'Suboccipital muscles', 'muscle', [0.2, 0.75, 0.8, 1]),
    ],
  },
  {
    id: 'neck-back', view: 'back', label: 'Neck, back', box: [262, 118, 352, 190], sided: true,
    structures: [
      s('upper-trap', 'Upper trapezius', 'muscle', [0, 0.4, 0.7, 1]),
      s('levator', 'Levator scapulae', 'muscle', [0.1, 0.5, 0.6, 1]),
      s('cervical-spine-b', 'Cervical spine', 'bone', [0.75, 0, 1, 1]),
      s('nuchal', 'Nuchal line', 'other', [0.3, 0, 1, 0.25]),
    ],
  },
  {
    id: 'shoulder-back', view: 'back', label: 'Shoulder, back', box: [196, 178, 415, 256], sided: true,
    outsideOnly: [242, 369],
    structures: [
      s('deltoid-post', 'Posterior deltoid', 'muscle', [0.05, 0.1, 0.7, 0.8]),
      s('supraspinatus', 'Supraspinatus', 'tendon', [0.4, 0, 1, 0.3]),
      s('infraspinatus', 'Infraspinatus', 'muscle', [0.45, 0.25, 1, 0.75]),
      s('teres', 'Teres major / minor', 'muscle', [0.4, 0.6, 1, 1]),
      s('scapula', 'Scapula', 'bone', [0.35, 0.1, 1, 0.95]),
    ],
  },
  {
    id: 'upper-back', view: 'back', label: 'Upper back', box: [238, 186, 372, 262], sided: true,
    structures: [
      s('trapezius-mid', 'Mid trapezius', 'muscle', [0.3, 0, 1, 0.8]),
      s('rhomboid', 'Rhomboids', 'muscle', [0.5, 0.15, 0.95, 0.85]),
      s('thoracic-spine', 'Thoracic spine', 'bone', [0.85, 0, 1, 1]),
      s('scapula-medial', 'Medial scapular border', 'bone', [0.6, 0.12, 0.86, 0.92]),
    ],
  },
  {
    id: 'mid-back', view: 'back', label: 'Mid back', box: [238, 258, 372, 322], sided: true,
    structures: [
      s('lats', 'Latissimus dorsi', 'muscle', [0, 0, 0.75, 1]),
      s('erectors-thoracic', 'Erector spinae', 'muscle', [0.72, 0, 1, 1]),
      s('ribs-back', 'Ribs', 'bone', [0.1, 0, 0.8, 0.6]),
      s('serratus', 'Serratus posterior', 'muscle', [0.05, 0.1, 0.5, 0.7]),
    ],
  },
  {
    id: 'lower-back', view: 'back', label: 'Lower back', box: [238, 318, 372, 398], sided: true,
    structures: [
      s('erectors-lumbar', 'Lumbar erectors', 'muscle', [0.65, 0, 1, 0.85]),
      s('ql', 'Quadratus lumborum', 'muscle', [0.35, 0.05, 0.8, 0.6]),
      s('lumbar-spine', 'Lumbar spine', 'bone', [0.85, 0, 1, 0.9]),
      s('si-joint', 'SI joint', 'joint', [0.6, 0.7, 0.95, 1]),
      s('disc', 'Disc', 'other', [0.8, 0.2, 1, 0.8]),
      s('sciatic', 'Sciatic nerve', 'nerve', [0.5, 0.75, 0.9, 1]),
    ],
  },
  {
    id: 'upper-arm-back', view: 'back', label: 'Upper arm, back', box: [186, 228, 425, 315], sided: true,
    outsideOnly: [242, 369],
    structures: [
      s('triceps-b', 'Triceps', 'muscle', [0.15, 0.05, 0.9, 0.8]),
      s('triceps-tendon', 'Triceps tendon', 'tendon', [0.3, 0.75, 0.8, 1]),
      s('humerus-b', 'Humerus', 'bone', [0.35, 0, 0.7, 1]),
    ],
  },
  {
    id: 'forearm-back', view: 'back', label: 'Forearm, back', box: [178, 312, 432, 448], sided: true,
    outsideOnly: [248, 362],
    structures: [
      s('extensors-b', 'Wrist extensors', 'muscle', [0.1, 0.15, 0.75, 0.9]),
      s('elbow-back', 'Elbow / olecranon', 'joint', [0.3, 0, 0.9, 0.2]),
      s('radius-b', 'Radius', 'bone', [0.08, 0.25, 0.36, 1]),
      s('ulna-b', 'Ulna', 'bone', [0.58, 0.3, 0.86, 0.95]),
    ],
  },
  {
    id: 'hand-back', view: 'back', label: 'Hand, back', box: [175, 444, 436, 500], sided: true,
    outsideOnly: [252, 358],
    structures: [
      s('wrist-back', 'Wrist', 'joint', [0.05, 0, 0.95, 0.35]),
      s('knuckles', 'Knuckles', 'joint', [0.05, 0.6, 0.95, 1]),
    ],
  },
  {
    id: 'glute', view: 'back', label: 'Glutes', box: [238, 394, 374, 462], sided: true,
    structures: [
      s('glute-max', 'Gluteus maximus', 'muscle', [0.2, 0.2, 1, 1]),
      s('glute-med', 'Gluteus medius', 'muscle', [0, 0, 0.5, 0.55]),
      s('piriformis', 'Piriformis', 'muscle', [0.4, 0.2, 0.85, 0.55]),
      s('high-hamstring', 'High hamstring tendon', 'tendon', [0.35, 0.75, 0.9, 1]),
      s('ischial', 'Sit bone (ischial tuberosity)', 'bone', [0.5, 0.8, 0.95, 1]),
      s('sciatic-glute', 'Sciatic nerve', 'nerve', [0.45, 0.45, 0.8, 1]),
    ],
  },
  {
    id: 'hamstring', view: 'back', label: 'Hamstring', box: [232, 458, 380, 570], sided: true,
    structures: [
      s('biceps-femoris', 'Biceps femoris', 'muscle', [0, 0.05, 0.45, 0.95]),
      s('semitendinosus', 'Semitendinosus', 'muscle', [0.55, 0.05, 0.9, 0.95]),
      s('semimembranosus', 'Semimembranosus', 'muscle', [0.7, 0.2, 1, 0.95]),
      s('hamstring-mid', 'Hamstring belly', 'muscle', [0.2, 0.3, 0.85, 0.75]),
      s('it-band-back', 'IT band', 'tendon', [0, 0, 0.2, 1]),
    ],
  },
  {
    id: 'knee-back', view: 'back', label: 'Knee, back', box: [232, 566, 380, 616], sided: true,
    structures: [
      s('popliteal', 'Popliteal fossa', 'other', [0.25, 0.25, 0.8, 0.75]),
      s('hamstring-insertion', 'Hamstring insertion', 'tendon', [0.15, 0, 0.95, 0.35]),
      s('gastroc-origin', 'Gastrocnemius origin', 'tendon', [0.2, 0.65, 0.9, 1]),
      s('bakers', 'Baker’s cyst', 'other', [0.55, 0.3, 0.9, 0.7]),
      s('pcl', 'PCL', 'other', [0.35, 0.35, 0.7, 0.7]),
    ],
  },
  {
    id: 'calf', view: 'back', label: 'Calf', box: [232, 612, 380, 722], sided: true,
    structures: [
      s('gastrocnemius', 'Gastrocnemius', 'muscle', [0.1, 0, 0.95, 0.6]),
      s('gastroc-medial', 'Medial gastrocnemius', 'muscle', [0.55, 0, 0.95, 0.55]),
      s('soleus', 'Soleus', 'muscle', [0.15, 0.45, 0.9, 0.95]),
      s('posterior-compartment', 'Deep posterior compartment', 'other', [0.3, 0.3, 0.85, 0.9]),
      s('tib-post', 'Tibialis posterior', 'muscle', [0.6, 0.35, 0.95, 0.9]),
    ],
  },
  {
    id: 'achilles', view: 'back', label: 'Achilles', box: [232, 718, 380, 762], sided: true,
    structures: [
      s('achilles-mid', 'Achilles, mid-portion', 'tendon', [0.3, 0.1, 0.75, 0.6]),
      s('achilles-insertion', 'Achilles insertion', 'tendon', [0.3, 0.6, 0.75, 1]),
      s('retrocalcaneal', 'Retrocalcaneal bursa', 'other', [0.35, 0.65, 0.8, 0.95]),
      s('calcaneus', 'Calcaneus', 'bone', [0.25, 0.75, 0.85, 1]),
    ],
  },
  {
    id: 'foot-back', view: 'back', label: 'Heel and sole', box: [228, 758, 384, 800], sided: true,
    structures: [
      s('plantar-fascia', 'Plantar fascia', 'tendon', [0.2, 0.3, 0.9, 0.9]),
      s('heel-pad', 'Heel pad', 'other', [0.25, 0, 0.85, 0.45]),
      s('heel-spur', 'Heel / calcaneal spur', 'bone', [0.35, 0.1, 0.8, 0.5]),
      s('arch', 'Arch', 'other', [0.45, 0.4, 1, 0.95]),
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

/**
 * Where each limb actually is, measured off the artwork rather than assumed
 * from the zone box.
 *
 * A zone box is drawn wide enough to catch a click, so half of it is much
 * wider than the limb inside it — the shin box's half spans 77 units where the
 * shin spans 50. Placing a structure by fractions of that half pushed
 * everything outward and stretched it, which left the lateral bones sitting
 * off the leg entirely. These are the real extents, sampled from the rendered
 * silhouette: `top` and `bottom` are the limb's span at each end of its ink, so
 * a tapering calf or an angled forearm is followed rather than boxed.
 */
export const LIMBS = {
  'front:head': { center: { y: [58, 150.5], top: [273, 323], bottom: [275.5, 319.5] } },
  'front:neck-front': { viewerLeft: { y: [148, 186.5], top: [275.5, 298], bottom: [255, 298] }, viewerRight: { y: [148, 186.5], top: [297.5, 319.5], bottom: [297.5, 342.5] } },
  'front:shoulder-front': { viewerLeft: { y: [177.5, 245.5], top: [216.5, 232.5], bottom: [195.5, 232.5] }, viewerRight: { y: [177.5, 245.5], top: [364, 379], bottom: [364, 399.5] } },
  'front:chest': { viewerLeft: { y: [180, 262.5], top: [228, 298], bottom: [228, 298] }, viewerRight: { y: [180, 262.5], top: [297.5, 368.5], bottom: [297.5, 368.5] } },
  'front:upper-arm-front': { viewerLeft: { y: [225, 315.5], top: [196, 232.5], bottom: [180, 216] }, viewerRight: { y: [225, 315.5], top: [364, 399.5], bottom: [379.5, 415] } },
  'front:elbow-front': { viewerLeft: { y: [300, 340.5], top: [180.5, 215.5], bottom: [175, 215] }, viewerRight: { y: [300, 340.5], top: [379.5, 415], bottom: [380.5, 420] } },
  'front:forearm-front': { viewerLeft: { y: [335, 425.5], top: [175, 212], bottom: [175, 197.5] }, viewerRight: { y: [335, 425.5], top: [383.5, 420], bottom: [398, 420.5] } },
  'front:hand': { viewerLeft: { y: [420, 456], top: [174.5, 205], bottom: [176, 200.5] }, viewerRight: { y: [420, 456], top: [391, 420.5], bottom: [396.5, 419.5] } },
  'front:abdomen-upper': { viewerLeft: { y: [258, 332.5], top: [236, 298], bottom: [241, 298] }, viewerRight: { y: [258, 332.5], top: [297.5, 360.5], bottom: [297.5, 354] } },
  'front:abdomen-lower': { viewerLeft: { y: [330, 392.5], top: [240.5, 298], bottom: [236, 298] }, viewerRight: { y: [330, 392.5], top: [297.5, 355], bottom: [297.5, 360.5] } },
  'front:hip-front': { viewerLeft: { y: [386, 452.5], top: [230, 298], bottom: [230, 297.5] }, viewerRight: { y: [386, 452.5], top: [297.5, 366.5], bottom: [298, 366.5] } },
  'front:thigh-front-upper': { viewerLeft: { y: [448, 512.5], top: [224.5, 296.5], bottom: [225.5, 291] }, viewerRight: { y: [448, 512.5], top: [299, 370.5], bottom: [305.5, 369.5] } },
  'front:thigh-front-lower': { viewerLeft: { y: [510, 566.5], top: [227, 289], bottom: [231.5, 280] }, viewerRight: { y: [510, 566.5], top: [307, 368], bottom: [315, 363.5] } },
  'front:knee-front': { viewerLeft: { y: [562, 612.5], top: [232.5, 277], bottom: [224.5, 277] }, viewerRight: { y: [562, 612.5], top: [318, 362.5], bottom: [318, 370.5] } },
  'front:shin': { viewerLeft: { y: [608, 722.5], top: [226, 276.5], bottom: [239, 264.5] }, viewerRight: { y: [608, 722.5], top: [318.5, 369], bottom: [330.5, 356.5] } },
  'front:ankle-front': { viewerLeft: { y: [718, 764.5], top: [236.5, 266.5], bottom: [220, 261.5] }, viewerRight: { y: [718, 764.5], top: [328.5, 358.5], bottom: [334, 376.5] } },
  'front:foot-top': { viewerLeft: { y: [760, 784], top: [215, 260], bottom: [236.5, 253] }, viewerRight: { y: [760, 784], top: [335, 380], bottom: [342, 358.5] } },
  'back:head-back': { center: { y: [65.5, 145.5], top: [281.5, 329.5], bottom: [277, 332] } },
  'back:neck-back': { viewerLeft: { y: [118, 190.5], top: [275, 306], bottom: [262, 306] }, viewerRight: { y: [118, 190.5], top: [305.5, 335.5], bottom: [305.5, 352.5] } },
  'back:shoulder-back': { viewerLeft: { y: [180, 256.5], top: [224.5, 242.5], bottom: [201.5, 242.5] }, viewerRight: { y: [180, 256.5], top: [369, 387], bottom: [369, 410] } },
  'back:upper-back': { viewerLeft: { y: [186, 262.5], top: [238, 306], bottom: [238, 306] }, viewerRight: { y: [186, 262.5], top: [305.5, 372.5], bottom: [305.5, 372.5] } },
  'back:mid-back': { viewerLeft: { y: [258, 322.5], top: [238, 306], bottom: [245, 305.5] }, viewerRight: { y: [258, 322.5], top: [305.5, 372.5], bottom: [306.5, 366.5] } },
  'back:lower-back': { viewerLeft: { y: [318, 398.5], top: [247, 306], bottom: [239, 306] }, viewerRight: { y: [318, 398.5], top: [305.5, 364.5], bottom: [305.5, 372.5] } },
  'back:upper-arm-back': { viewerLeft: { y: [228, 315.5], top: [202, 242.5], bottom: [189, 224.5] }, viewerRight: { y: [228, 315.5], top: [369, 409.5], bottom: [386.5, 422] } },
  'back:forearm-back': { viewerLeft: { y: [312, 448.5], top: [184, 224], bottom: [183.5, 217] }, viewerRight: { y: [312, 448.5], top: [387, 427.5], bottom: [394.5, 428] } },
  'back:hand-back': { viewerLeft: { y: [444, 463], top: [183.5, 217], bottom: [185, 203.5] }, viewerRight: { y: [444, 463], top: [394.5, 427.5], bottom: [408.5, 426.5] } },
  'back:glute': { viewerLeft: { y: [394, 462.5], top: [238, 306], bottom: [238, 305] }, viewerRight: { y: [394, 462.5], top: [305.5, 374.5], bottom: [306, 374.5] } },
  'back:hamstring': { viewerLeft: { y: [458, 570.5], top: [232, 304.5], bottom: [238.5, 291.5] }, viewerRight: { y: [458, 570.5], top: [306.5, 380.5], bottom: [320, 373] } },
  'back:knee-back': { viewerLeft: { y: [566, 616.5], top: [236.5, 289], bottom: [233.5, 284] }, viewerRight: { y: [566, 616.5], top: [322, 375], bottom: [327, 378] } },
  'back:calf': { viewerLeft: { y: [612, 722.5], top: [232, 285], bottom: [239, 271] }, viewerRight: { y: [612, 722.5], top: [326.5, 380], bottom: [340, 372] } },
  'back:achilles': { viewerLeft: { y: [718, 762.5], top: [242.5, 271], bottom: [246.5, 273.5] }, viewerRight: { y: [718, 762.5], top: [340.5, 369], bottom: [338, 365] } },
  'back:foot-back': { viewerLeft: { y: [758, 791.5], top: [242.5, 275], bottom: [246, 278] }, viewerRight: { y: [758, 791.5], top: [336.5, 368.5], bottom: [333, 365.5] } },
};

/** Which half of the screen a side of the body is on. */
export const viewerSide = (view, side) => (MIRRORED[view]
  ? (side === 'right' ? 'viewerLeft' : 'viewerRight')
  : (side === 'left' ? 'viewerLeft' : 'viewerRight'));

const spanUnion = (a, b) => {
  if (!a) return b || null;
  if (!b) return a;
  return {
    y: [Math.min(a.y[0], b.y[0]), Math.max(a.y[1], b.y[1])],
    top: [Math.min(a.top[0], b.top[0]), Math.max(a.top[1], b.top[1])],
    bottom: [Math.min(a.bottom[0], b.bottom[0]), Math.max(a.bottom[1], b.bottom[1])],
  };
};

/** The measured limb for a zone and side; both halves when the point is midline. */
export function limbFor(view, zoneId, side) {
  const entry = LIMBS[`${view}:${zoneId}`];
  if (!entry) return null;
  if (entry.center) return entry.center;
  if (side !== 'left' && side !== 'right') return spanUnion(entry.viewerLeft, entry.viewerRight);
  return entry[viewerSide(view, side)] || null;
}

/**
 * The outline of a structure, as four points that follow the limb.
 *
 * Areas are stored as fractions of the limb with x running lateral to medial,
 * so one definition lights up the right part of either arm or leg. The limb's
 * taper is applied at both ends of the structure, so a shape down at the ankle
 * comes out as narrow as the ankle. A structure with no area of its own covers
 * the whole limb, which is the honest answer when there is no smaller region
 * to point at.
 */
export function structureQuad(view, zoneId, structureId, side = 'center') {
  const zone = getZone(view, zoneId);
  const limb = limbFor(view, zoneId, side);
  if (!zone || !limb) return null;
  const st = structureId ? zone.structures.find((x) => x.id === structureId) : null;
  const [fx0, fy0, fx1, fy1] = st?.area || [0, 0, 1, 1];
  const sided = zone.sided !== false && (side === 'left' || side === 'right');
  // On the viewer's right the limb runs medial to lateral across the screen.
  const flip = sided && viewerSide(view, side) === 'viewerRight';

  const [ly0, ly1] = limb.y;
  const h = ly1 - ly0;
  const edge = (y) => {
    const t = h ? (y - ly0) / h : 0;
    const a = limb.top[0] + (limb.bottom[0] - limb.top[0]) * t;
    const b = limb.top[1] + (limb.bottom[1] - limb.top[1]) * t;
    const w = b - a;
    return flip ? [b - fx1 * w, b - fx0 * w] : [a + fx0 * w, a + fx1 * w];
  };
  const yA = ly0 + fy0 * h;
  const yB = ly0 + fy1 * h;
  const [ax0, ax1] = edge(yA);
  const [bx0, bx1] = edge(yB);
  return [[ax0, yA], [ax1, yA], [bx1, yB], [bx0, yB]];
}

/** The bounding box of a quad, for anything that needs a rectangle. */
export const quadBounds = (quad) => (quad ? [
  Math.min(...quad.map((p) => p[0])), Math.min(...quad.map((p) => p[1])),
  Math.max(...quad.map((p) => p[0])), Math.max(...quad.map((p) => p[1])),
] : null);

/** The same, straight from a stored site. */
export const siteQuad = (site, structureId = site?.structure) => (site
  ? structureQuad(site.view, site.zone, structureId, site.side)
  : null);

export const siteArea = (site, structureId = site?.structure) => quadBounds(siteQuad(site, structureId));

/** Which letter goes on which side of the figure on screen. */
export const sideLetters = (view) => (MIRRORED[view]
  ? { viewerLeft: 'R', viewerRight: 'L' }
  : { viewerLeft: 'L', viewerRight: 'R' });
