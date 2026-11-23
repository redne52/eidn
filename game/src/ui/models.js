// Kodla üretilen 3D modeller. Tek giriş noktası: getModel(id, stage) → { id, group, root, parts, anim, meta, height }
// Modeller parça parça kurulur, sonra "rijit iskelet" olarak birleştirilir: her parça bir kemiğe (Bone) bağlı,
// aynı malzemedeki bütün parçalar tek SkinnedMesh olur → model başına 3–4 çizim çağrısı.
// GLB: src/ui/assets.json'da kayıtlı ve yüklenmiş bir model varsa o kullanılır; yoksa/bozuksa kod modeli.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { skinTex } from './models/skin.js';
import { upgradeSurface, SURF_DEFAULTS } from './models/surface.js';
import { instantiateGlb } from './glb.js';
import { buildRigidGlbModel } from './models/rigidAnim.js';

// ---------- küçük tween motoru (tüm animasyonlar buradan) ----------
const tweens = [];
export function tween(dur, fn) {
  return new Promise((res) => tweens.push({ t: 0, dur, fn, res }));
}
export function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i]; w.t += dt; const k = Math.min(1, w.t / w.dur);
    w.fn(k); if (k >= 1) { tweens.splice(i, 1); w.res(); }
  }
}
export const ease = { out: (k) => 1 - (1 - k) * (1 - k), inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2), back: (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2), in: (k) => k * k * k };

// ---------- renkler ve dekor malzemesi (dünya dekorları için, eskisi gibi) ----------
export const PAL = {
  lapis: 0x1f4fa8, lapisD: 0x163a7a, gold: 0xd9a63a, goldD: 0xa67a22, sand: 0xd8b77a, sandD: 0xb08d55,
  mud: 0x9c6b43, mudD: 0x6e4a2e, reed: 0x6f8f3a, reedD: 0x4d6a28, bone: 0xe9dcc0, black: 0x1d1a17,
  teal: 0x2d8c8a, tealD: 0x1c5f60, red: 0xb5342b, rust: 0x8f4a2a, white: 0xf3ead6, skin: 0xc58b5a, purple: 0x6b3fa0,
};
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  return matCache.get(key);
}

// ---------- model malzemeleri: gövde (ayrıntı dokulu) / metal / parıltı ----------
const METAL = new Set([PAL.gold, PAL.goldD, 0xe7c35a, 0xc9a13b, 0xb8862a]);
const SKIN = new Set([0x7f8c92, 0x9a5a3a, 0xb27a4e, 0xb98058, 0xc58b5a, 0xb57a4b, 0x8a6040, 0x8e7058, 0x8a6448, 0xc79a5b, 0x9a7a52, 0xb08850]);
const GLOW = new Set([0xffe066, 0xffffff, 0xfff07a, 0xff3b3b, 0xff9a3d, 0xffe14a, 0x6ed6ff, 0x7dffb0, 0xff5a2a, 0x9fe8ff, 0x3fc4ff]);
const kmCache = new Map();
const DRAGON_DETAIL = new Set(['dscale', 'scale', 'plate']);
function kindMat(kind, detail) {
  const key = kind + '|' + detail;
  if (kmCache.has(key)) return kmCache.get(key);
  let m;
  if (kind === 'glow') { m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); m.color.setScalar(GLOW_BASE); }
  else if (kind === 'skin') { // karın plakaları / insan teni / dişler
    const cfg = DRAGON_DETAIL.has(detail) ? { ...SURF_DEFAULTS.chitin, freq: 6, rough: 0.55, rim: 0.2, dark: 0.72, bump: 0.6 } : { ...SURF_DEFAULTS.hide, freq: 5, bump: 0.35, rough: 0.6, rim: 0.22, dark: 0.82 };
    m = upgradeSurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: cfg.rough, metalness: 0 }), cfg);
  } else if (kind === 'metal') { // boynuz / pençe / diş / bronz-altın zırh: sert yüzey
    const cfg = SURF_DEFAULTS.horn;
    m = upgradeSurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: cfg.rough, metalness: 0.4, emissive: 0x1a1000, emissiveIntensity: 0.25 }), cfg);
  } else if (kind === 'mem') { // kanat zarı: çift yüzlü, damarlı, arkadan ışık hissi
    const cfg = SURF_DEFAULTS.mem;
    m = upgradeSurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: cfg.rough, metalness: 0, side: THREE.DoubleSide }), cfg);
  } else {
    const cfg = SURF_DEFAULTS[detail] || SURF_DEFAULTS.hide;
    m = upgradeSurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: cfg.rough, metalness: detail === 'chitin' ? 0.15 : 0 }), cfg);
  }
  kmCache.set(key, m); return m;
}
const GLOW_BASE = 1.6; // parıltı rengi >1 → son işlemde bloom'a girer

// ---------- geometri yardımcıları ----------
const V2 = (x, y) => new THREE.Vector2(x, y);
let LOWQ = false; // yabani canavar sürümleri: daha az bölüt (canavar üçgen bütçesi)
const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cone: (r, h, s = 6) => new THREE.ConeGeometry(r, h, s),
  cyl: (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  oct: (r) => new THREE.OctahedronGeometry(r),
  sph: (r, w = 8, h = 6, ...rest) => new THREE.SphereGeometry(r, LOWQ ? Math.max(5, w - 2) : w, LOWQ ? Math.max(4, h - 2) : h, ...rest),
  cap: (r, l, rs = 6) => new THREE.CapsuleGeometry(r, l, 1, LOWQ ? 5 : rs),
  lathe: (pts, s = 9) => new THREE.LatheGeometry(pts.slice().sort((a, b) => a[1] - b[1]).map(([x, y]) => V2(x, y)), LOWQ ? 7 : s),
  tor: (r, t, rs = 4, ts = 10, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, LOWQ ? 3 : rs, LOWQ ? Math.max(6, ts - 3) : ts, arc),
};
function P(parent, geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl, kind) {
  const m = new THREE.Mesh(geo);
  m.userData.color = color; m.userData.kind = kind || (GLOW.has(color) ? 'glow' : METAL.has(color) ? 'metal' : SKIN.has(color) ? 'skin' : 'body');
  m.position.set(...pos); m.rotation.set(...rot); if (scl) m.scale.set(...scl);
  parent.add(m); return m;
}
const _Y = new THREE.Vector3(0, 1, 0);
/** a→b arası kapsül (uzuv). */
function seg(parent, a, b, r, color, kind) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b); const d = vb.clone().sub(va); const len = d.length();
  const m = P(parent, G.cap(r, Math.max(0.01, len - r * 0.6)), color, [0, 0, 0], [0, 0, 0], null, kind);
  m.position.copy(va).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(_Y, d.normalize()); return m;
}
/** Ucu +yön'e bakan koni (pençe, boynuz, diş). */
function spike(parent, pos, dir, r, h, color, kind, s = 5) {
  const m = P(parent, G.cone(r, h, s), color, pos, [0, 0, 0], null, kind);
  m.quaternion.setFromUnitVectors(_Y, new THREE.Vector3(...dir).normalize()); m.position.addScaledVector(new THREE.Vector3(...dir).normalize(), h / 2); return m;
}
function pivot(parent, pos = [0, 0, 0], rot) { const g = new THREE.Bone(); g.position.set(...pos); if (rot) g.rotation.set(...rot); parent.add(g); return g; }

// ---------- rijit iskelete birleştirme ----------
function finalize(group, root, detail) {
  group.updateMatrixWorld(true);
  const bones = []; root.traverse((o) => { if (o.isBone) bones.push(o); });
  const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const buckets = new Map();
  const col = new THREE.Color();
  for (const m of meshes) {
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    g.applyMatrix4(m.matrixWorld);
    col.setHex(m.userData.color);
    const c = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const bi = Math.max(0, bones.indexOf(m.parent));
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const k = m.userData.kind; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(g);
    m.parent.remove(m); m.geometry.dispose();
  }
  const skeleton = new THREE.Skeleton(bones);
  const out = [];
  for (const kind of ['body', 'skin', 'mem', 'metal', 'glow']) {
    const list = buckets.get(kind); if (!list) continue;
    const geo = mergeGeometries(list, false); list.forEach((g) => g.dispose());
    const sm = new THREE.SkinnedMesh(geo, kindMat(kind, detail));
    sm.frustumCulled = false; sm.userData.kind = kind; group.add(sm); sm.bind(skeleton, new THREE.Matrix4());
    out.push(sm);
  }
  return out;
}

// ====================================================================================
// YARATIK KURUCULARI (yüz +z yönüne bakar). st: 1 (sv1–4), 2 (sv5–9), 3 (sv10+)
// ====================================================================================
const B = {};

// ---------- UGALLU: aslan başlı fırtına iblisi, kuş pençeli ----------
B.ugallu = (o, st, pal) => {
  const C = pal || { body: 0xc79a5b, mane: 0x7a3b1c, acc: PAL.lapis, claw: 0xd4b36a, kilt: 0xe8dcc0 };
  const root = o.root; const big = st === 1 ? 1.18 : st === 2 ? 1.06 : 1; // yavruda baş büyük
  // bacaklar: kalın uyluk + ince kuş incik + 3 öne 1 arkaya pençe
  const legs = [];
  for (const s of [-1, 1]) {
    const L = pivot(root, [s * 0.19, 0.95, 0]); legs.push(L);
    seg(L, [0, 0, 0], [0, -0.44, 0.12], 0.115, C.body);
    seg(L, [0, -0.44, 0.12], [0, -0.84, -0.05], 0.06, C.claw);
    P(L, G.sph(0.07, 6, 4), C.claw, [0, -0.88, 0.0], [0, 0, 0], [1, 0.6, 1.2]);
    for (const a of [-0.45, 0, 0.45]) spike(L, [Math.sin(a) * 0.05, -0.9, 0.04], [Math.sin(a) * 0.5, -0.15, 1], 0.025, 0.2, C.claw);
    spike(L, [0, -0.9, -0.05], [0, -0.2, -1], 0.02, 0.13, C.claw);
  }
  // gövde
  const torso = pivot(root, [0, 0.95, 0]);
  P(torso, G.lathe([[0, 0], [0.25, 0.02], [0.29, 0.2], [0.35, 0.48], [0.33, 0.6], [0.2, 0.7], [0, 0.73]]), C.body, [0, 0, 0], [0, 0, 0], [1, 1, 0.72]);
  P(torso, G.lathe([[0.27, 0.06], [0.37, -0.22], [0.4, -0.32]], 10), C.kilt, [0, 0, 0], [0, 0, 0], [1, 1, 0.78]); // etek
  P(torso, G.tor(0.28, 0.035, 4, 12), PAL.gold, [0, 0.07, 0], [Math.PI / 2, 0, 0], [1, 0.75, 1]); // kemer
  P(torso, G.box(0.16, 0.12, 0.04), C.acc, [0, 0.07, 0.22]);
  if (st === 3) { P(torso, G.tor(0.2, 0.04, 4, 12), PAL.gold, [0, 0.66, 0.02], [Math.PI / 2 + 0.2, 0, 0], [1, 0.8, 1]); P(torso, G.oct(0.06), 0x6ed6ff, [0, 0.6, 0.2]); }
  // baş
  const head = pivot(torso, [0, 0.8, 0.04]);
  const hs = big; const hp = (x, y, z) => [x * hs, y * hs, z * hs];
  const mane = pivot(head, [0, 0, -0.04]);
  const mr = [0.2, 0.27, 0.33][st - 1], mn = [8, 12, 16][st - 1];
  P(mane, G.ico(mr, 1), C.mane, [0, 0.02, -0.06], [0, 0, 0], [1.1, 1.15, 0.85]);
  for (let i = 0; i < mn; i++) { const a = (i / mn) * Math.PI * 2; spike(mane, [Math.cos(a) * mr * 0.7, 0.02 + Math.sin(a) * mr * 0.75, -0.08], [Math.cos(a), Math.sin(a), -0.6], 0.07, 0.12 + st * 0.07, C.mane, 'body', 4); }
  P(head, G.sph(0.19 * hs, 9, 7), C.body, hp(0, 0.03, 0.05), [0, 0, 0], [1, 0.95, 1.05]);
  P(head, G.sph(0.11 * hs, 8, 6), C.body, hp(0, -0.05, 0.2), [0, 0, 0], [1.05, 0.8, 1.1]); // ağız
  P(head, G.sph(0.08 * hs, 7, 5), C.body, hp(0, -0.13, 0.16), [0, 0, 0], [1, 0.7, 1.1]); // çene
  P(head, G.sph(0.045 * hs, 6, 4), 0x2a1a14, hp(0, -0.01, 0.31), [0, 0, 0], [1.3, 0.8, 0.8]); // burun
  P(head, G.box(0.26 * hs, 0.05, 0.06), C.body, hp(0, 0.1, 0.19), [0.3, 0, 0]); // kaş
  for (const s of [-1, 1]) {
    P(head, G.sph(0.03 * hs, 6, 4), 0xffe066, hp(s * 0.08, 0.06, 0.2)); // göz parıltısı
    spike(head, hp(s * 0.03, -0.1, 0.27), [0, -1, 0.15], 0.016, 0.08, PAL.bone, 'body', 4); // diş
    spike(head, hp(s * 0.15, 0.17, 0.0), [s * 0.5, 1, -0.2], 0.05, 0.11, C.body, 'body', 4); // kulak
    if (st === 3) spike(head, hp(s * 0.1, 0.2, 0.06), [s * 0.4, 1, -0.4], 0.035, 0.22, PAL.gold, 'metal', 5); // tanrısal boynuz tacı
  }
  // kollar
  const arm = (s) => {
    const A = pivot(torso, [s * 0.35, 0.58, 0]);
    seg(A, [0, 0, 0], [s * 0.06, -0.32, 0.02], 0.085, C.body);
    seg(A, [s * 0.06, -0.32, 0.02], [s * 0.04, -0.6, 0.12], 0.07, C.body);
    P(A, G.sph(0.075, 7, 5), C.body, [s * 0.04, -0.66, 0.14]);
    for (const a of [-0.35, 0, 0.35]) spike(A, [s * 0.04 + Math.sin(a) * 0.05, -0.7, 0.18], [Math.sin(a) * 0.4, -0.6, 1], 0.018, 0.1, C.claw);
    if (st >= 2) P(A, G.tor(0.075, 0.022, 4, 10), PAL.gold, [s * 0.05, -0.46, 0.07], [Math.PI / 2 + 0.3, 0, 0]);
    return A;
  };
  const armL = arm(-1), armR = arm(1);
  if (st === 2) { P(armR, G.cone(0.03, 0.45, 4), 0xcfd6dc, [0.05, -0.68, 0.38], [Math.PI / 2, 0, 0], null, 'metal'); P(armR, G.box(0.14, 0.03, 0.04), PAL.gold, [0.05, -0.68, 0.16]); }
  if (st === 3) { // topuz
    seg(armR, [0.05, -0.62, 0.0], [0.05, -0.75, 0.62], 0.025, 0x5a3a20);
    P(armR, G.ico(0.12, 0), PAL.gold, [0.05, -0.77, 0.68]);
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1]]) spike(armR, [0.05 + d[0] * 0.1, -0.77 + d[1] * 0.1, 0.68 + d[2] * 0.1], d, 0.03, 0.08, PAL.gold, 'metal', 4);
  }
  // kuyruk: 3 kemik
  const tail = []; let prev = pivot(root, [0, 0.98, -0.2], [-2.1, 0, 0]);
  for (let i = 0; i < 3; i++) { const p = i ? pivot(prev, [0, 0.22, 0], [-0.4, 0, 0]) : prev; seg(p, [0, 0, 0], [0, 0.22, 0], 0.035, C.body); tail.push(p); prev = p; }
  P(prev, G.ico(0.07 + st * 0.02, 0), C.mane, [0, 0.27, 0], [0, 0, 0], [1, 1.4, 1]);
  // kanat: 5'te taslak, 10'da tam
  let wingL, wingR;
  if (st >= 2) {
    const n = st === 2 ? 3 : 7, len = st === 2 ? 0.38 : 1.0;
    const wing = (s) => {
      const W = pivot(torso, [s * 0.12, 0.58, -0.2], [0, s * 0.55, 0]);
      for (let i = 0; i < n; i++) {
        const t = i / Math.max(1, n - 1), L = len * (1 - t * 0.45), th = s * (0.9 - t * 1.05);
        const fe = pivot(W, [0, 0.05 - t * 0.12, -0.02 - t * 0.05], [0, 0, th]);
        P(fe, G.box(L, 0.15, 0.025), i % 2 ? C.acc : 0x2f6fc0, [s * L * 0.5, 0, 0]);
        P(fe, G.cone(0.075, 0.14, 4), i % 2 ? 0x2f6fc0 : C.acc, [s * (L + 0.05), 0, 0], [0, 0, -s * Math.PI / 2], [1, 1, 0.3]);
      }
      return W;
    };
    wingL = wing(-1); wingR = wing(1);
  }
  return { torso, head, mane, armL, armR, legL: legs[0], legR: legs[1], tail, wingL, wingR };
};

