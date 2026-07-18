import { useState } from 'react';
import {
  CIRCUMSTANCES,
  type CircumstanceCode,
  type DamageDescription,
  type ParticipantConstat,
  type VehicleDetails,
} from './constatTypes';

interface ConstatFormProps {
  existingData?: Partial<ParticipantConstat>;
  onSave: (data: Partial<ParticipantConstat>) => void;
  isLocked: boolean;
}

export function ConstatForm({ existingData, onSave, isLocked }: ConstatFormProps) {
  const [vehicle, setVehicle] = useState<Partial<VehicleDetails>>(
    existingData?.vehicle || {}
  );
  const [circumstances, setCircumstances] = useState<CircumstanceCode[]>(
    existingData?.circumstances || []
  );
  const [damage, setDamage] = useState<Partial<DamageDescription>>(
    existingData?.damage || {}
  );

  const toggleCircumstance = (code: CircumstanceCode) => {
    if (isLocked) return;
    const updated = circumstances.includes(code)
      ? circumstances.filter((c) => c !== code)
      : [...circumstances, code];
    setCircumstances(updated);
    // Auto-save on change
    onSave({ ...existingData, circumstances: updated });
  };

  const updateVehicle = (field: keyof VehicleDetails, value: string) => {
    if (isLocked) return;
    const updated = { ...vehicle, [field]: value };
    setVehicle(updated);
  };

  const saveVehicle = () => {
    onSave({ ...existingData, vehicle: vehicle as VehicleDetails });
  };

  const updateDamage = (field: keyof DamageDescription, value: string) => {
    if (isLocked) return;
    const updated = { ...damage, [field]: value };
    setDamage(updated);
  };

  const saveDamage = () => {
    onSave({ ...existingData, damage: damage as DamageDescription });
  };

  return (
    <div className="constat-form">
      {/* Field 9: Vehicle Details */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">🚗 Informations du véhicule / معلومات السيارة</span>
          <span className="badge badge-blue">CHAMP 9</span>
        </div>
        <div className="form-grid">
          <label className="form-label">
            Immatriculation / رقم التسجيل
            <input
              type="text"
              value={vehicle.plateNumber || ''}
              onChange={(e) => updateVehicle('plateNumber', e.target.value)}
              onBlur={saveVehicle}
              disabled={isLocked}
              placeholder="123 TUN 4567"
              className="form-input"
            />
          </label>
          <label className="form-label">
            Marque / الماركة
            <input
              type="text"
              value={vehicle.make || ''}
              onChange={(e) => updateVehicle('make', e.target.value)}
              onBlur={saveVehicle}
              disabled={isLocked}
              placeholder="Renault, Peugeot..."
              className="form-input"
            />
          </label>
          <label className="form-label">
            Modèle / الموديل
            <input
              type="text"
              value={vehicle.model || ''}
              onChange={(e) => updateVehicle('model', e.target.value)}
              onBlur={saveVehicle}
              disabled={isLocked}
              placeholder="Clio, 208..."
              className="form-input"
            />
          </label>
          <label className="form-label">
            Direction / الاتجاه
            <input
              type="text"
              value={vehicle.direction || ''}
              onChange={(e) => updateVehicle('direction', e.target.value)}
              onBlur={saveVehicle}
              disabled={isLocked}
              placeholder="Nord, Sud, Est, Ouest"
              className="form-input"
            />
          </label>
          <label className="form-label">
            Compagnie d'assurance / شركة التأمين
            <input
              type="text"
              value={vehicle.insuranceCompany || ''}
              onChange={(e) => updateVehicle('insuranceCompany', e.target.value)}
              onBlur={saveVehicle}
              disabled={isLocked}
              placeholder="STAR, AMI, MAGHREBIA..."
              className="form-input"
            />
          </label>
          <label className="form-label">
            N° de police / رقم الوثيقة
            <input
              type="text"
              value={vehicle.policyNumber || ''}
              onChange={(e) => updateVehicle('policyNumber', e.target.value)}
              onBlur={saveVehicle}
              disabled={isLocked}
              placeholder="123456789"
              className="form-input"
            />
          </label>
        </div>
      </div>

      {/* Field 12: The 17 Circumstances */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">📋 Circonstances de l'accident / ظروف الحادث</span>
          <span className="badge badge-blue">CHAMP 12</span>
        </div>
        <p className="fine">
          Cochez toutes les cases correspondant à votre situation / ضع علامة على كل الخانات التي تصف وضعك
        </p>
        <div className="circumstances-grid">
          {(Object.entries(CIRCUMSTANCES) as [CircumstanceCode, { label: string; labelAr: string }][]).map(
            ([code, { label, labelAr }]) => {
              const isSelected = circumstances.includes(code);
              return (
                <button
                  key={code}
                  className={`circumstance-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleCircumstance(code)}
                  disabled={isLocked}
                  type="button"
                >
                  <div className="circumstance-checkbox">
                    <span className="circumstance-number">{code}</span>
                    {isSelected && <span className="checkmark">✓</span>}
                  </div>
                  <div className="circumstance-labels">
                    <span className="circumstance-label-fr">{label}</span>
                    <span className="circumstance-label-ar">{labelAr}</span>
                  </div>
                </button>
              );
            }
          )}
        </div>
        {circumstances.length > 0 && (
          <div className="selected-summary">
            <strong>Sélectionné:</strong> {circumstances.join(', ')}
          </div>
        )}
      </div>

      {/* Field 11: Damage Description */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">🔧 Dégâts visibles / الأضرار الظاهرة</span>
          <span className="badge badge-blue">CHAMP 11</span>
        </div>
        <label className="form-label">
          Décrivez les dégâts visibles sur votre véhicule / وصف الأضرار الظاهرة على سيارتك
          <textarea
            value={damage.visibleDamage || ''}
            onChange={(e) => updateDamage('visibleDamage', e.target.value)}
            onBlur={saveDamage}
            disabled={isLocked}
            placeholder="Ex: Pare-choc avant déformé, phare droit cassé, aile gauche enfoncée..."
            className="form-textarea"
            rows={4}
          />
        </label>
      </div>
    </div>
  );
}
