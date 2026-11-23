import * as THREE from 'three';

/**
 * NBA court markings in true scale (28.65 × 15.24 m). Dimensions from the NBA rulebook as commonly
 * published [not fetched this session]: centre circle r 1.83 m, lane 4.88 m wide × 5.79 m long,
 * free-throw circle r 1.83 m, basket centre 1.575 m from the baseline, three-point arc r 7.24 m with
 * straight corner lines 0.91 m in from the sidelines, restricted-area arc r 1.22 m.
 */
export function makeCourtTexture(L: number, W: number): THREE.Texture {
  const CW = 2048;
  const CH = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(CW / L, CH / W); // 1 unit = 1 m

  // Maple boards.
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 ? '#c8935a' : '#c08a52';
    ctx.fillRect(0, (i * W) / 40, L, W / 40);
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.05;
  const hw = W / 2;
  ctx.strokeRect(0.025, 0.025, L - 0.05, W - 0.05);
  line(ctx, L / 2, 0, L / 2, W);
  arc(ctx, L / 2, hw, 1.83, 0, 2 * Math.PI);

  for (const side of [0, 1]) {
    const x0 = side === 0 ? 0 : L;
    const dir = side === 0 ? 1 : -1;
    ctx.fillStyle = 'rgba(30, 70, 140, 0.55)';
    ctx.fillRect(Math.min(x0, x0 + dir * 5.79), hw - 2.44, 5.79, 4.88);
    ctx.strokeRect(Math.min(x0, x0 + dir * 5.79), hw - 2.44, 5.79, 4.88);
    const ft = x0 + dir * 5.79;
    arc(ctx, ft, hw, 1.83, 0, 2 * Math.PI);
    const basket = x0 + dir * 1.575;
    arc(ctx, basket, hw, 1.22, side === 0 ? -Math.PI / 2 : Math.PI / 2, side === 0 ? Math.PI / 2 : (3 * Math.PI) / 2);
    // Three-point line: corner straights 0.91 m from the sidelines, joined by the 7.24 m arc.
    const zc = hw - 0.91;
    const a = Math.asin(zc / 7.24);
    const xs = basket + dir * 7.24 * Math.cos(a);
    line(ctx, x0, 0.91, xs, 0.91);
    line(ctx, x0, W - 0.91, xs, W - 0.91);
    if (side === 0) arc(ctx, basket, hw, 7.24, -a, a);
    else arc(ctx, basket, hw, 7.24, Math.PI - a, Math.PI + a);
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
function arc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a0: number, a1: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, a0, a1);
  ctx.stroke();
}