// ---------- GİRTABLULLU: akrep-insan ----------
B.girtablullu = (o, st, pal) => {
  const C = pal || { body: 0x4a2c1a, shell: 0x6b3d1f, shellD: 0x3a2214, acc: PAL.gold, sting: 0x7dffb0, skin: 0x8a6040, beard: 0x1d1a20 };
  const root = o.root;
  const abd = pivot(root, [0, 0.42, -0.12]);
  P(abd, G.sph(0.3, 9, 6), C.shell, [0, 0, 0.12], [0, 0, 0], [1.1, 0.55, 1.25]);
  for (let i = 0; i < 3; i++) P(abd, G.sph(0.27 - i * 0.03, 9, 6), i % 2 ? C.shellD : C.shell, [0, 0.01, -0.22 - i * 0.22], [0, 0, 0], [1, 0.5, 0.95]);
  const legs = []; const pairs = st === 3 && !LOWQ ? 4 : 3;
  for (let i = 0; i < pairs; i++) for (const s of [-1, 1]) {
    const z = 0.15 - i * 0.22; const l = pivot(abd, [s * 0.24, -0.02, z]); legs.push(l);
    seg(l, [0, 0, 0], [s * 0.32, 0.17, 0.02], 0.03, C.body);
    seg(l, [s * 0.32, 0.17, 0.02], [s * 0.5, -0.4, 0.06], 0.026, C.shellD);
  }
  // kıskaçlar (evreye göre büyür)
  const cs = [0.6, 0.9, 1.3][st - 1]; const claws = [];
  for (const s of [-1, 1]) {
    const c = pivot(abd, [s * 0.22, 0.02, 0.32]); claws.push(c);
    seg(c, [0, 0, 0], [s * 0.12, 0.06, 0.28 * cs], 0.04, C.shell);
    P(c, G.sph(0.08 * cs, 7, 5), C.shell, [s * 0.14, 0.07, 0.32 * cs], [0, 0, 0], [0.8, 0.7, 1.3]);
    spike(c, [s * 0.18, 0.08, 0.36 * cs], [s * 0.3, 0.1, 1], 0.035 * cs, 0.2 * cs, C.shellD);
    spike(c, [s * 0.1, 0.06, 0.36 * cs], [-s * 0.25, 0.1, 1], 0.03 * cs, 0.17 * cs, C.shellD);
  }
  // insan gövdesi
  const torso = pivot(root, [0, 0.6, 0.24]);
  P(torso, G.lathe([[0, 0], [0.2, 0.02], [0.23, 0.2], [0.28, 0.42], [0.25, 0.52], [0.14, 0.6], [0, 0.62]]), C.skin, [0, 0, 0], [0, 0, 0], [1, 1, 0.72]);
  if (st >= 2) { P(torso, G.sph(0.25, 8, 4, ), C.shell, [0, 0.36, 0.02], [0, 0, 0], [1.05, 0.55, 0.78]); P(torso, G.tor(0.22, 0.03, 4, 12), PAL.gold, [0, 0.06, 0], [Math.PI / 2, 0, 0], [1, 0.75, 1]); }
  const head = pivot(torso, [0, 0.7, 0]);
  P(head, G.sph(0.14, 9, 7), C.skin, [0, 0.02, 0.02], [0, 0, 0], [0.95, 1.05, 1]);
  P(head, G.cone(0.12, 0.3, 7), C.beard, [0, -0.14, 0.09], [Math.PI + 0.25, 0, 0], [1, 1, 0.55]); // uzun sakal
  P(head, G.tor(0.035, 0.01, 3, 8), PAL.gold, [0, -0.25, 0.1], [Math.PI / 2 - 0.25, 0, 0]);
  P(head, G.sph(0.145, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), C.beard, [0, 0.04, -0.01]); // saç
  for (const s of [-1, 1]) P(head, G.sph(0.022, 6, 4), st === 3 ? 0x7dffb0 : 0xffffff, [s * 0.05, 0.04, 0.13]);
  // boynuzlu taç (tanrısal), evreyle yükselir
  P(head, G.cyl(0.12, 0.145, 0.07, 10), PAL.gold, [0, 0.13, -0.01]);
  for (const s of [-1, 1]) for (let i = 0; i < st; i++) { const h = pivot(head, [s * 0.1, 0.15 + i * 0.05, 0.03 - i * 0.03], [0, 0, -s * (0.7 - i * 0.15)]); seg(h, [0, 0, 0], [0, 0.12 + i * 0.03, 0.05], 0.022 - i * 0.003, PAL.gold, 'metal'); }
  if (st === 3) P(head, G.oct(0.05), 0x7dffb0, [0, 0.2, 0.12]);
  const arm = (s) => {
    const A = pivot(torso, [s * 0.28, 0.48, 0]);
    seg(A, [0, 0, 0], [s * 0.05, -0.27, 0.03], 0.065, C.skin);
    seg(A, [s * 0.05, -0.27, 0.03], [s * 0.03, -0.5, 0.14], 0.055, C.skin);
    P(A, G.sph(0.055, 6, 4), C.skin, [s * 0.03, -0.55, 0.16]);
    if (st >= 2) P(A, G.cyl(0.065, 0.065, 0.08, 8), C.shell, [s * 0.04, -0.38, 0.09], [0.4, 0, 0]);
    return A;
  };
  const armL = arm(-1), armR = arm(1);
  P(armL, G.tor(0.42, 0.018, 4, 14, Math.PI), 0x6b4423, [-0.05, -0.55, 0.2], [0, Math.PI / 2, 0]); // yay
  // kuyruk: 4/6/8 bölüt, yukarı ve öne kıvrılır
  const segs = [4, 6, 8][st - 1]; const tail = [];
  let prev = pivot(abd, [0, 0.06, -0.78], [-0.75, 0, 0]); const tb = [0.35, 0.3, 0.26][st - 1];
  for (let i = 0; i < segs; i++) {
    const p = i ? pivot(prev, [0, 0.18 - i * 0.006, 0], [tb, 0, 0]) : prev; tail.push(p);
    P(p, G.sph(0.1 - i * 0.006, 6, 4), i % 2 ? C.shellD : C.shell, [0, 0.09, 0], [0, 0, 0], [1, 1.25, 1]);
    prev = p;
  }
  P(prev, G.sph(0.09, 7, 5), C.shell, [0, 0.2, 0.03], [0, 0, 0], [1, 1.2, 1]);
  spike(prev, [0, 0.26, 0.06], [0, 0.35, 1], 0.04, 0.24, C.sting, 'glow', 5);
  return { torso, head, armL, armR, legs, tail, abd, claws };
};

// ---------- KULULLU: balık-insan ----------
B.kulullu = (o, st, pal) => {
  const C = pal || { body: 0x2a8c8a, dark: 0x16585a, acc: PAL.gold, fin: 0x63c7d6, skin: 0x7f8c92, beard: 0x1b2030, orb: 0x3fc4ff };
  const root = o.root;
  // balık alt gövde: kalça + 3 kemikli kuyruk + yüzgeç
  const lower = pivot(root, [0, 0.62, 0]);
  P(lower, G.lathe([[0, 0.12], [0.22, 0.1], [0.23, -0.04], [0.15, -0.24], [0, -0.3]]), C.body, [0, 0, 0], [0, 0, 0], [1, 1, 0.75]);
  const tail = []; let prev = pivot(lower, [0, -0.28, -0.02], [-2.21, 0, 0]);
  const tr = [0.17, 0.12, 0.08];
  for (let i = 0; i < 3; i++) { const p = i ? pivot(prev, [0, 0.27, 0], [0.4, 0, 0]) : prev; tail.push(p); P(p, G.cyl(tr[i] * 0.75, tr[i], 0.3, 8), i % 2 ? C.dark : C.body, [0, 0.14, 0], [0, 0, 0], [1, 1, 0.75]); prev = p; }
  const finS = [0.8, 1, 1.25][st - 1];
  for (const s of [-1, 1]) P(prev, G.cone(0.14 * finS, 0.42 * finS, 3), C.fin, [s * 0.13 * finS, 0.38, 0], [0, 0, -s * 0.7], [1, 1, 0.25]);
  // gövde + balık derisi pelerin
  const torso = pivot(root, [0, 0.82, 0]);
  P(torso, G.lathe([[0, 0], [0.21, 0.02], [0.24, 0.22], [0.29, 0.44], [0.26, 0.55], [0.15, 0.63], [0, 0.65]]), C.skin, [0, 0, 0], [0, 0, 0], [1, 1, 0.72]);
  P(torso, G.sph(0.3, 9, 7), C.body, [0, 0.3, -0.18], [0, 0, 0], [0.95, 1.55, 0.35]); // balık sırtı pelerin
  for (let i = 0; i < 5; i++) spike(torso, [0, 0.0 + i * 0.16, -0.3], [0, 0.3, -1], 0.06, 0.14 + (st - 1) * 0.04, C.fin, 'body', 3);
  P(torso, G.tor(0.23, 0.03, 4, 12), PAL.gold, [0, 0.05, 0], [Math.PI / 2, 0, 0], [1, 0.75, 1]);
  const head = pivot(torso, [0, 0.72, 0]);
  P(head, G.sph(0.13, 9, 7), C.skin, [0, -0.02, 0.06]);
  P(head, G.box(0.2, 0.2, 0.08), C.beard, [0, -0.15, 0.12], [0.15, 0, 0]); // kare sakal
    for (const s of [-1, 1]) P(head, G.sph(0.022, 6, 4), 0xffffff, [s * 0.05, 0.02, 0.18]);
  // balık başı başlık (ağız yukarıda, gözler yanlarda)
  const hood = pivot(head, [0, 0.12, -0.02]);
  P(hood, G.sph(0.19, 9, 7), C.body, [0, 0.05, 0], [0, 0, 0], [0.95, 0.85, 1.35]);
  P(hood, G.cone(0.15, 0.22, 8), C.dark, [0, 0.07, 0.27], [Math.PI / 2, 0, 0], [1, 0.7, 1]);
  for (const s of [-1, 1]) { P(hood, G.sph(0.045, 7, 5), 0x9fe8ff, [s * 0.15, 0.08, 0.12]); P(hood, G.cone(0.07, 0.18, 3), C.fin, [s * 0.17, -0.02, -0.05], [0, 0, -s * 1.3], [1, 1, 0.3]); }
  if (st === 3) for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; spike(hood, [Math.sin(a) * 0.1, 0.18, -0.05], [Math.sin(a) * 0.6, 1, -0.3], 0.045, 0.22 - Math.abs(a) * 0.08, C.fin, 'body', 3); }
  const arm = (s) => {
    const A = pivot(torso, [s * 0.3, 0.5, 0]);
    seg(A, [0, 0, 0], [s * 0.05, -0.28, 0.03], 0.07, C.skin);
    seg(A, [s * 0.05, -0.28, 0.03], [s * 0.03, -0.52, 0.14], 0.06, C.skin);
    P(A, G.sph(0.06, 6, 4), C.skin, [s * 0.03, -0.58, 0.17]);
    if (st >= 2) P(A, G.cone(0.06, 0.24, 3), C.fin, [s * 0.1, -0.38, 0.0], [0.6, 0, -s * 0.9], [1, 1, 0.3]);
    return A;
  };
  const armL = arm(-1), armR = arm(1);
  const orbR = [0.07, 0.09, 0.11][st - 1];
  P(armL, G.ico(orbR, 1), C.orb, [-0.12, -0.6, 0.26], [0, 0, 0], null, 'glow');
  if (st >= 2) { P(armR, G.cyl(0.07, 0.055, 0.12, 8), PAL.gold, [0.03, -0.7, 0.18]); P(armR, G.tor(0.05, 0.01, 3, 8, Math.PI), PAL.gold, [0.03, -0.61, 0.18], [0, 0, 0]); } // kutsal kova
  return { torso, head, hood, armL, armR, tail, lower };
};

