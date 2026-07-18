import { useEffect, useRef, useState } from 'react';
import type { FlowController } from '../../flow/controller';
import {
  descriptorDistance,
  descriptorFromImage,
  loadModels,
  watchLiveness,
  type LivenessSession,
} from '../../lib/face';

type Stage = 'starting' | 'live' | 'analyzing' | 'fallback';

export function SelfieWidget({ flow }: { flow: FlowController }) {
  const [stage, setStage] = useState<Stage>('starting');
  const [blinks, setBlinks] = useState(0);
  const [facePresent, setFacePresent] = useState(false);
  const [modelsOk, setModelsOk] = useState<boolean | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<LivenessSession | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  const stopAll = () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Finish: compare captured selfie against the ID document's face (if any)
  const finish = async (image: string, liveness: 'passed' | 'skipped') => {
    if (doneRef.current) return;
    doneRef.current = true;
    setStage('analyzing');
    stopAll();
    const ref = await flow.refDescriptor;
    let distance: number | null = null;
    if (ref) {
      const own = await descriptorFromImage(image).catch(() => null);
      if (own) distance = descriptorDistance(ref, own);
    }
    flow.provide({ image, distance, liveness, simulated: false, hadReference: !!ref });
  };

  const captureFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext('2d')!;
    // un-mirror the preview
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    return c.toDataURL('image/jpeg', 0.92);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadModels();
      if (!cancelled) setModelsOk(ok);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 960 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStage('live');
      } catch {
        if (!cancelled) setStage('fallback');
      }
    })();
    return () => {
      cancelled = true;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start blink watching once live and models are ready
  useEffect(() => {
    if (stage !== 'live' || modelsOk !== true || !videoRef.current) return;
    let count = 0;
    const session = watchLiveness(
      videoRef.current,
      (present) => setFacePresent(present),
      () => {
        count++;
        setBlinks(count);
        if (count >= 2) {
          const img = captureFrame();
          if (img) finish(img, 'passed');
        }
      }
    );
    sessionRef.current = session;
    return () => session.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, modelsOk]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    finish(dataUrl, 'skipped');
  };

  const simulate = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    stopAll();
    flow.provide({ image: null, distance: 0.34, liveness: 'simulated', simulated: true, hadReference: true });
  };

  if (stage === 'analyzing') {
    return (
      <div className="widget widget-processing">
        <div className="spinner" />
        <span>Comparing your face with the document…</span>
      </div>
    );
  }

  if (stage === 'fallback') {
    return (
      <div className="widget">
        <p className="fine">No camera available here. Upload a selfie instead — or simulate the step in demo mode.</p>
        <div className="row wrap">
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>🤳 Upload selfie</button>
          {flow.demo && (
            <button className="btn btn-ghost" onClick={simulate}>⚡ Simulate liveness + match (demo)</button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
    );
  }

  return (
    <div className="widget widget-camera selfie">
      <div className="selfie-stage">
        <video ref={videoRef} playsInline muted className="mirrored" />
        <div className={`face-ring ${facePresent ? 'ok' : ''}`} />
      </div>
      <div className="selfie-status">
        {modelsOk === false ? (
          <span>Biometric models unavailable — use manual capture.</span>
        ) : stage === 'starting' ? (
          <span>Starting camera…</span>
        ) : !facePresent ? (
          <span>Center your face in the ring…</span>
        ) : (
          <span>
            👁 Blink twice — <strong>{blinks}/2</strong> detected
          </span>
        )}
      </div>
      <div className="row wrap">
        {modelsOk === false && (
          <button
            className="btn btn-primary"
            onClick={() => {
              const img = captureFrame();
              if (img) finish(img, 'skipped');
            }}
          >
            📸 Capture manually
          </button>
        )}
        {flow.demo && (
          <button className="btn btn-ghost" onClick={simulate}>⚡ Simulate (demo)</button>
        )}
      </div>
    </div>
  );
}
