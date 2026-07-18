import { useEffect, useState } from 'react';
import { CinCapture } from './CinCapture';
import { LivenessCheck } from './LivenessCheck';
import { ProfileForm } from './ProfileForm';
import { SignatureCapture } from './SignatureCapture';
import type { CinData, EkycState, LivenessResult, PolicyMatch, ProfileData, ScreeningResult } from './types';
import { STEPS } from './types';
import { validateCinNumber, validateDateOfBirth, validateFullName } from '../lib/ocr';
import { useTranslation } from '../i18n/useTranslation';

export function EkycApp({ onComplete }: { onComplete: (data: EkycState) => void }) {
  const [state, setState] = useState<EkycState>({
    step: 0,
    cin: {
      fullName: '',
      dob: '',
      cinNumber: '',
      address: '',
      frontImage: null,
      backImage: null,
    },
    liveness: null,
    screening: null,
    profile: null,
    policy: null,
    signature: null,
    profileId: null,
  });

  const updateCin = (cin: Partial<CinData>) => {
    setState(s => ({ ...s, cin: { ...s.cin, ...cin } }));
  };

  const updateLiveness = (liveness: LivenessResult) => {
    setState(s => ({ ...s, liveness }));
  };

  const updateProfile = (profile: ProfileData) => {
    setState(s => ({ ...s, profile }));
  };

  // null means the customer declined — a valid, recorded outcome.
  const updatePolicy = (policy: PolicyMatch | null) => {
    setState(s => ({ ...s, policy }));
  };

  const updateScreening = (screening: ScreeningResult) => {
    setState(s => ({ ...s, screening }));
  };

  const updateSignature = (signature: string) => {
    setState(s => ({ ...s, signature }));
  };

  const goToStep = (step: number) => {
    setState(s => ({ ...s, step }));
  };

  const nextStep = () => goToStep(state.step + 1);
  const prevStep = () => goToStep(state.step - 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Stepper */}
      <div className="ekyc-stepper">
        {STEPS.map((label, i) => (
          <div
            key={i}
            className={`stepper-item ${i < state.step ? 'done' : i === state.step ? 'active' : ''}`}
          >
            <div className="stepper-dot">
              {i < state.step ? '✓' : i + 1}
            </div>
            <span className="stepper-label">{label}</span>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="ekyc-content">
        {state.step === 0 && <WelcomeStep onNext={nextStep} />}
        
        {state.step === 1 && (
          <CinCapture
            cin={state.cin}
            onUpdate={updateCin}
            onNext={nextStep}
            onBack={prevStep}
          />
        )}
        
        {state.step === 2 && (
          <ConfirmDetails
            cin={state.cin}
            onUpdate={updateCin}
            onNext={() => {
              // Run screening
              runScreening(state.cin).then(result => {
                updateScreening(result);
                nextStep();
              });
            }}
            onBack={prevStep}
          />
        )}
        
        {state.step === 3 && (
          <LivenessCheck
            cinFrontImage={state.cin.frontImage}
            onComplete={(result) => {
              updateLiveness(result);
              nextStep();
            }}
            onBack={prevStep}
          />
        )}
        
        {state.step === 4 && (
          <ScreeningStep
            screening={state.screening}
            cinData={state.cin}
            onNext={nextStep}
          />
        )}
        
        {state.step === 5 && (
          <ProfileForm
            onSubmit={(profile) => {
              updateProfile(profile);
              nextStep();
            }}
            onBack={prevStep}
          />
        )}

        {/* Options are fetched by the step itself, from answers the user gives
            there — previously this was gated on a policy fetched in advance
            from the eKYC profile, which is why it never varied. */}
        {state.step === 6 && (
          <PolicyOptionsStep
            profile={state.profile}
            selected={state.policy}
            onChoose={(policy) => {
              updatePolicy(policy);
              nextStep();
            }}
            onDecline={() => {
              updatePolicy(null);
              nextStep();
            }}
            onBack={prevStep}
          />
        )}
        
        {state.step === 7 && (
          <SignatureCapture
            onSign={(signature) => {
              updateSignature(signature);
              nextStep();
            }}
            onBack={prevStep}
          />
        )}
        
        {state.step === 8 && (
          <CompleteStep
            state={state}
            onContinue={() => onComplete(state)}
          />
        )}
      </div>
    </div>
  );
}

// Step Components
function WelcomeStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  
  return (
    <div className="card ekyc-card">
      <div className="ekyc-icon">🛡️</div>
      <h2>{t('welcome_title')}</h2>
      <p>{t('welcome_description')}</p>
      <div className="ekyc-features">
        <div className="feature-item">✓ Arabic + French OCR</div>
        <div className="feature-item">✓ Liveness detection</div>
        <div className="feature-item">✓ AML/PEP screening</div>
        <div className="feature-item">✓ Smart policy matching</div>
      </div>
      <button className="btn btn-danger btn-wide" onClick={onNext}>
        {t('start_ekyc')}
      </button>
    </div>
  );
}

function ConfirmDetails({
  cin,
  onUpdate,
  onNext,
  onBack
}: {
  cin: CinData;
  onUpdate: (data: Partial<CinData>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { t } = useTranslation();

  const handleValidateAndContinue = () => {
    const newErrors: Record<string, string> = {};

    // Validate full name
    if (!validateFullName(cin.fullName)) {
      newErrors.fullName = t('error_fullname');
    }

    // Validate date of birth
    if (!validateDateOfBirth(cin.dob)) {
      newErrors.dob = t('error_dob');
    }

    // Validate CIN number
    if (!validateCinNumber(cin.cinNumber)) {
      newErrors.cinNumber = t('error_cin');
    }

    // Validate address
    if (!cin.address || cin.address.length < 10) {
      newErrors.address = t('error_address');
    }

    setErrors(newErrors);

    // If no errors, continue
    if (Object.keys(newErrors).length === 0) {
      onNext();
    }
  };

  return (
    <div className="card ekyc-card">
      <h2>{t('confirm_details_title')}</h2>
      <p className="fine">{t('confirm_details_subtitle')}</p>
      
      <div className="form-grid">
        <label className="form-label">
          {t('full_name')}
          <input
            className={`form-input ${errors.fullName ? 'input-error' : ''}`}
            value={cin.fullName}
            onChange={(e) => {
              onUpdate({ fullName: e.target.value });
              if (errors.fullName) {
                setErrors(prev => ({ ...prev, fullName: '' }));
              }
            }}
            placeholder="Ahmed Ben Mohamed"
          />
          {errors.fullName && <span className="error-message">{errors.fullName}</span>}
        </label>
        
        <label className="form-label">
          {t('date_of_birth')}
          <input
            className={`form-input ${errors.dob ? 'input-error' : ''}`}
            value={cin.dob}
            onChange={(e) => {
              onUpdate({ dob: e.target.value });
              if (errors.dob) {
                setErrors(prev => ({ ...prev, dob: '' }));
              }
            }}
            placeholder="15/03/1990"
          />
          {errors.dob && <span className="error-message">{errors.dob}</span>}
        </label>
        
        <label className="form-label">
          {t('cin_number')}
          <input
            className={`form-input ${errors.cinNumber ? 'input-error' : ''}`}
            value={cin.cinNumber}
            onChange={(e) => {
              // Only allow digits
              const value = e.target.value.replace(/\D/g, '').slice(0, 8);
              onUpdate({ cinNumber: value });
              if (errors.cinNumber) {
                setErrors(prev => ({ ...prev, cinNumber: '' }));
              }
            }}
            placeholder="12345678"
            maxLength={8}
          />
          {errors.cinNumber && <span className="error-message">{errors.cinNumber}</span>}
        </label>
        
        <label className="form-label">
          {t('address')}
          <input
            className={`form-input ${errors.address ? 'input-error' : ''}`}
            value={cin.address}
            onChange={(e) => {
              onUpdate({ address: e.target.value });
              if (errors.address) {
                setErrors(prev => ({ ...prev, address: '' }));
              }
            }}
            placeholder="Avenue Habib Bourguiba, Tunis"
          />
          {errors.address && <span className="error-message">{errors.address}</span>}
        </label>
      </div>
      
      <div className="row">
        <button className="btn btn-ghost" onClick={onBack}>{t('back')}</button>
        <button 
          className="btn btn-danger" 
          onClick={handleValidateAndContinue}
        >
          {t('confirm_continue')}
        </button>
      </div>
    </div>
  );
}

function ScreeningStep({ 
  screening, 
  cinData,
  onNext 
}: { 
  screening: ScreeningResult | null; 
  cinData: CinData;
  onNext: () => void;
}) {
  if (!screening) {
    return (
      <div className="card ekyc-card">
        <div className="widget-processing">
          <div className="spinner" />
          <span>Running AML/PEP screening...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card ekyc-card">
      <h2>🌐 Screening Results</h2>
      <p className="fine">Checked against watchlists for {cinData.fullName}</p>
      
      {screening.status === 'clear' ? (
        <div className="screening-result success">
          <div className="result-icon">✓</div>
          <div>
            <strong>Clear</strong>
            <p className="fine">No sanctions or PEP matches found</p>
          </div>
        </div>
      ) : (
        <div className="screening-result warning">
          <div className="result-icon">⚠</div>
          <div>
            <strong>Review Required</strong>
            <p className="fine">{screening.hits.length} potential match(es) found</p>
            {screening.hits.map((hit, i) => (
              <p key={i} className="fine">
                • {hit.name} ({hit.list}) - {hit.score}% match
              </p>
            ))}
          </div>
        </div>
      )}
      
      <button className="btn btn-danger btn-wide" onClick={onNext}>
        Continue →
      </button>
    </div>
  );
}

interface PolicyOption {
  id: string;
  name: string;
  tier: number;
  tagline: string;
  covers: string[];
  notCovered: string[];
  premiumTND: number;
  recommended: boolean;
  fit: number;
}

/** The questions that actually move the recommendation. */
const POLICY_QUESTIONS: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
}[] = [
  { id: 'vehicle_age', label: 'Âge du véhicule', options: [
    { value: 'new', label: 'Neuf' }, { value: '1-3', label: '1–3 ans' },
    { value: '4-8', label: '4–8 ans' }, { value: '9+', label: '9 ans et +' }] },
  { id: 'vehicle_value', label: 'Valeur (TND)', options: [
    { value: 'lt20', label: '< 20 000' }, { value: '20-50', label: '20–50 000' },
    { value: '50-100', label: '50–100 000' }, { value: 'gt100', label: '> 100 000' }] },
  { id: 'financing', label: 'Financement', options: [
    { value: 'cash', label: 'Payé comptant' }, { value: 'credit', label: 'Crédit' },
    { value: 'leasing', label: 'Leasing' }] },
  { id: 'parking', label: 'Stationnement la nuit', options: [
    { value: 'garage', label: 'Garage fermé' }, { value: 'guarded', label: 'Parking gardé' },
    { value: 'street', label: 'Dans la rue' }] },
  { id: 'usage', label: 'Usage', options: [
    { value: 'commute', label: 'Trajets quotidiens' }, { value: 'occasional', label: 'Occasionnel' },
    { value: 'professional', label: 'Professionnel' }] },
  { id: 'record', label: 'Sinistres (3 ans)', options: [
    { value: 'none', label: 'Aucun' }, { value: 'one', label: 'Un' }, { value: 'multi', label: 'Plusieurs' }] },
  { id: 'priority', label: 'Ce qui compte le plus', options: [
    { value: 'price', label: 'Le prix' }, { value: 'balanced', label: 'Équilibre' },
    { value: 'protection', label: 'La protection' }] },
];

/**
 * The whole shelf, priced for the customer's answers — not a single verdict.
 * Declining is a first-class outcome: eKYC stands on its own and subscribing
 * has never been required to file a constat.
 */
function PolicyOptionsStep({
  profile,
  selected,
  onChoose,
  onDecline,
  onBack,
}: {
  profile: ProfileData | null;
  selected: PolicyMatch | null;
  onChoose: (p: PolicyMatch) => void;
  onDecline: () => void;
  onBack: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<PolicyOption[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [chosenId, setChosenId] = useState<string | null>(selected?.id ?? null);
  const [loading, setLoading] = useState(true);

  // Re-price on every answer change, so the effect of each choice is visible.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/policy/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, profile: profile || {} }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setOptions(d.options || []);
        setReasons(d.reasons || []);
        setChosenId((cur) => cur ?? (d.options || []).find((o: PolicyOption) => o.recommended)?.id ?? null);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [answers, profile]);

  const answered = Object.keys(answers).length;
  const chosen = options.find((o) => o.id === chosenId) || null;

  return (
    <div className="card ekyc-card">
      <h2>🛡️ Vos options d'assurance</h2>
      <p className="fine">
        Répondez à ce qui vous concerne — les tarifs se recalculent à chaque réponse.
        Vous pouvez aussi continuer <strong>sans souscrire</strong> : votre vérification d'identité reste valable.
      </p>

      <div className="policy-quiz">
        {POLICY_QUESTIONS.map((q) => (
          <div key={q.id} className="policy-quiz-row">
            <span className="policy-quiz-label">{q.label}</span>
            <div className="policy-quiz-opts">
              {q.options.map((o) => (
                <button
                  key={o.value}
                  className={`chip ${answers[q.id] === o.value ? 'chip-on' : ''}`}
                  onClick={() =>
                    setAnswers((a) =>
                      a[q.id] === o.value
                        ? Object.fromEntries(Object.entries(a).filter(([k]) => k !== q.id))
                        : { ...a, [q.id]: o.value }
                    )
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {answered === 0 && (
        <p className="fine">
          Sans réponses, les formules sont affichées au tarif de base et aucune ne peut être
          recommandée honnêtement.
        </p>
      )}

      <div className={`policy-list ${loading ? 'is-loading' : ''}`}>
        {options.map((o) => (
          <button
            key={o.id}
            className={`policy-option ${chosenId === o.id ? 'selected' : ''}`}
            onClick={() => setChosenId(o.id)}
          >
            <div className="policy-option-head">
              <span className="policy-option-name">{o.name}</span>
              {o.recommended && answered > 0 && <span className="badge badge-green">Recommandé</span>}
              <span className="policy-option-price">{o.premiumTND} TND<small>/an</small></span>
            </div>
            <p className="policy-tagline">{o.tagline}</p>
            {answered > 0 && (
              <div className="policy-fit"><div className="policy-fit-bar" style={{ width: `${o.fit}%` }} /></div>
            )}
            {chosenId === o.id && (
              <div className="policy-covers">
                {o.covers.map((c, i) => <div key={i} className="cover-item">✓ {c}</div>)}
                {o.notCovered.map((c, i) => <div key={i} className="cover-item cover-no">✕ {c}</div>)}
              </div>
            )}
          </button>
        ))}
      </div>

      {reasons.length > 0 && answered > 0 && (
        <ul className="policy-reasons">
          {reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      <div className="row">
        <button className="btn btn-ghost" onClick={onBack}>← Retour</button>
        <button
          className="btn btn-danger"
          disabled={!chosen}
          onClick={() =>
            chosen &&
            onChoose({
              id: chosen.id,
              name: chosen.name,
              tagline: chosen.tagline,
              covers: chosen.covers,
              confidence: chosen.fit,
              premiumTND: chosen.premiumTND,
            })
          }
        >
          Souscrire {chosen ? `— ${chosen.name}` : ''} →
        </button>
      </div>

      <div className="ekyc-skip">
        <button className="linklike" onClick={onDecline}>
          Non merci, continuer sans assurance →
        </button>
      </div>
    </div>
  );
}

function CompleteStep({ 
  state, 
  onContinue 
}: { 
  state: EkycState;
  onContinue: () => void;
}) {
  return (
    <div className="card ekyc-card">
      <div className="ekyc-icon">✅</div>
      <h2>Verification Complete!</h2>
      <p>Your identity has been verified and your policy is ready.</p>
      
      <div className="complete-summary">
        <div className="summary-item">
          <strong>Name:</strong> {state.cin.fullName}
        </div>
        <div className="summary-item">
          <strong>CIN:</strong> {state.cin.cinNumber}
        </div>
        <div className="summary-item">
          <strong>Policy:</strong> {state.policy?.name}
        </div>
        <div className="summary-item">
          <strong>Screening:</strong> {state.screening?.status}
        </div>
        <div className="summary-item">
          <strong>Liveness:</strong> {state.liveness?.method}
        </div>
      </div>
      
      <button className="btn btn-danger btn-wide" onClick={onContinue}>
        Continue to Accident Claims →
      </button>
    </div>
  );
}

// API functions
async function runScreening(cin: CinData): Promise<ScreeningResult> {
  try {
    const res = await fetch('/api/aml/screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: cin.fullName, dob: cin.dob })
    });
    const data = await res.json();
    return {
      status: data.status,
      hits: data.hits || []
    };
  } catch (error) {
    console.error('Screening error:', error);
    return { status: 'clear', hits: [] };
  }
}

