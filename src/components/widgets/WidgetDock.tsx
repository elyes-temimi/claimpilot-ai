import { useState } from 'react';
import type { FlowController } from '../../flow/controller';
import type { IdFields, WidgetSpec } from '../../types';
import { IdCaptureWidget } from './IdCaptureWidget';
import { SelfieWidget } from './SelfieWidget';
import { SignatureWidget } from './SignatureWidget';

export function WidgetDock({ widget, flow }: { widget: WidgetSpec | null; flow: FlowController }) {
  if (!widget) return <div className="dock dock-empty" />;

  return (
    <div className="dock">
      {widget.type === 'chips' && (
        <div className="widget chips">
          {widget.options.map((opt) => (
            <button key={opt.value} className="chip" onClick={() => flow.provide(opt)}>
              {opt.emoji ? `${opt.emoji} ` : ''}
              {opt.label}
            </button>
          ))}
        </div>
      )}
      {widget.type === 'processing' && (
        <div className="widget widget-processing">
          <div className="spinner" />
          <span>
            {widget.label}
            {widget.pct !== undefined && widget.pct > 0 ? ` ${widget.pct}%` : ''}
          </span>
        </div>
      )}
      {widget.type === 'idCapture' && <IdCaptureWidget flow={flow} />}
      {widget.type === 'fieldsConfirm' && <FieldsConfirm initial={widget.fields} flow={flow} />}
      {widget.type === 'selfie' && <SelfieWidget flow={flow} />}
      {widget.type === 'signature' && <SignatureWidget flow={flow} />}
    </div>
  );
}

function FieldsConfirm({ initial, flow }: { initial: IdFields; flow: FlowController }) {
  const [fields, setFields] = useState<IdFields>(initial);
  const set = (k: keyof IdFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="widget fields-confirm">
      <label>
        Full name
        <input value={fields.fullName} onChange={set('fullName')} placeholder="Full name" />
      </label>
      <label>
        Date of birth
        <input value={fields.dob} onChange={set('dob')} placeholder="dd/mm/yyyy" />
      </label>
      <label>
        ID number
        <input value={fields.idNumber} onChange={set('idNumber')} placeholder="ID number" />
      </label>
      <button
        className="btn btn-primary"
        disabled={!fields.fullName.trim()}
        onClick={() => flow.provide({ ...fields, fullName: fields.fullName.trim() })}
      >
        ✓ Confirm identity
      </button>
    </div>
  );
}
