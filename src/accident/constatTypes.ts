// Tunisian FTUSA Constat Form - Field definitions
// Based on the official "Constat Amiable d'Accident Automobile" form

export interface VehicleDetails {
  // Field 9: Vehicle identification
  plateNumber: string;
  make: string;
  model: string;
  direction: string; // Direction of travel (e.g., "Nord", "Sud", "Est", "Ouest")
  insuranceCompany: string;
  policyNumber: string;
  insuredName: string;
}

// Field 12: The 17 circumstance checkboxes from the FTUSA constat
export type CircumstanceCode = 
  | '1'  // Stationnait
  | '2'  // Quittait un stationnement, ouvrait une portière
  | '3'  // Prenait un stationnement
  | '4'  // Sortait d'un parc de stationnement, d'un lieu privé, d'un chemin de terre
  | '5'  // S'engageait dans un parc de stationnement, un lieu privé, un chemin de terre
  | '6'  // S'engageait dans un rond-point
  | '7'  // Heurtait à l'arrière en roulant dans le même sens et sur une même file
  | '8'  // Roulait dans le même sens et sur une file différente
  | '9'  // Changeait de file
  | '10' // Doublait
  | '11' // Virait à droite
  | '12' // Virait à gauche
  | '13' // Reculait
  | '14' // Empiétait sur une voie réservée à la circulation en sens inverse
  | '15' // Venait de droite (dans un carrefour)
  | '16' // N'avait pas observé un signal de priorité ou un feu rouge
  | '17' // Autres circonstances

export interface CircumstanceSelection {
  code: CircumstanceCode;
  label: string;
  labelAr?: string; // Arabic translation
}

// Field 11: Damage description
export interface DamageDescription {
  visibleDamage: string; // Free text description
  estimatedSeverity?: 'minor' | 'moderate' | 'severe';
}

// Field 13: Sketch (simplified - just store coordinates/lines)
export interface SketchData {
  lines: { x1: number; y1: number; x2: number; y2: number }[];
  vehicleA: { x: number; y: number; angle: number };
  vehicleB: { x: number; y: number; angle: number };
}

// Complete constat data for one participant
export interface ParticipantConstat {
  pid: string;
  
  // Field 9: Vehicle
  vehicle: VehicleDetails;
  
  // Field 10: Point of impact (already handled by existing ImpactZone)
  // impactZone: ImpactZone; - existing field
  
  // Field 11: Damage
  damage: DamageDescription;
  
  // Field 12: Circumstances (can select multiple)
  circumstances: CircumstanceCode[];
  
  // Field 13: Sketch (optional)
  sketch?: SketchData;
  
  // Additional metadata
  driverSignedAt?: string;
}

// The 17 circumstances with French labels (as they appear on the form)
export const CIRCUMSTANCES: Record<CircumstanceCode, { label: string; labelAr: string }> = {
  '1': { 
    label: 'Stationnait',
    labelAr: 'كان متوقفا'
  },
  '2': { 
    label: 'Quittait un stationnement, ouvrait une portière',
    labelAr: 'كان يغادر مكان وقوف أو يفتح بابا'
  },
  '3': { 
    label: 'Prenait un stationnement',
    labelAr: 'كان يأخذ مكان وقوف'
  },
  '4': { 
    label: 'Sortait d\'un parc/lieu privé/chemin de terre',
    labelAr: 'كان يخرج من موقف أو مكان خاص'
  },
  '5': { 
    label: 'S\'engageait dans un parc/lieu privé/chemin de terre',
    labelAr: 'كان يدخل إلى موقف أو مكان خاص'
  },
  '6': { 
    label: 'S\'engageait dans un rond-point',
    labelAr: 'كان يدخل إلى دوار'
  },
  '7': { 
    label: 'Heurtait à l\'arrière (même sens, même file)',
    labelAr: 'اصطدم من الخلف (نفس الاتجاه والمسار)'
  },
  '8': { 
    label: 'Roulait dans le même sens (file différente)',
    labelAr: 'كان يسير في نفس الاتجاه (مسار مختلف)'
  },
  '9': { 
    label: 'Changeait de file',
    labelAr: 'كان يغير المسار'
  },
  '10': { 
    label: 'Doublait',
    labelAr: 'كان يتجاوز'
  },
  '11': { 
    label: 'Virait à droite',
    labelAr: 'كان يدور لليمين'
  },
  '12': { 
    label: 'Virait à gauche',
    labelAr: 'كان يدور لليسار'
  },
  '13': { 
    label: 'Reculait',
    labelAr: 'كان يرجع للخلف'
  },
  '14': { 
    label: 'Empiétait sur une voie (sens inverse)',
    labelAr: 'كان يتعدى على المسار المعاكس'
  },
  '15': { 
    label: 'Venait de droite (dans un carrefour)',
    labelAr: 'كان قادما من اليمين (في تقاطع)'
  },
  '16': { 
    label: 'N\'avait pas observé un signal de priorité/feu rouge',
    labelAr: 'لم يحترم إشارة الأولوية أو الضوء الأحمر'
  },
  '17': { 
    label: 'Autres circonstances',
    labelAr: 'ظروف أخرى'
  },
};
