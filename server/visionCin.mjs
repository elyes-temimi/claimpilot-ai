// Vision-model CIN reader.
//
// Measured behaviour of qwen2.5vl:3b on a Tunisian CIN, which shapes this:
//
//  * Asked to extract structured fields directly, it is unreliable — it put the
//    mother's name into the holder's surname, and once echoed the format
//    placeholder "DD/MM/YYYY" back as if it were data.
//  * Asked only to TRANSCRIBE, it is good, including on a degraded phone photo
//    where Tesseract recovered nothing but the digits.
//
// So the model does the job it is good at (reading glyphs) and the existing
// deterministic parser does the job it is good at (deciding which label owns
// which value). Note the model transcribes an RTL card in visual order — value
// line first, then its label — which is why parseCin detects value orientation.

const HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODEL = process.env.VISION_MODEL || 'qwen2.5vl:3b';

const PROMPT = [
  "Cette image est une carte d'identité nationale tunisienne.",
  'Transcris fidèlement TOUT le texte visible, ligne par ligne, de haut en bas.',
  "Garde l'arabe tel quel, sans le traduire ni le translittérer.",
  'Si un libellé et sa valeur sont sur la même ligne, garde-les sur la même ligne.',
  "N'ajoute aucun commentaire. N'invente aucun texte absent de l'image.",
  'Réponds uniquement en JSON: {"lines": ["...", "..."]}',
].join('\n');

export class VisionUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = 'VisionUnavailable';
  }
}

/** Is a vision-capable model actually pulled? Cached briefly for the UI badge. */
let probeAt = 0;
let probeOk = false;
export async function visionStatus() {
  if (Date.now() - probeAt < 15000) return { available: probeOk, model: MODEL };
  probeAt = Date.now();
  try {
    const res = await fetch(`${HOST}/api/tags`, { signal: AbortSignal.timeout(4000) });
    const body = await res.json();
    probeOk = (body.models || []).some((m) => m.name === MODEL || m.name.startsWith(MODEL.split(':')[0]));
    return { available: probeOk, model: MODEL };
  } catch (err) {
    probeOk = false;
    return { available: false, model: MODEL, error: err.message };
  }
}

/** Strip a data: URL prefix — Ollama wants bare base64. */
function toBase64(image) {
  const s = String(image || '');
  const comma = s.indexOf(',');
  return s.startsWith('data:') && comma !== -1 ? s.slice(comma + 1) : s;
}

/**
 * Transcribe a CIN photo.
 * @returns {Promise<{lines: string[], text: string, model: string, ms: number}>}
 */
export async function transcribeCin(image, { timeoutMs = 90000 } = {}) {
  const b64 = toBase64(image);
  if (!b64) throw new VisionUnavailable('no image supplied');

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(`${HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: 'json',
        options: { temperature: 0, num_predict: 800 },
        messages: [{ role: 'user', content: PROMPT, images: [b64] }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new VisionUnavailable(`vision model unreachable: ${err.message}`);
  }
  if (!res.ok) throw new VisionUnavailable(`Ollama returned ${res.status}`);

  const body = await res.json();
  const content = body?.message?.content || '';

  let lines = [];
  try {
    const parsed = JSON.parse(content);
    lines = Array.isArray(parsed.lines) ? parsed.lines : [];
  } catch {
    // A model that ignored the JSON instruction still gave us usable text.
    lines = content.split('\n');
  }

  lines = lines
    .filter((l) => typeof l === 'string')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 40);

  return { lines, text: lines.join('\n'), model: MODEL, ms: Date.now() - t0 };
}
