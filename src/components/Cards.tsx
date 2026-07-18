import type { ReactNode } from 'react';
import { MATCH_THRESHOLD } from '../lib/face';
import type { Card } from '../types';

export function CardView({ card }: { card: Card }) {
  switch (card.kind) {
    case 'fields':
      return <FieldsCard card={card} />;
    case 'biometric':
      return <BiometricCard card={card} />;
    case 'aml':
      return <AmlCard card={card} />;
    case 'signed':
      return <SignedCard card={card} />;
    case 'policy':
      return <PolicyCard card={card} />;
  }
}

function FieldsCard({ card }: { card: Extract<Card, { kind: 'fields' }> }) {
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">🪪 Identity captured</span>
        <span className={`badge ${card.source === 'ocr' ? 'badge-blue' : 'badge-gray'}`}>
          {card.source === 'ocr' ? 'OCR extracted' : 'Manual entry'}
        </span>
      </div>
      <div className="kv">
        <span>Full name</span><strong>{card.fields.fullName || '—'}</strong>
      </div>
      <div className="kv">
        <span>Date of birth</span><strong>{card.fields.dob || '—'}</strong>
      </div>
      <div className="kv">
        <span>ID number</span><strong className="mono">{card.fields.idNumber || '—'}</strong>
      </div>
    </div>
  );
}

function BiometricCard({ card }: { card: Extract<Card, { kind: 'biometric' }> }) {
  const { data } = card;
  const livenessBadge =
    data.liveness === 'passed' ? (
      <span className="badge badge-green">Liveness ✓ blink detected</span>
    ) : data.liveness === 'simulated' ? (
      <span className="badge badge-amber">Liveness simulated (demo)</span>
    ) : (
      <span className="badge badge-gray">Liveness skipped</span>
    );

  let match: ReactNode;
  if (data.distance !== null) {
    const ok = data.distance < MATCH_THRESHOLD;
    const strength = Math.max(6, Math.min(100, Math.round((1 - data.distance / (MATCH_THRESHOLD * 2)) * 100)));
    match = (
      <>
        <div className="kv">
          <span>Face match</span>
          <span className={`badge ${ok ? 'badge-green' : 'badge-red'}`}>{ok ? 'Match ✓' : 'Review needed'}</span>
        </div>
        <div className="bar-track" title={`descriptor distance ${data.distance.toFixed(2)} (match < ${MATCH_THRESHOLD})`}>
          <div className={`bar-fill ${ok ? '' : 'bar-warn'}`} style={{ width: `${strength}%` }} />
        </div>
        <p className="fine">
          Descriptor distance {data.distance.toFixed(2)} — threshold {MATCH_THRESHOLD.toFixed(2)}
          {data.simulated ? ' · simulated values' : ''}
        </p>
      </>
    );
  } else {
    match = (
      <p className="fine">
        {card.hasReference
          ? 'Face comparison unavailable for this capture.'
          : 'No machine-readable face on the document (specimen card) — face match not applicable.'}
      </p>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">🧬 Biometric verification</span>
        {livenessBadge}
      </div>
      {match}
    </div>
  );
}

function AmlCard({ card }: { card: Extract<Card, { kind: 'aml' }> }) {
  const { data } = card;
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">🌐 AML / PEP screening</span>
        <span className={`badge ${data.status === 'clear' ? 'badge-green' : 'badge-amber'}`}>
          {data.status === 'clear' ? 'CLEAR' : 'REVIEW'}
        </span>
      </div>
      {data.hits.length > 0 && (
        <div className="aml-hits">
          {data.hits.map((h, i) => (
            <div className="aml-hit" key={i}>
              <div>
                <strong>{h.name}</strong>
                <span className={`badge ${h.list === 'SANCTIONS' ? 'badge-red' : 'badge-amber'}`}>{h.list}</span>
              </div>
              <p className="fine">{h.note} · match {h.score}%</p>
            </div>
          ))}
        </div>
      )}
      <p className="fine">
        {data.listsChecked.join(' · ')}
        <br />
        Ref {data.screeningId} · {new Date(data.screenedAt).toLocaleTimeString()}
      </p>
    </div>
  );
}

function SignedCard({ card }: { card: Extract<Card, { kind: 'signed' }> }) {
  const { data, profile, qr } = card;

  const download = () => {
    const blob = new Blob([JSON.stringify({ profile, attestation: data }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.profileId}-signed-profile.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card card-signed">
      <div className="card-head">
        <span className="card-title">🔏 Digitally signed profile</span>
        <span className="badge badge-green">SEALED</span>
      </div>
      <div className="signed-body">
        <div className="signed-fields">
          <div className="kv"><span>Holder</span><strong>{profile.fullName}</strong></div>
          <div className="kv"><span>Profile ID</span><strong className="mono">{data.profileId}</strong></div>
          <div className="kv"><span>Algorithm</span><strong>{data.algorithm}</strong></div>
          <div className="kv"><span>SHA-256</span><strong className="mono">{data.hash.slice(0, 18)}…</strong></div>
          <div className="kv"><span>Signed at</span><strong>{new Date(data.signedAt).toLocaleTimeString()}</strong></div>
        </div>
        <div className="signed-qr">
          <img src={qr} alt="Verification QR" />
          <span className="fine">scan to verify</span>
        </div>
      </div>
      <div className="check-strip">
        <span title={profile.checks.documentOcr}>🪪 Document</span>
        <span title={profile.checks.liveness}>🧬 Liveness</span>
        <span title={profile.checks.faceMatch}>🤳 Face</span>
        <span title={profile.checks.amlScreening}>🌐 AML</span>
        <span>✍️ Consent</span>
      </div>
      <button className="btn btn-ghost" onClick={download}>⬇ Download signed profile (JSON)</button>
    </div>
  );
}

function PolicyCard({ card }: { card: Extract<Card, { kind: 'policy' }> }) {
  const r = card.data;
  return (
    <div className="card card-policy">
      <div className="policy-header">
        <div>
          <p className="policy-eyebrow">Recommended for you</p>
          <h3>{r.policy.name}</h3>
          <p className="policy-tagline">{r.policy.tagline}</p>
        </div>
        <div className="policy-premium">
          <strong>{r.premiumTND.toLocaleString()}</strong>
          <span>TND / year (est.)</span>
        </div>
      </div>

      <div className="confidence">
        <div className="confidence-label">
          <span>Fit confidence</span>
          <strong>{r.confidence}%</strong>
        </div>
        <div className="bar-track"><div className="bar-fill" style={{ width: `${r.confidence}%` }} /></div>
      </div>

      <div className="policy-covers">
        {r.policy.covers.map((cv, i) => (
          <div key={i} className="cover yes">✓ {cv}</div>
        ))}
        {r.policy.notCovered.map((cv, i) => (
          <div key={i} className="cover no">✗ {cv}</div>
        ))}
      </div>

      <div className="policy-reasons">
        <p className="reasons-title">Why this one</p>
        {r.reasons.map((reason, i) => (
          <p key={i} className="reason">• {reason}</p>
        ))}
      </div>

      <details className="runner-up">
        <summary>Why not {r.runnerUp.name}?</summary>
        <p className="fine">{r.runnerUp.whyNot}</p>
      </details>
    </div>
  );
}
