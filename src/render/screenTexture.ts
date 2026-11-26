import * as THREE from 'three';

/**
 * Test-pattern texture for the screen: a 1 m grid in true scale, frame, centre cross and a label.
 * Lets the viewer judge size, keystone and how much of the picture fills the view.
 *
 * The canvas is power-of-two (2048 × 1024) so mipmapping is robust on every GPU / software renderer.
 * Content is drawn in an undistorted virtual space (2048 × 2048/aspect) and stretched vertically
 * into the canvas; mapping onto the screen plane undoes the stretch exactly.
 */
export function makeScreenTexture(widthM: number, heightM: number, label: string): THREE.Texture {
  const CW = 2048;
  const CH = 1024;
  const w = CW;
  const h = CW * (heightM / widthM); // virtual height
  const pxPerM = w / widthM;

  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(1, CH / h);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#4a6fa5');
  grad.addColorStop(1, '#a9c4e0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 4;
  for (let x = w / 2; x < w; x += pxPerM) line(ctx, x, 0, x, h);
  for (let x = w / 2 - pxPerM; x > 0; x -= pxPerM) line(ctx, x, 0, x, h);
  for (let y = h - pxPerM; y > 0; y -= pxPerM) line(ctx, 0, y, w, y);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.lineWidth = 5;
  line(ctx, w / 2 - 70, h / 2, w / 2 + 70, h / 2);
  line(ctx, w / 2, h / 2 - 70, w / 2, h / 2 + 70);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(h * 0.09)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label, w / 2, h * 0.3);
  ctx.font = `${Math.round(h * 0.05)}px sans-serif`;
  ctx.fillText('grid = 1 m', w / 2, h * 0.8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** A picture filling the screen like a projected frame: scaled to cover, centred, cropped at the edges. */
export function makePictureTexture(img: ImageBitmap | HTMLImageElement, aspect: number): THREE.Texture {
  const W = 2048;
  const H = Math.round(W / aspect);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const iw = img.width, ih = img.height;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  if (iw < ih) {
    // A portrait poster: show it whole, centred, over a dimmed, blurred copy filling the screen.
    const cover = Math.max(W / iw, H / ih);
    g.filter = 'blur(40px) brightness(0.45)';
    g.drawImage(img, (W - iw * cover) / 2, (H - ih * cover) / 2, iw * cover, ih * cover);
    g.filter = 'none';
    const fit = H / ih;
    g.drawImage(img, (W - iw * fit) / 2, 0, iw * fit, H);
  } else {
    const scale = Math.max(W / iw, H / ih);
    const dw = iw * scale, dh = ih * scale;
    g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
