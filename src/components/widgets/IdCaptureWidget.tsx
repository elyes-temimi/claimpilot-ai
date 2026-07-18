import { useEffect, useRef, useState } from 'react';
import type { FlowController } from '../../flow/controller';
import { drawSpecimenId } from '../../lib/specimen';

/** Downscale large photos so OCR stays fast. */
function normalizeImage(dataUrl: string, maxSide = 1600): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      if (scale === 1) return resolve(dataUrl);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function IdCaptureWidget({ flow }: { flow: FlowController }) {
  const [mode, setMode] = useState<'menu' | 'camera'>('menu');
  const [cameraError, setCameraError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== 'camera') return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } },
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
      } catch {
        setCameraError(true);
        setMode('menu');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [mode]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d')!.drawImage(video, 0, 0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    flow.provide({ image: c.toDataURL('image/jpeg', 0.92), specimen: false });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    flow.provide({ image: await normalizeImage(dataUrl), specimen: false });
  };

  if (mode === 'camera') {
    return (
      <div className="widget widget-camera">
        <video ref={videoRef} playsInline muted />
        <div className="row">
          <button className="btn btn-primary" onClick={capture}>📸 Capture document</button>
          <button className="btn btn-ghost" onClick={() => setMode('menu')}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="widget">
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
          🖼 Upload ID photo
        </button>
        <button className="btn btn-ghost" onClick={() => setMode('camera')}>
          📷 Use camera
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => flow.provide({ image: drawSpecimenId(), specimen: true })}
        >
          🪪 Use specimen ID
        </button>
      </div>
      {cameraError && <p className="fine">Camera unavailable here — upload works just as well.</p>}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
    </div>
  );
}
