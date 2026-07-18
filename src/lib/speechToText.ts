// Speech-to-text processing with Arabic/Darija/French support
// This uses Web Speech API for browser-based recognition
// For production, you'd use a service like Google Cloud Speech-to-Text, Azure Speech, or Whisper API

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  languageBreakdown?: {
    ar: number;  // Arabic percentage
    fr: number;  // French percentage
    darija: number; // Tunisian Darija (detected heuristically)
    en: number;  // English percentage
  };
  codeSwitching: boolean;
  duration: number;
}

/**
 * Mock transcription service
 * In production, this would send audio to a real speech-to-text service
 */
export async function transcribeAudio(
  audioBlob: Blob,
  duration: number
): Promise<TranscriptionResult> {
  // For now, return a mock result
  // In production, you'd send the blob to a backend API that uses:
  // - Google Cloud Speech-to-Text (supports Arabic + French)
  // - Azure Speech Services (supports Arabic + French)
  // - OpenAI Whisper API (best for multilingual, including Darija)
  // - AssemblyAI (good multilingual support)
  
  console.log('Transcribing audio blob:', audioBlob.size, 'bytes,', duration, 'seconds');
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Mock result with code-switching (French + Arabic + Darija)
  return {
    text: "J'ai freiné mais الطريق كانت مبللة, ma njemtech no9ef w dkhalt fih. C'est pas ma faute, طريق خايبة.",
    confidence: 0.87,
    language: 'mixed',
    languageBreakdown: {
      fr: 35,
      ar: 25,
      darija: 30,
      en: 10,
    },
    codeSwitching: true,
    duration,
  };
}

/**
 * Browser-based speech recognition (Chrome only, experimental)
 * Limited Arabic support, but works offline
 */
export function useBrowserSpeechRecognition(
  onResult: (transcript: string, isFinal: boolean) => void,
  onError: (error: string) => void
): {
  start: () => void;
  stop: () => void;
  isSupported: boolean;
} {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    return {
      start: () => onError('Speech recognition not supported in this browser'),
      stop: () => {},
      isSupported: false,
    };
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'ar-TN'; // Tunisian Arabic (fallback to ar-SA if not available)

  recognition.onresult = (event: any) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }
    }

    if (finalTranscript) {
      onResult(finalTranscript.trim(), true);
    } else if (interimTranscript) {
      onResult(interimTranscript.trim(), false);
    }
  };

  recognition.onerror = (event: any) => {
    onError(`Speech recognition error: ${event.error}`);
  };

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    isSupported: true,
  };
}

/**
 * Detect language breakdown in text (heuristic)
 * Useful for analyzing code-switching
 */
export function detectLanguages(text: string): {
  fr: number;
  ar: number;
  darija: number;
  en: number;
  codeSwitching: boolean;
} {
  const words = text.split(/\s+/);
  let frenchCount = 0;
  let arabicCount = 0;
  let darijaCount = 0;
  let englishCount = 0;

  // Simple heuristics
  const arabicRegex = /[\u0600-\u06FF]/;
  const latinRegex = /[a-zA-Z]/;
  
  // Common Darija words/patterns (phonetic transcription in Latin)
  const darijaPatterns = [
    'njemtech', 'no9ef', 'dkhalt', 'fih', 'khaieb', 'khayba', 
    'mziyen', 'behi', 'wallah', 'yezzi', 'barcha', 'chway',
    'w', 'wella', 'ama', 'hata', 'houwa', 'houma'
  ];

  words.forEach(word => {
    const lower = word.toLowerCase();
    
    if (arabicRegex.test(word)) {
      arabicCount++;
    } else if (latinRegex.test(word)) {
      if (darijaPatterns.some(pattern => lower.includes(pattern))) {
        darijaCount++;
      } else if (/^[a-z]+$/.test(lower) && lower.length > 2) {
        // Heuristic: short common words might be French
        if (['le', 'la', 'les', 'un', 'une', 'des', 'je', 'tu', 'il', 'pas', 'est', 'dans', 'pour', 'avec'].includes(lower)) {
          frenchCount++;
        } else {
          frenchCount++;
        }
      }
    }
  });

  const total = words.length;
  const result = {
    fr: Math.round((frenchCount / total) * 100),
    ar: Math.round((arabicCount / total) * 100),
    darija: Math.round((darijaCount / total) * 100),
    en: Math.round((englishCount / total) * 100),
    codeSwitching: false,
  };

  // Detect code-switching: more than one language with >15% representation
  const languages = [result.fr, result.ar, result.darija, result.en];
  const significantLanguages = languages.filter(pct => pct >= 15);
  result.codeSwitching = significantLanguages.length >= 2;

  return result;
}

/**
 * Integration endpoint for production speech-to-text API
 * This is where you'd call your backend that interfaces with:
 * - Whisper API (OpenAI) - best for multilingual
 * - Google Cloud Speech-to-Text
 * - Azure Speech Services
 */
export async function sendToSpeechAPI(
  audioBlob: Blob,
  apiEndpoint: string = '/api/speech/transcribe'
): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append('audio', audioBlob);
  formData.append('language', 'ar,fr,en'); // Multi-language detection

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Speech API error: ${response.statusText}`);
  }

  return response.json();
}
