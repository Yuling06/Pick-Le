// Landmark-only body measurement pipeline. Uses MediaPipe Pose Landmarker's skeleton
// points on a SINGLE frontal photo, plus the user's real height/weight/gender.
//
// This deliberately does NOT use a segmentation mask or a side/depth photo. An earlier
// version of this pipeline tried silhouette width/depth scanning (segmentation mask +
// ellipse-circumference math) and it was fragile in practice: arms merging into torso
// measurements, legs merging into each other, segmentation edge artifacts corrupting
// height detection, and front/side photo scale mismatches. This version predicts
// circumferences (which no skeleton landmark can measure directly) from BMI and
// skeletal proportions instead.

import { FilesetResolver, PoseLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const SEGMENTER_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';

let poseLandmarkerPromise = null;
let imageSegmenterPromise = null;

async function getImageSegmenter() {
  if (!imageSegmenterPromise) {
    imageSegmenterPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: SEGMENTER_MODEL },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
      });
    })();
  }
  return imageSegmenterPromise;
}

async function getPoseLandmarker() {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL },
        runningMode: 'IMAGE',
        numPoses: 1,
      });
    })();
  }
  return poseLandmarkerPromise;
}

// MediaPipe Pose landmark indices we care about.
const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};

/**
 * Runs the pose model on one photo and returns the raw landmark array:
 * [{ x, y, z, visibility }] with x/y/z normalized to 0-1 (MediaPipe's own convention).
 * visibility (0-1) is the model's own confidence that this landmark is genuinely
 * visible (not occluded/off-frame) - previously ignored entirely in this pipeline.
 */
export async function detectLandmarks(imageSource) {
  const poseLandmarker = await getPoseLandmarker();
  const result = poseLandmarker.detect(imageSource);
  if (!result.landmarks?.length) {
    throw new Error('No person detected in the photo - please retake it with your full body visible.');
  }
  return result.landmarks[0];
}

// ---- Step 2: photo validation ----

const VISIBILITY_THRESHOLD = 0.5;
// Major landmarks that must all be clearly visible for a usable full-body photo.
const MAJOR_LANDMARK_INDICES = [
  LM.NOSE, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP,
  LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
];

/**
 * Rejects photos that can't reliably be measured, before any measurement math runs.
 * Returns { success: true } or { success: false, reason: 'FULL_BODY_NOT_VISIBLE' }.
 * This is deliberately a HEURISTIC for rotation/arm-occlusion (there's no ground truth
 * to check against from a single photo) - it catches the clearest cases, not every one.
 */
export function validateFullBodyVisible(landmarks) {
  const missingOrLowVisibility = MAJOR_LANDMARK_INDICES.some(
    (i) => !landmarks[i] || landmarks[i].visibility < VISIBILITY_THRESHOLD
  );
  if (missingOrLowVisibility) {
    return { success: false, reason: 'FULL_BODY_NOT_VISIBLE' };
  }

  // Ankles or head missing entirely (visibility check above already covers this for
  // ankles/nose, but kept as an explicit named check per the spec).
  const ankleOrHeadMissing = [LM.NOSE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE].some(
    (i) => !landmarks[i] || landmarks[i].visibility < VISIBILITY_THRESHOLD
  );
  if (ankleOrHeadMissing) {
    return { success: false, reason: 'FULL_BODY_NOT_VISIBLE' };
  }

  // Heavy rotation heuristic: a genuinely front-facing photo should have a shoulder
  // width that's a plausible fraction of hip-to-ankle span. If shoulders read as very
  // narrow relative to the rest of the body, the person is likely turned sideways.
  const shoulderL = landmarks[LM.LEFT_SHOULDER];
  const shoulderR = landmarks[LM.RIGHT_SHOULDER];
  const hipL = landmarks[LM.LEFT_HIP];
  const hipR = landmarks[LM.RIGHT_HIP];
  const ankleL = landmarks[LM.LEFT_ANKLE];
  const ankleR = landmarks[LM.RIGHT_ANKLE];
  const shoulderWidthNorm = Math.abs(shoulderL.x - shoulderR.x);
  const hipToAnkleNorm = Math.abs((hipL.y + hipR.y) / 2 - (ankleL.y + ankleR.y) / 2);
  const MIN_PLAUSIBLE_SHOULDER_RATIO = 0.12; // a real front-on shoulder width vs torso+leg height
  if (hipToAnkleNorm > 0 && shoulderWidthNorm / hipToAnkleNorm < MIN_PLAUSIBLE_SHOULDER_RATIO) {
    return { success: false, reason: 'FULL_BODY_NOT_VISIBLE' };
  }

  // Arms-covering-torso heuristic: if a wrist sits right on the body's own centerline
  // at torso height, the arm is likely crossed in front of the body rather than at the
  // sides, which would corrupt any measurement relying on a clear torso outline.
  const wristL = landmarks[LM.LEFT_WRIST];
  const wristR = landmarks[LM.RIGHT_WRIST];
  const centerX = (shoulderL.x + shoulderR.x) / 2;
  const torsoTopY = Math.min(shoulderL.y, shoulderR.y);
  const torsoBottomY = Math.max(hipL.y, hipR.y);
  const WRIST_NEAR_CENTER_THRESHOLD = 0.05; // normalized units
  const wristBlockingTorso = [wristL, wristR].some(
    (w) =>
      w.y > torsoTopY &&
      w.y < torsoBottomY &&
      Math.abs(w.x - centerX) < WRIST_NEAR_CENTER_THRESHOLD
  );
  if (wristBlockingTorso) {
    return { success: false, reason: 'FULL_BODY_NOT_VISIBLE' };
  }

  return { success: true };
}