// ---------- KUSARIKKU: boğa-insan, eşik bekçisi ----------
B.kusarikku = (o, st, pal) => {
  const C = pal || { body: 0x7a4a2c, dark: 0x3e2618, horn: 0xe6d6b0, acc: PAL.gold, skin: 0x9a5a3a, beard: 0x1a2a4a, hoof: 0x231812 };
  const root = o.root;
  // boğa bacakları: kalın uyluk, geriye kırık diz, toynak
  const legs = [];
  for (const s of [-1, 1]) {
    const L = pivot(root, [s * 0.22, 1.0, 0]); legs.push(L);
    seg(L, [0, 0, 0], [0, -0.42, 0.14], 0.14, C.body);
    seg(L, [0, -0.42, 0.14], [0, -0.72, -0.04], 0.085, C.body);
    seg(L, [0, -0.72, -0.04], [0, -0.92, 0.02], 0.06, C.dark);
    P(L, G.cyl(0.08, 0.1, 0.1, 8), C.hoof, [0, -0.96, 0.04]);
  }
  const torso = pivot(root, [0, 1.0, 0]);
  P(torso, G.lathe([[0, 0], [0.3, 0.02], [0.33, 0.22], [0.43, 0.52], [0.41, 0.66], [0.24, 0.78], [0, 0.8]]), C.skin, [0, 0, 0], [0, 0, 0], [1, 1, 0.7]);
  P(torso, G.lathe([[0.33, 0.08], [0.42, -0.18], [0.44, -0.28]], 10), C.dark, [0, 0, 0], [0, 0, 0], [1, 1, 0.78]); // kürk etek
  P(torso, G.tor(0.33, 0.045, 4, 12), C.acc, [0, 0.08, 0], [Math.PI / 2, 0, 0], [1, 0.72, 1]);
  if (st >= 2) for (const s of [-1, 1]) P(torso, G.sph(0.17, 8, 5), st === 3 ? PAL.gold : C.dark, [s * 0.38, 0.7, 0], [0, 0, s * 0.3], [1, 0.6, 1]); // omuzluk
  if (st === 3) P(torso, G.sph(0.3, 9, 4), PAL.gold, [0, 0.45, 0.06], [0, 0, 0], [1.25, 0.6, 0.75]); // göğüs zırhı
  const head = pivot(torso, [0, 0.9, 0.04]);
  P(head, G.sph(0.17, 9, 7), C.skin, [0, 0.02, 0.04], [0, 0, 0], [1, 1.05, 1]);
  P(head, G.sph(0.1, 8, 6), C.skin, [0, -0.04, 0.17], [0, 0, 0], [1.25, 0.8, 0.8]); // geniş burun
  for (const s of [-1, 1]) P(head, G.sph(0.025, 6, 4), 0xff9a3d, [s * 0.06, 0.05, 0.17]);
  // lüleli sakal
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - r; c++) P(head, G.sph(0.05, 6, 4), C.beard, [(c - (3 - r) / 2) * 0.075, -0.14 - r * 0.07, 0.14 - r * 0.01]);
  P(head, G.sph(0.18, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), C.beard, [0, 0.05, -0.01]); // saç
  // kulak + boynuz (evreyle büyür, 10'da altın uç)
  const hl = [0.22, 0.36, 0.5][st - 1];
  for (const s of [-1, 1]) {
    P(head, G.cone(0.05, 0.14, 4), C.skin, [s * 0.19, 0.02, -0.01], [0, 0, s * 1.6], [1, 1, 0.4]);
    const h = pivot(head, [s * 0.14, 0.15, 0], [0, 0, -s * 1.2]);
    seg(h, [0, 0, 0], [0, hl * 0.55, 0.04], 0.05, C.horn);
    seg(h, [0, hl * 0.55, 0.04], [s * -0.08, hl, 0.1], 0.033, C.horn);
    if (st === 3) spike(h, [s * -0.08, hl, 0.1], [s * -0.4, 1, 0.3], 0.03, 0.09, PAL.gold, 'metal', 5);
  }
  P(head, G.tor(0.035, 0.01, 3, 8), PAL.gold, [0, -0.1, 0.25], [0, 0, 0]); // burun halkası
  const arm = (s) => {
    const A = pivot(torso, [s * 0.42, 0.66, 0]);
    seg(A, [0, 0, 0], [s * 0.06, -0.35, 0.03], 0.1, C.skin);
    seg(A, [s * 0.06, -0.35, 0.03], [s * 0.04, -0.62, 0.14], 0.085, C.skin);
    P(A, G.sph(0.08, 7, 5), C.skin, [s * 0.04, -0.69, 0.17]);
    P(A, G.cyl(0.09, 0.09, 0.1, 8), C.acc, [s * 0.05, -0.52, 0.1], [0.4, 0, 0]);
    return A;
  };
  const armL = arm(-1), armR = arm(1);
  // kalkan (sol), mızrak/direk (sağ)
  let shield = null; const shR = [0, 0.3, 0.42][st - 1];
  if (shR) { shield = pivot(armL, [-0.08, -0.6, 0.24]); P(shield, G.cyl(shR, shR, 0.06, 12), PAL.gold, [0, 0, 0], [Math.PI / 2, 0, 0]); P(shield, G.cyl(shR * 0.72, shR * 0.72, 0.07, 12), PAL.lapis, [0, 0, 0.01], [Math.PI / 2, 0, 0]); P(shield, G.sph(0.07, 6, 4), PAL.gold, [0, 0, 0.05]); if (st === 3) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P(shield, G.sph(0.03, 5, 3), 0xe7c35a, [Math.cos(a) * shR * 0.85, Math.sin(a) * shR * 0.85, 0.04]); } }
  seg(armR, [0.05, -0.68, -0.6], [0.05, -0.68, 0.9 + st * 0.1], 0.025, 0x5a3a20);
  spike(armR, [0.05, -0.68, 0.9 + st * 0.1], [0, 0, 1], 0.045, 0.2, 0xc9a13b, 'metal', 4);
  const tail = []; const t0 = pivot(root, [0, 1.02, -0.26], [0.5, 0, 0]); tail.push(t0);
  seg(t0, [0, 0, 0], [0, -0.42, -0.08], 0.025, C.body); P(t0, G.sph(0.06, 6, 4), C.dark, [0, -0.48, -0.1], [0, 0, 0], [1, 1.6, 1]);
  return { torso, head, armL, armR, legL: legs[0], legR: legs[1], tail, shield };
};

// ---------- diğer canavarlar (aynı birleştirme düzeniyle) ----------
B.basmu = (o, st, pal) => {
  const C = pal || { body: 0x5f7a2e, body2: 0x4c6424, belly: 0xc9b86a, horn: PAL.bone };
  const segs = []; let prev = pivot(o.root, [0, 0.2, -1.0]);
  for (let i = 0; i < 7; i++) {
    const p = i ? pivot(prev, [0, i > 4 ? 0.12 : 0, 0.3]) : prev; segs.push(p);
    const r = 0.17 - Math.abs(i - 3) * 0.012;
    P(p, G.sph(r, 8, 6), i % 2 ? C.body : C.body2, [0, 0, 0], [0, 0, 0], [1, 0.85, 1.25]); P(p, G.sph(r * 0.8, 7, 4), C.belly, [0, -0.07, 0], [0, 0, 0], [1, 0.4, 1.2]);
    if (i % 2 === 0) spike(p, [0, r * 0.8, 0], [0, 1, -0.3], 0.04, 0.12, C.horn, 'body', 4);
    prev = p;
  }
  const head = pivot(prev, [0, 0.12, 0.3]);
  P(head, G.sph(0.2, 9, 7), C.body, [0, 0, 0.08], [0, 0, 0], [0.95, 0.65, 1.25]);
  for (const s of [-1, 1]) { spike(head, [s * 0.1, 0.1, -0.02], [s * 0.3, 0.6, -1], 0.045, 0.32, C.horn, 'body', 5); P(head, G.sph(0.03, 6, 4), 0xffe14a, [s * 0.1, 0.06, 0.24]); }
  P(head, G.box(0.03, 0.02, 0.2), PAL.red, [0, -0.06, 0.38]);
  return { torso: segs[3], head, segs };
};
B.quad = (o, st, pal) => { // Mušḫuššu / Ušumgallu ejderi
  const C = pal || { body: 0x8a3b24, dark: 0x5a2416, acc: PAL.lapis, horn: PAL.gold, scale: 0xc0602f };
  const root = o.root;
  const torso = pivot(root, [0, 0.85, 0]);
  P(torso, G.sph(0.45, 10, 7), C.body, [0, 0, 0], [0, 0, 0], [0.85, 0.7, 1.6]); P(torso, G.sph(0.33, 9, 4), C.scale, [0, 0.12, 0], [0, 0, 0], [0.75, 0.5, 1.6]);
  for (let i = 0; i < 6; i++) spike(torso, [0, 0.25, -0.5 + i * 0.2], [0, 1, -0.3], 0.05, 0.2, C.acc, 'body', 4);
  const legs = [];
  for (const [x, z, front] of [[-0.28, 0.45, 1], [0.28, 0.45, 1], [-0.28, -0.45, 0], [0.28, -0.45, 0]]) {
    const l = pivot(torso, [x, -0.1, z]); legs.push(l);
    seg(l, [0, 0, 0], [0, -0.38, front ? 0.06 : -0.06], 0.14, front ? C.body : C.dark);
    seg(l, [0, -0.38, front ? 0.06 : -0.06], [0, -0.72, 0.02], 0.095, front ? C.body : C.dark);
    for (const a of [-0.4, 0, 0.4]) spike(l, [Math.sin(a) * 0.05, -0.76, 0.05], [Math.sin(a) * 0.4, -0.2, 1], 0.025, 0.14, front ? C.horn : PAL.black, front ? 'metal' : 'body', 4);
  }
  const neck = pivot(torso, [0, 0.15, 0.55], [-0.6, 0, 0]);
  seg(neck, [0, 0, 0], [0, 0.9, 0], 0.15, C.body);
  const head = pivot(neck, [0, 0.95, 0], [0.6, 0, 0]);
  P(head, G.sph(0.18, 9, 6), C.body, [0, 0, 0.05], [0, 0, 0], [0.9, 0.75, 1.4]); P(head, G.box(0.04, 0.03, 0.25), PAL.red, [0, -0.1, 0.4]);
  for (const s of [-1, 1]) { spike(head, [s * 0.08, 0.12, -0.05], [s * 0.2, 0.8, -0.6], 0.04, 0.42, C.horn, 'metal', 5); P(head, G.sph(0.03, 6, 4), 0xfff07a, [s * 0.1, 0.05, 0.2]); }
  const tail = []; let prev = pivot(torso, [0, 0, -0.62]);
  for (let i = 0; i < 4; i++) { const p = i ? pivot(prev, [0, 0, -0.3], [0.15, 0, 0]) : prev; tail.push(p); seg(p, [0, 0, 0], [0, 0, -0.3], 0.11 - i * 0.022, C.body); prev = p; }
  spike(prev, [0, 0, -0.32], [0, 0, -1], 0.07, 0.3, C.acc, 'body', 4);
  return { torso, head, neck, legs, tail };
};
B.lahmu = (o) => {
  const root = o.root; const skin = 0xb57a4b, hair = 0x2a1a10, cloth = 0xe8dcc0;
  const legs = [];
  for (const s of [-1, 1]) { const L = pivot(root, [s * 0.24, 1.0, 0]); legs.push(L); seg(L, [0, 0, 0], [0, -0.5, 0.05], 0.12, cloth); seg(L, [0, -0.5, 0.05], [0, -0.95, 0], 0.09, skin); P(L, G.box(0.2, 0.08, 0.32), hair, [0, -0.98, 0.07]); }
  const torso = pivot(root, [0, 1.0, 0]);
  P(torso, G.lathe([[0, 0], [0.34, 0.02], [0.38, 0.4], [0.42, 0.66], [0.26, 0.82], [0, 0.84]]), skin, [0, 0, 0], [0, 0, 0], [1, 1, 0.7]);
  P(torso, G.lathe([[0.36, 0.3], [0.46, -0.3], [0.48, -0.4]], 10), cloth, [0, 0, 0], [0, 0, 0], [1, 1, 0.8]);
  const head = pivot(torso, [0, 0.95, 0]);
  P(head, G.sph(0.2, 9, 7), skin, [0, 0.05, 0.03]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P(head, G.ico(0.11, 1), hair, [Math.cos(a) * 0.25, 0.08 + Math.sin(a) * 0.25, -0.05]); }
  P(head, G.box(0.36, 0.4, 0.12), hair, [0, -0.25, 0.18]);
  for (const s of [-1, 1]) P(head, G.sph(0.03, 6, 4), 0xffffff, [s * 0.08, 0.1, 0.21]);
  const arm = (s) => { const A = pivot(torso, [s * 0.46, 0.7, 0]); seg(A, [0, 0, 0], [s * 0.06, -0.4, 0.04], 0.1, skin); seg(A, [s * 0.06, -0.4, 0.04], [s * 0.05, -0.75, 0.15], 0.085, skin); P(A, G.sph(0.09, 7, 5), skin, [s * 0.05, -0.82, 0.18]); return A; };
  const armL = arm(-1), armR = arm(1);
  P(armR, G.cyl(0.07, 0.07, 1.8, 8), PAL.goldD, [0.06, -0.9, 0.2]);
  return { torso, head, armL, armR, legL: legs[0], legR: legs[1] };
};
B.anzu = (o) => {
  const root = o.root; const body = 0x3b2e4a, wingC = 0x2b2140, acc = PAL.gold;
  const legs = [];
  for (const s of [-1, 1]) { const l = pivot(root, [s * 0.25, 0.7, 0]); legs.push(l); seg(l, [0, 0, 0], [0, -0.68, 0], 0.07, PAL.gold, 'metal'); for (const a of [-0.4, 0, 0.4]) spike(l, [Math.sin(a) * 0.06, -0.72, 0.04], [Math.sin(a) * 0.4, -0.3, 1], 0.03, 0.2, PAL.black, 'body', 4); }
  const torso = pivot(root, [0, 0.75, 0]);
  P(torso, G.sph(0.55, 10, 7), body, [0, 0.45, 0], [0, 0, 0], [1, 1.2, 1]);
  const head = pivot(torso, [0, 1.15, 0.15]);
  P(head, G.ico(0.38, 1), PAL.rust, [0, 0, -0.05]); P(head, G.sph(0.2, 9, 7), PAL.sand, [0, 0, 0.12], [0, 0, 0], [1, 0.95, 1.05]); P(head, G.sph(0.11, 8, 6), PAL.sand, [0, -0.07, 0.3], [0, 0, 0], [1, 0.8, 1.1]);
  for (const s of [-1, 1]) P(head, G.sph(0.035, 6, 4), 0xff3b3b, [s * 0.09, 0.06, 0.29]);
  const wing = (s) => { const W = pivot(torso, [s * 0.15, 0.65, -0.25]); for (let i = 0; i < 6; i++) { const t = i / 5, L = 1.6 * (1 - t * 0.4); P(W, G.box(L, 0.04, 0.24), i % 2 ? acc : wingC, [s * L * 0.5, 0.15 - t * 0.4, -t * 0.05], [0, 0, s * (0.55 - t * 0.6)]); } return W; };
  const wingL = wing(-1), wingR = wing(1);
  const tail = [pivot(torso, [0, 0.1, -0.4])]; for (let i = 0; i < 3; i++) P(tail[0], G.box(0.3 - i * 0.05, 0.05, 0.6), i % 2 ? acc : wingC, [0, -0.05 * i, -0.25], [0.4, (i - 1) * 0.4, 0]);
  return { torso, head, wingL, wingR, legs, tail };
};
B.keeper = (o) => {
  const root = o.root;
  P(root, G.lathe([[0, 0], [0.45, 0], [0.4, 0.5], [0.28, 1.2], [0, 1.3]], 10), 0xe6dcc4, [0, 0, 0]);
  P(root, G.tor(0.29, 0.035, 4, 12), PAL.lapis, [0, 0.9, 0], [Math.PI / 2, 0, 0]);
  const torso = pivot(root, [0, 1.3, 0]); P(torso, G.sph(0.24, 8, 6), 0xe6dcc4, [0, 0.1, 0], [0, 0, 0], [1, 0.9, 0.75]);
  const head = pivot(torso, [0, 0.45, 0]); P(head, G.sph(0.13, 9, 7), PAL.skin, [0, 0, 0]); P(head, G.box(0.24, 0.2, 0.06), PAL.black, [0, -0.12, 0.11]); P(head, G.cyl(0.14, 0.14, 0.14, 10), PAL.gold, [0, 0.16, 0]);
  const arm = (s) => { const A = pivot(torso, [s * 0.26, 0.25, 0]); seg(A, [0, 0, 0], [s * 0.04, -0.28, 0.04], 0.065, 0xe6dcc4); seg(A, [s * 0.04, -0.28, 0.04], [s * 0.04, -0.5, 0.12], 0.05, PAL.skin); return A; };
  const armL = arm(-1), armR = arm(1);
  P(armR, G.cyl(0.03, 0.03, 1.7, 6), PAL.goldD, [0.05, -0.4, 0.12]); P(armR, G.oct(0.09), 0x6ed6ff, [0.05, 0.48, 0.12]);
  return { torso, head, armL, armR };
};

