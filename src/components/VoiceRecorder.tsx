import { useEffect, useRef, useState } from 'react';

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  maxDuration?: number; // in seconds
}

export function VoiceRecorder({ onRecordingComplete, maxDuration = 120 }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  // Why the mic is unavailable, so we can tell the user something true.
  // Previously any failure here rendered "access denied", which was actively
  // misleading: over plain http on the LAN the browser doesn't expose
  // navigator.mediaDevices at all, and no amount of changing permissions
  // fixes that.
  const [micProblem, setMicProblem] = useState<
    null | 'insecure' | 'unsupported' | 'denied' | 'nodevice' | 'error'
  >(null);

  useEffect(() => {
    // Capability probe only — deliberately does NOT call getUserMedia, so the
    // browser doesn't throw a permission prompt at the user on page load,
    // before they've asked to record anything. Permission is requested on the
    // first click instead, where the prompt has obvious context.
    if (!window.isSecureContext) {
      setMicProblem('insecure');
      setHasPermission(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicProblem('unsupported');
      setHasPermission(false);
      return;
    }
    setHasPermission(true);
  }, []);

  /** Map a getUserMedia rejection to an accurate cause. */
  const classifyMicError = (error: unknown) => {
    const name = (error as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied' as const;
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'nodevice' as const;
    return 'error' as const;
  };

  /** Let the user try again after fixing permissions, without a page reload. */
  const retryMic = async () => {
    if (!window.isSecureContext) return setMicProblem('insecure');
    if (!navigator.mediaDevices?.getUserMedia) return setMicProblem('unsupported');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setMicProblem(null);
      setHasPermission(true);
    } catch (error) {
      setMicProblem(classifyMicError(error));
      setHasPermission(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const finalDuration = Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000);
        onRecordingComplete(audioBlob, finalDuration);
        
        // Cleanup
        stream.getTracks().forEach(track => track.stop());
        setDuration(0);
        pausedTimeRef.current = 0;
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Start duration timer
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000);
        setDuration(elapsed);
        
        // Auto-stop at max duration
        if (elapsed >= maxDuration) {
          stopRecording();
        }
      }, 100);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      setMicProblem(classifyMicError(error));
      setHasPermission(false);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      
      // Track paused time
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      const pauseStart = Date.now();
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      
      // Resume timer
      timerRef.current = window.setInterval(() => {
        pausedTimeRef.current += Date.now() - pauseStart;
        const elapsed = Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000);
        setDuration(elapsed);
        
        if (elapsed >= maxDuration) {
          stopRecording();
        }
      }, 100);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
      chunksRef.current = [];
      setIsRecording(false);
      setIsPaused(false);
      setDuration(0);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (hasPermission === false) {
    // Each cause has a different fix — saying "denied" for all of them sends
    // the user hunting through browser settings that cannot help.
    const explain = {
      insecure: {
        title: 'Micro indisponible sur cette adresse',
        body:
          `Cette page est ouverte en http (${window.location.host}). Les navigateurs ` +
          'ne donnent accès au micro que sur une connexion sécurisée. ' +
          'Relancez avec « npm run dev:https » et ouvrez la version https:// — ' +
          'sur localhost le micro fonctionne aussi.',
      },
      unsupported: {
        title: 'Micro non pris en charge',
        body: "Ce navigateur n'expose pas l'enregistrement audio. Essayez Chrome, Edge ou Safari.",
      },
      denied: {
        title: 'Accès au micro refusé',
        body:
          "Autorisez le micro pour ce site (icône 🔒 dans la barre d'adresse → Micro → Autoriser), puis réessayez.",
      },
      nodevice: {
        title: 'Aucun micro détecté',
        body: 'Aucun périphérique audio disponible. Branchez un micro ou un casque, puis réessayez.',
      },
      error: {
        title: "Le micro n'a pas pu démarrer",
        body: 'Une erreur inattendue est survenue. Vérifiez qu\'aucune autre application n\'utilise le micro.',
      },
    }[micProblem ?? 'error'];

    return (
      <div className="voice-recorder error">
        <div className="voice-error">
          <span className="voice-icon">🎤</span>
          <p><strong>{explain.title}</strong></p>
          <p>{explain.body}</p>
          {micProblem !== 'insecure' && micProblem !== 'unsupported' && (
            <button className="btn-voice-start" type="button" onClick={retryMic}>
              Réessayer
            </button>
          )}
        </div>
      </div>
    );
  }

  if (hasPermission === null) {
    return (
      <div className="voice-recorder loading">
        <span>Checking microphone access...</span>
      </div>
    );
  }

  return (
    <div className={`voice-recorder ${isRecording ? 'recording' : ''}`}>
      {!isRecording ? (
        <button 
          className="btn-voice-start" 
          onClick={startRecording}
          type="button"
        >
          <span className="voice-icon">🎤</span>
          <span>Start Recording</span>
        </button>
      ) : (
        <div className="voice-recording-controls">
          <div className="voice-timer">
            <span className={`recording-indicator ${isPaused ? 'paused' : ''}`}></span>
            <span className="voice-time">{formatTime(duration)}</span>
            <span className="voice-max">/ {formatTime(maxDuration)}</span>
          </div>
          
          <div className="voice-waveform">
            <div className="wave-bar" style={{ animationDelay: '0s' }}></div>
            <div className="wave-bar" style={{ animationDelay: '0.1s' }}></div>
            <div className="wave-bar" style={{ animationDelay: '0.2s' }}></div>
            <div className="wave-bar" style={{ animationDelay: '0.3s' }}></div>
            <div className="wave-bar" style={{ animationDelay: '0.4s' }}></div>
          </div>

          <div className="voice-buttons">
            {!isPaused ? (
              <button 
                className="btn-voice-control pause" 
                onClick={pauseRecording}
                type="button"
              >
                ⏸ Pause
              </button>
            ) : (
              <button 
                className="btn-voice-control resume" 
                onClick={resumeRecording}
                type="button"
              >
                ▶ Resume
              </button>
            )}
            
            <button 
              className="btn-voice-control cancel" 
              onClick={cancelRecording}
              type="button"
            >
              ✕ Cancel
            </button>
            
            <button 
              className="btn-voice-control stop" 
              onClick={stopRecording}
              type="button"
            >
              ■ Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
