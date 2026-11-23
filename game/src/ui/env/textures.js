// Kodla üretilen dokular (indirme yok). Her doku: renk + normal (yükseklikten) + pürüzlülük.
// Boyut rules.performance.maxTexture (512) altında tutulur; varsayılan 256.
import * as THREE from 'three';

// ---------- gürültü ----------
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, s, per) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const w = (a) => ((a % per) + per) % per;
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// döşenebilir fbm (0..1)
export function fbm(x, y, s = 1, oct = 4, per = 8) {
  let f = 0, amp = 0.5, fr = 1, tot = 0;
  for (let i = 0; i < oct; i++) { f += amp * vnoise(x * fr, y * fr, s + i * 17, per * fr); tot += amp; amp *= 0.5; fr *= 2; }
  return f / tot;
}
// sürekli (döşenmeyen) gürültü — arazi yüksekliği için
export function noise2(x, y, s = 1, oct = 4) {
  let f = 0, amp = 0.5, fr = 1, tot = 0;
  for (let i = 0; i < oct; i++) { f += amp * vnoise(x * fr, y * fr, s + i * 31, 1e9); tot += amp; amp *= 0.5; fr *= 2.03; }
  return f / tot;
}
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---------- yükseklik → normal ----------
function normalFromHeight(hf, N, strength = 2) {
  const c = document.createElement('canvas'); c.width = c.height = N; const ctx = c.getContext('2d'); const img = ctx.createImageData(N, N);
  const at = (x, y) => hf[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1); const i = (y * N + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}
function toTex(canvas, srgb = true, repeat = 1) {
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.anisotropy = 2; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
// piksel fonksiyonundan doku seti üretir: fn(u,v) → {r,g,b,h,rough}
function build(N, fn, nStrength = 2) {
  const col = document.createElement('canvas'); col.width = col.height = N; const ctx = col.getContext('2d'); const img = ctx.createImageData(N, N);
  const rc = document.createElement('canvas'); rc.width = rc.height = N; const rctx = rc.getContext('2d'); const rimg = rctx.createImageData(N, N);
  const hf = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = fn(x / N, y / N); const i = (y * N + x) * 4;
    img.data[i] = p.r; img.data[i + 1] = p.g; img.data[i + 2] = p.b; img.data[i + 3] = 255;
    const r = Math.max(0, Math.min(255, (p.rough ?? 0.9) * 255)); rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = r; rimg.data[i + 3] = 255;
    hf[y * N + x] = p.h ?? 0;
  }
  ctx.putImageData(img, 0, 0); rctx.putImageData(rimg, 0, 0);
  return { col, nrm: normalFromHeight(hf, N, nStrength), rough: rc };
}
const mix = (a, b, t) => a + (b - a) * t;
const C = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
function lerpC(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }

// ---------- doku tarifleri ----------
const RECIPES = {
  // Kıyı / Sümer ovası: kum-toprak, kurumuş ot lekeleri
  plain(u, v) {
    const n = fbm(u * 6, v * 6, 3, 5, 6), g = fbm(u * 3, v * 3, 9, 3, 3), pebble = fbm(u * 40, v * 40, 5, 2, 40);
    let c = lerpC(C(0xb99764), C(0xd7bb84), n);
    c = lerpC(c, C(0x7d7a40), Math.max(0, g - 0.55) * 1.8);        // kuru ot
    if (pebble > 0.78) c = lerpC(c, C(0x8c7458), 0.6);
    return { r: c[0], g: c[1], b: c[2], h: n * 0.6 + (pebble > 0.78 ? 0.4 : 0), rough: 0.95 };
  },
  // Fırtına vadisi: sert kaya-toprak, çatlaklı
  storm(u, v) {
    const n = fbm(u * 5, v * 5, 11, 5, 5), grain = fbm(u * 24, v * 24, 4, 3, 24), peb = fbm(u * 40, v * 40, 19, 2, 40);
    let c = lerpC(C(0x62584a), C(0x8f8068), n * 0.7 + grain * 0.3);
    if (peb > 0.76) c = lerpC(c, C(0x4a4038), 0.55);
    return { r: c[0], g: c[1], b: c[2], h: n * 0.6 + grain * 0.3 + (peb > 0.76 ? 0.4 : 0), rough: 0.9 };
  },
  // Tiamat: siyah taş, ince damarlar (ışıltı ayrı emissive dokuda)
  abyss(u, v) {
    const n = fbm(u * 5, v * 5, 21, 5, 5), cr = Math.abs(fbm(u * 4, v * 4, 8, 4, 4) - 0.5);
    let c = lerpC(C(0x15121c), C(0x3a3346), n);
    if (cr < 0.02) c = lerpC(c, C(0x5a2a55), 0.7);
    return { r: c[0], g: c[1], b: c[2], h: n - (cr < 0.02 ? 0.6 : 0), rough: 0.6 + n * 0.3 };
  },
  // kerpiç tuğla
  mudbrick(u, v) {
    const rows = 8, cols = 4, y = v * rows, row = Math.floor(y), x = u * cols + (row % 2) * 0.5, col = Math.floor(x);
    const fx = x - col, fy = y - row; const mortar = fx < 0.05 || fy < 0.08;
    const tone = hash(col, row, 7); const n = fbm(u * 16, v * 16, 2, 3, 16);
    let c = mortar ? C(0x6b4f35) : lerpC(C(0x9c6f48), C(0xc39567), tone * 0.7 + n * 0.3);
    if (!mortar && fbm(u * 30, v * 30, 13, 2, 30) > 0.75) c = lerpC(c, C(0x5b3f2a), 0.5); // kırık
    return { r: c[0], g: c[1], b: c[2], h: mortar ? 0 : 0.6 + n * 0.4, rough: 0.95 };
  },
  // sırlı lacivert tuğla (İştar kapısı mavisi) + altın şerit
  glazed(u, v) {
    const rows = 10, cols = 5, y = v * rows, row = Math.floor(y), x = u * cols + (row % 2) * 0.5, col = Math.floor(x);
    const fx = x - col, fy = y - row; const mortar = fx < 0.04 || fy < 0.06; const tone = hash(col, row, 3); const n = fbm(u * 20, v * 20, 6, 3, 20);
    let c = mortar ? C(0xc9b48a) : lerpC(C(0x15398a), C(0x2a62c0), tone * 0.6 + n * 0.4);
    const band = (v > 0.46 && v < 0.54);
    if (band && !mortar) c = lerpC(C(0xb9862c), C(0xf0c35a), n);
    return { r: c[0], g: c[1], b: c[2], h: mortar ? 0 : 0.7, rough: mortar ? 0.9 : 0.35 };
  },
  // kaba taş (kaya, sütun)
  stone(u, v) {
    const n = fbm(u * 6, v * 6, 31, 5, 6), sp = fbm(u * 30, v * 30, 2, 2, 30);
    let c = lerpC(C(0x7d7262), C(0xb3a48a), n); if (sp > 0.7) c = lerpC(c, C(0x5c5448), 0.5);
    return { r: c[0], g: c[1], b: c[2], h: n + sp * 0.3, rough: 0.92 };
  },
  // kara bazalt
  basalt(u, v) {
    const n = fbm(u * 7, v * 7, 41, 5, 7);
    const c = lerpC(C(0x16131b), C(0x3b3442), n);
    return { r: c[0], g: c[1], b: c[2], h: n, rough: 0.55 };
  },
  // kemik
  bone(u, v) {
    const n = fbm(u * 3, v * 12, 51, 4, 3); const c = lerpC(C(0x9e9480), C(0xd9ceb4), n);
    return { r: c[0], g: c[1], b: c[2], h: n, rough: 0.8 };
  },
};

const cache = new Map();
// grafik ayarına bağlı doku çözünürlüğü (Düşük 128, Orta 256, Yüksek 512)
export const texCfg = { size: 256 };
// kind: RECIPES anahtarı. Döner: { map, normalMap, roughnessMap }
export function texSet(kind, N = 256, repeat = 1) {
  const key = kind + N + ':' + repeat;
  if (cache.has(key)) return cache.get(key);
  const b = build(N, RECIPES[kind], kind === 'mudbrick' || kind === 'glazed' ? 3 : 2);
  const s = { map: toTex(b.col, true, repeat), normalMap: toTex(b.nrm, false, repeat), roughnessMap: toTex(b.rough, false, repeat) };
  cache.set(key, s); return s;
}

// çivi yazısı paneli (kil tablet). Satır satır kama işaretleri.
export function cuneiformTex(seed = 1, N = 256, base = 0xb98f5e) {
  const key = 'cun' + seed + N + base; if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  const [r0, g0, b0] = C(base);
  g.fillStyle = `rgb(${r0},${g0},${b0})`; g.fillRect(0, 0, N, N);
  const R = rng(seed * 97 + 3);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.06})`; g.fillRect(R() * N, R() * N, 2 + R() * 6, 2 + R() * 6); }
  const rows = 9, rh = N / rows;
  for (let r = 0; r < rows; r++) {
    g.fillStyle = 'rgba(60,35,15,0.35)'; g.fillRect(6, r * rh + rh - 2, N - 12, 1);
    let x = 10;
    while (x < N - 14) {
      const n = 1 + Math.floor(R() * 4);
      for (let k = 0; k < n && x < N - 14; k++) {
        const y = r * rh + rh * 0.25 + R() * rh * 0.3; const s = rh * (0.28 + R() * 0.22); const kind = R();
        g.fillStyle = 'rgba(55,30,12,0.85)';
        g.beginPath();
        if (kind < 0.5) { g.moveTo(x, y); g.lineTo(x + s * 0.55, y); g.lineTo(x + s * 0.28, y + s * 0.45); g.closePath(); g.fill(); g.fillRect(x + s * 0.24, y + s * 0.4, 1.5, s * 0.6); }
        else if (kind < 0.8) { g.moveTo(x, y + s * 0.2); g.lineTo(x + s * 0.45, y); g.lineTo(x + s * 0.45, y + s * 0.4); g.closePath(); g.fill(); g.fillRect(x + s * 0.4, y + s * 0.18, s * 0.7, 1.5); }
        else { g.moveTo(x, y); g.lineTo(x + s * 0.5, y + s * 0.25); g.lineTo(x, y + s * 0.5); g.closePath(); g.fill(); }
        x += s * 0.75;
      }
      x += rh * 0.35;
    }
  }
  const t = toTex(c); cache.set(key, t); return t;
}

// sırlı frizde yürüyen hayvan silueti (genel, aslan-ejder benzeri ama özgün)
export function friezeTex(N = 256) {
  const key = 'frieze' + N; if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = N * 2; c.height = N / 2; const g = c.getContext('2d');
  const W = c.width, H = c.height;
  for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 16) { const t = Math.random(); g.fillStyle = `rgb(${20 + t * 15},${55 + t * 25},${140 + t * 40})`; g.fillRect(x + ((y / 8) % 2) * 8, y, 15, 7); }
  g.fillStyle = '#e8c35c'; g.fillRect(0, 0, W, 5); g.fillRect(0, H - 5, W, 5);
  for (let k = 0; k < 2; k++) {
    const ox = k * W / 2 + 30, oy = H * 0.72, s = H / 128;
    g.save(); g.translate(ox, oy); g.scale(s, s); g.fillStyle = '#f2d27a'; g.strokeStyle = '#9b6a1e'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -10); g.quadraticCurveTo(30, -55, 90, -50); g.quadraticCurveTo(140, -48, 165, -70); // sırt ve boyun
    g.lineTo(190, -82); g.lineTo(198, -70); g.lineTo(178, -58); g.quadraticCurveTo(170, -30, 150, -22); // baş
    g.lineTo(152, 30); g.lineTo(138, 30); g.lineTo(132, -8); g.lineTo(60, -8); g.lineTo(52, 30); g.lineTo(38, 30); g.lineTo(34, -6);
    g.quadraticCurveTo(-10, 0, -40, -30); g.quadraticCurveTo(-20, -8, 0, -10); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(186, -84); g.lineTo(196, -110); g.lineTo(192, -80); g.fill(); // boynuz
    g.restore();
  }
  const t = toTex(c); t.wrapT = THREE.ClampToEdgeWrapping; cache.set(key, t); return t;
}

function voronoiEdge(x, y, per, seed) {
  const xi = Math.floor(x), yi = Math.floor(y); let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j; const wx = ((cx % per) + per) % per, wy = ((cy % per) + per) % per;
    const px = cx + hash(wx, wy, seed), py = cy + hash(wx, wy, seed + 1); const d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return f2 - f1;
}
function smoothstepJ(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
// emisyon dokusu: Tiamat enerji çatlakları (siyah zemin üzerinde mor-kızıl damar)
export function crackEmissive(N = 512, seed = 5, density = 1) {
  const key = 'crk' + N + seed + '_' + density; const dd = (1 - density) * 0.22; if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    // Voronoi hücre kenarları (kırık toprak deseni), alan bozmalı ve maskeli
    const wu = u + (fbm(u * 3, v * 3, seed + 4, 3, 3) - 0.5) * 0.08, wv = v + (fbm(u * 3, v * 3, seed + 7, 3, 3) - 0.5) * 0.08;
    const e1 = voronoiEdge(wu * 5, wv * 5, 5, seed), e2 = voronoiEdge(wu * 11, wv * 11, 11, seed + 3);
    const mask = fbm(u * 3, v * 3, seed + 21, 2, 3);
    let k = Math.max(0, 1 - e1 / 0.045) * smoothstepJ(0.42 + dd, 0.6 + dd, mask), k2 = Math.max(0, 1 - e2 / 0.035) * smoothstepJ(0.58 + dd, 0.72 + dd, mask) * 0.5;
    const t = Math.max(k, k2); const i = (y * N + x) * 4; const hot = fbm(u * 2, v * 2, seed + 3, 2, 2);
    img.data[i] = Math.min(255, t * (190 + hot * 65)); img.data[i + 1] = t * 40; img.data[i + 2] = Math.min(255, t * (255 - hot * 60)); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = toTex(c); cache.set(key, t); return t;
}

// yumuşak parlama noktası (parçacıklar, alev)
export function glowTex(N = 64) {
  const key = 'glow' + N; if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, N, N); const t = new THREE.CanvasTexture(c); cache.set(key, t); return t;
}

// ritüel dairesi: çivi yazılı halka (alfa)
export function ritualTex(N = 512) {
  const key = 'rit' + N; if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const m = N / 2;
  g.strokeStyle = 'rgba(255,230,160,0.95)'; g.lineWidth = N / 120;
  for (const r of [0.47, 0.44, 0.30, 0.27]) { g.beginPath(); g.arc(m, m, r * N, 0, Math.PI * 2); g.stroke(); }
  const R = rng(11);
  g.fillStyle = 'rgba(255,230,160,0.95)';
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2; g.save(); g.translate(m + Math.cos(a) * N * 0.365, m + Math.sin(a) * N * 0.365); g.rotate(a + Math.PI / 2);
    const s = N * 0.03; g.beginPath(); if (R() < 0.6) { g.moveTo(-s / 2, -s / 2); g.lineTo(s / 2, -s / 2); g.lineTo(0, s * 0.1); } else { g.moveTo(-s / 2, 0); g.lineTo(s / 2, -s / 3); g.lineTo(s / 2, s / 3); }
    g.closePath(); g.fill(); g.fillRect(-1, 0, 2, s * 0.6); g.restore();
  }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(m + Math.cos(a) * N * 0.27, m + Math.sin(a) * N * 0.27); g.lineTo(m + Math.cos(a) * N * 0.1, m + Math.sin(a) * N * 0.1); g.stroke(); }
  g.beginPath(); g.arc(m, m, N * 0.08, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; cache.set(key, t); return t;
}