// ====================================================================================
// EJDERHALAR (oynanabilir, v4): 4 bacak + katlı 2 kanat, uzun boyun, ayrı çene kemiği, 6–9 bölüt kuyruk.
// Evre 1: yavru (büyük kafa, kanat taslağı) · 2: boynuz + sırt dikenleri · 3: tam kanat + tür imzası
// ====================================================================================
export const DRAGON = {
  ejder_ates: { type: 'ates', body: 0x8e2416, dark: 0x241010, belly: 0xc9783a, horn: 0x1d1a17, mem: 0x5c1810, glow: 0xff7a1e, spk: 0x2a1210, eye: 0xffd04a, detail: 'dscale', fx: 'fire' },
  ejder_su: { type: 'su', body: 0x1f6aa6, dark: 0x0f3a5e, belly: 0x9fdcd2, horn: 0xdcefee, mem: 0x2aa3a0, glow: 0x5ff0ff, spk: 0x2aa3a0, eye: 0xb8ffff, detail: 'scale', fx: 'water' },
  ejder_zehir: { type: 'zehir', body: 0x2f6a2c, dark: 0x2c1742, belly: 0xa2bc58, horn: 0x3b2152, mem: 0x48246a, glow: 0x8dff5a, spk: 0x4a2470, eye: 0xd2ff6a, detail: 'dscale', fx: 'poison' },
  ejder_tas: { type: 'tas', body: 0x8c6c40, dark: 0x4e4236, belly: 0xb79a66, horn: 0xc99a48, mem: 0x6a5642, glow: 0xffc65a, spk: 0x5c5048, eye: 0xffb43a, detail: 'plate', fx: 'horn' },
};
/** Kanat zarı: kök→dirsek→uç ve parmak uçları arasında çift yüzlü yelpaze. */
function membraneGeo(s, pts) {
  const [r, ...rest] = pts; const pos = [];
  for (let i = 0; i < rest.length - 1; i++) { const a = rest[i], b = rest[i + 1]; pos.push(...r, ...a, ...b, ...r, ...b, ...a); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const n = pos.length / 3, uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { uv[i * 2] = (i % 3) * 0.5; uv[i * 2 + 1] = (i % 2); }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
B.dragon = (o, st, C) => {
  const root = o.root, T = C.type;
  const hs = [1.32, 1.12, 1][st - 1]; // yavruda kafa büyük
  // ---- gövde: göğüs + kalça + karın ----
  const torso = pivot(root, [0, 0.66, 0]);
  // v5: tek parça Lathe gövde — göğüs kafesi yüksek ve dolgun, bel incelir, kalça kaslı; kuyruğa ve boyna yumuşak geçiş
  const PROF = [[0.02, -0.86], [0.15, -0.8], [0.27, -0.6], [0.33, -0.38], [0.3, -0.12], [0.34, 0.12], [0.38, 0.34], [0.35, 0.54], [0.27, 0.7], [0.15, 0.8], [0.02, 0.84]];
  const rAt = (z) => { for (let i = 1; i < PROF.length; i++) if (z <= PROF[i][1]) { const [r0, z0] = PROF[i - 1], [r1, z1] = PROF[i]; return r0 + (r1 - r0) * (z - z0) / (z1 - z0); } return 0.02; };
  P(torso, G.lathe(PROF, 9), C.body, [0, 0.03, -0.02], [Math.PI / 2, 0, 0], [0.92, 1, 0.86]);
  // karın plakaları: alt yüzey boyunca, gövde profilini izleyen ayrı tonlu plakalar
  for (let i = 0; i < 7; i++) { const z = 0.6 - i * 0.19, r = rAt(z); P(torso, G.box(r * 1.2, 0.035, 0.12), C.belly, [0, 0.03 - r * 0.84, z - 0.02], [0.06 + (z > 0.3 ? -0.25 : z < -0.4 ? 0.2 : 0), 0, 0], null, 'skin'); }
  // omuz/kaburga kası (gövde yanları)
  for (const sx of [-1, 1]) P(torso, G.sph(0.17, 7, 5), C.body, [sx * 0.2, 0.08, 0.36], [0, 0, 0], [0.7, 1.05, 1.25]);
  const chest = pivot(torso, [0, 0.0, 0.6]);
  if (T === 'ates') for (let i = 0; i < 3; i++) P(chest, G.box(0.04 + i * 0.01, 0.2 - i * 0.04, 0.02), C.glow, [(i - 1) * 0.09, -0.06 - Math.abs(i - 1) * 0.04, -0.04], [0, 0, (i - 1) * 0.5], null, 'glow');
  // ---- bacaklar: ön dirsek geride, arka diz önde; ayak 3 öne + 1 arkaya pençe ----
  const legs = [];
  for (const [x, z, front] of [[-1, 0.44, 1], [1, 0.44, 1], [-1, -0.44, 0], [1, -0.44, 0]]) {
    const s = x; const L = pivot(torso, [s * 0.28, -0.04, z]); legs.push(L);
    const kn = front ? [s * 0.08, -0.28, -0.08] : [s * 0.08, -0.25, 0.15];
    P(L, G.sph(front ? 0.13 : 0.16, 7, 5), C.body, [s * 0.02, -0.05, front ? 0 : 0.02], [0, 0, 0], [0.75, 1.1, 1.15]); // omuz / uyluk kası
    seg(L, [0, 0, 0], kn, front ? 0.1 : 0.12, C.body);
    seg(L, kn, [s * 0.07, -0.56, front ? 0.05 : -0.03], 0.075, C.dark);
    P(L, G.sph(0.09, 6, 4), C.dark, [s * 0.07, -0.6, 0.07], [0, 0, 0], [1, 0.48, 1.4]);
    for (const a of [-0.45, 0, 0.45]) spike(L, [s * 0.07 + Math.sin(a) * 0.06, -0.62, 0.15], [Math.sin(a) * 0.5, -0.35, 1], 0.024, 0.12, C.horn, 'metal', 4);
  }
  // ---- boyun: 3 kemik, öne-yukarı S kıvrımı; boğaz parıltısı ----
  const neck = []; let np = torso;
  // v5: daha uzun, kademeli incelen boyun; ön yüzde boğaz plakaları, arkada küçük diken dizisi
  const nr = [[0, 0.16, 0.7, 1.05], [0, 0.31, 0, -0.3], [0, 0.31, 0, -0.38]];
  nr.forEach(([x, y, z, rx], i) => {
    const n = pivot(np, i ? [0, y, 0] : [x, y, z], [rx, 0, 0]); neck.push(n);
    const r0 = 0.15 - i * 0.03;
    seg(n, [0, -0.03, 0], [0, 0.33, 0], r0, C.body);
    for (let k = 0; k < 2; k++) P(n, G.box(r0 * 1.25, 0.1, 0.03), C.belly, [0, 0.07 + k * 0.14, r0 * 0.86], [0.1, 0, 0], null, 'skin'); // boğaz plakaları
    P(n, G.box(0.04, 0.2, 0.02), C.glow, [0, 0.15, r0 * 0.95 + 0.012], [0, 0, 0], null, 'glow'); // boğaz parıltısı
    if (st >= 2 && T !== 'su' && i < 2) spike(n, [0, 0.16, -r0 * 0.85], [0, 0.45, -1], 0.022, 0.07 + st * 0.02, T === 'tas' ? C.horn : C.spk, T === 'tas' ? 'metal' : 'body', 4);
    np = n;
  });
  // ---- kafa (+z ileri), çene ayrı kemik ----
  const head = pivot(np, [0, 0.3, 0], [-0.3, 0, 0]);
  const hp = (x, y, z) => [x * hs, y * hs, z * hs];
  P(head, G.sph(0.16 * hs, 10, 7), C.body, hp(0, 0.04, 0.02), [0, 0, 0], [0.95, 0.82, 1.15]);
  P(head, G.sph(0.11 * hs, 9, 6), C.body, hp(0, 0.0, 0.22), [0, 0, 0], [0.85, 0.62, 1.55]); // burun
  P(head, G.box(0.24 * hs, 0.05 * hs, 0.1 * hs), C.dark, hp(0, 0.1, 0.12), [0.25, 0, 0]); // kaş sırtı
  for (const s of [-1, 1]) {
    P(head, G.sph(0.032 * hs, 6, 4), C.eye, hp(s * 0.085, 0.07, 0.13), [0, 0, 0], [1, 0.7, 1.2], 'glow'); // göz
    P(head, G.sph(0.014 * hs, 5, 3), C.glow, hp(s * 0.035, 0.03, 0.39), [0, 0, 0], null, 'glow'); // burun deliği
    for (let k = 0; k < 2; k++) spike(head, hp(s * (0.05 + k * 0.03), -0.05, 0.33 - k * 0.07), [0, -1, 0.1], 0.012 * hs, 0.06 * hs, 0xf2ead8, 'skin', 4); // üst diş
  }
  const jaw = pivot(head, hp(0, -0.06, 0.04));
  P(jaw, G.sph(0.095 * hs, 8, 5), C.body, hp(0, -0.03, 0.18), [0, 0, 0], [0.8, 0.34, 1.75]);
  for (const s of [-1, 1]) spike(jaw, hp(s * 0.05, -0.01, 0.28), [0, 1, 0.1], 0.011 * hs, 0.05 * hs, 0xf2ead8, 'skin', 4);
  const mouth = pivot(head, hp(0, -0.06, 0.4)); // ağız ucu işaretçisi (kemik, parça yok)
  if (st >= 2) for (const s of [-1, 1]) { spike(head, hp(s * 0.13, -0.02, -0.04), [s * 0.8, -0.1, -0.6], 0.025 * hs, 0.11 * hs, C.horn, 'metal', 4); spike(jaw, hp(s * 0.07, -0.05, 0.02), [s * 0.5, -0.4, -0.7], 0.018 * hs, 0.08 * hs, C.horn, 'metal', 4); } // yanak/çene dikenleri
  // boynuzlar evreye göre
  if (st === 1) for (const s of [-1, 1]) spike(head, hp(s * 0.08, 0.12, -0.04), [s * 0.2, 1, -0.7], 0.03 * hs, 0.08 * hs, C.horn, 'metal', 5);
  else {
    const hl = st === 2 ? 0.26 : 0.42, hr = st === 2 ? 0.045 : (T === 'tas' ? 0.08 : 0.06);
    for (const s of [-1, 1]) {
      const H = pivot(head, hp(s * 0.09, 0.11, -0.05), [-0.9, s * 0.25, s * 0.25]);
      seg(H, [0, 0, 0], [0, hl * 0.55, 0], hr, C.horn, 'metal');
      spike(H, [0, hl * 0.5, 0], [s * 0.1, 1, -0.35], hr * 0.8, hl * 0.55, C.horn, 'metal', 6);
      if (T === 'tas' && st === 3) spike(head, hp(s * 0.12, 0.02, 0.02), [s, 0.2, 0.2], 0.04, 0.16, C.horn, 'metal', 5);
    }
  }
  // tür imzası (evre 3): ateş yelesi / su yüzgeç tacı / zehir dikenleri + kesecikler / taş alın plakası
  if (st === 3) {
    if (T === 'ates') neck.forEach((n, i) => { for (let k = 0; k < 2; k++) { spike(n, [0, 0.06 + k * 0.13, -0.09], [0, 0.35, -1], 0.035, 0.2, C.dark, 'body', 4); spike(n, [0, 0.06 + k * 0.13, -0.27], [0, 0.4, -1], 0.022, 0.1, C.glow, 'glow', 4); } });
    if (T === 'su') { for (let k = -2; k <= 2; k++) { const f = pivot(head, hp(k * 0.05, 0.12, -0.04), [-0.8 + Math.abs(k) * 0.12, 0, k * 0.28]); P(f, G.box(0.018, 0.3 - Math.abs(k) * 0.05, 0.1), C.mem, [0, 0.14 - Math.abs(k) * 0.02, 0], [0, 0, 0], null, 'mem'); spike(f, [0, 0.28 - Math.abs(k) * 0.05, 0], [0, 1, 0], 0.012, 0.06, C.glow, 'glow', 4); } for (const s of [-1, 1]) P(head, G.box(0.015, 0.12, 0.16), C.mem, hp(s * 0.15, 0.0, -0.02), [0, s * 0.5, 0], null, 'skin'); }
    if (T === 'zehir') { for (let k = 0; k < 5; k++) spike(head, hp((k - 2) * 0.05, 0.13, -0.06 - Math.abs(k - 2) * 0.02), [(k - 2) * 0.2, 1, -0.6], 0.02, 0.14, C.spk, 'body', 4); for (const s of [-1, 1]) { P(neck[0], G.sph(0.07, 7, 5), C.glow, [s * 0.11, 0.12, 0.04], [0, 0, 0], [0.8, 1.2, 0.8], 'glow'); spike(jaw, hp(s * 0.06, -0.06, 0.12), [s * 0.3, -1, 0], 0.015, 0.08, C.spk, 'body', 4); } }
    if (T === 'tas') for (const s of [-1, 1]) P(head, G.box(0.07, 0.04, 0.16), C.horn, hp(s * 0.07, 0.11, 0.12), [0.25, s * 0.2, 0], null, 'metal'); // kaş plakaları
  }
  // ---- sırt dikenleri / plakalar ----
  if (st >= 2) {
    const n = st === 2 ? 4 : 7, big = st === 3 && T === 'zehir' ? 1.5 : 1;
    for (let i = 0; i < n; i++) {
      const z = 0.58 - i * (1.2 / (n - 1));
      if (T === 'tas') P(torso, G.box(0.22, 0.05, 0.16), C.horn, [0, 0.34 + Math.cos(z * 1.6) * 0.04, z], [0.1, 0, 0], null, st === 3 ? 'metal' : 'body');
      else if (T === 'su') P(torso, G.cone(0.11, 0.14 + st * 0.05, 3), C.mem, [0, 0.36 + (0.07 + st * 0.025), z], [-0.45, 0, 0], [0.18, 1, 1], 'mem');
      else spike(torso, [0, 0.33 + Math.cos(z * 1.6) * 0.04, z], [0, 1, -0.35], 0.04 * big, (0.1 + st * 0.04) * big, C.spk, 'body', 4);
    }
  }
  if (st === 3 && T === 'tas') for (const s of [-1, 1]) for (let i = 0; i < 3; i++) P(torso, G.box(0.05, 0.18, 0.2), C.horn, [s * 0.33, 0.12, 0.3 - i * 0.3], [0, 0, s * 0.35], null, 'metal'); // yan zırh
  // ---- kuyruk: 6 / 8 / 9 bölüt, uçta tür imzası ----
  const tail = []; const tn = [6, 8, 9][st - 1]; let tp = pivot(torso, [0, 0.02, -0.76], [-0.18, 0, 0]);
  for (let i = 0; i < tn; i++) {
    const p = i ? pivot(tp, [0, 0, -0.17], [0.05, 0, 0]) : tp; tail.push(p);
    const r = 0.13 * (1 - i / (tn + 1)) + 0.02; seg(p, [0, 0, 0.02], [0, 0, -0.19], r, i % 2 ? C.body : C.dark);
    if (st >= 2 && T !== 'su' && i < tn - 2 && i % 2 === 0) spike(p, [0, r * 0.8, -0.08], [0, 1, -0.5], r * 0.4 * (T === 'zehir' ? 1.3 : 1), r * 1.1, T === 'tas' ? C.horn : C.spk, T === 'tas' ? 'metal' : 'body', 4);
    tp = p;
  }
  if (T === 'ates') { spike(tp, [0, 0, -0.17], [0, 0.3, -1], 0.06, 0.2, C.dark, 'body', 4); if (st >= 2) spike(tp, [0, 0.02, -0.3], [0, 0.4, -1], 0.04 + st * 0.01, 0.14 + st * 0.04, C.glow, 'glow', 5); }
  if (T === 'su') for (const s of [-1, 1]) P(tp, G.cone(0.1 + st * 0.03, 0.3, 3), C.mem, [s * 0.07, 0, -0.22], [-Math.PI / 2 + 0.2, 0, s * 0.9], [1, 1, 0.18], 'mem'); // kuyruk yüzgeci
  if (T === 'zehir') { P(tp, G.sph(0.07, 7, 5), C.dark, [0, 0, -0.2], [0, 0, 0], [1, 1, 1.4]); spike(tp, [0, 0.02, -0.27], [0, 0.6, -1], 0.035, 0.12 + st * 0.06, C.glow, 'glow', 5); }
  if (T === 'tas') { P(tp, G.ico(0.09 + st * 0.03, 0), C.dark, [0, 0, -0.24]); if (st >= 2) for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]) spike(tp, [d[0] * 0.1, d[1] * 0.1, -0.24], d, 0.03, 0.1, C.horn, 'metal', 4); }
  // ---- kanatlar: dinlenmede katlı, gövde boyunca geriye yatık ----
  const wl = [0.38, 0.8, 1.3][st - 1];
  const wing = (s) => {
    const W = pivot(torso, [s * 0.24, 0.26, 0.3], [-0.2, s * 1.32, s * 0.04]);
    const el = [s * wl * 0.45, 0.14, 0], tip = [s * wl, 0.06, -0.04];
    seg(W, [0, 0, 0], el, 0.05 + st * 0.008, C.dark); seg(W, el, tip, 0.035 + st * 0.006, C.dark);
    spike(W, tip, [s * 0.4, 0.6, 0.1], 0.025, 0.08 + st * 0.03, C.horn, 'metal', 4); // başparmak pençesi
    const fings = st === 1 ? [[s * wl * 0.9, -0.12, -0.3 * wl]] : [[s * wl * 1.02, -0.14, -0.38 * wl], [s * wl * 0.78, -0.22, -0.66 * wl], [s * wl * 0.42, -0.16, -0.78 * wl]];
    fings.forEach((f) => seg(W, tip, f, 0.018, C.dark));
    P(W, membraneGeo(s, [[0, 0, 0], el, tip, ...fings, [0, -0.12, -0.5 * wl]]), C.mem, [0, 0, 0], [0, 0, 0], null, 'mem');
    return W;
  };
  const wingL = wing(-1), wingR = wing(1);
  return { torso, chest, neck, head, jaw, mouth, legs, tail, wingL, wingR };
};

