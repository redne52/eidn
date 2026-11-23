// Mimari ve doğal yapılar: Ruh Kapısı, sütunlar, heykeller, yıkıntılar, kayalar, palmiyeler, kemikler, köprü, uyarı taşları.
// Tekrarlanan parçalar InstancedMesh; tek parçalı yapılar mergeGeometries ile tek mesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texSet, cuneiformTex, friezeTex, ritualTex, noise2, rng, glowTex, texCfg } from './textures.js';
import { makeLightPillar, makeParticles, makeFlames, clock } from './fx.js';

// ---------- malzemeler ----------
const mats = new Map();
export function std(kind, { color = 0xffffff, repeat = 1, emissive, emissiveIntensity = 1, roughness = 1, metalness = 0 } = {}) {
  const key = [kind, color, repeat, emissive, emissiveIntensity, roughness, texCfg.size].join('|'); if (mats.has(key)) return mats.get(key);
  const t = texSet(kind, texCfg.size, repeat);
  const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, color, roughness, metalness });
  if (emissive !== undefined) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = emissiveIntensity; }
  mats.set(key, m); return m;
}
const gold = () => (mats.get('gold') || mats.set('gold', new THREE.MeshStandardMaterial({ color: 0xd8a33c, roughness: 0.35, metalness: 0.8, emissive: 0x3a2405, emissiveIntensity: 0.6 })).get('gold'));

// kutu UV'lerini boyuta göre ölçekle (doku gerilmesin)
function boxG(w, h, d, uvScale = 0.5) {
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; const n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [su, sv] = ax > 0.5 ? [d, h] : ay > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, uv.getX(i) * su * uvScale, uv.getY(i) * sv * uvScale);
  }
  return g;
}
const T = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s) => { if (s) g.scale(...s); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
function merge(list) { return mergeGeometries(list.map((g) => { const n = nonIdx(g); for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; })); }

// ---------- kayalar ----------
const rockGeos = [];
export function rockGeo(i) {
  if (!rockGeos[i]) {
    const g = new THREE.IcosahedronGeometry(1, 2); const p = g.attributes.position; const v = new THREE.Vector3();
    for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); const n = noise2(v.x * 1.3 + i * 7, v.z * 1.3 + v.y * 0.7, 5 + i, 3); v.multiplyScalar(0.7 + n * 0.6); v.y *= i % 2 ? 0.65 : 0.85; p.setXYZ(k, v.x, v.y, v.z); }
    g.computeVertexNormals(); rockGeos[i] = g;
  }
  return rockGeos[i];
}
// items: [{x,y,z,s,sy?,ry}] → 4 varyantlı instanced kaya
export function rockField(items, kind = 'stone', tint = 0xffffff, seed = 1) {
  const R = rng(seed); const grp = new THREE.Group(); const buckets = [[], [], [], []];
  items.forEach((it) => buckets[Math.floor(R() * 4)].push(it));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color();
  buckets.forEach((b, i) => {
    if (!b.length) return;
    const im = new THREE.InstancedMesh(rockGeo(i), std(kind, { color: 0xffffff, repeat: 1 }), b.length);
    b.forEach((it, k) => { P.set(it.x, it.y ?? 0, it.z); E.set((R() - 0.5) * 0.5, it.ry ?? R() * 6.28, (R() - 0.5) * 0.5); Q.setFromEuler(E); S.set(it.s * (0.8 + R() * 0.4), it.s * (it.sy ?? 1) * (0.7 + R() * 0.5), it.s * (0.8 + R() * 0.4)); M.compose(P, Q, S); im.setMatrixAt(k, M); C.setHex(tint).multiplyScalar(0.75 + R() * 0.4); im.setColorAt(k, C); });
    grp.add(im);
  });
  return grp;
}

// ---------- sütun (sağlam / kırık) ----------
let colGeoFull, colGeoBroken;
function columnGeo(broken) {
  const parts = [T(new THREE.CylinderGeometry(0.75, 0.85, 0.35, 12), 0, 0.17, 0), T(new THREE.CylinderGeometry(0.55, 0.6, broken ? 2.2 : 5.2, 12, 4), 0, broken ? 1.45 : 2.95, 0)];
  if (!broken) parts.push(T(new THREE.CylinderGeometry(0.85, 0.6, 0.45, 12), 0, 5.75, 0), T(new THREE.BoxGeometry(1.8, 0.3, 1.8), 0, 6.1, 0));
  else { const top = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 12, 1); const p = top.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) + Math.sin(p.getX(i) * 4) * 0.25); parts.push(T(top, 0, 2.75, 0)); }
  const g = merge(parts); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * (broken ? 1.2 : 2.6)); return g;
}
export function columns(items, kind = 'stone', tint = 0xe8dcc4) {
  colGeoFull ||= columnGeo(false); colGeoBroken ||= columnGeo(true);
  const grp = new THREE.Group(); const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
  for (const broken of [false, true]) {
    const list = items.filter((i) => !!i.broken === broken); if (!list.length) continue;
    const im = new THREE.InstancedMesh(broken ? colGeoBroken : colGeoFull, std(kind, { color: 0xffffff }), list.length);
    list.forEach((it, k) => { P.set(it.x, it.y ?? 0, it.z); E.set(it.tilt ?? 0, it.ry ?? 0, (it.tiltZ ?? 0)); Q.setFromEuler(E); S.setScalar(it.s ?? 1); M.compose(P, Q, S); im.setMatrixAt(k, M); C.setHex(tint).multiplyScalar(0.85 + ((k * 37) % 10) / 40); im.setColorAt(k, C); });
    grp.add(im);
  }
  return grp;
}

