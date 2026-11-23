// Yaratık yüzeyleri için kodla üretilen ayrıntı dokuları (gri tonlu: renk köşe renginden gelir).
// Her tür: map (açık gri ayrıntı) + normalMap + roughnessMap. Tarayıcı dışında (node testleri) boş döner.
import * as THREE from 'three';
import { fbm } from '../env/textures.js';

const cache = new Map();
const N = 128;

function heightField(kind) {
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N; let val;
    if (kind === 'fur') { // aşağı akan tüy çizgileri
      const streak = fbm(u * 2, v * 0.35, 3, 3, 8) * 0.5 + fbm(u * 18, v * 2.2, 7, 2, 8) * 0.5;
      val = streak;
    } else if (kind === 'scale') { // balık/yılan pulu (yarım daire sıraları)
      const sy = v * 10, row = Math.floor(sy), sx = u * 10 + (row % 2) * 0.5;
      const fx = sx - Math.floor(sx) - 0.5, fy = sy - row;
      const d = Math.hypot(fx, fy * 1.1);
      val = 1 - Math.min(1, d * 1.6) + fbm(u * 6, v * 6, 11, 2, 8) * 0.25;
    } else if (kind === 'chitin') { // zırh plakaları + ince damar
      const band = Math.abs(Math.sin(v * Math.PI * 6)); const vein = fbm(u * 5, v * 5, 13, 3, 8);
      val = 0.55 + 0.35 * Math.pow(band, 0.25) + (vein - 0.5) * 0.25;
    } else if (kind === 'feather') {
      const row = (v * 8) % 1; const shaft = Math.abs(((u * 6) % 1) - 0.5);
      val = 0.5 + 0.4 * (1 - row) - shaft * 0.3 + fbm(u * 8, v * 8, 17, 2, 8) * 0.2;
    } else if (kind === 'dscale') { // ejderha pulu: üst üste binen baklava pullar, kenarı koyu
      const sy = v * 12, row = Math.floor(sy), sx = u * 12 + (row % 2) * 0.5;
      const fx = Math.abs(sx - Math.floor(sx) - 0.5), fy = sy - row;
      const d = fx * 1.25 + (1 - fy) * 0.85; // baklava (aşağı bakan uç)
      val = Math.max(0, 1 - d) * 0.9 + fbm(u * 8, v * 8, 29, 2, 8) * 0.2 + fy * 0.15;
    } else if (kind === 'plate') { // taş plakalar: düzensiz hücreler, derin oluklar
      let d1 = 9, d2 = 9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = Math.floor(u * 6) + i, cy = Math.floor(v * 6) + j;
        const hx = cx + 0.5 + (fbm(cx * 3.1, cy * 1.7, 31, 1, 6) - 0.5) * 0.8, hy = cy + 0.5 + (fbm(cx * 2.3, cy * 4.1, 37, 1, 6) - 0.5) * 0.8;
        const dd = Math.hypot(u * 6 - hx, v * 6 - hy); if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
      }
      val = Math.min(1, (d2 - d1) * 2.2) * 0.75 + fbm(u * 14, v * 14, 41, 3, 8) * 0.3;
    } else { // hide: kalın deri, gözenek
      val = fbm(u * 4, v * 4, 19, 4, 8) * 0.7 + fbm(u * 24, v * 24, 23, 2, 8) * 0.3;
    }
    h[y * N + x] = val;
  }
  return h;
}

export function skinTex(kind = 'hide') {
  if (typeof document === 'undefined') return {};
  if (cache.has(kind)) return cache.get(kind);
  const h = heightField(kind);
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
  const cm = mk(), cn = mk(), cr = mk();
  const im = cm.getContext('2d').createImageData(N, N), inn = cn.getContext('2d').createImageData(N, N), ir = cr.getContext('2d').createImageData(N, N);
  const at = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  const str = kind === 'scale' || kind === 'dscale' ? 3.5 : kind === 'plate' ? 4 : kind === 'chitin' ? 2.5 : 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4, v = at(x, y);
    const g = Math.round((0.72 + v * 0.28) * 255); im.data[i] = im.data[i + 1] = im.data[i + 2] = g; im.data[i + 3] = 255;
    const dx = (at(x + 1, y) - at(x - 1, y)) * str, dy = (at(x, y + 1) - at(x, y - 1)) * str, l = Math.hypot(dx, dy, 1);
    inn.data[i] = (-dx / l * 0.5 + 0.5) * 255; inn.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; inn.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; inn.data[i + 3] = 255;
    const r = kind === 'chitin' ? 0.35 + (1 - v) * 0.3 : kind === 'scale' || kind === 'dscale' ? 0.42 + (1 - v) * 0.3 : kind === 'plate' ? 0.7 + (1 - v) * 0.25 : 0.75 + v * 0.2;
    ir.data[i] = ir.data[i + 1] = ir.data[i + 2] = Math.round(r * 255); ir.data[i + 3] = 255;
  }
  cm.getContext('2d').putImageData(im, 0, 0); cn.getContext('2d').putImageData(inn, 0, 0); cr.getContext('2d').putImageData(ir, 0, 0);
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const out = { map: tex(cm, true), normalMap: tex(cn, false), roughnessMap: tex(cr, false) };
  cache.set(kind, out); return out;
}
