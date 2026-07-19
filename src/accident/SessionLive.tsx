import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { IS_DEMO } from '../lib/demo';
import { EvidenceStage } from '../evidence/EvidenceStage';
import { CarDiagram } from './CarDiagram';
import { ConstatForm } from './ConstatForm';
import { downloadConstatPdf } from './constatPdfFill';
import { EstimateCard } from './EstimateCard';
import type { ParticipantConstat } from './constatTypes';
import {
  distanceMeters,
  IMPACT_LABELS,
  type Participant,
  type SessionState,
} from './types';
import type { SessionHandle } from './useSession';

type GpsStatus = 'pending' | 'ok' | 'failed';
type Stage = 'case' | 'constat' | 'evidence' | 'done';

/** Per-tab, matching how useSession stores the session itself. */
const STAGE_KEY = 'cp_stage';

export function SessionLive({
  handle,
  onExit,
  userProfile,
}: {
  handle: SessionHandle;
  onExit: () => void;
  /** Verified identity from eKYC. Prefills the constat so a driver who has
   *  already proved who they are does not retype it at the roadside. A guest
   *  arriving via a join link has none, and the form collects it instead. */
  userProfile?: {
    fullName: string;
    cinNumber: string;
    profileId?: string;
    dob?: string;
    address?: string;
    planName?: string;
  };
}) {
  const session = handle.session as SessionState;
  const me = session.participants.find((p) => p.pid === handle.myPid) || null;
  const other = session.participants.find((p) => p.pid !== handle.myPid) || null;
  const locked = session.status === 'locked';
  // Persisted per tab, because taking a photo on a phone frequently costs us
  // the page: the OS camera takes focus, the browser evicts the tab, and on
  // return the app remounts. The session itself survives in sessionStorage, so
  // without this the user was silently thrown back to the case summary (or all
  // the way to eKYC) every time they added a damage photo.
  const [stage, setStageRaw] = useState<Stage>(() => {
    const saved = sessionStorage.getItem(STAGE_KEY) as Stage | null;
    return saved === 'case' || saved === 'constat' || saved === 'evidence' || saved === 'done' ? saved : 'case';
  });

  // A failed PDF must say why — the old .txt stub could not fail, so nothing
  // in the UI was prepared to report a real generation error.
  const [pdfError, setPdfError] = useState<string | null>(null);

  // eKYC values reused by the constat; undefined for a guest.
  const kycIdentity = userProfile
    ? {
        fullName: userProfile.fullName,
        cin: userProfile.cinNumber,
        dob: userProfile.dob,
        address: userProfile.address,
        planName: userProfile.planName,
      }
    : undefined;

  const setStage = (s: Stage) => {
    sessionStorage.setItem(STAGE_KEY, s);
    setStageRaw(s);
  };

  // ---- QR + join link ----------------------------------------------------
  const [qr, setQr] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState('');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let base = window.location.origin;
      try {
        const info = await fetch('/api/netinfo').then((r) => r.json());
        if (info.lanIp) base = `${window.location.protocol}//${info.lanIp}:${info.clientPort}`;
      } catch {
        /* fall back to current origin */
      }
      const url = `${base}/#join/${session.code}`;
      const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 300 });
      if (!cancelled) {
        setJoinUrl(url);
        setQr(dataUrl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.code]);

  // ---- Automatic GPS capture (the "never typed" claim) -------------------
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('pending');
  const gpsRequested = useRef(false);

  const captureGps = () => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('failed');
      return;
    }
    setGpsStatus('pending');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handle.sendPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setGpsStatus('ok');
      },
      () => setGpsStatus('failed'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  useEffect(() => {
    if (me && !me.position && !locked && handle.connected && !gpsRequested.current) {
      gpsRequested.current = true;
      captureGps();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.pid, handle.connected]);

  const sendDemoLocation = () => {
    // Central Tunis with slight jitter — clearly labeled simulated
    handle.sendPosition({
      lat: 36.8065 + (Math.random() - 0.5) * 0.0002,
      lng: 10.1815 + (Math.random() - 0.5) * 0.0002,
      accuracy: 10 + Math.round(Math.random() * 8),
      simulated: true,
    });
    setGpsStatus('ok');
  };

  // ---- Timeline auto-scroll ----------------------------------------------
  const timelineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = timelineRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.events.length]);

  // ---- Proximity consistency chip ----------------------------------------
  let proximity: { meters: number; anySim: boolean } | null = null;
  if (me?.position && other?.position) {
    proximity = {
      meters: distanceMeters(me.position, other.position),
      anySim: !!(me.position.simulated || other.position.simulated),
    };
  }

  const created = new Date(session.createdAt);

  // Handler for saving constat data
  const handleSaveConstat = (data: Partial<ParticipantConstat>) => {
    handle.sendConstat(data);
  };

  // -------- Phase 3: Constat Form (after both confirmed, before evidence) ----
  if (locked && stage === 'constat' && me) {
    const canDownload = me.constat && other?.constat && 
                       me.constat.vehicle && other.constat.vehicle;
    
    return (
      <div className="acc-live">
        <div className="stage-nav">
          <button className="linklike" onClick={() => setStage('case')}>‹ Back to case summary</button>
          <span className="badge badge-blue">PHASE 3 · CONSTAT AMIABLE</span>
        </div>
        <div className="card">
          <h3>📋 Constat Amiable d'Accident Automobile</h3>
          <p className="fine">
            Remplissez les informations du constat officiel FTUSA. Ces données seront synchronisées avec l'autre conducteur.
          </p>
          {other && (
            <p className="fine">
              <strong>{other.name}</strong> {other.constat ? '✓ a rempli son constat' : 'remplit son constat...'}
            </p>
          )}
        </div>
        <ConstatForm
          existingData={me.constat || undefined}
          onSave={handleSaveConstat}
          isLocked={false}
        />
        <div className="confirm-bar">
          {canDownload && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                downloadConstatPdf({ session, me, other, identity: kycIdentity }).catch((e) => setPdfError(String(e.message || e)));
              }}
            >
              ⬇ Télécharger le constat (PDF)
            </button>
          )}
          <button
            className="btn btn-danger btn-wide"
            onClick={() => setStage('evidence')}
          >
            Continuer vers l'analyse des preuves →
          </button>
        </div>
      </div>
    );
  }

  // -------- Final step: take the constat and go home ----------------------
  // The claim ends with a document in the driver's hand. Both drivers land
  // here independently, each downloading their own constat, and "return home"
  // detaches this tab from the case so the next journey starts clean.
  if (locked && stage === 'done' && me) {
    const goHome = () => {
      sessionStorage.removeItem(STAGE_KEY);
      onExit();
    };
    return (
      <div className="acc-live">
        <div className="card locked-banner">
          <div className="ekyc-icon">✅</div>
          <h2>Dossier terminé</h2>
          <p className="fine">
            Le constat de <strong>{me.name}</strong> est prêt. Chaque conducteur télécharge
            sa propre version — les deux sont enregistrées sous le dossier <code>{session.caseId}</code>.
          </p>

          <button
            className="btn btn-danger btn-wide"
            onClick={() => downloadConstatPdf({ session, me, other, identity: kycIdentity }).catch((e) => setPdfError(String(e.message || e)))}
          >
            ⬇ Télécharger mon constat (PDF)
          </button>
          {pdfError && <p className="scan-warning" role="alert">⚠️ {pdfError}</p>}

          {session.fraud && (
            <p className={`fine center fraud-line ${session.fraud.risk}`}>
              Analyse anti-fraude : risque <strong>{session.fraud.risk.toUpperCase()}</strong> ·
              intégrité {session.fraud.integrityScore}/100 · {session.fraud.verdict}
            </p>
          )}
          {session.fraudPending && (
            <p className="fine center">🧠 Analyse anti-fraude en cours…</p>
          )}
          {session.persistence && (
            <p className="fine center">
              {session.persistence.persisted
                ? '💾 Enregistré dans la base'
                : "📥 En attente de synchronisation avec la base"}
            </p>
          )}

        </div>

        <EstimateCard
          estimate={session.estimates?.[me.role]}
          pending={!!session.fraudPending}
          hasPhotos={!!me.evidence?.photos?.length}
        />

        <div className="card">
          <button className="btn btn-ghost btn-wide" onClick={goHome}>
            🏠 Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  // -------- Phase 4: AI evidence analysis (after the case locks) ----------
  if (locked && stage === 'evidence' && me) {
    return (
      <div className="acc-live">
        <div className="stage-nav">
          <button className="linklike" onClick={() => setStage('case')}>‹ Back to case summary</button>
          <span className="badge badge-blue">PHASE 4 · AI EVIDENCE ANALYSIS</span>
        </div>
        <EvidenceStage handle={handle} me={me} other={other} />

        {/* The estimate updates as photos are added, so it belongs here beside
            them — not only behind a button at the very end. */}
        <EstimateCard
          estimate={session.estimates?.[me.role]}
          pending={!!session.fraudPending}
          hasPhotos={!!me.evidence?.photos?.length}
        />

        {/* Every stage must have a visible way forward — the evidence step
            previously dead-ended with no route to the finished document. */}
        <div className="confirm-bar">
          <button className="btn btn-danger btn-wide" onClick={() => setStage('done')}>
            Terminer et récupérer le constat →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="acc-live">
      {/* Auto-captured facts */}
      <div className="card auto-card">
        <div className="card-head">
          <span className="card-title">⚡ Captured automatically</span>
          <span className="badge badge-green">NOTHING TYPED</span>
        </div>
        <div className="auto-grid">
          <div>
            <span className="auto-label">Date</span>
            <strong>{created.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
          </div>
          <div>
            <span className="auto-label">Time</span>
            <strong>{created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
          </div>
          <div>
            <span className="auto-label">Case</span>
            <strong className="mono">{session.caseId}</strong>
          </div>
        </div>
        {proximity && (
          <div className={`proximity ${proximity.meters <= 150 ? 'prox-ok' : 'prox-warn'}`}>
            {proximity.meters <= 150
              ? `✓ Both phones at the scene — ≈${proximity.meters} m apart`
              : `⚠ Devices ≈${(proximity.meters / 1000).toFixed(1)} km apart — flagged for review`}
            {proximity.anySim ? ' (includes simulated location)' : ''}
          </div>
        )}
      </div>

      {/* Share block while waiting for the other driver */}
      {session.status === 'waiting' && (
        <div className="card share-card">
          <span className="card-title">Get the other driver in</span>
          <div className="share-body">
            {qr && <img className="share-qr" src={qr} alt="Join QR code" />}
            <div className="share-code-side">
              <span className="auto-label">or session code</span>
              <div className="code-display">{session.code}</div>
              <p className="fine">{joinUrl}</p>
            </div>
          </div>
          {IS_DEMO && (
            <button className="btn btn-ghost" onClick={() => handle.simulateOtherDriver()}>
              ⚡ Simulate other driver joining (demo)
            </button>
          )}
        </div>
      )}

      {/* Drivers */}
      <div className="drivers">
        {me && <DriverCard p={me} isMe locked={locked} handle={handle} gpsStatus={gpsStatus} onRetryGps={captureGps} onDemoGps={sendDemoLocation} />}
        {other ? (
          <DriverCard p={other} isMe={false} locked={locked} handle={handle} gpsStatus="ok" onRetryGps={() => {}} onDemoGps={() => {}} />
        ) : (
          <div className="card driver-card ghost">
            <div className="driver-wait">
              <div className="pulse-ring" />
              <span>Waiting for the other driver…</span>
            </div>
          </div>
        )}
      </div>

      {/* Live timeline */}
      <div className="card">
        <span className="card-title">📡 Live case timeline</span>
        <div className="timeline" ref={timelineRef}>
          {session.events.map((e, i) => (
            <div className="tl-row" key={i}>
              <span className="tl-time">
                {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="tl-icon">{e.icon}</span>
              <span className="tl-text">{e.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Confirm / locked footer */}
      {locked ? (
        <div className="card locked-banner">
          <div className="locked-head">🔒 Case locked & sealed</div>
          <p className="fine">
            Both drivers confirmed at{' '}
            {session.lockedAt
              ? new Date(session.lockedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '—'}
            . One case file, two confirmations, zero paperwork.
          </p>
          <button className="btn btn-danger" onClick={() => setStage('constat')}>
            📋 Continue to Constat Form — Phase 3
          </button>
          {session.analysis && (
            <p className="fine center">Case integrity so far: {session.analysis.score}/100</p>
          )}
          <button className="btn btn-ghost" onClick={onExit}>Start a new session</button>
        </div>
      ) : (
        me && (
          <div className="confirm-bar">
            {me.confirmed ? (
              <div className="confirm-waiting">
                ✅ You confirmed — waiting for {other ? other.name : 'the other driver'}…
              </div>
            ) : (
              <>
                <button
                  className="btn btn-danger btn-wide"
                  disabled={session.status !== 'active'}
                  onClick={() => handle.sendConfirm()}
                >
                  {session.status === 'active' ? '✅ Confirm & lock my side' : '⏳ Waiting for the other driver…'}
                </button>
                {session.status === 'active' && !me.impact && (
                  <p className="fine center">Tip: tap where your car was hit first</p>
                )}
              </>
            )}
          </div>
        )
      )}
      {handle.error && <p className="acc-error">{handle.error}</p>}
    </div>
  );
}

function DriverCard({
  p,
  isMe,
  locked,
  handle,
  gpsStatus,
  onRetryGps,
  onDemoGps,
}: {
  p: Participant;
  isMe: boolean;
  locked: boolean;
  handle: SessionHandle;
  gpsStatus: GpsStatus;
  onRetryGps: () => void;
  onDemoGps: () => void;
}) {
  const joinLabel = { created: 'opened the case', qr: 'joined via QR', code: 'joined via code', simulated: 'simulated join' }[
    p.joinMethod
  ];
  return (
    <div className={`card driver-card ${isMe ? 'mine' : ''}`}>
      <div className="driver-head">
        <span className={`conn-dot ${p.connected ? 'on' : ''}`} title={p.connected ? 'connected' : 'disconnected'} />
        <strong>{p.name}</strong>
        {isMe && <span className="badge badge-blue">YOU</span>}
        {p.verified && <span className="badge badge-green">eKYC ✓</span>}
        {p.simulated && <span className="badge badge-amber">SIMULATED</span>}
      </div>
      <p className="fine">
        {p.policy ? `Policy: ${p.policy}` : 'No policy on file'} · {joinLabel}
      </p>

      <div className="gps-line">
        {p.position ? (
          <span>
            📍 {p.position.lat.toFixed(5)}, {p.position.lng.toFixed(5)} · ±{p.position.accuracy} m
            {p.position.simulated ? ' · simulated' : ''}
          </span>
        ) : isMe ? (
          gpsStatus === 'pending' ? (
            <span>📍 Locating automatically…</span>
          ) : (
            <span className="gps-failed">
              📍 GPS unavailable here ·{' '}
              <button className="linklike" onClick={onRetryGps}>retry</button> ·{' '}
              <button className="linklike" onClick={onDemoGps}>use demo location</button>
            </span>
          )
        ) : (
          <span>📍 Waiting for their location…</span>
        )}
      </div>

      <div className="impact-row">
        <CarDiagram
          selected={p.impact}
          editable={isMe && !locked}
          mine={isMe}
          onSelect={(z) => handle.sendImpact(z)}
        />
        <div className="impact-side">
          <span className="auto-label">{isMe ? 'Where was your car hit?' : 'Their point of impact'}</span>
          <strong className="impact-value">{p.impact ? IMPACT_LABELS[p.impact] : isMe ? 'Tap the car' : '—'}</strong>
          {p.confirmed && <span className="badge badge-green">CONFIRMED ✓</span>}
        </div>
      </div>
    </div>
  );
}
