// UUID generation that survives a non-secure context.
//
// `crypto.randomUUID` is only exposed on HTTPS and localhost. The moment a
// second driver opens the session link on their phone over the LAN
// (http://192.168.x.x:5173), it is undefined and every call throws
// "crypto.randomUUID is not a function".
//
// `crypto.getRandomValues` has no such restriction, so we build a v4 UUID from
// it and only fall back to Math.random if even that is missing.

export function safeRandomUUID(): string {
  const c: Crypto | undefined = globalThis.crypto;

  if (typeof c?.randomUUID === 'function') {
    return c.randomUUID();
  }

  if (typeof c?.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    // RFC 4122 §4.4 — set version (4) and variant (10xx)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Not cryptographically strong — only reached on ancient browsers. Local
  // record ids, never secrets.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