const DETAIL = { ugallu: 'fur', girtablullu: 'chitin', kulullu: 'scale', kusarikku: 'hide', basmu: 'scale', quad: 'scale', lahmu: 'hide', anzu: 'feather', keeper: 'hide' };
const FX = { ugallu: 'storm', girtablullu: 'poison', kulullu: 'water', kusarikku: 'horn', basmu: 'poison', quad: 'fire', lahmu: 'earth', anzu: 'storm', keeper: 'spirit' };

const WILD = {
  ugallu: { body: 0x9a7a52, mane: 0x3b2416, acc: 0x4a3a2a, claw: 0xa8946a, kilt: 0x8a7a62 },
  girtablullu: { body: 0x231a14, shell: 0x2e231a, shellD: 0x1c140f, acc: 0x6e6252, sting: 0xff5a2a, skin: 0x8a6040, beard: 0x141210 },
  kulullu: { body: 0x2a5f52, dark: 0x173f37, acc: 0x7d6e4a, fin: 0x3d8a7a, skin: 0x8e7058, beard: 0x101418, orb: 0x7dffb0 },
  kusarikku: { body: 0x4a3a32, dark: 0x2e231e, horn: 0xc8bba0, acc: 0x6e5a3a, skin: 0x8a6448, beard: 0x141418, hoof: 0x141010 },
};
const REG = {
  ugallu: { b: 'ugallu' }, girtablullu: { b: 'girtablullu', s: 1.15 }, kulullu: { b: 'kulullu' }, kusarikku: { b: 'kusarikku' },
  ugallu_yabani: { b: 'ugallu', pal: WILD.ugallu }, girtablullu_yabani: { b: 'girtablullu', pal: WILD.girtablullu },
  kulullu_yabani: { b: 'kulullu', pal: WILD.kulullu }, kusarikku_yabani: { b: 'kusarikku', pal: WILD.kusarikku, s: 1.05 },
  uridimmu: { b: 'ugallu', pal: { body: 0xb08850, mane: 0x6b3a1a, acc: PAL.red, claw: 0xe0d0a8, kilt: 0x6b2a20 }, st: 1, s: 1.05 },
  basmu: { b: 'basmu', s: 1.1 }, mushussu: { b: 'quad', s: 1.0 },
  usumgallu: { b: 'quad', pal: { body: 0x2c3b5a, dark: 0x1a2438, acc: PAL.gold, horn: 0xe7c35a, scale: 0x3e5a8a }, s: 1.7 },
  lahmu: { b: 'lahmu', s: 1.3 }, anzu: { b: 'anzu', s: 1.3 }, keeper: { b: 'keeper' },
  ejder_ates: { b: 'dragon', pal: DRAGON.ejder_ates }, ejder_su: { b: 'dragon', pal: DRAGON.ejder_su },
  ejder_zehir: { b: 'dragon', pal: DRAGON.ejder_zehir }, ejder_tas: { b: 'dragon', pal: DRAGON.ejder_tas, s: 1.04 },
};
export const MODEL_HEIGHT = { ejder_ates: 1.9, ejder_su: 1.9, ejder_zehir: 1.9, ejder_tas: 1.9, basmu: 0.9, mushussu: 2.0, usumgallu: 3.2, anzu: 2.6, lahmu: 2.7 };
const PLAYER = new Set(['ugallu', 'girtablullu', 'kulullu', 'kusarikku', 'ejder_ates', 'ejder_su', 'ejder_zehir', 'ejder_tas']);
export const DRAGON_IDS = Object.keys(DRAGON);

