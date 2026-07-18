import { useEffect, useRef, useState } from 'react';
import type { CinData } from './types';
import { extractCinData } from '../lib/ocr';
import { useTranslation } from '../i18n/useTranslation';

export function CinCapture({
  cin,
  onUpdate,
  onNext,
  onBack
}: {
  cin: CinData;
  onUpdate: (data: Partial<CinData>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [processing, setProcessing] = useState(false);
  const [scanWarning, setScanWarning] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<'camera' | 'upload'>('upload');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // A ref, not state: the cleanup function must always see the live stream,
  // and storing it in state would retrigger the effect that created it.
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const { t } = useTranslation();

  const currentImage = side === 'front' ? cin.frontImage : cin.backImage;
  const hasImage = !!currentImage;

  // The camera is driven by state, not by a click handler.
  //
  // Two bugs lived in the old imperative version:
  //  1. switchToCamera() called setCaptureMode('camera') and startCamera() back
  //     to back. React had not mounted the <video> yet, so videoRef.current was
  //     still null and the stream was acquired but never attached — a black box.
  //  2. After capturing the FRONT, stopCamera() ran and the side flipped to
  //     'back'. Nothing ever restarted the camera, so the back step showed a
  //     dead <video> and the capture button drew a 0x0 canvas. That is why the
  //     front worked and the back never did.
  //
  // Deriving the stream from (mode, side, hasImage) makes both impossible.
  useEffect(() => {
    const wanted = captureMode === 'camera' && !hasImage && !processing;

    if (!wanted) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }

    let cancelled = false;
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "La caméra n'est disponible qu'en https. Ouvrez l'adresse https:// ou utilisez l'import de fichier."
        );
        setCaptureMode('upload');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          // iOS Safari needs an explicit play() after srcObject is set.
          await videoRef.current.play().catch(() => {});
        }
        setCameraError(null);
      } catch (err) {
        const name = (err as DOMException)?.name;
        setCameraError(
          name === 'NotAllowedError'
            ? "Accès à la caméra refusé. Autorisez-le (icône 🔒 dans la barre d'adresse) ou importez un fichier."
            : name === 'NotFoundError'
              ? 'Aucune caméra détectée sur cet appareil.'
              : "La caméra n'a pas pu démarrer. Utilisez l'import de fichier."
        );
        setCaptureMode('upload');
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [captureMode, side, hasImage, processing]);

  // Capture from camera
  const captureImage = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // A stream that has not produced a frame yet reports 0x0 and would silently
    // yield a blank data URL — the old code captured that and "succeeded".
    if (!video.videoWidth || !video.videoHeight) {
      setCameraError("La caméra n'est pas encore prête — patientez une seconde et réessayez.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    setCameraError(null);
    processImage(canvas.toDataURL('image/jpeg', 0.9));
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      processImage(imageData);
    };
    reader.readAsDataURL(file);
  };

  // Process image (run OCR)
  const processImage = async (imageData: string) => {
    setProcessing(true);
    
    try {
      // Run Tesseract OCR on the image
      const ocrResult = await extractCinData(imageData, side, (progress) => {
        console.log(`OCR Progress: ${progress.toFixed(0)}%`);
      });
      
      // Field extraction is label-driven, so a value is only written when it
      // was actually read off the card. Assigning unconditionally used to wipe
      // a good earlier value whenever a later scan missed a field.
      const f = ocrResult.fields;
      const update: Record<string, string> = {};
      if (ocrResult.fullName) update.fullName = ocrResult.fullName;
      if (ocrResult.dob) update.dob = ocrResult.dob;
      if (ocrResult.cinNumber) update.cinNumber = ocrResult.cinNumber;
      if (ocrResult.address) update.address = ocrResult.address;

      if (side === 'front') {
        onUpdate({ frontImage: imageData, ...update });
        setProcessing(false);
        setSide('back');
      } else {
        onUpdate({ backImage: imageData, ...update });
        setProcessing(false);
      }

      // Tell the user plainly when a photo produced nothing usable, instead of
      // silently advancing with empty fields.
      if (f && f.found.length === 0) {
        setScanWarning(
          "Aucun champ n'a pu être lu sur cette photo. Cadrez la carte à plat, sans reflet, et réessayez."
        );
      } else if (f && f.side !== 'unknown' && f.side !== side) {
        setScanWarning(
          `Cette photo ressemble au ${f.side === 'back' ? 'verso' : 'recto'} de la carte. Les champs lus ont été conservés.`
        );
      } else {
        setScanWarning(null);
      }
    } catch (error) {
      console.error('OCR error:', error);
      // Store image anyway but don't extract data
      if (side === 'front') {
        onUpdate({ frontImage: imageData });
      } else {
        onUpdate({ backImage: imageData });
      }
      setProcessing(false);
    }
  };

  // Mode switches only set state — the effect above owns the stream lifecycle.
  const switchToCamera = () => {
    setCameraError(null);
    setCaptureMode('camera');
  };

  const switchToUpload = () => {
    setCameraError(null);
    setCaptureMode('upload');
  };

  /** Discard the current side's photo so the camera restarts for a retake. */
  const retake = () => {
    setScanWarning(null);
    setCameraError(null);
    onUpdate(side === 'front' ? { frontImage: null } : { backImage: null });
  };

  const canContinue = cin.frontImage && cin.backImage;

  return (
    <div className="card ekyc-card">
      <h2>📄 {t('cin_capture_title')}</h2>

      {/* Which of the two photos we are on, and what is already done. */}
      <div className="cin-steps">
        <span className={`cin-step ${side === 'front' ? 'active' : ''} ${cin.frontImage ? 'done' : ''}`}>
          {cin.frontImage ? '✓' : '1'} Recto
        </span>
        <span className="cin-step-sep">→</span>
        <span className={`cin-step ${side === 'back' ? 'active' : ''} ${cin.backImage ? 'done' : ''}`}>
          {cin.backImage ? '✓' : '2'} Verso
        </span>
      </div>

      <p className="fine">
        {side === 'front' ? t('cin_front_instruction') : t('cin_back_instruction')}
      </p>

      {/* The back side is reached automatically after the front; make that
          switchable by hand too, since auto-advance can surprise people. */}
      {cin.frontImage && (
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          <button
            className={`mode-btn ${side === 'front' ? 'active' : ''}`}
            onClick={() => setSide('front')}
          >
            Recto
          </button>
          <button
            className={`mode-btn ${side === 'back' ? 'active' : ''}`}
            onClick={() => setSide('back')}
          >
            Verso
          </button>
        </div>
      )}

      {/* Mode selector */}
      <div className="capture-mode-selector">
        <button
          className={`mode-btn ${captureMode === 'upload' ? 'active' : ''}`}
          onClick={switchToUpload}
        >
          {t('upload_file')}
        </button>
        <button
          className={`mode-btn ${captureMode === 'camera' ? 'active' : ''}`}
          onClick={switchToCamera}
        >
          {t('use_camera')}
        </button>
      </div>

      {processing ? (
        <div className="widget-processing">
          <div className="spinner" />
          <span>{t('processing_ocr', { side: side === 'front' ? 'recto' : 'verso' })}</span>
        </div>
      ) : hasImage ? (
        <div className="image-preview">
          <img src={currentImage!} alt={`CIN ${side}`} />
          <div className="preview-overlay">
            <span className="badge badge-green">✓ {side.toUpperCase()} {t('captured')}</span>
          </div>
          {scanWarning && (
            <p className="scan-warning" role="status">⚠️ {scanWarning}</p>
          )}
          <button className="btn btn-ghost" onClick={retake} style={{ marginTop: 8 }}>
            ↻ Reprendre cette photo
          </button>
        </div>
      ) : captureMode === 'camera' ? (
        <div className="camera-view">
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {cameraError && <p className="scan-warning" role="alert">⚠️ {cameraError}</p>}
          <button className="btn-capture" onClick={captureImage}>
            {t('capture')}
          </button>
        </div>
      ) : (
        <div className="upload-zone">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <div className="upload-icon">📄</div>
          <p>Click to upload {side} of CIN</p>
          <p className="fine">Supports JPG, PNG, PDF</p>
          <button
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose File
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="row">
        {side === 'front' ? (
          <button className="btn btn-ghost" onClick={onBack}>
            {t('back')}
          </button>
        ) : (
          <button 
            className="btn btn-ghost" 
            onClick={() => setSide('front')}
          >
            ← Redo Front
          </button>
        )}
        
        {canContinue && (
          <button className="btn btn-danger" onClick={onNext}>
            {t('continue')}
          </button>
        )}
      </div>

      {/* Skip option */}
      <div className="ekyc-skip">
        <button className="linklike" onClick={onNext}>
          Skip OCR and enter manually →
        </button>
      </div>
    </div>
  );
}
