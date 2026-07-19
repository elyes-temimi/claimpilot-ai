import { useState } from 'react';
import type { RepairEstimate } from './types';

const tnd = (n: number) =>
  new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 0 }).format(Math.round(n));

/**
 * The repair estimate, shown to the driver at the end of the claim.
 *
 * This used to exist only as rows in MySQL, which meant the one number the
 * driver actually cares about — what this will cost — was invisible unless you
 * ran a SQL query. It is presented with its uncertainty band and its
 * provenance rather than as a single confident figure, because it is derived
 * from photo analysis against indicative market prices, not from a quote.
 */
export function EstimateCard({ estimate }: { estimate: RepairEstimate }) {
  const [open, setOpen] = useState(false);

  if (!estimate || estimate.lines.length === 0) {
    return (
      <div className="card estimate-card">
        <div className="card-head">
          <span className="card-title">🔧 Estimation de réparation</span>
        </div>
        <p className="fine">
          Aucun dégât chiffrable détecté sur les photos analysées.
        </p>
      </div>
    );
  }

  return (
    <div className="card estimate-card">
      <div className="card-head">
        <span className="card-title">🔧 Estimation de réparation</span>
        <span className="badge badge-blue">{estimate.city}</span>
      </div>

      <div className="estimate-hero">
        <div className="estimate-total">
          {tnd(estimate.total)} <small>{estimate.currency}</small>
        </div>
        {/* An estimate from photos is a range, and saying so is the honest
            way to present it — a single figure implies a precision we do not
            have. */}
        <div className="estimate-range">
          fourchette {tnd(estimate.rangeLow)} – {tnd(estimate.rangeHigh)} {estimate.currency}
        </div>
      </div>

      <div className="estimate-breakdown">
        <div><span>Pièces</span><strong>{tnd(estimate.partsTotal)}</strong></div>
        <div><span>Main-d'œuvre + peinture</span><strong>{tnd(estimate.labourTotal)}</strong></div>
        <div><span>TVA {Math.round(estimate.vatRate * 100)}%</span><strong>{tnd(estimate.vat)}</strong></div>
      </div>

      <button className="linklike" onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} {estimate.lines.length} pièce{estimate.lines.length > 1 ? 's' : ''} — détail et où l'acheter
      </button>

      {open && (
        <div className="estimate-lines">
          {estimate.lines.map((l) => (
            <div key={l.partKey} className="estimate-line">
              <div className="estimate-line-head">
                <span className="estimate-part">{l.partLabel}</span>
                <span className={`chip ${l.action === 'replace' ? 'chip-warn' : ''}`}>
                  {l.action === 'replace' ? 'remplacer' : 'réparer'}
                </span>
                <strong className="estimate-line-total">{tnd(l.total)}</strong>
              </div>
              <div className="estimate-line-sub">
                pièce {tnd(l.partsCost)} · main-d'œuvre {tnd(l.labourCost)} ({l.labourHours} h)
                {l.fromDiagram && ' · déduit du schéma'}
              </div>
              <div className="estimate-shops">
                {l.shops.map((s) => (
                  <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" title={s.note}>
                    {s.name} ↗
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {estimate.rationale && <p className="fine estimate-rationale">{estimate.rationale}</p>}

      {estimate.hiddenDamage.length > 0 && (
        <p className="fine">
          <strong>À vérifier à l'atelier</strong> (non visible sur photo) :{' '}
          {estimate.hiddenDamage.join(', ')}.
        </p>
      )}

      <p className="fine estimate-disclaimer">{estimate.disclaimer}</p>
    </div>
  );
}