// ---------- yıkık duvar parçaları (kerpiç) ----------
export function ruinWalls(segs, kind = 'mudbrick', tint = 0xffffff, seed = 4) {
  // segs: [{x,z,len,h,ry}] → üst kenarı kırık tuğla duvarlar, tek mesh
  const R = rng(seed); const list = [];
  for (const s of segs) {
    const n = Math.max(2, Math.round(s.len / 0.9));
    for (let i = 0; i < n; i++) {
      const hh = Math.max(0.25, s.h * (0.35 + R() * 0.75) * (i === 0 || i === n - 1 ? 0.6 : 1)); const w = s.len / n;
      const g = boxG(w * 1.02, hh, 0.7, 0.5); T(g, -s.len / 2 + w * (i + 0.5), hh / 2, 0); g.rotateY(s.ry ?? 0); g.translate(s.x, s.y ?? 0, s.z); list.push(g);
      if (R() < 0.35) { const d = boxG(0.5, 0.25, 0.4); T(d, -s.len / 2 + w * (i + 0.5) + (R() - 0.5), 0.12, 0.7 + R() * 0.6, 0, R() * 3); d.rotateY(s.ry ?? 0); d.translate(s.x, s.y ?? 0, s.z); list.push(d); }
    }
  }
  if (!list.length) return new THREE.Group();
  return new THREE.Mesh(merge(list), std(kind, { color: tint }));
}

// ---------- kırık koruyucu heykel (kanatlı boğa-adam esintili, özgün) ----------
export function brokenStatue(scale = 1, kind = 'stone', tint = 0xd9ccb0) {
  const p = [];
  p.push(boxG(2.6, 0.5, 1.4), T(boxG(2.2, 1.5, 1.1), 0, 1.25, 0)); p[0].translate(0, 0.25, 0);
  // bacaklar
  for (const [x, z] of [[-0.8, 0.35], [-0.8, -0.35], [0.8, 0.35]]) p.push(T(boxG(0.4, 1.2, 0.4), x, 0.9 - 0.25 + 0.25, z));
  // gövde, kanat kırığı, kırık boyun
  p.push(T(boxG(2.4, 1.0, 1.0), 0, 2.4, 0));
  p.push(T(boxG(1.6, 1.4, 0.18), -0.2, 3.1, 0.55, 0.15, 0, 0.35));
  const neck = new THREE.CylinderGeometry(0.38, 0.45, 0.8, 8); const np = neck.attributes.position; for (let i = 0; i < np.count; i++) if (np.getY(i) > 0) np.setY(i, np.getY(i) + Math.sin(np.getX(i) * 6 + np.getZ(i) * 3) * 0.18);
  p.push(T(neck, 1.15, 3.1, 0, 0, 0, -0.4));
  const g = merge(p); g.scale(scale, scale, scale);
  const m = new THREE.Mesh(g, std(kind, { color: tint }));
  // düşmüş baş (yanında)
  const head = new THREE.Mesh(T(merge([boxG(0.8, 0.9, 0.8), T(boxG(0.9, 0.35, 0.9), 0, 0.55, 0), T(new THREE.ConeGeometry(0.12, 0.6, 5), 0.3, 1.0, 0, 0, 0, -0.3), T(new THREE.ConeGeometry(0.12, 0.6, 5), -0.3, 1.0, 0, 0, 0, 0.3)]), 0, 0, 0, 0.3, 0.8, 1.2), std(kind, { color: tint }));
  head.scale.setScalar(scale); head.position.set(2.0 * scale, 0.45 * scale, 1.2 * scale);
  const grp = new THREE.Group(); grp.add(m, head); return grp;
}

