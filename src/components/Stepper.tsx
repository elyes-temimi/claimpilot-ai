import type { StepId } from '../types';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'liveness', label: 'Liveness' },
  { id: 'screening', label: 'Screening' },
  { id: 'signature', label: 'Signature' },
  { id: 'policy', label: 'Policy' },
];

export function Stepper({ current }: { current: StepId | 'done' }) {
  const idx = current === 'done' ? STEPS.length : STEPS.findIndex((s) => s.id === current);
  return (
    <div className="stepper">
      {STEPS.map((s, i) => (
        <div key={s.id} className={`step ${i < idx ? 'done' : ''} ${i === idx ? 'active' : ''}`}>
          <span className="step-dot">{i < idx ? '✓' : i + 1}</span>
          <span className="step-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
