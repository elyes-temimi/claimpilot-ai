import type { ImpactZone } from './types';

// Top-view car with 8 tappable impact zones arranged around the cabin.
const ZONES: { id: ImpactZone; x: number; y: number; w: number; h: number }[] = [
  { id: 'front-left', x: 22, y: 14, w: 32, h: 66 },
  { id: 'front', x: 54, y: 14, w: 32, h: 66 },
  { id: 'front-right', x: 86, y: 14, w: 32, h: 66 },
  { id: 'left', x: 22, y: 80, w: 32, h: 76 },
  { id: 'right', x: 86, y: 80, w: 32, h: 76 },
  { id: 'rear-left', x: 22, y: 156, w: 32, h: 66 },
  { id: 'rear', x: 54, y: 156, w: 32, h: 66 },
  { id: 'rear-right', x: 86, y: 156, w: 32, h: 66 },
];

export function CarDiagram({
  selected,
  editable,
  mine,
  onSelect,
}: {
  selected: ImpactZone | null;
  editable: boolean;
  /** Style: my car (blue selection) vs the other driver's (amber selection). */
  mine: boolean;
  onSelect?: (zone: ImpactZone) => void;
}) {
  return (
    <svg
      viewBox="0 0 140 236"
      className={`car-svg ${editable ? 'editable' : ''}`}
      role={editable ? 'group' : 'img'}
      aria-label="Point of impact diagram"
    >
      <text x="70" y="9" textAnchor="middle" className="car-caption">FRONT</text>

      {/* wheels */}
      {[
        [12, 36], [12, 168], [116, 36], [116, 168],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="12" height="34" rx="5" className="car-wheel" />
      ))}

      {/* body */}
      <path
        d="M 40 14
           Q 70 4 100 14
           L 112 40 L 116 110 L 112 196
           Q 70 232 28 196
           L 24 110 L 28 40 Z"
        className="car-body"
      />
      {/* windshield + rear window for orientation */}
      <path d="M 42 66 Q 70 56 98 66 L 92 88 Q 70 80 48 88 Z" className="car-glass" />
      <path d="M 46 158 Q 70 166 94 158 L 90 176 Q 70 184 50 176 Z" className="car-glass" />

      {/* impact zones */}
      {ZONES.map((z) => {
        const isSel = selected === z.id;
        return (
          <rect
            key={z.id}
            x={z.x}
            y={z.y}
            width={z.w}
            height={z.h}
            rx="9"
            className={`car-zone ${isSel ? (mine ? 'sel-mine' : 'sel-other') : ''}`}
            onClick={editable && onSelect ? () => onSelect(z.id) : undefined}
            role={editable ? 'button' : undefined}
            aria-label={z.id}
          >
            {editable && <title>{z.id.replace('-', ' ')}</title>}
          </rect>
        );
      })}

      {selected &&
        (() => {
          const z = ZONES.find((zz) => zz.id === selected);
          if (!z) return null;
          return (
            <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 6} textAnchor="middle" className="car-hit">
              💥
            </text>
          );
        })()}
    </svg>
  );
}