export function getModel(id, stage = 3) {
  if (id === 'egg') return makeEgg(stage);
  const reg = REG[id] || REG.basmu;
  const st = reg.st || (typeof stage === 'number' ? Math.max(1, Math.min(3, stage)) : 3);
  const glb = instantiateGlb(id, st);
  if (glb) { const gm = fromGlb(id, st, reg, glb); if (gm) return gm; }
  const group = new THREE.Group(); const root = pivot(group); const o = { root };
  const sc = (reg.s || 1) * (PLAYER.has(id) ? [0, 0.68, 0.85, 1][st] : 1);
  LOWQ = !PLAYER.has(id); let parts; try { parts = B[reg.b](o, st, reg.pal); } finally { LOWQ = false; }
  root.scale.setScalar(sc);
  const isDragon = reg.b === 'dragon';
  const meshes = finalize(group, root, isDragon ? reg.pal.detail : DETAIL[reg.b] || 'hide');
  // gölge diski
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.6 * sc * (reg.b === 'quad' ? 1.4 : isDragon ? 1.55 : 1), 12), shadowMat());
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; group.add(sh);
  const height = (MODEL_HEIGHT[id] || 2.1) * sc;
  const meta = { source: 'code', kind: reg.b, finisherFx: isDragon ? reg.pal.fx : FX[reg.b] || 'storm', impactPoint: new THREE.Vector3(0, height * 0.55, 0.55 * sc), height };
  const model = { id, group, root, parts, meshes, anim: null, height, meta };
  if (isDragon) dragonMeta(model, reg.pal);
  model.anim = makeAnimator(model);
  return model;
}
let _shMat = null;
function shadowMat() { return _shMat || (_shMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })); }

/** Ejderha meta: ağız/göğüs noktaları (model yerel uzayı, dinlenme pozu) ve parıltı ayarı (göz/boğaz/pul). */
function dragonMeta(model, C) {
  const { group, parts } = model; group.updateMatrixWorld(true);
  const loc = (bone) => { const v = new THREE.Vector3(); bone.getWorldPosition(v); return group.worldToLocal(v); };
  model.meta.dragonType = C.type; model.meta.mouth = loc(parts.mouth); model.meta.chest = loc(parts.chest);
  model.meta.impactPoint = model.meta.mouth.clone().setY(model.meta.mouth.y * 0.8);
  /** Canlı ağız/göğüs konumu (animasyon sırasında, dünya uzayında). */
  model.meta.mouthWorld = (out = new THREE.Vector3()) => parts.mouth.getWorldPosition(out);
  model.meta.chestWorld = (out = new THREE.Vector3()) => parts.chest.getWorldPosition(out);
  // modele özel malzeme kopyaları: parıltı diğer modelleri etkilemesin
  const body = model.meshes.find((x) => x.userData.kind === 'body'), glow = model.meshes.find((x) => x.userData.kind === 'glow');
  if (body) { const src = body.material; body.material = upgradeSurface(src.clone(), src.userData.edinSurf); body.material.emissive = new THREE.Color(C.glow); body.material.emissiveIntensity = 0; }
  if (glow) glow.material = glow.material.clone();
  let gk = 0;
  model.meta.glow = (k) => { gk = Math.max(0, Math.min(1, k || 0)); if (body) body.material.emissiveIntensity = gk * 0.3; if (glow) glow.material.color.setScalar(GLOW_BASE + gk * 2.6); };
  Object.defineProperty(model.meta, 'glowLevel', { get: () => gk });
}

function fromGlb(id, st, reg, glb) {
  if (glb.opts?.rigid) { try { return buildRigidGlbModel(id, st, glb, { tween, ease, shadowMat }); } catch (err) { if (typeof console !== 'undefined') console.warn('[Edin] GLB modeli kurulamadı, kod modeli kullanılacak:', err); return null; } }
  const group = new THREE.Group(); const root = pivot(group);
  root.add(glb.scene); glb.scene.rotation.y = glb.rotY || 0; root.scale.setScalar((glb.scale || 1) * (reg.s || 1));
  const height = glb.height || (MODEL_HEIGHT[id] || 2.1) * (reg.s || 1);
  const meta = { source: 'glb', kind: reg.b, finisherFx: FX[reg.b] || 'storm', impactPoint: new THREE.Vector3(0, height * 0.55, 0.55), height };
  const model = { id, group, root, parts: {}, meshes: [], anim: null, height, meta, clips: glb.clips };
  model.anim = makeAnimator(model);
  return model;
}

function makeEgg(grade = 'C') {
  const group = new THREE.Group(); const root = pivot(group);
  const glow = { C: 0x9aa0a6, B: 0x4caf6a, A: 0xa061e0, S: 0xf2c14e }[grade] || 0x9aa0a6;
  const shellP = pivot(root, [0, 0.6, 0]);
  P(shellP, G.sph(0.5, 12, 9), 0xe8dcc0, [0, 0, 0], [0, 0, 0], [0.85, 1.12, 0.85]);
  for (let i = 0; i < 5; i++) P(shellP, G.box(0.08, 0.04, 0.03), glow, [Math.cos(i * 1.3) * 0.41, -0.15 + i * 0.1, Math.sin(i * 1.3) * 0.41], [0, -i * 1.3, 0], null, 'glow');
  P(root, G.cyl(0.55, 0.7, 0.3, 10), PAL.lapis, [0, 0.0, 0]); P(root, G.cyl(0.58, 0.58, 0.06, 10), PAL.gold, [0, 0.16, 0]);
  const meshes = finalize(group, root, 'scale');
  const body = meshes.find((m) => m.userData.kind === 'body');
  if (body && grade !== 'C') { body.material = upgradeSurface(body.material.clone(), body.material.userData.edinSurf); body.material.emissive = new THREE.Color(glow); body.material.emissiveIntensity = grade === 'S' ? 0.55 : 0.3; }
  const meta = { source: 'code', kind: 'egg', finisherFx: 'spirit', impactPoint: new THREE.Vector3(0, 0.6, 0.4), height: 1.4 };
  const model = { id: 'egg', group, root, parts: { shell: shellP }, meshes, height: 1.4, meta };
  model.anim = makeAnimator(model); return model;
}

