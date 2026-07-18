import { useRef, useState } from 'react';
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
  const [captureMode, setCaptureMode] = useState<'camera' | 'upload'>('upload');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const { t } = useTranslation();

  const currentImage = side === 'front' ? cin.frontImage : cin.backImage;
  const hasImage = !!currentImage;

  // Start camera
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 1280, height: 720 }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
      }
    } catch (error) {
      console.error('Camera error:', error);
      alert('Could not access camera. Please use file upload instead.');
      setCaptureMode('upload');
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  // Capture from camera
  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    
    processImage(imageData);
    stopCamera();
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
      
      if (side === 'front') {
        onUpdate({ 
          frontImage: imageData,
          fullName: ocrResult.fullName,
          dob: ocrResult.dob,
          cinNumber: ocrResult.cinNumber
        });
        setProcessing(false);
        setSide('back');
      } else {
        onUpdate({ 
          backImage: imageData,
          address: ocrResult.address
        });
        setProcessing(false);
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

  // Switch to camera mode
  const switchToCamera = () => {
    setCaptureMode('camera');
    startCamera();
  };

  // Switch to upload mode
  const switchToUpload = () => {
    setCaptureMode('upload');
    stopCamera();
  };

  const canContinue = cin.frontImage && cin.backImage;

  return (
    <div className="card ekyc-card">
      <h2>📄 {t('cin_capture_title')}</h2>
      <p className="fine">
        {side === 'front' ? t('cin_front_instruction') : t('cin_back_instruction')}
      </p>

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
        </div>
      ) : captureMode === 'camera' ? (
        <div className="camera-view">
          <video ref={videoRef} autoPlay playsInline className="camera-video" />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
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