// ---------- palmiye (hurma) ----------
let palmTrunk, palmLeaf;
export function palms(items, seed = 2) {
  if (!palmTrunk) {
    const segs = []; for (let i = 0; i < 7; i++) segs.push(T(new THREE.CylinderGeometry(0.17 - i * 0.01, 0.21 - i * 0.01, 0.62, 7), Math.sin(i * 0.35) * 0.25, 0.3 + i * 0.6, 0));
    palmTrunk = merge(segs);
    const leaves = []; for (let i = 0; i < 9; i++) { const l = new THREE.PlaneGeometry(2.4, 0.42, 6, 1); const p = l.attributes.position; for (let k = 0; k < p.count; k++) { const x = p.getX(k) + 1.2; p.setY(k, p.getY(k) * (1 - x / 2.6)); p.setZ(k, -x * x * 0.13); p.setX(k, x); } l.rotateX(-Math.PI / 2); l.rotateY((i / 9) * Math.PI * 2); l.translate(0.25 * 1.4, 4.25, 0); leaves.push(l); }
    palmLeaf = merge(leaves);
  }
  const R = rng(seed); const grp = new THREE.Group();
  const trunkM = std('stone', { color: 0xc8a07a }); const leafM = new THREE.MeshLambertMaterial({ color: 0x86a646, emissive: 0x1a2408, side: THREE.DoubleSide });
  const ti = new THREE.InstancedMesh(palmTrunk, trunkM, items.length), li = new THREE.InstancedMesh(palmLeaf, leafM, items.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
  items.forEach((it, k) => { P.set(it.x, it.y ?? 0, it.z); E.set(0, R() * 6.28, (R() - 0.5) * 0.15); Q.setFromEuler(E); S.setScalar((it.s ?? 1) * (0.8 + R() * 0.45)); M.compose(P, Q, S); ti.setMatrixAt(k, M); li.setMatrixAt(k, M); C.setHex(0xffffff).multiplyScalar(0.7 + R() * 0.45); li.setColorAt(k, C); });
  grp.add(ti, li); return grp;
}

// ---------- düz taş levhalar (yol) ----------
export function slabs(items, kind = 'stone', tint = 0xc9b893) {
  const geo = boxG(1, 0.12, 1, 0.6); const im = new THREE.InstancedMesh(geo, std(kind, { color: 0xffffff }), items.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color(); const R = rng(8);
  items.forEach((it, k) => { P.set(it.x, (it.y ?? 0) + 0.03, it.z); E.set((R() - 0.5) * 0.06, it.ry ?? 0, (R() - 0.5) * 0.06); Q.setFromEuler(E); S.set(it.w ?? 1, 1, it.d ?? 1); M.compose(P, Q, S); im.setMatrixAt(k, M); C.setHex(tint).multiplyScalar(0.8 + R() * 0.35); im.setColorAt(k, C); });
  return im;
}

// ---------- zigurat / tapınak silueti (uzak plan) ----------
export function ziggurat(scale = 1, kind = 'mudbrick', tint = 0xb98a60) {
  const p = []; const tiers = [[24, 4], [18, 4], [12, 4], [7, 3.5]]; let y = 0;
  tiers.forEach(([w, h], i) => { p.push(T(boxG(w, h, w * 0.8, 0.25), 0, y + h / 2, 0)); y += h; if (i < 3) for (const s of [-1, 1]) p.push(T(boxG(1.2, h * 0.9, w * 0.8 + 0.2, 0.25), s * w * 0.32, y - h * 0.55, 0)); });
  p.push(T(boxG(3, 14, 2.4, 0.25), 0, 7, 9.6, -0.95, 0, 0)); // ön merdiven
  p.push(T(boxG(4, 3, 4, 0.25), 0, y + 1.5, 0));
  const g = merge(p); g.scale(scale, scale, scale);
  return new THREE.Mesh(g, std(kind, { color: tint, repeat: 1 }));
}

// ---------- kırık taş köprü ----------
export function brokenBridge(span = 30, h = 8, kind = 'stone', tint = 0x8d8577) {
  const p = []; const n = 7;
  for (let i = 0; i < n; i++) { if (i === 3) continue; const x = -span / 2 + (i + 0.5) * span / n; p.push(T(boxG(span / n * 1.02, 1.0, 4), x, h, 0)); if (i % 2 === 0 && i !== 4) p.push(T(boxG(2, h, 2.6), x, h / 2, 0)); }
  // kemer altları
  for (let i = 0; i < n; i += 2) { if (i === 2 || i === 4) continue; const a = new THREE.TorusGeometry(span / n * 0.5, 0.5, 4, 10, Math.PI); p.push(T(a, -span / 2 + (i + 1) * span / n, h - 0.5, 0, 0, 0, Math.PI)); }
  // kopmuş uçlar
  p.push(T(boxG(2.2, 0.8, 3.6), -span / 2 + 3.5 * span / n - 1.6, h - 0.7, 0.2, 0.1, 0, -0.5));
  return new THREE.Mesh(merge(p), std(kind, { color: tint }));
}

// ---------- dev kemikler (kaburga yayı) ----------
export function ribcage(scale = 1, tint = 0xcfc3a6) {
  const p = []; for (let i = 0; i < 7; i++) { const t = new THREE.TorusGeometry(3.2 - Math.abs(i - 3) * 0.3, 0.22, 5, 14, Math.PI * 0.9); p.push(T(t, i * 1.2 - 3.6, 0, 0, 0, Math.PI / 2, Math.PI * 0.05)); }
  p.push(T(new THREE.CylinderGeometry(0.35, 0.35, 9.5, 6), 0, 0.2, 0, 0, 0, Math.PI / 2));
  const g = merge(p); g.scale(scale, scale, scale);
  return new THREE.Mesh(g, std('bone', { color: tint }));
}
export function skull(scale = 1, tint = 0xcfc3a6) {
  const g = new THREE.SphereGeometry(1.6, 10, 8); const pp = g.attributes.position; for (let i = 0; i < pp.count; i++) { const z = pp.getZ(i); pp.setZ(i, z * (z > 0 ? 1.8 : 1)); pp.setY(i, pp.getY(i) * 0.8); }
  g.computeVertexNormals();
  const parts = [g, T(new THREE.ConeGeometry(0.3, 2.6, 6), 0.9, 1.4, -0.6, -0.5, 0, -0.4), T(new THREE.ConeGeometry(0.3, 2.6, 6), -0.9, 1.4, -0.6, -0.5, 0, 0.4)];
  const m = new THREE.Mesh(merge(parts), std('bone', { color: tint })); m.scale.setScalar(scale);
  // göz boşlukları: koyu küreler
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x120814 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), eyeM); e.position.set(s * 0.6, 0.35, 2.3); m.add(e); }
  return m;
}

