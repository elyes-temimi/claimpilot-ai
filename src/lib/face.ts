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

/**
 * Watch a <video> element and report blinks.
 * Calls onUpdate each frame with face presence, and onBlink when a blink completes.
 */
export function watchLiveness(
  video: HTMLVideoElement,
  onUpdate: (facePresent: boolean) => void,
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
        if (!eyesClosed && ear < 0.24) {
          eyesClosed = true;
        } else if (eyesClosed && ear > 0.3) {
          eyesClosed = false;
          onBlink();
        }
        onUpdate(true);
      } else {
        onUpdate(false);
      }
    } catch {
      onUpdate(false);
    }
    if (!stopped) setTimeout(tick, 160);
  };
  tick();

  return { stop: () => { stopped = true; } };
}
