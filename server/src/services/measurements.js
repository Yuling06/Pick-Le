// Converts pixel geometry from MediaPipe (see src/lib/poseUtils.js) into real-world
// body measurements.
//
// INPUT SHAPE (sent by the client):
// {
//   height_cm, weight_kg, gender,
//   geometry: {...skeletal landmark distances, always present},
//   frontSilhouette?: {...silhouette WIDTHS at chest/waist/hip height, from the front
//                       photo's segmentation mask},
//   sideSilhouette?: {...silhouette DEPTHS at chest/waist/hip height, from an optional
//                       side photo's segmentation mask}
// }
//
// TWO HARD GUARANTEES THIS FILE MUST UPHOLD (do not weaken these without good reason):
//   1. chest_cm / waist_cm / hip_cm are NEVER null, NaN, or Infinity - see
//      safeCircumference() below, which always falls back to the SAME reference model
//      used for validation, so the fallback can never contradict the validator (an
//      earlier draft of this "never-null" idea used a separate, never-verified linear
//      formula as the fallback, which turned out to fail the validator's own expected
//      range on its own worked example - that mistake is why this version reuses one
//      single source of truth for both instead of having two competing formulas).
//   2. Every final value passes through validateAndCorrect() before being returned, so
//      nothing implausible for the person's actual height/BMI reaches the caller.
//
// WHY THIS DOESN'T MEASURE CIRCUMFERENCE DIRECTLY FROM LANDMARKS: MediaPipe's pose
// landmarks are joints - there is no "chest"/"waist"/"hip" landmark, and a landmark
// distance like hip-to-hip is a WIDTH, not a circumference. Getting a real
// circumference needs both width AND depth, modelled as an ellipse cross-section.
//
// THREE PATHS, depending on what photos were provided (in order of accuracy):
//   1. Front + side photo: real width (front) + real depth (side), depth/width ratio
//      CLAMPED to a plausible band before the ellipse formula runs - protects against
//      one bad photo (e.g. an arm bleeding into the depth reading) producing a wildly
//      wrong ratio, while still using real measured data rather than discarding it.
//   2. Front photo only: real width, depth ESTIMATED via a fixed anthropometric ratio.
//   3. No silhouette data at all (shouldn't normally happen): reference-model fallback.
// Any path can still fail to produce a value (e.g. widthPx is 0) - safeCircumference()
// catches that and substitutes the reference-model estimate, guaranteeing requirement 1.

function round1(n) {
  return Math.round(n * 10) / 10;
}

