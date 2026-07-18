import { useRef, useState } from 'react';
import type { LivenessResult } from './types';
import { useTranslation } from '../i18n/useTranslation';

export function LivenessCheck({
  cinFrontImage,
  onComplete,
  onBack
}: {
  cinFrontImage: string | null;
  onComplete: (result: LivenessResult) => void;
  onBack: () => void;
}) {
  const [method, setMethod] = useState<'blink' | 'head-turn' | null>(null);
  const [showSkip, setShowSkip] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const { t } = useTranslation();

  const skipLiveness = () => {
    onComplete({
      passed: true,
      method: 'skipped',
      selfieImage: cinFrontImage
    });
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
      }
    } catch (error) {
      console.error('Camera error:', error);
      alert('Could not access camera. You can skip this step for testing.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const captureSelfie = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    
    stopCamera();
    
    // Mock liveness check - in production, send to API
    setTimeout(() => {
      onComplete({
        passed: true,
        method: method || 'blink',
        selfieImage: imageData
      });
    }, 1000);
  };

  if (method === null) {
    return (
      <div className="card ekyc-card">
        <h2>{t('liveness_title')}</h2>
        <p className="fine">{t('liveness_subtitle')}</p>

        <div className="liveness-methods">
          <button
            className="liveness-method-card"
            onClick={() => {
              setMethod('blink');
              startCamera();
            }}
          >
            <div className="method-icon">👁</div>
            <div className="method-name">{t('blink_twice')}</div>
            <p className="fine">{t('quick_easy')}</p>
          </button>

          <button
            className="liveness-method-card"
            onClick={() => {
              setMethod('head-turn');
              startCamera();
            }}
          >
            <div className="method-icon">↔️</div>
            <div className="method-name">{t('turn_head')}</div>
            <p className="fine">{t('left_right')}</p>
          </button>
        </div>

        {/* Skip option */}
        {!showSkip ? (
          <button className="linklike" onClick={() => setShowSkip(true)}>
            Having trouble? Click here
          </button>
        ) : (
          <div className="skip-warning">
            <p className="fine">⚠️ <strong>Testing Mode:</strong> Skip biometric verification</p>
            <p className="fine">This should only be used for testing purposes</p>
            <button className="btn btn-ghost" onClick={skipLiveness}>
              {t('skip_liveness')}
            </button>
          </div>
        )}

        <button className="btn btn-ghost" onClick={onBack}>
          {t('back')}
        </button>
      </div>
    );
  }

  return (
    <div className="card ekyc-card">
      <h2>🧬 {method === 'blink' ? 'Blink Twice' : 'Turn Your Head'}</h2>
      <p className="fine">
        {method === 'blink'
          ? 'Look at the camera and blink twice when you capture'
          : 'Turn your head left, then right, then capture'}
      </p>

      <div className="camera-view">
        <video ref={videoRef} autoPlay playsInline className="camera-video" />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div className="camera-instructions">
          <div className="instruction-icon">
            {method === 'blink' ? '👁' : '↔️'}
          </div>
          <p>{method === 'blink' ? 'Blink twice now!' : 'Turn left ← → right'}</p>
        </div>
        <button className="btn-capture" onClick={captureSelfie}>
          ✓ Capture
        </button>
      </div>

      <div className="row">
        <button
          className="btn btn-ghost"
          onClick={() => {
            stopCamera();
            setMethod(null);
          }}
        >
          ← Try Different Method
        </button>
        {showSkip && (
          <button className="btn btn-ghost" onClick={skipLiveness}>
            Skip This Step
          </button>
        )}
      </div>
    </div>
  );
}
