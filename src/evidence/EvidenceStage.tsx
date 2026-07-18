import { useEffect, useRef, useState } from 'react';
import { IS_DEMO } from '../lib/demo';
import type { Participant, ParticipantEvidence } from '../accident/types';
import type { SessionHandle } from '../accident/useSession';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { transcribeAudio } from '../lib/speechToText';
import { ConsistencyCard } from './ConsistencyCard';
import { analyzeStatement, DEMO_STATEMENTS, LANG_LABELS, type Lang, type StatementAnalysis } from './language';
import { drawDamagedCar, type SampleKind } from './sampleDamage';
import { speechAvailable, startDictation, type DictationHandle } from './speech';
import { analyzeDamage, makeThumb, type DamageAnalysis } from './vision';

type Side = 'front' | 'rear' | 'left' | 'right';

interface AnalyzedPhoto {
  id: string;
  side: Side;
  heatmap: string;
  analysis: DamageAnalysis;
}

export const LANG_COLORS: Record<Lang, string> = {
  fr: '#2563eb',
  ar: '#059669',
  darija: '#f59e0b',
  en: '#64748b',
  other: '#cbd5e1',
};

export function EvidenceStage({
  handle,
  me,
  other,
}: {
  handle: SessionHandle;
  me: Participant;
  other: Participant | null;
}) {
  const [photos, setPhotos] = useState<AnalyzedPhoto[]>([]);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [statementText, setStatementText] = useState('');
  const [statement, setStatement] = useState<StatementAnalysis | null>(null);
  const [dictating, setDictating] = useState(false);
  const [interim, setInterim] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'text' | 'voice'>('text');
  const dictRef = useRef<DictationHandle | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- Sync my evidence to the shared session whenever it changes ---------
  useEffect(() => {
    if (photos.length === 0 && !statement) return;
    let cancelled = false;
    (async () => {
      const metas = await Promise.all(
        photos.map(async (p) => ({
          id: p.id,
          side: p.side,
          severity: p.analysis.severity,
          damageRatio: p.analysis.damageRatio,
          regionCount: p.analysis.regionCount,
          confidence: p.analysis.confidence,
          thumb: await makeThumb(p.heatmap),
        }))
      );
      if (cancelled) return;
      const evidence: Omit<ParticipantEvidence, 'updatedAt'> = {
        photos: metas,
        statement: statement
          ? {
              raw: statement.raw,
              summary: statement.summary,
              shares: statement.breakdown.shares,
              codeSwitching: statement.breakdown.codeSwitching,
              slots: statement.slots,
            }
          : null,
      };
      handle.sendEvidence(evidence);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, statement]);

  // ---- Photo intake -------------------------------------------------------
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    setPendingImage(dataUrl);
  };

  const addSample = (kind: SampleKind) => setPendingImage(drawDamagedCar(kind));

  const labelPending = async (side: Side) => {
    if (!pendingImage) return;
    const img = pendingImage;
    setPendingImage(null);
    setAnalyzing(true);
    try {
      const analysis = await analyzeDamage(img);
      setPhotos((prev) => [
        ...prev.slice(0, 3),
        { id: 'ph-' + Date.now(), side, heatmap: analysis.heatmapDataUrl, analysis },
      ]);
    } finally {
      setAnalyzing(false);
    }
  };

  // ---- Statement intake ---------------------------------------------------
  const toggleDictation = (lang: 'fr-FR' | 'ar-TN' | 'en-US') => {
    if (dictating) {
      dictRef.current?.stop();
      setDictating(false);
      return;
    }
    const h = startDictation(
      lang,
      (text, isFinal) => {
        if (isFinal) {
          setStatementText((prev) => (prev ? prev + ' ' : '') + text);
          setInterim('');
        } else {
          setInterim(text);
        }
      },
      () => setDictating(false),
      () => setDictating(false)
    );
    if (h) {
      dictRef.current = h;
      setDictating(true);
    }
  };

  useEffect(() => () => dictRef.current?.stop(), []);

  const runStatementAnalysis = () => {
    if (!statementText.trim()) return;
    setStatement(analyzeStatement(statementText.trim()));
  };

  const handleVoiceRecording = async (audioBlob: Blob, duration: number) => {
    setTranscribing(true);
    try {
      const result = await transcribeAudio(audioBlob, duration);
      setStatementText(result.text);
      setStatement(analyzeStatement(result.text));
      setRecordingMode('text'); // Switch back to text mode to show result
    } catch (error) {
      console.error('Transcription error:', error);
      alert('Failed to transcribe audio. Please try again.');
    } finally {
      setTranscribing(false);
    }
  };

  const loadFraudScenario = () => {
    setStatementText(DEMO_STATEMENTS.fraud);
    setStatement(analyzeStatement(DEMO_STATEMENTS.fraud));
    setPendingImage(null);
    // photos say FRONT while the story says REAR — the flagship mismatch
    (async () => {
      setAnalyzing(true);
      const img = drawDamagedCar('front');
      const analysis = await analyzeDamage(img);
      setPhotos([{ id: 'ph-fraud', side: 'front', heatmap: analysis.heatmapDataUrl, analysis }]);
      setAnalyzing(false);
    })();
  };

  const sevBadge = (s: string) =>
    s === 'severe' ? 'badge-red' : s === 'moderate' ? 'badge-amber' : 'badge-green';

  return (
    <div className="evidence-stage">
      {/* ------------------------ 1 · Vision AI ------------------------- */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">📷 1 · Damage photos — Vision AI</span>
          <span className="badge badge-blue">ON-DEVICE</span>
        </div>
        <p className="fine">
          Edge-orientation entropy analysis localizes damage texture and grades severity — live, in your
          browser. Production swaps in a trained CNN; same pipeline.
        </p>

        {photos.length > 0 && (
          <div className="photo-grid">
            {photos.map((p) => (
              <div className="photo-card" key={p.id}>
                <img src={p.heatmap} alt={`Damage ${p.side}`} />
                <div className="photo-meta">
                  <span className="badge badge-gray">{p.side.toUpperCase()}</span>
                  <span className={`badge ${sevBadge(p.analysis.severity)}`}>
                    {p.analysis.severity.toUpperCase()}
                  </span>
                  <span className="fine">
                    {(p.analysis.damageRatio * 100).toFixed(1)}% of frame · {p.analysis.regionCount} region
                    {p.analysis.regionCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {pendingImage ? (
          <div className="side-picker">
            <img src={pendingImage} alt="New evidence" />
            <p className="fine center">Which side of <strong>your car</strong> is this?</p>
            <div className="row wrap center-row">
              {(['front', 'rear', 'left', 'right'] as Side[]).map((s) => (
                <button key={s} className="chip" onClick={() => labelPending(s)}>
                  {s === 'front' ? '🔼' : s === 'rear' ? '🔽' : s === 'left' ? '◀' : '▶'} {s}
                </button>
              ))}
              <button className="chip chip-muted" onClick={() => setPendingImage(null)}>✕ discard</button>
            </div>
          </div>
        ) : analyzing ? (
          <div className="widget-processing">
            <div className="spinner" />
            <span>Vision AI analyzing damage texture…</span>
          </div>
        ) : (
          photos.length < 4 && (
            <div className="row wrap">
              <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                📸 Add damage photo
              </button>
              <button className="btn btn-ghost" onClick={() => addSample('rear')}>🚗 Sample: rear hit</button>
              <button className="btn btn-ghost" onClick={() => addSample('front')}>🚗 Sample: front hit</button>
            </div>
          )
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      </div>

      {/* ----------------------- 2 · Language AI ------------------------ */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">🎙 2 · Your statement — Language AI</span>
          <span className="badge badge-blue">FR·AR·DARIJA·EN</span>
        </div>
        <p className="fine">
          Speak or type in French, Arabic, Tunisian Darija or English — even mixed in one sentence. The
          engine tags every word, then extracts the facts.
        </p>

        {/* Recording mode toggle */}
        <div className="row wrap" style={{ marginBottom: '12px' }}>
          <button 
            className={`chip ${recordingMode === 'text' ? 'chip-active' : ''}`}
            onClick={() => setRecordingMode('text')}
          >
            ⌨️ Type / Dictate
          </button>
          <button 
            className={`chip ${recordingMode === 'voice' ? 'chip-active' : ''}`}
            onClick={() => setRecordingMode('voice')}
          >
            🎤 Voice Recording
          </button>
        </div>

        {recordingMode === 'voice' ? (
          <>
            <p className="fine" style={{ marginBottom: '12px' }}>
              Record your full statement in any language (Arabic, Darija, French, or mixed). 
              The AI will automatically transcribe and analyze it.
            </p>
            {transcribing ? (
              <div className="widget-processing">
                <div className="spinner" />
                <span>Transcribing your statement with multilingual AI...</span>
              </div>
            ) : (
              <VoiceRecorder onRecordingComplete={handleVoiceRecording} maxDuration={120} />
            )}
          </>
        ) : (
          <>
            {speechAvailable() && (
              <div className="row wrap">
                <button className={`chip ${dictating ? 'chip-live' : ''}`} onClick={() => toggleDictation('fr-FR')}>
                  {dictating ? '⏹ stop' : '🎙 dicter en français'}
                </button>
                <button className="chip" onClick={() => toggleDictation('ar-TN')}>🎙 بالعربية / بالدارجة</button>
                <button className="chip" onClick={() => toggleDictation('en-US')}>🎙 in English</button>
              </div>
            )}

            <textarea
              className="stmt-input"
              dir="auto"
              rows={3}
              placeholder="Ex: Kont waqef au feu rouge و دخل فيا من التالي…"
              value={interim ? `${statementText} ${interim}`.trim() : statementText}
              onChange={(e) => setStatementText(e.target.value)}
            />
            <div className="row wrap">
              <button className="btn btn-primary" disabled={!statementText.trim()} onClick={runStatementAnalysis}>
                🧠 Analyze statement
              </button>
              {IS_DEMO && (
                <>
                  <button className="btn btn-ghost" onClick={() => { setStatementText(DEMO_STATEMENTS.victim); setStatement(analyzeStatement(DEMO_STATEMENTS.victim)); }}>
                    ⚡ Demo: mixed-language statement
                  </button>
                  <button className="btn btn-ghost" onClick={loadFraudScenario}>⚠ Demo: fraud scenario</button>
                </>
              )}
            </div>
          </>
        )}

        {statement && <StatementResult analysis={statement} />}
      </div>

      {/* ----------------- Other driver's evidence (live) ---------------- */}
      <OtherEvidence other={other} />

      {/* -------------------- 3 · Consistency Engine --------------------- */}
      {handle.session?.analysis ? (
        <ConsistencyCard report={handle.session.analysis} />
      ) : (
        <div className="card">
          <div className="card-head">
            <span className="card-title">⚖️ 3 · Consistency Engine</span>
            <span className="badge badge-gray">WAITING</span>
          </div>
          <p className="fine">
            Add a photo or a statement and the engine starts cross-examining the case: story vs dents vs
            diagram vs the other driver — before payout, not after.
          </p>
        </div>
      )}
      <p className="fine center">
        {me.name.split(' ')[0]}, everything here syncs live to the shared case file.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatementResult({ analysis }: { analysis: StatementAnalysis }) {
  const { breakdown, slots, summary } = analysis;
  const langs = (Object.keys(breakdown.shares) as Lang[]).filter((l) => breakdown.shares[l] > 0);

  return (
    <div className="stmt-result">
      <div className="lang-bar">
        {langs.map((l) => (
          <div
            key={l}
            className="lang-seg"
            style={{ width: `${breakdown.shares[l]}%`, background: LANG_COLORS[l] }}
            title={`${LANG_LABELS[l]} ${breakdown.shares[l]}%`}
          />
        ))}
      </div>
      <div className="lang-legend">
        {langs.map((l) => (
          <span key={l} className="lang-key">
            <i style={{ background: LANG_COLORS[l] }} /> {LANG_LABELS[l]} {breakdown.shares[l]}%
          </span>
        ))}
        {breakdown.codeSwitching && <span className="badge badge-amber">CODE-SWITCHING ✓</span>}
      </div>

      <div className="token-strip" dir="auto">
        {breakdown.tokens.map((t, i) => (
          <span key={i} className="token" style={{ borderColor: LANG_COLORS[t.lang], background: `${LANG_COLORS[t.lang]}18` }}>
            {t.token}
          </span>
        ))}
      </div>

      <div className="slots-grid">
        <Slot label="Impact from" value={slots.impactDirection} />
        <Slot label="Movement" value={slots.movement} />
        <Slot label="Fault claim" value={slots.faultClaim === 'other' ? 'other party' : slots.faultClaim === 'self' ? 'accepts fault' : null} />
        <Slot label="Injuries" value={slots.injuries === null ? null : slots.injuries ? 'reported' : 'none'} />
        {slots.conditions.length > 0 && <Slot label="Conditions" value={slots.conditions.join(', ')} />}
      </div>
      <p className="stmt-summary">📄 {summary}</p>
    </div>
  );
}

function Slot({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="slot">
      <span className="auto-label">{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

function OtherEvidence({ other }: { other: Participant | null }) {
  if (!other) return null;
  const ev = other.evidence;
  const first = other.name.split(' ')[0];
  return (
    <div className="card other-evidence">
      <div className="card-head">
        <span className="card-title">👤 {first}'s evidence</span>
        {ev ? <span className="badge badge-green">RECEIVED</span> : <span className="badge badge-gray">WAITING…</span>}
      </div>
      {!ev ? (
        <p className="fine">Their photos and statement will appear here the moment they submit.</p>
      ) : (
        <>
          {ev.photos.length > 0 && (
            <div className="row wrap">
              {ev.photos.map((p) => (
                <div className="mini-photo" key={p.id}>
                  {p.thumb ? <img src={p.thumb} alt={p.side} /> : <div className="mini-ph">📷</div>}
                  <span className="fine">
                    {p.side} · {p.severity}
                    {p.placeholder ? ' · simulated' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          {ev.statement && (
            <>
              <p className="stmt-quote" dir="auto">“{ev.statement.raw}”</p>
              <p className="stmt-summary">📄 {ev.statement.summary}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
