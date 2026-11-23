// v4 Tur 3: haritadaki toplanabilir kaynaklar ve kamp ateşi (kodla üretilen low-poly modeller).
// Her düğüm tek birleştirilmiş mesh (köşe renkleri) + gerekiyorsa tek parıltı mesh'i → düşük çizim çağrısı.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const col = (g, hex) => { const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const prep = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; };
const place = (g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s)); g.applyMatrix4(m); return g; };
const part = (geo, hex, ...tr) => prep(col(place(geo, ...tr), hex));
const merged = (parts, matOpts = {}) => { const g = mergeGeometries(parts.map((p) => prep(p)), false); g.computeVertexNormals(); return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02, flatShading: true, ...matOpts })); };

let _rnd = 1; const rnd = () => (_rnd = (_rnd * 16807) % 2147483647) / 2147483647;

function meatPile() {
  const p = [];
  // av leşinden kesilmiş et parçaları + kemik, yere serilmiş deri
  p.push(part(new THREE.CircleGeometry(0.75, 9), 0x6a4a30, 0, 0.02, 0, -Math.PI / 2));
  for (let i = 0; i < 4; i++) { const a = i * 1.7, r = 0.22 + (i % 2) * 0.12; p.push(part(new THREE.DodecahedronGeometry(0.2 + (i % 3) * 0.04, 0), i % 2 ? 0xb23a32 : 0xd0605a, Math.cos(a) * r, 0.16 + (i === 0 ? 0.12 : 0), Math.sin(a) * r, a, a * 0.7, 0, 1)); }
  p.push(part(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), 0xf1e6cf, 0.05, 0.3, 0, 0, 0.4, 1.3));
  for (const s of [-1, 1]) p.push(part(new THREE.SphereGeometry(0.08, 6, 5), 0xf1e6cf, 0.05 + s * 0.36, 0.3 + s * 0.09, s * 0.1));
  return merged(p);
}
function herbTuft() {
  const p = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + rnd() * 0.4, h = 0.45 + rnd() * 0.35; p.push(part(new THREE.ConeGeometry(0.07, h, 4), i % 3 ? 0x5fa040 : 0x86c45a, Math.cos(a) * 0.12, h / 2, Math.sin(a) * 0.12, Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45)); }
  for (let i = 0; i < 4; i++) { const a = i * 1.6; p.push(part(new THREE.SphereGeometry(0.05, 5, 4), 0xe8f0a0, Math.cos(a) * 0.2, 0.55 + (i % 2) * 0.12, Math.sin(a) * 0.2)); }
  return merged(p, { emissive: 0x1a3a10, emissiveIntensity: 0.6 });
}
function berryBush() {
  const p = [];
  for (let i = 0; i < 5; i++) { const a = i * 1.3; p.push(part(new THREE.IcosahedronGeometry(0.34 + (i % 2) * 0.08, 0), i % 2 ? 0x2f5a2a : 0x3e7034, Math.cos(a) * 0.25, 0.32 + (i === 0 ? 0.18 : 0), Math.sin(a) * 0.25, a, a, 0)); }
  for (let i = 0; i < 12; i++) { const a = rnd() * 6.28, y = 0.25 + rnd() * 0.5, r = 0.42 + rnd() * 0.12; p.push(part(new THREE.SphereGeometry(0.065, 6, 5), i % 3 ? 0xd8322a : 0xff8a2a, Math.cos(a) * r, y, Math.sin(a) * r)); }
  return merged(p, { emissive: 0x401008, emissiveIntensity: 0.25 });
}
function mushrooms() {
  const g = new THREE.Group(); const stems = [], caps = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.25 + rnd() * 0.5, r = i ? 0.22 + rnd() * 0.14 : 0, h = 0.18 + rnd() * 0.22 + (i ? 0 : 0.16), s = i ? 0.7 + rnd() * 0.3 : 1.2;
    stems.push(part(new THREE.CylinderGeometry(0.035 * s, 0.05 * s, h, 6), 0xd8e8e4, Math.cos(a) * r, h / 2, Math.sin(a) * r));
    caps.push(part(new THREE.SphereGeometry(0.13 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0x30e0d0, Math.cos(a) * r, h - 0.01, Math.sin(a) * r));
  }
  g.add(merged(stems));
  const glow = merged(caps, { emissive: 0x1fd8c8, emissiveIntensity: 1.4, roughness: 0.4 }); g.add(glow);
  g.userData.glow = glow;
  return g;
}

export const NODE_COLOR = { cig_et: '#e06a5a', sifali_ot: '#8fd06a', sifali_meyve: '#ff8a3a', ruh_mantari: '#4ff0e0' };

