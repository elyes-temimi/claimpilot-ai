// Generate a PDF export of the filled Tunisian constat form
import type { ParticipantConstat } from './constatTypes';
import { CIRCUMSTANCES } from './constatTypes';
import type { Participant, SessionState } from './types';

export interface ConstatPDFData {
  session: SessionState;
  driverA: Participant;
  driverB: Participant;
}

/**
 * Generate a downloadable PDF of the filled constat form
 * For now, this generates a simple text-based PDF. In production,
 * this would overlay data onto the actual FTUSA form template.
 */
export async function generateConstatPDF(data: ConstatPDFData): Promise<Blob> {
  const { session, driverA, driverB } = data;
  
  // Build text content
  let content = `
═══════════════════════════════════════════════════════════
  CONSTAT AMIABLE D'ACCIDENT AUTOMOBILE
  FTUSA - Fédération Tunisienne des Sociétés d'Assurances
═══════════════════════════════════════════════════════════

CASE ID: ${session.caseId}
DATE: ${new Date(session.createdAt).toLocaleDateString('fr-FR')}
TIME: ${new Date(session.createdAt).toLocaleTimeString('fr-FR')}
LIEU: ${driverA.position ? `${driverA.position.lat.toFixed(5)}, ${driverA.position.lng.toFixed(5)}` : 'Non capturé'}

───────────────────────────────────────────────────────────
VÉHICULE A - ${driverA.name}
───────────────────────────────────────────────────────────
`;

  if (driverA.constat?.vehicle) {
    const v = driverA.constat.vehicle;
    content += `
Immatriculation: ${v.plateNumber || '—'}
Marque: ${v.make || '—'}
Modèle: ${v.model || '—'}
Direction: ${v.direction || '—'}
Compagnie d'assurance: ${v.insuranceCompany || '—'}
N° de police: ${v.policyNumber || '—'}
`;
  } else {
    content += '\nInformations du véhicule non renseignées\n';
  }

  content += `\nPoint d'impact: ${driverA.impact || 'Non marqué'}`;

  if (driverA.constat?.circumstances && driverA.constat.circumstances.length > 0) {
    content += '\n\nCirconstances (Champ 12):\n';
    driverA.constat.circumstances.forEach(code => {
      const circ = CIRCUMSTANCES[code];
      content += `  [${code}] ${circ?.label || code}\n`;
    });
  }

  if (driverA.constat?.damage?.visibleDamage) {
    content += `\nDégâts visibles (Champ 11):\n${driverA.constat.damage.visibleDamage}\n`;
  }

  content += `\n───────────────────────────────────────────────────────────
VÉHICULE B - ${driverB.name}
───────────────────────────────────────────────────────────
`;

  if (driverB.constat?.vehicle) {
    const v = driverB.constat.vehicle;
    content += `
Immatriculation: ${v.plateNumber || '—'}
Marque: ${v.make || '—'}
Modèle: ${v.model || '—'}
Direction: ${v.direction || '—'}
Compagnie d'assurance: ${v.insuranceCompany || '—'}
N° de police: ${v.policyNumber || '—'}
`;
  } else {
    content += '\nInformations du véhicule non renseignées\n';
  }

  content += `\nPoint d'impact: ${driverB.impact || 'Non marqué'}`;

  if (driverB.constat?.circumstances && driverB.constat.circumstances.length > 0) {
    content += '\n\nCirconstances (Champ 12):\n';
    driverB.constat.circumstances.forEach(code => {
      const circ = CIRCUMSTANCES[code];
      content += `  [${code}] ${circ?.label || code}\n`;
    });
  }

  if (driverB.constat?.damage?.visibleDamage) {
    content += `\nDégâts visibles (Champ 11):\n${driverB.constat.damage.visibleDamage}\n`;
  }

  content += `\n═══════════════════════════════════════════════════════════
SIGNATURES
═══════════════════════════════════════════════════════════

Conducteur A: ${driverA.name}
Confirmé le: ${driverA.confirmed ? new Date(session.lockedAt || '').toLocaleString('fr-FR') : 'Non confirmé'}
${driverA.verified ? '✓ Identité vérifiée (eKYC)' : ''}

Conducteur B: ${driverB.name}
Confirmé le: ${driverB.confirmed ? new Date(session.lockedAt || '').toLocaleString('fr-FR') : 'Non confirmé'}
${driverB.verified ? '✓ Identité vérifiée (eKYC)' : ''}

═══════════════════════════════════════════════════════════
Document généré automatiquement par ClaimPilot AI
${new Date().toISOString()}
═══════════════════════════════════════════════════════════
`;

  // Convert to PDF-like format (simple text file for now)
  // In production, you'd use jsPDF or similar to create a real PDF
  return new Blob([content], { type: 'text/plain; charset=utf-8' });
}

/**
 * Trigger download of the constat PDF
 */
export function downloadConstatPDF(data: ConstatPDFData) {
  generateConstatPDF(data).then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `constat-${data.session.caseId}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}
