// Generates clearly-synthetic "damaged car" photos on a canvas so the Vision
// AI can be demonstrated live without a real crashed car. The damage texture
// (chaotic scratches + dents) is exactly what the orientation-entropy
// detector fires on, and the clean panels are what it stays quiet on.

export type SampleKind = 'rear' | 'front';

export function drawDamagedCar(kind: SampleKind): string {
  const w = 640;
  const h = 420;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  // Background: asphalt + sky
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  sky.addColorStop(0, '#cfd9e4');
  sky.addColorStop(1, '#e7edf3');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.55);
  ctx.fillStyle = '#8a919c';
  ctx.fillRect(0, h * 0.55, w, h * 0.45);

  // Car body (side view, facing left)
  const bodyY = h * 0.34;
  ctx.fillStyle = '#3b6ea5';
  ctx.strokeStyle = '#2c517a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(70, bodyY + 95);
  ctx.lineTo(85, bodyY + 45);
  ctx.quadraticCurveTo(140, bodyY + 8, 210, bodyY + 5);
  ctx.quadraticCurveTo(300, bodyY - 28, 400, bodyY - 22);
  ctx.quadraticCurveTo(470, bodyY - 16, 520, bodyY + 15);
  ctx.quadraticCurveTo(570, bodyY + 30, 575, bodyY + 60);
  ctx.lineTo(572, bodyY + 95);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Windows
  ctx.fillStyle = '#b9cede';
  ctx.beginPath();
  ctx.moveTo(230, bodyY + 2);
  ctx.quadraticCurveTo(300, bodyY - 22, 390, bodyY - 16);
  ctx.lineTo(400, bodyY + 8);
  ctx.lineTo(240, bodyY + 12);
  ctx.closePath();
  ctx.fill();

  // Wheels
  for (const wx of [170, 470]) {
    ctx.fillStyle = '#22262b';
    ctx.beginPath();
    ctx.arc(wx, bodyY + 98, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5b6470';
    ctx.beginPath();
    ctx.arc(wx, bodyY + 98, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  // Damage cluster: chaotic scratches + dark dents on one end
  const zoneX = kind === 'rear' ? 470 : 70; // car faces left ⇒ left = front
  const zoneW = 110;
  const zoneY = bodyY - 10;
  const zoneH = 105;
  const rnd = mulberry32(kind === 'rear' ? 41 : 97);

  // dents (dark blotches)
  for (let i = 0; i < 9; i++) {
    const x = zoneX + rnd() * zoneW;
    const y = zoneY + rnd() * zoneH;
    const r = 6 + rnd() * 16;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(15, 20, 28, 0.75)');
    g.addColorStop(1, 'rgba(15, 20, 28, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // scratches (chaotic bright/dark polylines)
  for (let i = 0; i < 42; i++) {
    ctx.strokeStyle = rnd() > 0.5 ? 'rgba(235, 240, 245, 0.8)' : 'rgba(20, 26, 34, 0.7)';
    ctx.lineWidth = 0.8 + rnd() * 1.8;
    ctx.beginPath();
    let x = zoneX + rnd() * zoneW;
    let y = zoneY + rnd() * zoneH;
    ctx.moveTo(x, y);
    const segs = 3 + Math.floor(rnd() * 4);
    for (let s = 0; s < segs; s++) {
      x += (rnd() - 0.5) * 46;
      y += (rnd() - 0.5) * 34;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // crumple highlights
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2 + rnd() * 2;
    ctx.beginPath();
    const x = zoneX + rnd() * zoneW;
    const y = zoneY + rnd() * zoneH;
    ctx.arc(x, y, 4 + rnd() * 10, rnd() * Math.PI, rnd() * Math.PI + 1.2);
    ctx.stroke();
  }

  // Watermark
  ctx.fillStyle = 'rgba(30, 41, 59, 0.5)';
  ctx.font = 'bold 13px Arial';
  ctx.fillText('SYNTHETIC SAMPLE PHOTO — FOR DEMO', 12, h - 12);

  return c.toDataURL('image/jpeg', 0.9);
}

// Deterministic PRNG so the same sample always analyzes the same way
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