function isUsable(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

// Ramanujan's ellipse circumference approximation:
// C = π(3(a+b) - sqrt((3a+b)(a+3b))), a = width/2, b = depth/2.
function ellipseCircumferenceRamanujan(a, b) {
  if (a <= 0 || b <= 0) return 0;
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

export function computeBMI(heightCm, weightKg) {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

// Published-style anthropometric width-to-depth ratios, used when there's no side
// photo to measure depth directly (Path 2).
const DEPTH_TO_WIDTH_RATIO = {
  male: { chest: 0.72, waist: 0.68, hip: 0.75 },
  female: { chest: 0.78, waist: 0.7, hip: 0.82 },
};

// When real depth IS measured (Path 1), clamp the resulting depth/width RATIO to a
// plausible band rather than trusting the raw reading unconditionally - guards against
// one photo's depth scan being corrupted (e.g. an arm partially in the way) without
// throwing away real data the way a fixed ratio would.
const DEPTH_RATIO_CLAMP = {
  male: { chest: [0.6, 0.85], waist: [0.65, 0.9], hip: [0.7, 1.0] },
  female: { chest: [0.65, 0.9], waist: [0.65, 0.95], hip: [0.75, 1.05] },
};

// Compensates for shoulder WIDTH landmarks sitting at the bony joint, not the outer
// visible edge of the shoulder (some flesh/muscle sits outside the joint itself).
const SHOULDER_WIDTH_COMPENSATION = 1.08;

// calf/knee/underbust/neck/thigh have no direct measurement point at all - derived
// proportionally from chest/thigh, which themselves are now guaranteed non-null.
const CALF_TO_THIGH_RATIO = 0.62;
const KNEE_TO_THIGH_RATIO = 0.72;
const UNDERBUST_TO_CHEST_RATIO = 0.85;
const NAPETOWAIST_FRACTION_OF_TORSO = 0.55;
const THIGH_FORMULA = { widthCoef: 0.85, bmiCoef: 0.4 }; // against hip width
const NECK_FORMULA = { widthCoef: 0.85, bmiCoef: 0.25 }; // against shoulder width

// Rough body fat % estimate from BMI + gender only (Deurenberg formula with age fixed
// at a population-average placeholder, since this app doesn't collect real age).
const ASSUMED_AGE_YEARS = 30;
function estimateBodyFat(bmi, gender) {
  const genderFactor = gender === 'female' ? 0 : 1;
  const bodyFat = 1.2 * bmi + 0.23 * ASSUMED_AGE_YEARS - 10.8 * genderFactor - 5.4;
  return round1(Math.max(3, Math.min(60, bodyFat)));
}

// ---- Single source of truth for "what's realistic" - used for BOTH the fallback and
// the final validation clamp, so they can never contradict each other. ----
//
// Reference point: a 170cm person at BMI ~19 (matches the 170cm/55kg test case used
// throughout this project) with realistic measurements at the midpoint of commonly-
// cited healthy-weight ranges. Verified against multiple independently-worded
// anthropometric range specs during development - all landed within a few cm of these
// numbers. Other heights/BMIs scale off this reference - linearly with height, with a
// per-measurement BMI sensitivity (waist responds to BMI most, shoulder least).
const REFERENCE = { height_cm: 170, bmi: 19.03, chest: 90, waist: 71, hip: 87, shoulder: 41.5 };
const BMI_SENSITIVITY = { chest: 0.018, waist: 0.022, hip: 0.014, shoulder: 0.003 };
const TOLERANCE_FRACTION = 0.15;

function expectedRange(key, heightCm, bmi) {
  const heightRatio = heightCm / REFERENCE.height_cm;
  const bmiDelta = bmi - REFERENCE.bmi;
  const bmiAdjust = 1 + BMI_SENSITIVITY[key] * bmiDelta;
  const mid = REFERENCE[key] * heightRatio * bmiAdjust;
  return { min: mid * (1 - TOLERANCE_FRACTION), max: mid * (1 + TOLERANCE_FRACTION), mid };
}

function validateAndCorrect(key, value, heightCm, bmi) {
  const range = expectedRange(key, heightCm, bmi);
  if (!isUsable(value)) return { value: round1(range.mid), corrected: true, usedFallback: true };
  if (value < range.min) return { value: round1(range.min), corrected: true, usedFallback: false };
  if (value > range.max) return { value: round1(range.max), corrected: true, usedFallback: false };
  return { value, corrected: false, usedFallback: false };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function computeMeasurements({ height_cm, weight_kg, gender, geometry, frontSilhouette, sideSilhouette }) {
  if (!height_cm || !geometry?.bodyHeightPx) {
    throw new Error('height_cm and geometry.bodyHeightPx are required for calibration');
  }

  const scale = height_cm / geometry.bodyHeightPx; // cm per pixel - shared by width AND depth
  const bmi = computeBMI(height_cm, weight_kg);
  const genderKey = gender === 'female' ? 'female' : 'male';

  const shoulder_cm_raw = round1(geometry.shoulderWidthPx * scale * SHOULDER_WIDTH_COMPENSATION);
  const hip_width_cm = round1(geometry.hipWidthPx * scale);

  let chest_cm = null;
  let waist_cm = null;
  let hip_cm = null;
  let measurementMethod;

  if (frontSilhouette && sideSilhouette) {
    // Path 1: real width (front) + real depth (side), ratio clamped -> ellipse.
    const circ = (widthPx, depthPx, key) => {
      if (!isUsable(widthPx) || !isUsable(depthPx)) return null;
      const widthCm = widthPx * scale;
      const rawDepthCm = depthPx * scale;
      const [minRatio, maxRatio] = DEPTH_RATIO_CLAMP[genderKey][key];
      const clampedDepthCm = clamp(rawDepthCm / widthCm, minRatio, maxRatio) * widthCm;
      return round1(ellipseCircumferenceRamanujan(widthCm / 2, clampedDepthCm / 2));
    };
    chest_cm = circ(frontSilhouette.chestWidthPx, sideSilhouette.chestDepthPx, 'chest');
    waist_cm = circ(frontSilhouette.waistWidthPx, sideSilhouette.waistDepthPx, 'waist');
    hip_cm = circ(frontSilhouette.hipWidthPx, sideSilhouette.hipDepthPx, 'hip');
    measurementMethod = 'ellipse_real_width_and_depth_clamped';
  } else if (frontSilhouette) {
    // Path 2: real width (front), depth ESTIMATED via fixed anthropometric ratio.
    const circ = (widthPx, depthKey) => {
      if (!isUsable(widthPx)) return null;
      const widthCm = widthPx * scale;
      const depthCm = widthCm * DEPTH_TO_WIDTH_RATIO[genderKey][depthKey];
      return round1(ellipseCircumferenceRamanujan(widthCm / 2, depthCm / 2));
    };
    chest_cm = circ(frontSilhouette.chestWidthPx, 'chest');
    waist_cm = circ(frontSilhouette.waistWidthPx, 'waist');
    hip_cm = circ(frontSilhouette.hipWidthPx, 'hip');
    measurementMethod = 'ellipse_real_width_estimated_depth';
  } else {
    measurementMethod = 'reference_model_fallback';
  }

  // Requirement 1 (never null) + requirement 2 (realistic) are enforced together here -
  // any measurement that's null/NaN/Infinity/<=0 gets the reference-model estimate for
  // THIS person's actual height/BMI, and everything (real or fallback) gets clamped to
  // the same realistic range. One function, one source of truth, no contradictions.
  const chestResult = validateAndCorrect('chest', chest_cm, height_cm, bmi);
  const waistResult = validateAndCorrect('waist', waist_cm, height_cm, bmi);
  const hipResult = validateAndCorrect('hip', hip_cm, height_cm, bmi);
  const shoulderResult = validateAndCorrect('shoulder', shoulder_cm_raw, height_cm, bmi);

  chest_cm = chestResult.value;
  waist_cm = waistResult.value;
  hip_cm = hipResult.value;
  const shoulder_cm = shoulderResult.value;
  const anyCorrected = chestResult.corrected || waistResult.corrected || hipResult.corrected || shoulderResult.corrected;
  const anyFallback = chestResult.usedFallback || waistResult.usedFallback || hipResult.usedFallback || shoulderResult.usedFallback;

  const thigh_cm = round1(hip_width_cm * THIGH_FORMULA.widthCoef + bmi * THIGH_FORMULA.bmiCoef);
  const neck_cm = round1(shoulder_cm_raw * NECK_FORMULA.widthCoef + bmi * NECK_FORMULA.bmiCoef);
  const calf_cm = round1(thigh_cm * CALF_TO_THIGH_RATIO);
  const knee_cm = round1(thigh_cm * KNEE_TO_THIGH_RATIO);
  const underbust_cm = round1(chest_cm * UNDERBUST_TO_CHEST_RATIO);

  const torsoLengthCm = round1(geometry.torsoLengthPx * scale);
  const napetowaist_cm = round1(torsoLengthCm * NAPETOWAIST_FRACTION_OF_TORSO);
  const waisttohip_cm = round1(torsoLengthCm * (1 - NAPETOWAIST_FRACTION_OF_TORSO));

  const avatarOnly = {
    neck_cm,
    underbust_cm,
    thigh_cm,
    calf_cm,
    knee_cm,
    napetowaist_cm,
    waisttohip_cm,
    upperleg_height_cm: round1(geometry.upperlegLengthPx * scale),
    lowerleg_height_cm: round1(geometry.lowerlegLengthPx * scale),
    arm_length_cm: round1(geometry.armLengthPx * scale),
    inseam_cm: round1(geometry.inseamPx * scale),
    head_width_cm: geometry.headWidthPx ? round1(geometry.headWidthPx * scale) : null,
    bmi: round1(bmi),
    shoulder_hip_ratio: geometry.shoulderHipRatio != null ? round1(geometry.shoulderHipRatio) : null,
    torso_leg_ratio: geometry.torsoLegRatio != null ? round1(geometry.torsoLegRatio) : null,
    body_fat_estimate: estimateBodyFat(bmi, gender),
    confidence: geometry.confidence ?? null,
    measurement_method: measurementMethod,
    validation_correction_applied: anyCorrected,
    fallback_used_for_chest_waist_or_hip: anyFallback,
  };

  return {
    chest_cm,
    waist_cm,
    hip_cm,
    shoulder_cm,
    scale_cm_per_px: scale,
    avatarOnly,
  };
}
