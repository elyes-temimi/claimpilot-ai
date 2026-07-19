import { useEffect, useRef, useState } from 'react';
import type { LivenessResult } from './types';
import { useTranslation } from '../i18n/useTranslation';
import { loadModels, watchLiveness, type HeadPose, type LivenessSession } from '../lib/face';

/**
 * Liveness check that actually checks liveness.
 *
 * The previous version showed an instruction, waited for a "capture" click and
 * passed unconditionally — nothing was ever detected, which is why blinking or
 * turning your head appeared to do nothing. Both challenges now run against
 * face-api landmarks in real time:
 *
 *   blink      — count completed close→open transitions, pass at 2
 *   head turn  — require a LEFT pose, then a RIGHT pose, in that order
 *
 * Detection is on-device; no frame leaves the browser.
 */
export function LivenessCheck({
  cinFrontImage,
  onComplete,
  onBack,
}: {
  cinFrontImage: string | null;
  onComplete: (result: LivenessResult) => void;
  onBack: () => void;
}) {
  const [method, setMethod] = useState<'blink' | 'head-turn' | null>(null);
  const [showSkip, setShowSkip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [facePresent, setFacePresent] = useState(false);
  const [blinks, setBlinks] = useState(0);
  const [turnedLeft, setTurnedLeft] = useState(false);
  const [turnedRight, setTurnedRight] = useState(false);
  const [pose, setPose] = useState<HeadPose>('center');
  const [passed, setPassed] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const watchRef = useRef<LivenessSession | null>(null);
  // The watcher runs outside React's render cycle, so progress is tracked in
  // refs as well; reading state inside the callback would see stale values.
  const blinksRef = useRef(0);
  const leftRef = useRef(false);
  const rightRef = useRef(false);
  const doneRef = useRef(false);

  const { t } = useTranslation();

  const capture = (): string | null => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return cinFrontImage;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    return c.toDataURL('image/jpeg', 0.85);
  };

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setPassed(true);
    const selfie = capture();
    watchRef.current?.stop();
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    // Brief pause so the user sees the success state before moving on.
    setTimeout(() => onComplete({ passed: true, method: method || 'blink', selfieImage: selfie }), 900);
  };

  // Camera + detector lifecycle, driven by which challenge is selected.
  useEffect(() => {
    if (!method) return;
    let cancelled = false;

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("La caméra n'est disponible qu'en https. Ouvrez l'adresse https:// ou passez cette étape.");
        setShowSkip(true);
        return;
      }
      const ok = await loadModels();
      if (cancelled) return;
      setModelsReady(ok);
      if (!ok) {
        setError('Les modèles de détection n\'ont pas pu être chargés. Vous pouvez passer cette étape.');
        setShowSkip(true);
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } } });
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }

        watchRef.current = watchLiveness(
          videoRef.current!,
          (f) => {
            if (cancelled) return;
            setFacePresent(f.facePresent);
            setPose(f.pose);
            if (!f.facePresent || doneRef.current) return;

            if (method === 'head-turn') {
              // Order matters: left first, then right. Requiring a sequence is
              // what makes this a liveness test rather than "hold still".
              if (f.pose === 'left' && !leftRef.current) {
                leftRef.current = true;
                setTurnedLeft(true);
              } else if (f.pose === 'right' && leftRef.current && !rightRef.current) {
                rightRef.current = true;
                setTurnedRight(true);
                finish();
              }
            }
          },
          () => {
            if (cancelled || doneRef.current || method !== 'blink') return;
            blinksRef.current += 1;
            setBlinks(blinksRef.current);
            if (blinksRef.current >= 2) finish();
          }
        );
      } catch (err) {
        const name = (err as DOMException)?.name;
        setError(
          name === 'NotAllowedError'
            ? "Accès à la caméra refusé. Autorisez-le puis réessayez, ou passez cette étape."
            : "La caméra n'a pas pu démarrer. Vous pouvez passer cette étape."
        );
        setShowSkip(true);
      }
    })();

    // Offer an escape hatch if nothing is detected after a while, so a bad
    // camera or bad light cannot trap someone in the flow.
    const escape = setTimeout(() => setShowSkip(true), 20000);

    return () => {
      cancelled = true;
      clearTimeout(escape);
      watchRef.current?.stop();
      watchRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  const skipLiveness = () =>
    onComplete({ passed: true, method: 'skipped', selfieImage: cinFrontImage });

  const restart = () => {
    doneRef.current = false;
    blinksRef.current = 0;
    leftRef.current = false;
    rightRef.current = false;
    setBlinks(0);
    setTurnedLeft(false);
    setTurnedRight(false);
    setPassed(false);
    setMethod(null);
  };

  // ---- Method chooser ----------------------------------------------------
  if (!method) {
    return (
      <div className="card ekyc-card">
        <h2>🧬 {t('liveness_title') || 'Vérification de vivacité'}</h2>
        <p className="fine">Choisissez une méthode. Tout est analysé sur votre appareil.</p>
        <div className="liveness-methods">
          <button className="method-card" onClick={() => setMethod('blink')}>
            <div className="method-icon">👁</div>
            <div className="method-name">{t('blink_twice') || 'Clignez des yeux deux fois'}</div>
          </button>
          <button className="method-card" onClick={() => setMethod('head-turn')}>
            <div className="method-icon">↔️</div>
            <div className="method-name">{t('turn_head') || 'Tournez la tête'}</div>
          </button>
        </div>
        <div className="row">
          <button className="btn btn-ghost" onClick={onBack}>← {t('back') || 'Retour'}</button>
        </div>
        <div className="ekyc-skip">
          <button className="linklike" onClick={skipLiveness}>Passer cette étape →</button>
        </div>
      </div>
    );
  }

  // ---- Live challenge ----------------------------------------------------
  const instruction =
    method === 'blink'
      ? `Clignez des yeux — ${blinks}/2 détecté${blinks > 1 ? 's' : ''}`
      : !turnedLeft
        ? 'Tournez la tête vers la GAUCHE'
        : !turnedRight
          ? 'Maintenant vers la DROITE'
          : 'Parfait';

  return (
    <div className="card ekyc-card">
      <h2>🧬 {method === 'blink' ? 'Clignez deux fois' : 'Tournez la tête'}</h2>

      <div className="liveness-stage">
        <video ref={videoRef} autoPlay playsInline muted className="camera-video liveness-video" />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Honest live status: what the detector sees right now. */}
        <div className={`liveness-status ${facePresent ? 'ok' : 'warn'}`}>
          {passed
            ? '✅ Vivacité confirmée'
            : !modelsReady
              ? 'Chargement des modèles…'
              : facePresent
                ? instruction
                : 'Aucun visage détecté — cadrez votre visage'}
        </div>

        {method === 'blink' ? (
          <div className="liveness-dots">
            <span className={blinks >= 1 ? 'on' : ''} />
            <span className={blinks >= 2 ? 'on' : ''} />
          </div>
        ) : (
          <div className="liveness-turns">
            <span className={turnedLeft ? 'on' : ''}>← gauche {turnedLeft ? '✓' : ''}</span>
            <span className={`pose-now ${pose}`}>{pose === 'center' ? '•' : pose === 'left' ? '←' : '→'}</span>
            <span className={turnedRight ? 'on' : ''}>droite {turnedRight ? '✓' : ''} →</span>
          </div>
        )}
      </div>

      {error && <p className="scan-warning" role="alert">⚠️ {error}</p>}

      <div className="row">
        <button className="btn btn-ghost" onClick={restart}>← Changer de méthode</button>
      </div>

      {showSkip && (
        <div className="ekyc-skip">
          <button className="linklike" onClick={skipLiveness}>
            La détection ne fonctionne pas — passer cette étape →
          </button>
        </div>
      )}
    </div>
  );
}
