import * as THREE from 'three';

/**
 * Football pitch markings in true scale (IFAB Laws of the Game, Law 1 dimensions:
 * centre circle r 9.15 m, penalty area 16.5 × 40.32 m, goal area 5.5 × 18.32 m,
 * penalty mark 11 m, corner arc r 1 m, lines 0.12 m).
 * Drawn in metres via a non-uniform scale onto a power-of-two canvas; mapping onto the
 * L × W pitch plane undoes the scale.
 */
export function makePitchTexture(L: number, W: number): THREE.Texture {
  const CW = 4096;
  const CH = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(CW / L, CH / W); // 1 unit = 1 m, origin top-left corner of the pitch

  // Mown stripes, 12 across the length.
  const stripes = 12;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? '#3f8f3a' : '#4a9b42';
    ctx.fillRect((i * L) / stripes, 0, L / stripes, W);
  }

  ctx.strokeStyle = '#f4f4f4';
  ctx.lineWidth = 0.12;
  const hw = W / 2;
  ctx.strokeRect(0.06, 0.06, L - 0.12, W - 0.12);
  line(ctx, L / 2, 0, L / 2, W);
  circle(ctx, L / 2, hw, 9.15);
  dot(ctx, L / 2, hw, 0.15);

  for (const side of [0, 1]) {
    const x0 = side === 0 ? 0 : L;
    const dir = side === 0 ? 1 : -1;
    rect(ctx, x0, hw - 20.16, dir * 16.5, 40.32);
    rect(ctx, x0, hw - 9.16, dir * 5.5, 18.32);
    const spot = x0 + dir * 11;
    dot(ctx, spot, hw, 0.15);
    // Penalty arc: part of the r = 9.15 circle around the mark outside the area.
    const a = Math.acos(5.5 / 9.15);
    ctx.beginPath();
    if (side === 0) ctx.arc(spot, hw, 9.15, -a, a);
    else ctx.arc(spot, hw, 9.15, Math.PI - a, Math.PI + a);
    ctx.stroke();
  }
  for (const [cx, cy, s, e] of [
    [0, 0, 0, Math.PI / 2],
    [L, 0, Math.PI / 2, Math.PI],
    [L, W, Math.PI, 1.5 * Math.PI],
    [0, W, 1.5 * Math.PI, 2 * Math.PI],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, 1, s, e);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeRect(Math.min(x, x + w), y, Math.abs(w), h);
}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.stroke();
}
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = '#f4f4f4';
  ctx.fill();
}
