import * as faceapi from '@vladmandic/face-api';

let modelsReady: Promise<boolean> | null = null;

/** Load face detection/landmark/recognition models (served locally from /models). */
export function loadModels(): Promise<boolean> {
  if (!modelsReady) {
    modelsReady = (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        ]);
        return true;
      } catch (err) {
        console.warn('[face] model load failed', err);
        return false;
      }
    })();
  }
  return modelsReady;
}

const detectorOptions = () =>
  new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 });

/** Compute a 128-d face descriptor from an image dataURL. Null if no face found. */
export async function descriptorFromImage(dataUrl: string): Promise<Float32Array | null> {
  const ok = await loadModels();
  if (!ok) return null;
  const img = await loadImage(dataUrl);
  const det = await faceapi
    .detectSingleFace(img, detectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  return det?.descriptor ?? null;
}

/** Descriptor distance — lower is closer. < 0.6 is generally the same person. */
export function descriptorDistance(a: Float32Array, b: Float32Array): number {
  return faceapi.euclideanDistance(a, b);
}

export const MATCH_THRESHOLD = 0.6;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Liveness: blink detection via Eye Aspect Ratio (EAR) on 68-point landmarks
// ---------------------------------------------------------------------------

function earOfEye(eye: faceapi.Point[]): number {
  const d = (p: faceapi.Point, q: faceapi.Point) => Math.hypot(p.x - q.x, p.y - q.y);
  // eye has 6 points: [outer, top1, top2, inner, bottom2, bottom1]
  return (d(eye[1], eye[5]) + d(eye[2], eye[4])) / (2 * d(eye[0], eye[3]));
}

export interface LivenessSession {
  stop: () => void;
}

export type HeadPose = 'left' | 'center' | 'right';

export interface LivenessFrame {
  facePresent: boolean;
  /** Eye aspect ratio, for a live "eyes open/closed" readout. */
  ear: number;
  pose: HeadPose;
  /** 0 = fully turned one way, 1 = the other; 0.5 is centred. */
  yaw: number;
}

/**
 * Estimate head yaw from the 68-point landmarks.
 *
 * Where the nose tip sits between the two jaw extremes is a robust proxy for
 * yaw and needs no 3D model: facing the camera it is centred, turning the head
 * slides it towards the jaw edge you turn away from. Normalising by jaw width
 * makes it independent of distance from the camera.
 */
function yawOf(landmarks: faceapi.FaceLandmarks68): number {
  const jaw = landmarks.getJawOutline();
  const nose = landmarks.getNose();
  const left = jaw[0];
  const right = jaw[jaw.length - 1];
  const tip = nose[nose.length - 1] ?? nose[0];
  const width = right.x - left.x;
  if (!width) return 0.5;
  return Math.max(0, Math.min(1, (tip.x - left.x) / width));
}

/**
 * Watch a <video> and report liveness signals every frame.
 *
 * `onBlink` fires on each completed close→open transition; the caller counts
 * them. Hysteresis (close below 0.21, open above 0.28) stops a single slow
 * blink registering as several, which is what makes a "blink twice" check
 * pass on one blink.
 */
export function watchLiveness(
  video: HTMLVideoElement,
  onFrame: (f: LivenessFrame) => void,
  onBlink: () => void
): LivenessSession {
  let stopped = false;
  let eyesClosed = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const det = await faceapi.detectSingleFace(video, detectorOptions()).withFaceLandmarks();
      if (det) {
        const ear = (earOfEye(det.landmarks.getLeftEye()) + earOfEye(det.landmarks.getRightEye())) / 2;
        if (!eyesClosed && ear < 0.21) {
          eyesClosed = true;
        } else if (eyesClosed && ear > 0.28) {
          eyesClosed = false;
          onBlink();
        }
        const yaw = yawOf(det.landmarks);
        // Generous deadband: a natural "look left" only moves this so far, and
        // demanding a big angle makes the check feel broken.
        const pose: HeadPose = yaw < 0.4 ? 'left' : yaw > 0.6 ? 'right' : 'center';
        onFrame({ facePresent: true, ear, pose, yaw });
      } else {
        onFrame({ facePresent: false, ear: 0, pose: 'center', yaw: 0.5 });
      }
    } catch {
      onFrame({ facePresent: false, ear: 0, pose: 'center', yaw: 0.5 });
    }
    if (!stopped) setTimeout(tick, 120);
  };
  tick();

  return { stop: () => { stopped = true; } };
}