// ====================================================================================
// ANİMASYON: katmanlı poz. Her parçanın dinlenme pozu saklanır; her karede
//   son poz = dinlenme + bekleme (nefes, sallanma) + yürüme + savunma duruşu + eylem katmanı.
// Eylemler "act" katmanını tween'ler; bitişte 0'a yumuşakça döner (ani geçiş yok).
// ====================================================================================
const lerp = (a, b, k) => a + (b - a) * k;
function makeAnimator(m) {
  const p = m.parts; const root = m.root; const kind = m.meta?.kind || 'generic';
  let t = Math.random() * 10, state = 'idle', seq = 0;
  let walkAmp = 0, walkTarget = 0, walkPh = 0, guardW = 0, guardT = 0, idleW = 1, idleT = 1, restW = 0, restT = 0;
  const DT = m.meta?.dragonType; // ejderha türü (ates/su/zehir/tas) ya da undefined
  const base = new Map();
  const reg = (o) => { if (o && o.isObject3D && !base.has(o)) base.set(o, { r: o.rotation.clone(), p: o.position.clone() }); };
  reg(root); Object.values(p).forEach((v) => (Array.isArray(v) ? v.forEach(reg) : reg(v)));
  const act = {}; // "parça.özellik" → değer (özellik: rx ry rz px py pz)
  const get = (k) => act[k] || 0;
  const objs = (name) => (name === 'root' ? [root] : [].concat(p[name] || []).filter(Boolean));
  const add = (o, prop, v) => { if (!v) return; if (prop[0] === 'r') o.rotation[prop[1]] += v; else o.position[prop[1]] += v; };

  // ---- eylem yardımcıları ----
  const blendTo = (dur, targets, e = ease.inOut) => {
    const my = seq; const from = {}; const keys = new Set([...Object.keys(targets)]);
    keys.forEach((k) => (from[k] = get(k)));
    return tween(dur, (k) => { if (my !== seq) return; const kk = e(k); keys.forEach((key) => (act[key] = lerp(from[key], targets[key], kk))); });
  };
  const clearAct = (dur = 0.18) => { const z = {}; Object.keys(act).forEach((k) => (z[k] = 0)); return blendTo(dur, z); };
  const begin = (s) => { seq++; state = s; idleT = 0.35; return seq; };
  const end = async (my, dur = 0.2) => { if (my !== seq) return; await clearAct(dur); if (my === seq) { state = 'idle'; idleT = 1; } };

  let flashing = null;
  const flash = (color, power = 0.9) => {
    const list = (m.meshes || []).filter((x) => x.material && x.material.emissive);
    if (!list.length || flashing) return Promise.resolve();
    const saved = list.map((x) => x.material); list.forEach((x) => { const src = x.material; x.material = src.userData.edinSurf ? upgradeSurface(src.clone(), src.userData.edinSurf) : src.clone(); x.material.emissive = new THREE.Color(color); x.material.emissiveIntensity = power; });
    flashing = tween(0.24, (k) => list.forEach((x) => (x.material.emissiveIntensity = power * (1 - k)))).then(() => { list.forEach((x, i) => { x.material.dispose(); x.material = saved[i]; }); flashing = null; });
    return flashing;
  };

  // ---- yaratığa özel saldırı pozları (hazırlık / vuruş) ----
  const POSE = {
    quickPrep: { dragon: { 'neck.rx': -0.18, 'head.rx': -0.25, 'jaw.rx': 0.25, 'torso.rx': -0.08 }, ugallu: { 'armR.rx': -1.9, 'armR.rz': 0.5, 'torso.ry': -0.35 }, girtablullu: { 'claws.rx': -0.5, 'armR.rx': -1.2, 'torso.ry': -0.3 }, kulullu: { 'armL.rx': -1.4, 'torso.ry': 0.3 }, kusarikku: { 'armL.rx': -1.0, 'armL.rz': 0.4, 'torso.ry': 0.3 } },
    quickHit: { dragon: { 'neck.rx': 0.2, 'head.rx': 0.3, 'jaw.rx': 0.55, 'torso.rx': 0.1 }, ugallu: { 'armR.rx': 0.9, 'armR.rz': -0.3, 'torso.ry': 0.35, 'torso.rx': 0.25 }, girtablullu: { 'claws.rx': 0.4, 'armR.rx': -1.6, 'torso.ry': 0.3, 'torso.rx': 0.2 }, kulullu: { 'armL.rx': -1.5, 'torso.ry': -0.25, 'torso.rx': 0.25 }, kusarikku: { 'armL.rx': -1.4, 'armL.rz': -0.2, 'torso.ry': -0.3, 'torso.rx': 0.2 } },
    heavyPrep: { dragon: { 'torso.rx': -0.42, 'neck.rx': -0.22, 'head.rx': -0.3, 'jaw.rx': 0.7, 'wingL.ry': 1.0, 'wingR.ry': -1.0, 'wingL.rz': -0.3, 'wingR.rz': 0.3, 'tail.rx': -0.05 }, ugallu: { 'armR.rx': -2.8, 'armL.rx': -2.8, 'torso.rx': -0.45, 'head.rx': -0.4 }, girtablullu: { 'tail.rx': 0.35, 'abd.rx': -0.25, 'torso.rx': -0.35 }, kulullu: { 'root.ry': -1.2, 'tail.ry': 0.6, 'torso.rx': -0.2 }, kusarikku: { 'head.rx': 0.65, 'torso.rx': 0.55, 'armL.rx': -0.4, 'armR.rx': -0.4 } },
    heavyHit: { dragon: { 'torso.rx': 0.28, 'neck.rx': 0.24, 'head.rx': 0.35, 'jaw.rx': 0.35, 'wingL.ry': 0.7, 'wingR.ry': -0.7, 'tail.rx': 0.06 }, ugallu: { 'armR.rx': 0.8, 'armL.rx': 0.8, 'torso.rx': 0.6, 'head.rx': 0.2 }, girtablullu: { 'tail.rx': -0.55, 'abd.rx': 0.2, 'torso.rx': 0.3 }, kulullu: { 'root.ry': 1.6, 'tail.ry': -0.8, 'torso.rx': 0.2 }, kusarikku: { 'head.rx': -0.35, 'torso.rx': 0.1, 'armL.rx': -0.8, 'armR.rx': -0.8 } },
  };
  const pose = (name) => POSE[name][kind] || { quickPrep: { 'torso.rx': -0.3, 'head.rx': -0.3, 'neck.rx': -0.4, 'armR.rx': -1.6 }, quickHit: { 'torso.rx': 0.35, 'head.rx': 0.3, 'neck.rx': 0.3, 'armR.rx': 0.8 }, heavyPrep: { 'torso.rx': -0.5, 'head.rx': -0.5, 'neck.rx': -0.7, 'armR.rx': -2.6, 'armL.rx': -2.6, 'tail.rx': 0.4 }, heavyHit: { 'torso.rx': 0.6, 'head.rx': 0.45, 'neck.rx': 0.5, 'armR.rx': 0.8, 'armL.rx': 0.8, 'tail.rx': -0.4 } }[name];

  const a = {
    update(dt) {
      t += dt;
      // savunma ve yürüme yumuşak geçişleri
      guardW += (guardT - guardW) * Math.min(1, dt * 10); idleW += (idleT - idleW) * Math.min(1, dt * 6);
      walkAmp += (walkTarget - walkAmp) * Math.min(1, dt * 8); walkTarget = 0; walkPh += dt * 9 * Math.max(0.35, walkAmp);
      for (const [o, b] of base) { o.rotation.copy(b.r); o.position.copy(b.p); }
      if (state === 'dead') { for (const k in act) { const [n, pr] = k.split('.'); objs(n).forEach((o) => add(o, pr, act[k])); } return; }
      const br = Math.sin(t * 2.2), iw = idleW * (1 - walkAmp * 0.6);
      // bekleme: nefes, baş, kollar, kuyruk dalgası, kanat, yüzgeç
      if (p.torso) { p.torso.position.y += br * 0.018 * iw; p.torso.rotation.x += br * 0.025 * iw; }
      if (p.head) { p.head.rotation.y += Math.sin(t * 0.7) * 0.14 * iw; p.head.rotation.x += Math.sin(t * 1.3) * 0.04 * iw; }
      if (p.mane) p.mane.rotation.z += Math.sin(t * 3.1) * 0.05;
      if (p.hood) p.hood.rotation.z += Math.sin(t * 1.9) * 0.04 * iw;
      if (p.armL) { p.armL.rotation.x += br * 0.07 * iw; p.armL.rotation.z += -0.05 * iw; }
      if (p.armR) { p.armR.rotation.x += -br * 0.07 * iw - 0.1 * iw; p.armR.rotation.z += 0.05 * iw; }
      const tl = [].concat(p.tail || []);
      tl.forEach((s, i) => { s.rotation.y += Math.sin(t * 1.8 - i * 0.7) * (0.12 + i * 0.03); s.rotation.x += Math.sin(t * 1.3 - i * 0.5) * 0.05; });
      if (p.segs) p.segs.forEach((s, i) => (s.rotation.y += Math.sin(t * 2 + i) * (0.16 + walkAmp * 0.2)));
      if (p.wingL) { const w = Math.sin(t * (kind === 'anzu' ? 2.4 : 1.6)) * (kind === 'anzu' ? 0.35 : 0.12); p.wingL.rotation.y += w; p.wingR.rotation.y -= w; p.wingL.rotation.z += w * 0.5; p.wingR.rotation.z -= w * 0.5; }
      if (p.claws) p.claws.forEach((c, i) => (c.rotation.y += Math.sin(t * 2.6 + i * 1.7) * 0.08));
      if (p.legs && kind !== 'anzu') p.legs.forEach((l, i) => (l.rotation.x += Math.sin(t * 3 + i * 1.7) * 0.03));
      if (m.id === 'egg') root.rotation.y += (t * 0.4) % (Math.PI * 2);
      if (kind === 'dragon') { // nefes: göğüs kabarır, boyun hafif S salınımı, çene arada aralanır
        const nk = [].concat(p.neck || []);
        nk.forEach((n, i) => { n.rotation.x += Math.sin(t * 1.1 - i * 0.6) * 0.035 * iw; n.rotation.y += Math.sin(t * 0.55 - i * 0.4) * 0.08 * iw; });
        if (p.jaw) p.jaw.rotation.x += Math.max(0, Math.sin(t * 0.9)) * 0.06 * iw;
        if (p.chest) p.chest.scale.setScalar(1 + br * 0.03);
        restW += (restT - restW) * Math.min(1, dt * 3);
        if (restW > 0.01) { const w = restW; root.position.y -= 0.32 * w; (p.legs || []).forEach((l, i) => (l.rotation.x += (i < 2 ? -0.95 : 1.0) * w));
          nk.forEach((n, i) => { n.rotation.x += (i ? 0.25 : 0.35) * w; n.rotation.y += 0.32 * w; }); if (p.head) p.head.rotation.x += 0.25 * w;
          tl.forEach((sg) => (sg.rotation.y += 0.22 * w)); if (p.wingL) { p.wingL.rotation.z += 0.2 * w; p.wingR.rotation.z -= 0.2 * w; } }
      }
      // yürüme
      if (walkAmp > 0.01) {
        const s = Math.sin(walkPh), c = Math.cos(walkPh), w = walkAmp;
        if (p.legL) { p.legL.rotation.x += s * 0.65 * w; p.legR.rotation.x -= s * 0.65 * w; }
        if (p.armL) { p.armL.rotation.x -= s * 0.45 * w; p.armR.rotation.x += s * 0.45 * w; }
        if (p.legs) p.legs.forEach((l, i) => { const ph = walkPh + (i % 2 ? Math.PI : 0) + Math.floor(i / 2) * 1.1; l.rotation.x += Math.sin(ph) * 0.45 * w; l.rotation.z += Math.cos(ph) * 0.12 * w; });
        if (p.torso) p.torso.rotation.z += c * 0.05 * w;
        if (kind === 'kulullu') { tl.forEach((sg, i) => (sg.rotation.x += Math.sin(walkPh - i) * 0.25 * w)); root.position.y += Math.abs(s) * 0.12 * w; }
        else if (kind === 'dragon') { [].concat(p.neck || []).forEach((n, i) => (n.rotation.x += Math.sin(walkPh * 2 - i * 0.8) * 0.05 * w)); tl.forEach((sg, i) => (sg.rotation.y += Math.sin(walkPh - i * 0.6) * 0.1 * w)); root.position.y += Math.abs(s) * 0.035 * w; }
        else root.position.y += Math.abs(s) * 0.06 * w;
      }
      // savunma duruşu
      if (guardW > 0.01) {
        const g = guardW;
        if (kind === 'dragon') { if (p.wingL) { p.wingL.rotation.y += 1.9 * g; p.wingR.rotation.y -= 1.9 * g; p.wingL.rotation.z -= 0.35 * g; p.wingR.rotation.z += 0.35 * g; } [].concat(p.neck || []).forEach((n) => (n.rotation.x += 0.12 * g)); if (p.torso) p.torso.rotation.x -= 0.1 * g; }
        else if (kind === 'kusarikku') { if (p.armL) { p.armL.rotation.x -= 1.15 * g; p.armL.rotation.z += 0.5 * g; } if (p.torso) p.torso.rotation.x += 0.15 * g; }
        else if (kind === 'girtablullu') { p.claws?.forEach((c, i) => { c.rotation.y += (i ? -0.6 : 0.6) * g; c.rotation.x -= 0.3 * g; }); tl.forEach((s) => (s.rotation.x -= 0.12 * g)); }
        else if (kind === 'kulullu') { if (p.armL) p.armL.rotation.x -= 1.4 * g; if (p.armR) { p.armR.rotation.x -= 1.1 * g; p.armR.rotation.z -= 0.6 * g; } }
        else { if (p.armL) { p.armL.rotation.x -= 1.3 * g; p.armL.rotation.z += 0.7 * g; } if (p.armR) { p.armR.rotation.x -= 1.3 * g; p.armR.rotation.z -= 0.7 * g; } if (p.wingL) { p.wingL.rotation.y -= 0.8 * g; p.wingR.rotation.y += 0.8 * g; } }
        if (p.head) p.head.rotation.x += 0.25 * g;
        root.position.y -= 0.06 * g;
      }
      const fl0 = kind === 'dragon' && p.legs && p.legs[0]; if (fl0 && fl0.userData._dig) fl0.rotation.x -= fl0.userData._dig;
      // eylem katmanı
      for (const k in act) { const v = act[k]; if (!v) continue; const [n, pr] = k.split('.'); objs(n).forEach((o) => add(o, pr, v)); }
    },
    idle() { if (state !== 'dead') { seq++; state = 'idle'; idleT = 1; return clearAct(0.2); } return Promise.resolve(); },
    walk(x, y) { const sp = y === undefined ? x : y; walkTarget = Math.max(0, Math.min(1, sp || 0)); },
    guard(on = true) { guardT = on ? 1 : 0; },
    attack(onImpact) { return a.attackQuick(onImpact); },
    async attackQuick(onImpact) { // ~0,35 sn, temas ~0,18 sn
      const my = begin('attack');
      await blendTo(0.11, { ...pose('quickPrep'), 'root.pz': -0.15 }, ease.out);
      await blendTo(0.07, { ...pose('quickHit'), 'root.pz': 1.25 }, ease.in);
      onImpact && onImpact();
      await blendTo(0.05, { 'root.pz': 1.15 });
      await end(my, 0.13);
    },
    async attackHeavy(onImpact) { // ~0,8 sn, temas ~0,55 sn
      const my = begin('attack');
      await blendTo(0.38, { ...pose('heavyPrep'), 'root.pz': -0.35, 'root.py': 0.08 }, ease.out);
      await blendTo(0.06, { ...pose('heavyPrep'), 'root.pz': -0.4, 'root.py': 0.12 });
      await blendTo(0.11, { ...pose('heavyHit'), 'root.pz': 1.65, 'root.py': 0 }, ease.in);
      onImpact && onImpact();
      await blendTo(0.1, { 'root.pz': 1.55, 'root.py': -0.04 });
      await end(my);
    },
    async finisher(onImpact) { // ~1,1 sn, temas ~0,75 sn; yaratığa özel
      const my = begin('attack');
      if (DT === 'ates') { // şaha kalkıp kanat aç, boyun geri çekilir; öne eğilip ateş püskürtme duruşu
        await blendTo(0.3, { 'torso.rx': -0.5, 'root.py': 0.18, 'neck.rx': -0.3, 'head.rx': -0.3, 'jaw.rx': 0.2, 'wingL.ry': 1.15, 'wingR.ry': -1.15, 'wingL.rz': -0.45, 'wingR.rz': 0.45 }, ease.out);
        await blendTo(0.25, { 'torso.rx': -0.55, 'neck.rx': -0.36, 'jaw.rx': 0.95, 'chest.py': 0.04 }, ease.inOut);
        await blendTo(0.2, { 'torso.rx': 0.22, 'root.py': 0, 'root.pz': 1.2, 'neck.rx': 0.26, 'head.rx': 0.3, 'jaw.rx': 1.0, 'wingL.rz': -0.1, 'wingR.rz': 0.1 }, ease.in);
      } else if (DT === 'su') { // kanatları açıp yükselme, gövdeyi savurup dalga
        await blendTo(0.3, { 'root.py': 0.35, 'torso.rx': -0.3, 'wingL.ry': 1.2, 'wingR.ry': -1.2, 'wingL.rz': -0.6, 'wingR.rz': 0.6, 'neck.rx': -0.2, 'root.ry': -0.7 }, ease.out);
        await blendTo(0.25, { 'root.py': 0.45, 'root.ry': -0.9, 'tail.ry': 0.25, 'jaw.rx': 0.5 }, ease.inOut);
        await blendTo(0.2, { 'root.py': 0.05, 'root.ry': 0.5, 'root.pz': 1.5, 'tail.ry': -0.3, 'torso.rx': 0.2, 'wingL.rz': 0.2, 'wingR.rz': -0.2, 'neck.rx': 0.2 }, ease.in);
      } else if (DT === 'zehir') { // kuyruğu sırtın üstüne kıvırıp iğneyle öne saplama
        await blendTo(0.3, { 'tail.rx': 0.33, 'torso.rx': -0.12, 'neck.rx': 0.12, 'jaw.rx': 0.4, 'wingL.ry': 0.6, 'wingR.ry': -0.6 }, ease.out);
        await blendTo(0.25, { 'tail.rx': 0.4, 'root.pz': 0.5, 'neck.rx': 0.18 }, ease.inOut);
        await blendTo(0.2, { 'tail.rx': 0.12, 'root.pz': 1.6, 'torso.rx': 0.15, 'jaw.rx': 0.2 }, ease.in);
      } else if (DT === 'tas') { // şaha kalkıp yere vuruş, boynuzlarla hücum
        await blendTo(0.25, { 'torso.rx': -0.55, 'root.py': 0.3, 'neck.rx': -0.2 }, ease.out);
        await blendTo(0.15, { 'torso.rx': 0.25, 'root.py': -0.06, 'neck.rx': 0.15 }, ease.in);
        await blendTo(0.15, { 'neck.rx': 0.32, 'head.rx': 0.45, 'root.pz': 0.4 }, ease.out);
        await blendTo(0.2, { 'neck.rx': 0.1, 'head.rx': -0.35, 'root.pz': 1.8, 'torso.rx': 0.05, 'root.py': 0.1 }, ease.in);
      } else if (kind === 'ugallu') { // sıçrayıp kanat açarak iki pençeyle dalış
        await blendTo(0.3, { 'root.py': -0.15, 'torso.rx': -0.4, 'armR.rx': -2.6, 'armL.rx': -2.6, 'wingL.ry': -0.9, 'wingR.ry': 0.9, 'head.rx': -0.5 }, ease.out);
        await blendTo(0.25, { 'root.py': 1.1, 'root.pz': 0.6, 'root.rx': -0.3, 'wingL.rz': -0.7, 'wingR.rz': 0.7, 'armR.rx': -3.0, 'armL.rx': -3.0 }, ease.out);
        await blendTo(0.2, { 'root.py': 0, 'root.pz': 1.8, 'root.rx': 0.25, 'armR.rx': 1.0, 'armL.rx': 1.0, 'torso.rx': 0.6, 'wingL.rz': 0.3, 'wingR.rz': -0.3 }, ease.in);
      } else if (kind === 'girtablullu') { // şaha kalkıp üç zehirli iğne
        await blendTo(0.25, { 'abd.rx': -0.35, 'root.py': 0.15, 'tail.rx': 0.3, 'claws.rx': -0.6 }, ease.out);
        for (let i = 0; i < 2; i++) { await blendTo(0.09, { 'tail.rx': -0.45, 'root.pz': 0.9 + i * 0.2 }, ease.in); await blendTo(0.08, { 'tail.rx': 0.25 }); }
        await blendTo(0.13, { 'tail.rx': -0.65, 'abd.rx': 0.25, 'root.pz': 1.6, 'root.py': 0, 'claws.rx': 0.5 }, ease.in);
      } else if (kind === 'kulullu') { // yükselip su küresini iki eliyle fırlatma
        await blendTo(0.35, { 'root.py': 0.7, 'armL.rx': -2.8, 'armR.rx': -2.8, 'armL.rz': -0.3, 'armR.rz': 0.3, 'head.rx': -0.4, 'tail.rx': 0.4 }, ease.out);
        await blendTo(0.2, { 'root.py': 0.75, 'root.ry': Math.PI * 2 }, ease.inOut);
        act['root.ry'] = 0;
        await blendTo(0.2, { 'root.py': 0.1, 'root.pz': 1.2, 'armL.rx': -1.5, 'armR.rx': -1.5, 'armL.rz': 0, 'armR.rz': 0, 'torso.rx': 0.4, 'head.rx': 0.2 }, ease.in);
      } else if (kind === 'kusarikku') { // yere vuruş + boynuzla yukarı savurma
        await blendTo(0.25, { 'root.py': 0.55, 'armL.rx': -1.2, 'head.rx': -0.3, 'legL.rx': -0.6, 'legR.rx': 0.3 }, ease.out);
        await blendTo(0.15, { 'root.py': -0.1, 'legL.rx': 0, 'legR.rx': 0, 'torso.rx': 0.3 }, ease.in);
        await blendTo(0.15, { 'head.rx': 0.75, 'torso.rx': 0.6, 'root.pz': 0.5 }, ease.out);
        await blendTo(0.2, { 'head.rx': -0.8, 'torso.rx': -0.3, 'root.pz': 1.7, 'root.py': 0.15, 'armL.rx': -1.6 }, ease.in);
      } else { // genel: dönüp ağır darbe
        await blendTo(0.35, { ...pose('heavyPrep'), 'root.pz': -0.4, 'root.py': 0.2 }, ease.out);
        await blendTo(0.2, { 'root.ry': Math.PI * 2, 'root.py': 0.4 }, ease.inOut); act['root.ry'] = 0;
        await blendTo(0.2, { ...pose('heavyHit'), 'root.pz': 1.7, 'root.py': 0 }, ease.in);
      }
      onImpact && onImpact();
      await blendTo(0.16, { 'root.pz': get('root.pz') * 0.92, 'root.py': 0 });
      await end(my);
    },
    async hit(arg) { // arg: ağır mı (true) ya da parıltı rengi (sayı)
      const heavy = arg === true; const color = typeof arg === 'number' ? arg : 0xff2a2a;
      if (state === 'dead') return; const my = begin('hit'); flash(color, heavy ? 1.2 : 0.9);
      await blendTo(heavy ? 0.12 : 0.08, { 'root.pz': heavy ? -0.45 : -0.22, 'torso.rx': heavy ? -0.45 : -0.22, 'head.rx': heavy ? -0.5 : -0.25, 'root.rz': heavy ? 0.12 : 0.05 }, ease.out);
      await blendTo(heavy ? 0.12 : 0.06, { 'root.pz': heavy ? -0.5 : -0.25, 'root.px': heavy ? 0.04 : 0.02 });
      await end(my);
    },
    async block() { // savunmayla karşılama
      const my = begin('hit'); flash(0x88aaff, 0.8);
      await blendTo(0.08, { 'root.pz': -0.15, 'torso.rx': -0.12, 'root.ry': 0.2 }, ease.out);
      await end(my);
    },
    async dodge() {
      const my = begin('dodge');
      await blendTo(0.16, { 'root.px': 0.85, 'root.py': 0.3, 'root.rz': -0.32, 'torso.rz': -0.2 }, ease.out);
      await blendTo(0.08, { 'root.px': 0.9, 'root.py': 0.1, 'root.rz': -0.2 });
      await end(my);
    },
    async die() {
      if (kind === 'dragon') { // yana devrilir, kanatlar yayılır, boyun yere düşer
        seq++; state = 'dead'; const my2 = seq; restT = 0;
        await blendTo(0.18, { 'torso.rx': -0.25, 'neck.rx': -0.15, 'jaw.rx': 0.6 }, ease.out);
        if (my2 !== seq) return;
        await blendTo(0.6, { 'root.rz': 1.38, 'root.py': 0.22, 'torso.rx': 0, 'neck.rx': 0.32, 'head.rx': 0.3, 'jaw.rx': 0.35, 'legs.rz': 0.35, 'wingL.ry': 1.0, 'wingR.ry': -0.9, 'tail.ry': 0.12 }, ease.out);
        return;
      }
      seq++; state = 'dead'; const my = seq;
      await blendTo(0.15, { 'root.pz': -0.2, 'torso.rx': -0.4, 'head.rx': -0.5 }, ease.out);
      if (my !== seq) return;
      await blendTo(0.55, { 'root.rx': -1.45, 'root.py': -0.1, 'root.pz': -0.45, 'torso.rx': -0.2, 'head.rx': 0.3, 'armL.rz': -0.8, 'armR.rz': 0.8 }, ease.out);
    },
    async victory() {
      if (kind === 'dragon') { // şaha kalkıp kanat açar, kükrer
        const myd = begin('victory');
        await blendTo(0.25, { 'torso.rx': -0.45, 'root.py': 0.2, 'neck.rx': -0.3, 'head.rx': -0.35, 'jaw.rx': 0.9, 'wingL.ry': 1.2, 'wingR.ry': -1.2, 'wingL.rz': -0.7, 'wingR.rz': 0.7, 'tail.rx': 0.06 }, ease.out);
        await blendTo(0.35, { 'torso.rx': -0.4, 'jaw.rx': 0.75, 'wingL.rz': -0.5, 'wingR.rz': 0.5 }, ease.inOut);
        await end(myd, 0.3); return;
      }
      const my = begin('victory');
      await blendTo(0.2, { 'root.py': 0.3, 'armR.rz': 2.2, 'armL.rz': -2.2, 'head.rx': -0.55, 'wingL.ry': -0.8, 'wingR.ry': 0.8, 'tail.rx': 0.3 }, ease.out);
      await blendTo(0.25, { 'root.py': 0, 'armR.rz': 2.0, 'armL.rz': -2.0 }, ease.inOut);
      await end(my);
    },
    /** Ruh özü emme: baş hedefe döner, ağız açılır, çekme (nefes içe), sonda göz/boğaz/pul parıltısı. */
    async absorb(target, dur = 1) {
      if (state === 'dead') return; const my = begin('absorb'); dur = Math.max(0.4, dur || 1);
      let yaw = 0, pitch = 0.15;
      if (target && Number.isFinite(target.x)) { m.group.updateMatrixWorld(true); const l = m.group.worldToLocal(target.clone()); const dx = l.x, dz = l.z - (m.meta.chest?.z || 0); yaw = Math.max(-1.3, Math.min(1.3, Math.atan2(dx, Math.max(0.05, dz)))); pitch = Math.max(-0.2, Math.min(0.45, 0.6 - Math.atan2((m.meta.mouth?.y || 1.4) - l.y, Math.hypot(dx, dz) || 1))); }
      const n = Math.max(1, [].concat(p.neck || []).length);
      await blendTo(dur * 0.25, { 'neck.ry': yaw / n, 'root.ry': yaw * 0.25, 'neck.rx': pitch / n, 'head.rx': -0.1, 'jaw.rx': 0.75, 'wingL.ry': 0.3, 'wingR.ry': -0.3 }, ease.out);
      if (my !== seq) return;
      await tween(dur * 0.5, (k) => { if (my !== seq) return; act['torso.rx'] = -0.08 * Math.sin(k * Math.PI); act['jaw.rx'] = 0.75 + Math.sin(k * Math.PI * 6) * 0.06; if (m.meta.glow) m.meta.glow(k * 0.5); });
      if (my !== seq) return;
      await blendTo(dur * 0.25, { 'jaw.rx': 0, 'neck.ry': yaw / n * 0.4, 'root.ry': yaw * 0.15, 'torso.rx': -0.05, 'neck.rx': 0 }, ease.inOut);
      if (m.meta.glow) { const g0 = 0.5; await tween(0.12, (k) => m.meta.glow(g0 + 0.5 * k)); tween(0.45, (k) => m.meta.glow(1 - k)); }
      await end(my, 0.25);
    },
    /** Yemek: yiyeceğe eğilir, çiğner, yutar. */
    async eat(dur = 1.2) {
      if (state === 'dead') return; const my = begin('eat'); dur = Math.max(0.6, dur || 1.2);
      await blendTo(dur * 0.25, { 'neck.rx': 0.42, 'head.rx': 0.35, 'torso.rx': 0.08, 'jaw.rx': 0.45 }, ease.out);
      await tween(dur * 0.5, (k) => { if (my !== seq) return; act['jaw.rx'] = 0.2 + Math.abs(Math.sin(k * Math.PI * 4)) * 0.3; act['head.rx'] = 0.35 + Math.sin(k * Math.PI * 4) * 0.05; });
      if (my !== seq) return;
      await blendTo(dur * 0.25, { 'neck.rx': -0.08, 'head.rx': -0.25, 'jaw.rx': 0, 'torso.rx': -0.04 }, ease.inOut); // yutma: baş yukarı
      await end(my, 0.25);
    },
    /** Dinlenme (kamp): yere çöker, boynu yana kıvrılır. on=false ile kalkar. */
    rest(on = true) { if (state !== 'dead') restT = on ? 1 : 0; },
    /** Toplama: koklar, ön ayakla eşeler, ağzıyla alır. */
    async gather(dur = 0.8) {
      if (state === 'dead') return; const my = begin('gather'); dur = Math.max(0.4, dur || 0.8);
      await blendTo(dur * 0.25, { 'neck.rx': 0.38, 'head.rx': 0.3 }, ease.out);
      const fl = [].concat(p.legs || [])[0];
      await tween(dur * 0.45, (k) => { if (my !== seq) return; act['head.rx'] = 0.3 + Math.sin(k * Math.PI * 4) * 0.08; if (fl) fl.userData._dig = Math.sin(k * Math.PI * 2) * 0.6; });
      if (fl) fl.userData._dig = 0;
      await blendTo(dur * 0.3, { 'jaw.rx': 0.35, 'neck.rx': 0.1, 'head.rx': -0.1 }, ease.inOut);
      await end(my, 0.2);
    },
    async shake(n = 1) {
      const my = begin('shake');
      await tween(0.5 * n, (k) => { if (my !== seq) return; act['root.rz'] = Math.sin(k * 60) * 0.18 * (0.4 + k); act['root.px'] = Math.sin(k * 45) * 0.05; });
      await end(my);
    },
    reset() { seq++; state = 'idle'; idleW = 1; idleT = 1; guardT = 0; guardW = 0; restT = 0; restW = 0; if (m.meta?.glow) m.meta.glow(0); for (const k in act) act[k] = 0; for (const [o, b] of base) { o.rotation.copy(b.r); o.position.copy(b.p); } },
    get state() { return state; },
  };
  return a;
}

