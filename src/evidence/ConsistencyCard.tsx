import type { ConsistencyReport } from '../accident/types';

const STATUS_ICON: Record<string, string> = {
  pass: '✅',
  flag: '🚩',
  info: 'ℹ️',
  unknown: '⏳',
};

export function ConsistencyCard({ report }: { report: ConsistencyReport }) {
  const r = 30;
  const circumference = 2 * Math.PI * r;
  const filled = (report.score / 100) * circumference;
  const color = report.score >= 85 ? '#059669' : report.score >= 60 ? '#d97706' : '#dc2626';
  const verdictBadge =
    report.verdict === 'fast-track' ? 'badge-green' : report.verdict === 'standard' ? 'badge-amber' : 'badge-red';

  return (
    <div className="card consistency-card">
      <div className="card-head">
        <span className="card-title">⚖️ 3 · Consistency Engine</span>
        <span className={`badge ${verdictBadge}`}>{report.verdict.toUpperCase()}</span>
      </div>

      <div className="integrity-row">
        <svg viewBox="0 0 76 76" className="score-ring" role="img" aria-label={`Integrity ${report.score} of 100`}>
          <circle cx="38" cy="38" r={r} fill="none" stroke="#eef2f7" strokeWidth="8" />
          <circle
            cx="38"
            cy="38"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            transform="rotate(-90 38 38)"
          />
          <text x="38" y="36" textAnchor="middle" className="ring-num">{report.score}</text>
          <text x="38" y="50" textAnchor="middle" className="ring-sub">/100</text>
        </svg>
        <div className="integrity-side">
          <strong>Case integrity</strong>
          <p className="fine">{report.verdictLabel}</p>
        </div>
      </div>

      <div className="checks">
        {report.checks.map((c) => (
          <div key={c.id} className={`check check-${c.status}`}>
            <span className="check-icon">{STATUS_ICON[c.status]}</span>
            <div>
              <strong>{c.title}</strong>
              <p className="fine">{c.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="fine">
        The engine flags — a human decides. Liability recommendation with confidence scoring ships in
        Phase 5.
      </p>
    </div>
  );
}
