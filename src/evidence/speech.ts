// Web Speech API wrapper — real dictation in Chrome (fr-FR, ar-TN, en-US),
// with graceful absence everywhere else (the textarea is always available).

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
}

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function speechAvailable(): boolean {
  return getRecognitionCtor() !== null;
}

export interface DictationHandle {
  stop: () => void;
}

export function startDictation(
  lang: 'fr-FR' | 'ar-TN' | 'en-US',
  onText: (text: string, isFinal: boolean) => void,
  onEnd: () => void,
  onError: (message: string) => void
): DictationHandle | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (e: any) => {
    let interim = '';
    let final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript + ' ';
      else interim += r[0].transcript;
    }
    if (final) onText(final.trim(), true);
    else if (interim) onText(interim.trim(), false);
  };
  rec.onend = () => onEnd();
  rec.onerror = (e: any) => onError(e?.error || 'speech error');

  try {
    rec.start();
  } catch {
    return null;
  }
  return { stop: () => rec.stop() };
}