// ---------- dünya dekorları (eskisi gibi; çevre sanatçısının dosyaları kullanır) ----------
export function makeGate(scale = 1) {
  const g = new THREE.Group();
  const brick = mat(PAL.lapis), brickD = mat(PAL.lapisD), gold = mat(PAL.gold), mud = mat(PAL.mud);
  const Q = (geo, m, pos, rot = [0, 0, 0]) => { const x = new THREE.Mesh(geo, m); x.position.set(...pos); x.rotation.set(...rot); g.add(x); return x; };
  for (const s of [-1, 1]) {
    Q(G.box(1.6, 5, 1.6), brick, [s * 2.3, 2.5, 0]);
    for (let i = 0; i < 6; i++) Q(G.box(0.36, 0.5, 0.3), mud, [s * 2.3 - 0.6 + (i % 3) * 0.6, 5.25, i < 3 ? 0.65 : -0.65]);
    for (let i = 0; i < 3; i++) Q(G.box(0.9, 0.5, 0.06), gold, [s * 2.3, 1.2 + i * 1.3, 0.82]);
  }
  Q(G.box(3.2, 1.0, 1.4), brickD, [0, 4.6, 0]);
  Q(new THREE.CylinderGeometry(1.5, 1.5, 1.4, 10, 1, false, 0, Math.PI), brick, [0, 3.4, 0], [Math.PI / 2, 0, Math.PI / 2]);
  Q(G.box(3.4, 0.14, 1.5), gold, [0, 4.05, 0]);
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.4), new THREE.MeshBasicMaterial({ color: 0x6fd7ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  portal.position.set(0, 1.9, 0); g.add(portal); g.userData.portal = portal;
  g.scale.setScalar(scale); return g;
}
export function makeProp(kind, rng = Math.random) {
  const g = new THREE.Group();
  const Q = (geo, color, pos, rot = [0, 0, 0], scl) => { const x = new THREE.Mesh(geo, mat(color)); x.position.set(...pos); x.rotation.set(...rot); if (scl) x.scale.set(...scl); g.add(x); return x; };
  if (kind === 'reed') { for (let i = 0; i < 5; i++) Q(G.cone(0.05, 1 + rng() * 0.8, 3), i % 2 ? PAL.reed : PAL.reedD, [(rng() - 0.5) * 0.6, 0.5, (rng() - 0.5) * 0.6], [(rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3]); }
  else if (kind === 'palm') { Q(G.cyl(0.1, 0.16, 2.6, 5), PAL.mud, [0, 1.3, 0], [0.08, 0, 0.05]); for (let i = 0; i < 6; i++) Q(G.box(1.2, 0.04, 0.3), PAL.reed, [Math.cos(i) * 0.5, 2.55, Math.sin(i) * 0.5], [0, -i, -0.35]); }
  else if (kind === 'rock') { Q(G.ico(0.5 + rng() * 0.5, 0), PAL.sandD, [0, 0.3, 0], [rng(), rng(), rng()], [1, 0.6, 1]); }
  else if (kind === 'ruin') { Q(G.box(0.6, 1.5 + rng(), 0.6), PAL.mud, [0, 0.8, 0]); Q(G.box(1.4, 0.4, 0.6), PAL.mudD, [0.4, 0.2, 0.6], [0, 0.4, 0]); Q(G.box(0.62, 0.15, 0.62), PAL.lapis, [0, 1.6, 0]); }
  else if (kind === 'crystal') { const x = Q(G.oct(0.4), 0x7a5cff, [0, 0.6, 0], [0, rng(), 0], [0.6, 1.4, 0.6]); x.material = mat(0x7a5cff, { emissive: 0x3a1f99 }); }
  return g;
}
