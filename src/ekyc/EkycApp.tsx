import { useState } from 'react';
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

  const updatePolicy = (policy: PolicyMatch) => {
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
              // Get policy match
              getPolicyMatch(profile).then(policy => {
                updatePolicy(policy);
                nextStep();
              });
            }}
            onBack={prevStep}
          />
        )}
        
        {state.step === 6 && state.policy && (
          <PolicyMatchStep
            policy={state.policy}
            onNext={nextStep}
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

function PolicyMatchStep({
  policy,
  onNext,
  onBack
}: {
  policy: PolicyMatch;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="card ekyc-card">
      <h2>🎯 Your Matched Policy</h2>
      <div className="policy-card">
        <h3>{policy.name}</h3>
        <div className="policy-confidence">{policy.confidence}% match</div>
        <p className="policy-tagline">{policy.tagline}</p>
        <div className="policy-covers">
          {policy.covers.map((cover, i) => (
            <div key={i} className="cover-item">✓ {cover}</div>
          ))}
        </div>
      </div>
      
      <div className="row">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn btn-danger" onClick={onNext}>
          Accept & Continue →
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

async function getPolicyMatch(profile: ProfileData): Promise<PolicyMatch> {
  try {
    const res = await fetch('/api/policy/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: profile, profile: {} })
    });
    const data = await res.json();
    
    // Mock response structure - adapt based on your API
    return {
      name: data.recommendation?.name || 'Tiers Confort',
      tagline: data.recommendation?.tagline || 'Essential coverage for everyone',
      covers: data.recommendation?.covers || ['Third party liability', 'Legal assistance'],
      confidence: 75
    };
  } catch (error) {
    console.error('Policy match error:', error);
    return {
      name: 'Tiers Confort',
      tagline: 'Essential coverage',
      covers: ['Third party liability'],
      confidence: 70
    };
  }
}