export function buildNode(type, seed = 1) {
  _rnd = 1 + (seed * 9301) % 2147483646;
  const root = new THREE.Group();
  const body = type === 'cig_et' ? meatPile() : type === 'sifali_ot' ? herbTuft() : type === 'sifali_meyve' ? berryBush() : mushrooms();
  body.scale.setScalar(type === 'ruh_mantari' ? 1.7 : 1.25); root.add(body);
  // seçilebilirlik: altta yumuşak renkli halka (yakındayken parlar)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 24), new THREE.MeshBasicMaterial({ color: NODE_COLOR[type] || '#fff', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; root.add(ring);
  root.userData = { type, ring, body, t: rnd() * 6 };
  return root;
}

// Kamp ateşi: taş halka, kütükler, alev (additive koniler), kor parçacıkları, sehpa ve kazan, deri çadır.
export function buildCamp(q = 1) {
  const g = new THREE.Group();
  const p = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; p.push(part(new THREE.DodecahedronGeometry(0.2, 0), i % 2 ? 0x8a8276 : 0x6d665c, Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62, a, a, 0)); }
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; p.push(part(new THREE.CylinderGeometry(0.07, 0.08, 0.85, 6), 0x5a3a20, Math.cos(a) * 0.12, 0.18, Math.sin(a) * 0.12, Math.PI / 2 - 0.35, a, 0)); }
  p.push(part(new THREE.CircleGeometry(0.5, 10), 0x2a1a10, 0, 0.03, 0, -Math.PI / 2));
  // sehpa + kazan
  for (const a of [0, 2.1, 4.2]) p.push(part(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), 0x6a4a2a, Math.cos(a) * 0.55, 0.75, Math.sin(a) * 0.55, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35));
  p.push(part(new THREE.SphereGeometry(0.24, 9, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0x3a3a3a, 0, 1.05, 0));
  // deri çadır ve kütük oturaklar
  p.push(part(new THREE.ConeGeometry(1.25, 1.9, 6, 1, true), 0xb08a5a, -2.6, 0.95, -1.4, 0, 0.3, 0));
  p.push(part(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 4), 0x5a3a20, -2.6, 1.15, -1.4));
  for (const [x, z, r] of [[1.6, 0.6, 0.4], [-0.4, 1.7, 1.6], [1.0, -1.5, -0.6]]) p.push(part(new THREE.CylinderGeometry(0.22, 0.24, 0.9, 7), 0x6a4a2a, x, 0.22, z, Math.PI / 2, r, 0));
  // halı
  p.push(part(new THREE.PlaneGeometry(1.4, 0.9), 0x8a2a2a, 0.2, 0.025, 1.3, -Math.PI / 2, 0, 0.3));
  const base = merged(p); base.material.side = THREE.DoubleSide; g.add(base);
  // alevler
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flames = [];
  for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.16 + (i === 0 ? 0.08 : 0), 0.7 + (i === 0 ? 0.3 : 0), 6), i === 0 ? flameMat : flameMat.clone()); const a = i * 1.3; f.position.set(i ? Math.cos(a) * 0.12 : 0, 0.45, i ? Math.sin(a) * 0.12 : 0); if (i) f.material.color.setHex(i % 2 ? 0xff6020 : 0xffd060); g.add(f); flames.push(f); }
  // korlar
  const N = [10, 24, 36][q] || 24; const ep = new Float32Array(N * 3), seeds = [];
  for (let i = 0; i < N; i++) seeds.push({ a: Math.random() * 6.28, r: Math.random() * 0.25, t: Math.random() * 2, sp: 0.6 + Math.random() * 0.8 });
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffb050, size: 0.08, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); g.add(embers);
  // güvenli halka (yerde sıcak renkli ince çember) — yarıçap dışarıdan ayarlanır
  const safe = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })); safe.rotation.x = -Math.PI / 2; safe.position.y = 0.05; g.add(safe);
  let light = null; if (q >= 1) { light = new THREE.PointLight(0xff9a40, 6, 9, 1.6); light.position.set(0, 1.0, 0); g.add(light); }
  let t = 0;
  g.userData = {
    safe,
    update(dt) {
      t += dt;
      flames.forEach((f, i) => { const k = 0.8 + Math.sin(t * (9 + i * 2.3) + i) * 0.15 + Math.sin(t * 23 + i) * 0.07; f.scale.set(1, k, 1); f.position.y = 0.35 * k + 0.1; });
      if (light) light.intensity = 5.2 + Math.sin(t * 13) * 0.8 + Math.sin(t * 31) * 0.5;
      for (let i = 0; i < N; i++) { const s = seeds[i]; s.t += dt * s.sp; if (s.t > 2) { s.t = 0; s.a = Math.random() * 6.28; s.r = Math.random() * 0.25; } const k = s.t / 2; ep[i * 3] = Math.cos(s.a + k * 2) * (s.r + k * 0.2); ep[i * 3 + 1] = 0.3 + k * 2.2; ep[i * 3 + 2] = Math.sin(s.a + k * 2) * (s.r + k * 0.2); }
      eg.attributes.position.needsUpdate = true; embers.material.opacity = 0.9;
    },
  };
  return g;
}