// ---------- uyarı taşı (tehlikeli bölge girişi) ----------
export function warningStele(color = 0xff3b6b) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(T(merge([boxG(0.9, 2.6, 0.4), T(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 10, 1, false, 0, Math.PI), 0, 1.3, 0, Math.PI / 2, 0, 0)]), 0, 1.3, 0), std('basalt', { color: 0x9a8fa8 }));
  g.add(body);
  const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.7), new THREE.MeshBasicMaterial({ map: cuneiformTex(31, 128, 0x000000), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  glyph.position.set(0, 1.35, 0.21); g.add(glyph);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 })); glow.position.set(0, 1.6, 0.4); glow.scale.set(2.2, 3, 1); g.add(glow);
  g.userData.update = () => { const k = 0.55 + Math.sin(clock.t * 3) * 0.25; glyph.material.opacity = k + 0.3; glow.material.opacity = k * 0.7; };
  return g;
}

// ---------- RUH KAPISI ----------
// q: kalite (0..2). Döner: { group, portal, update(dt) }  — kapı açıklığı +z yönüne bakar; yükseklik ~11 birim (ölçek 1)
export function makeSpiritGate(q = 1, { pillar = true } = {}) {
  const grp = new THREE.Group();
  const glazed = std('glazed', { color: 0xffffff, roughness: 1 }), mud = std('mudbrick', { color: 0xf0d8b8 }), stone = std('stone', { color: 0xe0d2b4 });
  // platform: üç kademe, kırık merdiven
  const plat = [T(boxG(16, 0.6, 9, 0.35), 0, 0.3, -1.2), T(boxG(13, 0.5, 7.2, 0.35), 0, 0.85, -1.4), T(boxG(10.5, 0.4, 6, 0.35), 0, 1.3, -1.6)];
  const steps = []; for (let i = 0; i < 6; i++) { const w = 5.2 - (i === 2 ? 1.6 : 0); steps.push(T(boxG(w, 0.25, 0.7, 0.4), i === 2 ? -0.8 : 0, 0.12 + i * 0.25, 4.6 - i * 0.55)); }
  steps.push(T(boxG(1.2, 0.3, 0.6, 0.4), 2.2, 0.15, 5.4, 0, 0.5, 0.2)); // düşmüş taş
  grp.add(new THREE.Mesh(merge([...plat, ...steps]), stone));
  // kuleler (sırlı tuğla) + mazgallar (kerpiç)
  const towerG = []; const crenG = [];
  for (const s of [-1, 1]) {
    towerG.push(T(boxG(3.0, 9.5, 3.4, 0.45), s * 3.4, 1.5 + 4.75, -1.6));
    towerG.push(T(boxG(3.4, 0.6, 3.8, 0.45), s * 3.4, 1.5 + 9.8, -1.6));
    for (let i = 0; i < 4; i++) for (const zz of [0.0, -3.2]) crenG.push(T(boxG(0.55, 0.8, 0.55, 0.5), s * 3.4 - 1.2 + i * 0.8, 1.5 + 10.5, zz - 0.1));
  }
  // kemer ve üst kiriş
  towerG.push(T(boxG(4.0, 2.0, 3.0, 0.45), 0, 1.5 + 8.4, -1.6));
  const arch = new THREE.CylinderGeometry(1.9, 1.9, 3.0, 16, 1, false, 0, Math.PI); arch.rotateZ(Math.PI / 2); arch.rotateY(Math.PI / 2); arch.translate(0, 1.5 + 6.0, -1.6);
  towerG.push(arch);
  for (let i = 0; i < 4; i++) crenG.push(T(boxG(0.55, 0.8, 0.55, 0.5), -1.2 + i * 0.8, 1.5 + 9.8, -0.2));
  grp.add(new THREE.Mesh(merge(towerG), glazed), new THREE.Mesh(merge(crenG), mud));
  // altın şeritler (kenar profilleri)
  const gl = []; for (const s of [-1, 1]) { gl.push(T(new THREE.BoxGeometry(3.1, 0.18, 0.12), s * 3.4, 1.5 + 9.3, 0.13), T(new THREE.BoxGeometry(3.1, 0.18, 0.12), s * 3.4, 1.5 + 0.8, 0.13)); }
  gl.push(T(new THREE.TorusGeometry(1.95, 0.12, 6, 20, Math.PI), 0, 1.5 + 6.0, 0.0));
  grp.add(new THREE.Mesh(merge(gl), gold()));
  // yürüyen ejder frizi (kulelerin önünde iki sıra)
  const fz = new THREE.MeshStandardMaterial({ map: friezeTex(), roughness: 0.4, metalness: 0.1, emissive: 0x2a1c05, emissiveIntensity: 0.4 });
  for (const s of [-1, 1]) for (const y of [3.6, 6.6]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.15), fz); pl.position.set(s * 3.4, 1.5 + y, 0.12); if (s > 0) pl.scale.x = -1; grp.add(pl); }
  // çivi yazılı paneller (kule yan yüzleri ve platform önü)
  const cun = new THREE.MeshStandardMaterial({ map: cuneiformTex(7, 256, 0xc49a62), roughness: 0.9, emissive: 0x4a2a08, emissiveIntensity: 0.25 });
  for (const s of [-1, 1]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.2), cun); pl.position.set(s * (3.4 + 1.51), 1.5 + 4.6, -1.6); pl.rotation.y = s * Math.PI / 2; grp.add(pl); }
  const front = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.48), cun); front.position.set(-5.2, 0.85, 2.21); grp.add(front);
  // portal
  const pm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(0x35e0d0) }, uB: { value: new THREE.Color(0xffc861) }, uOpen: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float uTime,uOpen; uniform vec3 uA,uB; varying vec2 vUv;
      void main(){ vec2 p=vUv-vec2(.5,.42); p.x*=1.0; float r=length(p); float a=atan(p.y,p.x);
        float sw=sin(a*5.+r*18.-uTime*2.6)*.5+.5; float sw2=sin(a*3.-r*12.+uTime*1.7)*.5+.5;
        vec3 c=mix(uA,uB,sw*sw2); float core=smoothstep(.55,0.,r); float edge=smoothstep(.02,.12,vUv.x)*smoothstep(.98,.88,vUv.x)*smoothstep(.0,.06,vUv.y)*smoothstep(1.,.8,vUv.y);
        float a2=(core*.7+.25*sw)*edge*uOpen; gl_FragColor=vec4(c*(1.2+core),a2); }`,
  });
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 7.4), pm); portal.position.set(0, 1.5 + 3.7, -0.4); grp.add(portal);
  // sütunlar (biri kırık)
  grp.add(columns([{ x: -7.2, z: 2.4, s: 0.85 }, { x: 7.2, z: 2.4, s: 0.85 }, { x: -9.4, z: 0.2, s: 0.8, broken: true, ry: 1 }, { x: 9.6, z: -0.4, s: 0.8 }], 'stone', 0xe8dcc4));
  // ritüel dairesi
  const rit = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: ritualTex(), color: 0x6ff3e2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  rit.rotation.x = -Math.PI / 2; rit.position.set(0, 0.04, 8.4); grp.add(rit);
  // mangallar + alev
  const brazG = merge([T(new THREE.CylinderGeometry(0.5, 0.3, 0.5, 10), 0, 1.25, 0), T(new THREE.CylinderGeometry(0.12, 0.2, 1.0, 6), 0, 0.5, 0), T(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 8), 0, 0.06, 0)]);
  const brazPos = [[-3.2, 4.9], [3.2, 4.9], [-6, 8.6], [6, 8.6]];
  const bi = new THREE.InstancedMesh(brazG, gold(), brazPos.length); const M = new THREE.Matrix4();
  brazPos.forEach(([x, z], i) => { M.makeTranslation(x, z < 6 ? 0 : 0, z); bi.setMatrixAt(i, M); }); grp.add(bi);
  const flames = makeFlames(brazPos.map(([x, z]) => ({ x, y: 1.75, z })), { color: 0xff9a3a, size: 1.1 }); grp.add(flames);
  const lights = [];
  if (q > 0) { for (const s of [-1, 1]) { const l = new THREE.PointLight(0xffa24a, 6, 11, 1.6); l.position.set(s * 3.2, 2.4, 5.1); grp.add(l); lights.push(l); } }
  const pl = new THREE.PointLight(0x48f0dc, q > 0 ? 9 : 0, 14, 1.6); pl.position.set(0, 4, 1.5); grp.add(pl);
  // ışık sütunu ve ruh parçacıkları
  if (pillar) { const p = makeLightPillar(90, 1.6, 0x7ff0e0); p.position.set(0, 1.5, -1.2); grp.add(p); }
  const motes = makeParticles({ count: [40, 110, 180][q], box: [-8, 0.5, -4, 8, 12, 9], color: 0x9ff7ea, size: 0.16, speed: 0.35, mode: 'float', seed: 4 }); grp.add(motes);
  const sparks = makeParticles({ count: [10, 30, 50][q], box: [-2, 2, -1, 2, 9, 1], color: 0xffd98a, size: 0.12, speed: 0.6, mode: 'orbit', seed: 8 }); grp.add(sparks);
  return {
    group: grp, portal,
    update(dt) {
      pm.uniforms.uTime.value = clock.t; flames.userData.update(); rit.rotation.z += dt * 0.08;
      const f = 0.9 + Math.sin(clock.t * 9) * 0.06 + Math.sin(clock.t * 17) * 0.04; lights.forEach((l) => (l.intensity = 6 * f));
      pl.intensity = (q > 0 ? 9 : 0) * (0.85 + Math.sin(clock.t * 1.5) * 0.15);
    },
    setOpen(o) { pm.uniforms.uOpen.value = o; },
  };
}

// =====================================================================
// v3 ek yapılar: lamassu benzeri kanatlı boğa koruyucu, tören yolu duvarı, erozyon kayalıkları,
// uzak kuleler, Anzû izleri (tüy, yuva, pençe izi), sulama kanalı. Hepsi birleşik geometri / instanced.
// =====================================================================
let lamassuGeo;
// Kanatlı boğa koruyucu (özgün tasarım): kaide, dört bacak, gövde, sakallı insan başı, boynuzlu taç, geriye uzanan kanat.
export function lamassu(scale = 1, { broken = false, kind = 'stone', tint = 0xe6d6b4 } = {}) {
  if (!lamassuGeo) {
    const p = [];
    p.push(T(boxG(3.4, 0.6, 1.6, 0.4), 0, 0.3, 0)); // kaide
    for (const [x, z] of [[-1.15, 0.45], [-1.15, -0.45], [1.0, 0.45], [1.0, -0.45], [1.45, 0.45]]) p.push(T(new THREE.CylinderGeometry(0.2, 0.26, 1.5, 7), x, 1.35, z)); // beş bacak (Asur geleneği)
    const body = new THREE.CylinderGeometry(0.75, 0.8, 2.6, 10); body.rotateZ(Math.PI / 2); body.scale(1, 1, 0.82); p.push(T(body, -0.05, 2.35, 0));
    p.push(T(new THREE.SphereGeometry(0.62, 10, 8), 1.35, 2.55, 0, 0, 0, 0, [1, 1.1, 0.85])); // göğüs
    p.push(T(new THREE.CylinderGeometry(0.3, 0.36, 0.7, 8), 1.55, 3.1, 0, 0, 0, -0.35)); // boyun
    p.push(T(new THREE.SphereGeometry(0.42, 10, 8), 1.75, 3.62, 0, 0, 0, 0, [1, 1.15, 0.95])); // baş
    p.push(T(boxG(0.46, 0.75, 0.6, 0.6), 1.95, 3.15, 0, 0, 0, 0.12)); // sakal
    for (let i = 0; i < 4; i++) p.push(T(boxG(0.48, 0.06, 0.62, 0.6), 1.98, 2.92 + i * 0.14, 0, 0, 0, 0.12)); // sakal örgüsü
    p.push(T(new THREE.CylinderGeometry(0.4, 0.46, 0.55, 10), 1.72, 4.12, 0)); // taç
    for (const s of [-1, 1]) p.push(T(new THREE.TorusGeometry(0.42, 0.05, 4, 12, Math.PI), 1.72, 4.0, s * 0.02, 0, s * 0.35, 0)); // taç boynuzları
    // kanatlar: üst üste tüy sıraları, geriye ve yukarı
    for (const s of [-1, 1]) for (let r = 0; r < 4; r++) {
      const w = new THREE.BoxGeometry(2.4 - r * 0.35, 0.34, 0.06); w.translate(-(1.2 - r * 0.17), 0, 0);
      p.push(T(w, 0.9, 2.95 + r * 0.32, s * (0.62 + r * 0.02), s * 0.08, 0, 0.42 + r * 0.05));
    }
    p.push(T(new THREE.CylinderGeometry(0.08, 0.04, 1.3, 5), -1.6, 2.1, 0, 0, 0, 0.6)); // kuyruk
    lamassuGeo = merge(p);
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(lamassuGeo, std(kind, { color: tint })); g.add(m);
  if (broken) { m.rotation.z = -0.22; m.position.y = -0.35; const head = new THREE.Mesh(T(new THREE.SphereGeometry(0.42, 8, 6), 0, 0, 0, 0, 0, 0, [1, 1.15, 0.95]), std(kind, { color: tint })); head.position.set(2.6, 0.38, 1.1); g.add(head); }
  const crown = new THREE.Mesh(T(new THREE.TorusGeometry(0.44, 0.06, 5, 16), 1.72, 4.38, 0, Math.PI / 2, 0, 0), gold()); if (!broken) g.add(crown);
  g.scale.setScalar(scale); return g;
}

// tören yolu: iki yanda alçak sırlı tuğla duvar + friz şeridi (tek mesh + tek friz şeridi)
export function processionalWalls(z0, z1, halfW = 3.4, h = 1.3) {
  const len = z1 - z0; const zc = (z0 + z1) / 2; const p = [], cap = [];
  for (const s of [-1, 1]) {
    // aralıklı, kırık bölümlü duvar
    let z = z0; let i = 0;
    while (z < z1) { const segL = Math.min(z1 - z, 3.2 + (i % 3) * 0.8); const hh = (i % 5 === 3) ? h * 0.45 : h; p.push(T(boxG(0.7, hh, segL - 0.15, 0.45), s * halfW, hh / 2, z + segL / 2)); if (hh === h) cap.push(T(boxG(0.82, 0.12, segL - 0.1, 0.5), s * halfW, h + 0.06, z + segL / 2)); z += segL; i++; }
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(merge(p), std('glazed')), new THREE.Mesh(merge(cap), gold()));
  const fz = new THREE.MeshStandardMaterial({ map: friezeTex(), roughness: 0.4, metalness: 0.1, emissive: 0x2a1c05, emissiveIntensity: 0.35 });
  for (const s of [-1, 1]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.92, 0.7), fz); pl.material.map = friezeTex().clone(); pl.material.map.repeat.set(Math.max(1, Math.round(len / 3)), 1); pl.material.map.needsUpdate = true; pl.position.set(s * (halfW - 0.36), h * 0.55, zc); pl.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(pl); }
  return g;
}

// erozyon kayalıkları: renk bantlı (sarı-kızıl) yığma sütunlar + şapka taşı. items: [{x,y,z,s,sy}]
let hoodooGeos;
export function hoodoos(items, seed = 3) {
  if (!hoodooGeos) {
    hoodooGeos = [0, 1, 2].map((v) => {
      const parts = []; let y = 0; const tiers = 4 + v;
      for (let i = 0; i < tiers; i++) {
        const r0 = 1 - i * 0.12 + Math.sin(i * 2.3 + v) * 0.12, r1 = r0 * (0.78 + 0.1 * Math.cos(i + v)), hh = 0.9 + ((i * 7 + v * 3) % 4) * 0.25;
        const c = new THREE.CylinderGeometry(r1, r0, hh, 9, 2); const pp = c.attributes.position;
        for (let k = 0; k < pp.count; k++) { const a = Math.atan2(pp.getZ(k), pp.getX(k)); const f = 1 + Math.sin(a * 3 + i + v) * 0.1 + noise2(pp.getX(k) * 2 + i, pp.getZ(k) * 2, 9 + v, 2) * 0.18; pp.setX(k, pp.getX(k) * f); pp.setZ(k, pp.getZ(k) * f); }
        c.translate(0, y + hh / 2, 0); y += hh * 0.96;
        // renk bandı: vertex rengi
        const band = [[0.95, 0.72, 0.42], [0.82, 0.42, 0.26], [0.98, 0.82, 0.55], [0.72, 0.36, 0.24], [0.9, 0.6, 0.36]][(i + v) % 5];
        const col = new Float32Array(c.attributes.position.count * 3); for (let k = 0; k < col.length; k += 3) { col[k] = band[0]; col[k + 1] = band[1]; col[k + 2] = band[2]; }
        c.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(c);
      }
      const capG = new THREE.CylinderGeometry(0.95, 0.7, 0.5, 8); capG.translate(0, y + 0.2, 0); capG.scale(1.25, 1, 1.1);
      const cc = new Float32Array(capG.attributes.position.count * 3).fill(0.52); capG.setAttribute('color', new THREE.BufferAttribute(cc, 3)); parts.push(capG);
      return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    });
  }
  const R = rng(seed); const grp = new THREE.Group(); const buckets = [[], [], []];
  items.forEach((it) => buckets[Math.floor(R() * 3)].push(it));
  const mat = std('storm', { color: 0xffffff }).clone(); mat.vertexColors = true;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
  buckets.forEach((b, i) => { if (!b.length) return; const im = new THREE.InstancedMesh(hoodooGeos[i], mat, b.length); b.forEach((it, k) => { P.set(it.x, it.y ?? 0, it.z); E.set((R() - 0.5) * 0.08, R() * 6.28, (R() - 0.5) * 0.08); Q.setFromEuler(E); S.set(it.s, it.s * (it.sy ?? 1), it.s); M.compose(P, Q, S); im.setMatrixAt(k, M); }); grp.add(im); });
  return grp;
}

// uzak antik kule (kerpiç, mazgallı, yarı yıkık)
export function farTower(scale = 1, kind = 'mudbrick', tint = 0xb88a60, broken = false) {
  const p = [T(boxG(6, 22, 6, 0.25), 0, 11, 0), T(boxG(7, 1.2, 7, 0.25), 0, 22.6, 0)];
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { p.push(T(boxG(1, 1.4, 1, 0.4), -2.6 + i * 1.75, 23.9, s * 3)); p.push(T(boxG(1, 1.4, 1, 0.4), s * 3, 23.9, -2.6 + i * 1.75)); }
  for (const s of [-1, 1]) p.push(T(boxG(1.4, 18, 1.4, 0.3), s * 3.4, 9, 3.4), T(boxG(1.4, 18, 1.4, 0.3), s * 3.4, 9, -3.4));
  let g = merge(broken ? p.filter((_, i) => i % 3 !== 1) : p); g.scale(scale, scale, scale);
  const m = new THREE.Mesh(g, std(kind, { color: tint })); if (broken) m.rotation.z = 0.06; return m;
}

// Anzû izleri: dev tüyler (instanced), yuva kalıntısı, pençe izi (yer çıkartması)
let featherGeo;
export function giantFeathers(items, tint = 0x5a3a24) {
  if (!featherGeo) {
    const g = new THREE.PlaneGeometry(0.9, 4.2, 4, 10); const pp = g.attributes.position;
    for (let k = 0; k < pp.count; k++) { const y = pp.getY(k), x = pp.getX(k); const t = (y + 2.1) / 4.2; pp.setX(k, x * Math.sin(Math.min(1, t * 1.25) * Math.PI) * 1.1); pp.setZ(k, Math.abs(x) * 0.35 + Math.sin(t * 3) * 0.25); }
    g.rotateX(-Math.PI / 2 + 0.12); g.computeVertexNormals(); const spine = new THREE.CylinderGeometry(0.035, 0.05, 4.6, 5); spine.rotateX(Math.PI / 2 - 0.12); spine.translate(0, 0.15, 0.2);
    featherGeo = merge([g, spine]);
  }
  const mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.8, metalness: 0.15, side: THREE.DoubleSide, emissive: 0x3a1a05, emissiveIntensity: 0.25 });
  const im = new THREE.InstancedMesh(featherGeo, mat, items.length); const R = rng(41);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color();
  items.forEach((it, k) => { P.set(it.x, (it.y ?? 0) + 0.1, it.z); E.set((R() - 0.5) * 0.3, it.ry ?? R() * 6.28, (R() - 0.5) * 0.4); Q.setFromEuler(E); S.setScalar(it.s ?? 1); M.compose(P, Q, S); im.setMatrixAt(k, M); C.setHex(0xffffff).multiplyScalar(0.7 + R() * 0.6); im.setColorAt(k, C); });
  return im;
}
export function nestRemains(scale = 1) {
  const p = []; const R = rng(77);
  for (let i = 0; i < 34; i++) { const a = (i / 34) * Math.PI * 2 + R() * 0.2, r = 2.6 + R() * 0.6; const c = new THREE.CylinderGeometry(0.09, 0.12, 2.4 + R() * 1.2, 5); p.push(T(c, Math.cos(a) * r, 0.35 + (i % 3) * 0.18, Math.sin(a) * r, Math.PI / 2, -a + (R() - 0.5) * 0.8, (R() - 0.5) * 0.4)); }
  const g = merge(p); g.scale(scale, scale, scale);
  const grp = new THREE.Group(); grp.add(new THREE.Mesh(g, std('stone', { color: 0x6a5238 })));
  // kırık dev yumurta kabuğu (iki yarım)
  const shell = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); const sm = new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 0.7, side: THREE.DoubleSide });
  const a = new THREE.Mesh(shell, sm); a.scale.set(0.9 * scale, 1.2 * scale, 0.9 * scale); a.position.set(0.6 * scale, 0.1, 0.4 * scale); a.rotation.set(2.6, 0.4, 0.3);
  const b = new THREE.Mesh(shell, sm); b.scale.set(0.9 * scale, 1.1 * scale, 0.9 * scale); b.position.set(-0.7 * scale, 0.5 * scale, -0.5 * scale); b.rotation.set(0.25, 1.2, 0.2);
  grp.add(a, b); return grp;
}
let clawTex;
export function clawMarks(len = 3.2) {
  if (!clawTex) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    for (let i = 0; i < 3; i++) { const x = 30 + i * 34; const gr = g.createLinearGradient(x - 9, 0, x + 9, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(20,10,4,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x - 3, 10); g.quadraticCurveTo(x + 14, 128, x + 2, 246); g.lineTo(x - 2, 246); g.quadraticCurveTo(x + 4, 128, x - 9, 10); g.fill(); }
    clawTex = new THREE.CanvasTexture(c); clawTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.5, len), new THREE.MeshBasicMaterial({ map: clawTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; return m;
}

// sulama kanalı: kerpiç kenarlı düz hendek. Kenar duvarlarını döndürür (su ayrıca konur)
export function canalBanks(x0, z0, x1, z1, width = 2.2, heightAt = () => 0) {
  const len = Math.hypot(x1 - x0, z1 - z0); const ang = Math.atan2(x1 - x0, z1 - z0); const n = Math.max(2, Math.round(len / 2.4));
  const p = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n; const cx = x0 + (x1 - x0) * t, cz = z0 + (z1 - z0) * t;
    for (const s of [-1, 1]) { if ((i * 3 + (s > 0 ? 1 : 0)) % 7 === 5) continue; const ox = Math.cos(ang) * s * width / 2, oz = -Math.sin(ang) * s * width / 2; const y = heightAt(cx + ox, cz + oz); p.push(T(boxG(0.45, 0.5, len / n * 0.98, 0.5), cx + ox, y + 0.05, cz + oz, 0, ang, 0)); }
  }
  return new THREE.Mesh(merge(p), std('mudbrick', { color: 0xe6c8a0 }));
}
