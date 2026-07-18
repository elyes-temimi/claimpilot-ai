import { useState } from 'react';
import type { ProfileData } from './types';

const INCOME_BRACKETS = {
  'lt1200': 'Less than 1,200 TND/month',
  '1200-2500': '1,200 - 2,500 TND/month',
  '2500-4500': '2,500 - 4,500 TND/month',
  'gt4500': 'More than 4,500 TND/month'
};

const LIVING_AREAS = {
  'grand_tunis': 'Grand Tunis',
  'urban': 'Other urban areas',
  'suburban': 'Suburban',
  'rural': 'Rural'
};

const LIVING_CONDITIONS = [
  { key: 'owns_home', label: 'Owns home' },
  { key: 'has_wifi', label: 'Has WiFi' },
  { key: 'has_fridge', label: 'Has refrigerator' },
  { key: 'has_ac', label: 'Has air conditioning' },
  { key: 'has_second_vehicle', label: 'Has second vehicle' }
];

export function ProfileForm({
  onSubmit,
  onBack
}: {
  onSubmit: (data: ProfileData) => void;
  onBack: () => void;
}) {
  const [incomeBracket, setIncomeBracket] = useState('1200-2500');
  const [livingArea, setLivingArea] = useState('grand_tunis');
  const [conditions, setConditions] = useState<Record<string, boolean>>({});

  const toggleCondition = (key: string) => {
    setConditions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = () => {
    onSubmit({
      incomeBracket,
      livingArea,
      conditions
    });
  };

  return (
    <div className="card ekyc-card">
      <h2>📋 A Few Questions</h2>
      <p className="fine">
        This helps us match you with the right insurance policy
      </p>

      <div className="form-grid">
        <label className="form-label">
          Household Income
          <select
            className="form-input"
            value={incomeBracket}
            onChange={(e) => setIncomeBracket(e.target.value)}
          >
            {Object.entries(INCOME_BRACKETS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label className="form-label">
          Where do you live?
          <select
            className="form-input"
            value={livingArea}
            onChange={(e) => setLivingArea(e.target.value)}
          >
            {Object.entries(LIVING_AREAS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="conditions-section">
        <h3>Living Conditions</h3>
        <div className="conditions-grid">
          {LIVING_CONDITIONS.map(({ key, label }) => (
            <label key={key} className="condition-checkbox">
              <input
                type="checkbox"
                checked={!!conditions[key]}
                onChange={() => toggleCondition(key)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="row">
        <button className="btn btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <button className="btn btn-danger" onClick={handleSubmit}>
          Get My Policy Match →
        </button>
      </div>
    </div>
  );
}