// ---- Step 3: normalized coordinates -> pixels ----

export function toPixel(landmark, imageWidth, imageHeight) {
  return { x: landmark.x * imageWidth, y: landmark.y * imageHeight };
}

export function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midPoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function averagePoint(points) {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

// ---- Step 4: body height in pixels, and cm-per-pixel scale ----

// The nose sits at roughly 90% of total standing height, not 100% - there's still
// head (crown-to-nose) above it. Using raw nose-to-ankle distance as "full height"
// would systematically undercount by that missing ~10%, which inflates every derived
// measurement by roughly the same amount. Dividing by this fraction corrects for it -
// kept from an earlier version of this pipeline since it's a real, validated fix.
const NOSE_HEIGHT_FRACTION = 0.90;

export function computeBodyHeightPx(nosePx, ankleCenterPx) {
  return distance2D(nosePx, ankleCenterPx) / NOSE_HEIGHT_FRACTION;
}

export function computeScale(heightCm, bodyHeightPx) {
  if (!bodyHeightPx) return 0;
  return heightCm / bodyHeightPx; // cm per pixel
}

// ---- Step 5: skeletal (internal body feature) measurements ----

/**
 * Extracts every skeletal (landmark-distance) measurement from one frontal photo, plus
 * a validation result and a confidence score based on average landmark visibility.
 * Throws if the photo fails validation (see validateFullBodyVisible).
 */
export async function extractSkeletalGeometry(imageSource, imageWidth, imageHeight) {
  const landmarks = await detectLandmarks(imageSource);

  const validation = validateFullBodyVisible(landmarks);
  if (!validation.success) {
    throw new Error(
      'Could not get a clear full-body reading from this photo - please retake it standing fully upright, ' +
      'facing the camera, with your whole body (head to feet) visible and arms at your sides.'
    );
  }

  const px = (i) => toPixel(landmarks[i], imageWidth, imageHeight);

  const nose = px(LM.NOSE);
  const earL = px(LM.LEFT_EAR);
  const earR = px(LM.RIGHT_EAR);
  const shoulderL = px(LM.LEFT_SHOULDER);
  const shoulderR = px(LM.RIGHT_SHOULDER);
  const elbowL = px(LM.LEFT_ELBOW);
  const wristL = px(LM.LEFT_WRIST);
  const hipL = px(LM.LEFT_HIP);
  const hipR = px(LM.RIGHT_HIP);
  const kneeL = px(LM.LEFT_KNEE);
  const ankleL = px(LM.LEFT_ANKLE);
  const ankleR = px(LM.RIGHT_ANKLE);

  const ankleCenter = midPoint(ankleL, ankleR);
  const shoulderCenter = midPoint(shoulderL, shoulderR);
  const hipCenter = midPoint(hipL, hipR);

  const bodyHeightPx = computeBodyHeightPx(nose, ankleCenter);
  const shoulderWidthPx = distance2D(shoulderL, shoulderR);
  const hipWidthPx = distance2D(hipL, hipR);
  const headWidthPx = distance2D(earL, earR);
  const armLengthPx = distance2D(shoulderL, elbowL) + distance2D(elbowL, wristL);
  const upperlegLengthPx = distance2D(hipL, kneeL);
  const lowerlegLengthPx = distance2D(kneeL, ankleL);
  const legLengthPx = upperlegLengthPx + lowerlegLengthPx;
  const torsoLengthPx = distance2D(shoulderCenter, hipCenter);
  // No literal "pelvis"/"crotch" landmark in MediaPipe Pose - hipCenter (midpoint of
  // the two hip joints) approximates it closely enough for inseam purposes.
  const inseamPx = distance2D(hipCenter, ankleCenter);

  const shoulderHipRatio = hipWidthPx ? shoulderWidthPx / hipWidthPx : null;
  const torsoLegRatio = legLengthPx ? torsoLengthPx / legLengthPx : null;

  // Confidence: average visibility across the major landmarks actually used above.
  const usedIndices = [
    LM.NOSE, LM.LEFT_EAR, LM.RIGHT_EAR, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
    LM.LEFT_ELBOW, LM.LEFT_WRIST, LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE,
    LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  ];
  const confidence =
    usedIndices.reduce((sum, i) => sum + (landmarks[i]?.visibility ?? 0), 0) / usedIndices.length;

  return {
    bodyHeightPx,
    shoulderWidthPx,
    hipWidthPx,
    headWidthPx,
    armLengthPx,
    legLengthPx,
    upperlegLengthPx,
    lowerlegLengthPx,
    torsoLengthPx,
    inseamPx,
    shoulderHipRatio,
    torsoLegRatio,
    confidence: Math.round(confidence * 100) / 100,
  };
}

// ============================================================================
// OPTIONAL: silhouette-based width (front) / depth (side) for real ellipse-based
// circumference, when a side photo is provided. Falls back to the BMI-formula
// prediction in measurements.js when it isn't. This reuses proven techniques from
// earlier in this project (correct mask polarity: `< 128` = foreground; gap-respecting
// outward scans that stop at the first background pixel, rather than naively scanning
// a whole window and grabbing whatever's furthest - the latter was proven to defeat
// the whole point of excluding arms from torso measurements).
// ============================================================================

async function getSegmentationMask(imageSource) {
  const imageSegmenter = await getImageSegmenter();
  const segResult = imageSegmenter.segment(imageSource);
  const categoryMask = segResult.categoryMask;
  return { data: categoryMask.getAsUint8Array(), width: categoryMask.width, height: categoryMask.height };
}

// Height-fraction levels shared by both front (width) and side (depth) silhouette
// scans, derived from shoulder/hip landmarks - same convention as the earlier
// silhouette-based version of this pipeline.
function computeHeightLevels(shoulderY, hipY) {
  return {
    chestY: shoulderY + (hipY - shoulderY) * 0.3,
    waistY: shoulderY + (hipY - shoulderY) * 0.55,
    abdomenY: shoulderY + (hipY - shoulderY) * 0.7,
    // Slightly above the raw hip landmark (which sits near groin level) - measuring
    // exactly at the joint risked catching the point where legs visually start to
    // separate in the photo, which inflated the measurement well past real hip width.
    hipY: shoulderY + (hipY - shoulderY) * 0.9,
  };
}

// Walks outward from a centerline and STOPS at the first background pixel on each
// side, capped by a safety range - this is what actually respects a gap between torso
// and arm, unlike scanning the whole window and grabbing the farthest foreground pixel
// regardless of any gap in between.
function measureBoundedWidthAtRow(mask, yFraction, centerXFraction, halfRangeFraction) {
  const row = Math.round(yFraction * mask.height);
  if (row < 0 || row >= mask.height) return 0;

  const centerX = Math.round(centerXFraction * mask.width);
  const maxHalfRangePx = Math.round(halfRangeFraction * mask.width);
  const isForeground = (x) => x >= 0 && x < mask.width && mask.data[row * mask.width + x] < 128;

  if (!isForeground(centerX)) return 0;

  let left = centerX;
  while (left > centerX - maxHalfRangePx && isForeground(left - 1)) left--;
  let right = centerX;
  while (right < centerX + maxHalfRangePx && isForeground(right + 1)) right++;

  return (right - left) / mask.width;
}

/**
 * Front photo -> silhouette WIDTH at chest/waist/abdomen/hip height. Bounded to the
 * shoulder span (with margin for natural torso flare) so outstretched or slightly-out
 * arms can't be measured as torso width - the torso can never be wider than
 * shoulder-to-shoulder distance plus a reasonable margin.
 */
export async function extractFrontSilhouette(imageSource, imageWidth, imageHeight, landmarks) {
  const mask = await getSegmentationMask(imageSource);
  const px = (i) => toPixel(landmarks[i], imageWidth, imageHeight);

  const shoulderL = px(LM.LEFT_SHOULDER);
  const shoulderR = px(LM.RIGHT_SHOULDER);
  const hipL = px(LM.LEFT_HIP);
  const hipR = px(LM.RIGHT_HIP);
  const shoulderY = (shoulderL.y + shoulderR.y) / 2;
  const hipY = (hipL.y + hipR.y) / 2;
  const levels = computeHeightLevels(shoulderY, hipY);

  const centerXFraction = (shoulderL.x + shoulderR.x) / 2 / imageWidth;
  const shoulderSpanFraction = distance2D(shoulderL, shoulderR) / imageWidth;
  const TORSO_MARGIN = 1.8; // generous enough for hips/waist naturally wider than shoulders
  const halfRangeFraction = (shoulderSpanFraction * TORSO_MARGIN) / 2;

  const widthAt = (levelY) =>
    measureBoundedWidthAtRow(mask, levelY / imageHeight, centerXFraction, halfRangeFraction) * imageWidth;

  return {
    chestWidthPx: widthAt(levels.chestY),
    waistWidthPx: widthAt(levels.waistY),
    abdomenWidthPx: widthAt(levels.abdomenY),
    hipWidthPx: widthAt(levels.hipY),
  };
}

/**
 * Side photo -> silhouette DEPTH at chest/waist/abdomen/hip height. Side-view shoulders
 * nearly overlap (viewed edge-on) so they can't give a reliable width reference the
 * way the front photo's shoulder span does - the half-range here uses a fixed fraction
 * of image width instead, generous enough to contain genuine torso depth.
 */
export async function extractSideSilhouette(imageSource, imageWidth, imageHeight, landmarks) {
  const mask = await getSegmentationMask(imageSource);
  const px = (i) => toPixel(landmarks[i], imageWidth, imageHeight);

  const shoulderL = px(LM.LEFT_SHOULDER);
  const shoulderR = px(LM.RIGHT_SHOULDER);
  const hipL = px(LM.LEFT_HIP);
  const hipR = px(LM.RIGHT_HIP);
  const shoulderY = (shoulderL.y + shoulderR.y) / 2;
  const hipY = (hipL.y + hipR.y) / 2;
  const levels = computeHeightLevels(shoulderY, hipY);

  const centerXFraction = (shoulderL.x + shoulderR.x) / 2 / imageWidth;
  const DEPTH_HALF_RANGE_FRACTION = 0.18; // fraction of image width - generous for torso depth

  const depthAt = (levelY) =>
    measureBoundedWidthAtRow(mask, levelY / imageHeight, centerXFraction, DEPTH_HALF_RANGE_FRACTION) * imageWidth;

  return {
    chestDepthPx: depthAt(levels.chestY),
    waistDepthPx: depthAt(levels.waistY),
    abdomenDepthPx: depthAt(levels.abdomenY),
    hipDepthPx: depthAt(levels.hipY),
  };
}
