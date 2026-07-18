// Local LLM client — talks to Ollama on this machine (no cloud, no API key).
//
// Everything the fraud engine and the estimator need from a model goes through
// `askJson`, which forces Ollama's JSON mode, enforces a timeout, and repairs
// the ragged output an 8B model sometimes produces (code fences, prose before
// the object, trailing commas). If Ollama is down the caller gets a typed
// LlmUnavailable error and falls back to the deterministic engines — the demo
// never hangs on a stopped service.

const HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

// Preference order: 3.1 has the most reliable JSON adherence of the three,
// but we use whatever the machine actually has pulled.
const MODEL_PREFERENCE = ['llama3.1', 'llama3', 'llama3.2'];

export class LlmUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = 'LlmUnavailable';
  }
}

let resolvedModel = null;
let lastProbeAt = 0;
let lastProbeOk = false;

/** Fetch with a hard deadline — Ollama can stall indefinitely on a cold load. */
async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw new LlmUnavailable(`Ollama timed out after ${timeoutMs}ms`);
    throw new LlmUnavailable(`Ollama unreachable at ${HOST}: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Which model to use. Resolved once from /api/tags, then cached.
 * OLLAMA_MODEL overrides the preference list entirely.
 */
export async function resolveModel() {
  if (resolvedModel) return resolvedModel;
  if (process.env.OLLAMA_MODEL) {
    resolvedModel = process.env.OLLAMA_MODEL;
    return resolvedModel;
  }
  const res = await fetchWithTimeout(`${HOST}/api/tags`, {}, 4000);
  if (!res.ok) throw new LlmUnavailable(`Ollama /api/tags returned ${res.status}`);
  const body = await res.json();
  const available = (body.models || []).map((m) => m.name);
  if (available.length === 0) throw new LlmUnavailable('Ollama has no models pulled');

  for (const want of MODEL_PREFERENCE) {
    const hit = available.find((n) => n === want || n.startsWith(`${want}:`));
    if (hit) {
      resolvedModel = hit;
      return resolvedModel;
    }
  }
  resolvedModel = available[0];
  return resolvedModel;
}

/** Cheap liveness probe, cached for 15s so the UI can show an honest badge. */
export async function llmStatus() {
  const now = Date.now();
  if (now - lastProbeAt < 15000) {
    return { available: lastProbeOk, model: resolvedModel, host: HOST };
  }
  lastProbeAt = now;
  try {
    const model = await resolveModel();
    lastProbeOk = true;
    return { available: true, model, host: HOST };
  } catch (err) {
    lastProbeOk = false;
    return { available: false, model: null, host: HOST, error: err.message };
  }
}

/**
 * Pull a JSON object out of whatever the model returned.
 * Handles ```json fences, leading prose, and trailing commas.
 */
export function extractJson(text) {
  if (!text) throw new Error('empty completion');
  let s = String(text).trim();

  // Strip markdown fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // Take the outermost {...} or [...] span
  const start = s.search(/[{[]/);
  if (start === -1) throw new Error('no JSON object in completion');
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error('unterminated JSON in completion');
  let json = s.slice(start, end + 1);

  try {
    return JSON.parse(json);
  } catch {
    // Second chance: drop trailing commas, which small models love to emit
    json = json.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(json);
  }
}

/**
 * Ask the local model for a JSON answer.
 *
 * @param {object}  opts
 * @param {string}  opts.system     - system prompt (the role + rules)
 * @param {string}  opts.prompt     - the user turn (the case data)
 * @param {number}  [opts.timeoutMs]- hard deadline, default 45s (8B on CPU is slow)
 * @param {number}  [opts.temperature] - default 0.1, we want determinism
 * @param {number}  [opts.retries]  - JSON-parse retries, default 1
 * @returns {Promise<object>} parsed JSON
 */
export async function askJson({ system, prompt, timeoutMs = 45000, temperature = 0.1, retries = 1 }) {
  const model = await resolveModel();
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // On a retry, get blunter about the format requirement.
    const userContent =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous answer was not valid JSON. Reply with ONE valid JSON object and nothing else — no prose, no markdown fences.`;

    const res = await fetchWithTimeout(
      `${HOST}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          options: { temperature, num_predict: 1200 },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userContent },
          ],
        }),
      },
      timeoutMs
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new LlmUnavailable(`Ollama /api/chat returned ${res.status}: ${detail.slice(0, 200)}`);
    }

    const body = await res.json();
    const content = body?.message?.content ?? '';
    try {
      return extractJson(content);
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(`LLM returned unparseable JSON after ${retries + 1} attempts: ${lastErr?.message}`);
}

// --- small helpers the engines share ---------------------------------------

/** Clamp a model-supplied number into range, falling back when it's garbage. */
export function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Coerce a model-supplied value to one of `allowed`, else null. */
export function oneOf(value, allowed) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return allowed.includes(v) ? v : null;
}

/** Coerce to a bounded array of trimmed strings. */
export function stringList(value, maxItems = 6, maxLen = 240) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => typeof x === 'string' && x.trim())
    .slice(0, maxItems)
    .map((x) => x.trim().slice(0, maxLen));
}
