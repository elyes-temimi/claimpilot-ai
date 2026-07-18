// Draws a clearly-fictional SPECIMEN identity document onto a canvas.
// Used as the built-in demo document so the OCR pipeline can be shown
// live even when nobody wants to put a real ID in front of the camera.

export const SPECIMEN_FIELDS = {
  fullName: 'Amine Ben Salah',
  dob: '14/03/1994',
  idNumber: '09452817',
};

export function drawSpecimenId(): string {
  const w = 860;
  const h = 540;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  // Card background
  ctx.fillStyle = '#f4f6fb';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c3cadd';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, w - 12, h - 12);

  // Header band
  ctx.fillStyle = '#22315c';
  ctx.fillRect(6, 6, w - 12, 86);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px Arial';
  ctx.fillText('DEMO REPUBLIC - IDENTITY CARD', 40, 62);

  // SPECIMEN watermark
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.35);
  ctx.font = 'bold 90px Arial';
  ctx.fillStyle = 'rgba(190, 60, 60, 0.16)';
  ctx.textAlign = 'center';
  ctx.fillText('SPECIMEN', 0, 40);
  ctx.restore();

  // Photo placeholder (simple avatar silhouette — intentionally not a face
  // photo, so the flow demonstrates its "no reference face" fallback)
  ctx.fillStyle = '#dde3f0';
  ctx.fillRect(48, 130, 220, 280);
  ctx.strokeStyle = '#aab3cd';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 130, 220, 280);
  ctx.fillStyle = '#9aa6c4';
  ctx.beginPath();
  ctx.arc(158, 230, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(158, 380, 95, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#7f8bad';
  ctx.font = 'bold 20px Arial';
  ctx.fillText('SPECIMEN', 105, 440);

  // Identity fields — large, high-contrast, OCR-friendly
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'left';
  ctx.font = 'bold 30px Arial';
  ctx.fillText('NAME: AMINE BEN SALAH', 320, 190);
  ctx.fillText('DATE OF BIRTH: 14/03/1994', 320, 260);
  ctx.fillText('ID NO: 09452817', 320, 330);
  ctx.font = '24px Arial';
  ctx.fillStyle = '#4b5563';
  ctx.fillText('NATIONALITY: DEMOLAND', 320, 395);
  ctx.fillText('EXPIRES: 01/01/2030', 320, 440);

  // Footer
  ctx.font = '18px Arial';
  ctx.fillStyle = '#8a93ab';
  ctx.fillText('FICTIONAL DOCUMENT FOR SOFTWARE DEMONSTRATION ONLY', 48, h - 32);

  return c.toDataURL('image/png');
}
