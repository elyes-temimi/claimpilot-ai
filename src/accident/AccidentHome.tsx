import { useEffect, useState } from 'react';
import { loadStoredIdentity } from './identity';
import type { SessionHandle } from './useSession';
import type { SessionPreview } from './types';

export function AccidentHome({
  handle,
  initialJoinCode,
}: {
  handle: SessionHandle;
  initialJoinCode?: string;
}) {
  const stored = loadStoredIdentity();
  const [name, setName] = useState(stored.name);
  const [codeInput, setCodeInput] = useState(initialJoinCode || '');
  const [preview, setPreview] = useState<SessionPreview | null>(null);
  const [joinMethod, setJoinMethod] = useState<'qr' | 'code'>('code');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identity = () => ({ name: name.trim() || 'Guest Driver', verified: stored.verified, policy: stored.policy });

  const lookup = async (code: string, method: 'qr' | 'code') => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/session/${encodeURIComponent(code.trim().toUpperCase())}`);
      if (!res.ok) throw new Error('Session not found — check the code');
      const data = (await res.json()) as SessionPreview;
      if (data.participantCount >= 2) throw new Error('This case already has two drivers');
      setJoinMethod(method);
      setPreview(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Arrived via a scanned QR link (#join/CODE): look the session up immediately
  useEffect(() => {
    if (initialJoinCode) lookup(initialJoinCode, 'qr');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJoinCode]);

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      await handle.create(identity());
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const confirmJoin = async () => {
    if (!preview) return;
    setError(null);
    setBusy(true);
    try {
      await handle.join(preview.code, identity(), joinMethod);
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
      setBusy(false);
    }
  };

  if (preview) {
    return (
      <div className="acc-home">
        <div className="card acc-card">
          <div className="acc-icon">🤝</div>
          <h2>Join this case?</h2>
          <div className="kv"><span>Case</span><strong className="mono">{preview.caseId}</strong></div>
          <div className="kv"><span>Opened by</span><strong>{preview.createdBy}</strong></div>
          <div className="kv">
            <span>At</span>
            <strong>{new Date(preview.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
          </div>
          <label className="acc-label">
            Joining as
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </label>
          {stored.fromEkyc && <p className="fine">✓ eKYC-verified identity attached automatically</p>}
          <button className="btn btn-danger" disabled={busy} onClick={confirmJoin}>
            {busy ? 'Joining…' : '🤝 Join as second driver'}
          </button>
          <button className="btn btn-ghost" onClick={() => setPreview(null)}>Back</button>
          {error && <p className="acc-error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="acc-home">
      <div className="card acc-card">
        <div className="acc-icon">🚨</div>
        <h2>Accident? Stay calm.</h2>
        <p className="acc-sub">
          Both drivers work on <strong>one shared live case</strong> — location, date and time are captured
          automatically. Nothing is typed, nothing is filed twice.
        </p>
        <label className="acc-label">
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </label>
        {stored.fromEkyc ? (
          <p className="fine">
            ✓ eKYC-verified identity{stored.policy ? ` · policy: ${stored.policy}` : ''} — attached automatically
          </p>
        ) : (
          <p className="fine">Tip: complete onboarding first and your verified identity attaches automatically.</p>
        )}
        <button className="btn btn-danger" disabled={busy} onClick={start}>
          {busy ? 'Opening case…' : '🚨 Start shared session'}
        </button>

        <div className="acc-divider"><span>or join the other driver</span></div>

        <div className="row">
          <input
            className="code-input"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="6-letter code"
            maxLength={6}
          />
          <button
            className="btn btn-ghost"
            disabled={busy || codeInput.trim().length < 6}
            onClick={() => lookup(codeInput, 'code')}
          >
            Join
          </button>
        </div>
        <p className="fine">Join by scanning the other driver's QR, or typing their session code. (BLE nearby-join: planned.)</p>
        {error && <p className="acc-error">{error}</p>}
      </div>
    </div>
  );
}
