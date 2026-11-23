// Bölge ortamları: gökyüzü, ışık, sis, yükseklik haritalı arazi, dekor, canlılık.
// Oyun alanı (0..W, 0..H) neredeyse düz kalır; yükselti, kayalık ve büyük yapılar kenarlarda ve uzak planda.
import * as THREE from 'three';
import { texSet, crackEmissive, noise2, rng, glowTex, texCfg } from './textures.js';
import { attachSunShadow } from '../stage.js';
import { makeSky, makeParticles, makeWater, makeGrass, makeBirds, makeLightning, makeLightPillar, makeFlames, makeLightShafts, tickFx, clock } from './fx.js';
import { std, rockField, columns, ruinWalls, brokenStatue, palms, slabs, ziggurat, brokenBridge, ribcage, skull, warningStele, makeSpiritGate, lamassu, processionalWalls, hoodoos, farTower, giantFeathers, nestRemains, clawMarks, canalBanks } from './structures.js';

// ---------- bölge görünümleri ----------
export const ZONE_ENV = {
  gate: {
    skyTop: 0x1f2a5a, skyMid: 0x7a5a8a, horizon: 0xf2a565, below: 0x4a3326, sunDir: [-0.55, 0.1, -1], sunColor: 0xffc070, sunSize: 0.05, clouds: 0.38, cloudColor: 0xe89a6a,
    fog: 0xd8956a, fogNear: 30, fogFar: 150, hemi: [0xffe0b8, 0x6a4a34, 1.35], sun: [0xffc58a, 2.4, [-40, 22, 8]], fill: [0x8ab4ff, 0.6, [25, 12, 30]], exposure: 1.2, ground: 'plain',
  },
  kiyi: {
    skyTop: 0x22306a, skyMid: 0x8a6a8e, horizon: 0xf6b06a, below: 0x5a3a26, sunDir: [-0.5, 0.12, -1], sunColor: 0xffc27a, sunSize: 0.05, clouds: 0.35, cloudColor: 0xeea072,
    fog: 0xdca070, fogNear: 28, fogFar: 140, hemi: [0xffe0b8, 0x5e4630, 1.35], sun: [0xffcc90, 2.4, [-40, 24, 6]], fill: [0x8ab4ff, 0.55, [25, 12, 35]], exposure: 1.2, ground: 'plain',
  },
  bozkir: {
    skyTop: 0x10141e, skyMid: 0x323a4a, horizon: 0x6a6a70, below: 0x2a2622, sunDir: [0.3, 0.25, -1], sunColor: 0x9fb2d0, sunSize: 0.08, clouds: 0.75, cloudColor: 0x3d4350,
    fog: 0x6a6460, fogNear: 40, fogFar: 175, hemiShadow: 1.4, rim: 0xffc890, rimI: 0.5, hemi: [0x9aa6bd, 0x4a3a2a, 1.25], sun: [0xd8e0f0, 1.8, [25, 35, 20]], fill: [0xffb070, 0.45, [-20, 8, 30]], exposure: 1.2, ground: 'storm',
  },
  derin: {
    skyTop: 0x05030b, skyMid: 0x1e0c30, horizon: 0x5a1a48, below: 0x0a0510, sunDir: [0.4, 0.5, -1], sunColor: 0x8a4ad0, sunSize: 0.03, clouds: 0.55, cloudColor: 0x2a1238, stars: true,
    fog: 0x2a1236, fogNear: 30, fogFar: 170, hemiShadow: 1.35, rim: 0xff5a8a, rimI: 0.7, hemi: [0x8a6ab8, 0x1a0a20, 1.1], sun: [0xc49cff, 1.1, [0, 30, -30]], fill: [0xff3a5a, 0.6, [-25, 5, 30]], exposure: 1.15, ground: 'abyss',
  },
};

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// ---------- yükseklik fonksiyonları ----------
export function makeHeightFn(id, W, H, puddles = []) {
  // oyun alanı: hafif yükselti ve çöküntüler (±0,35); karakterler araziye oturur
  const inner = (x, z) => (noise2(x * 0.12, z * 0.12, 7, 2) - 0.5) * 0.16 + (noise2(x * 0.035, z * 0.035, 11, 2) - 0.5) * 0.7;
  const out = (x, z) => { const dx = x < 0 ? -x : x > W ? x - W : 0, dz = z < 0 ? -z : z > H ? z - H : 0; return Math.hypot(dx, dz); };
  const bowl = (x, z) => { let s = 0; for (const p of puddles) s -= 0.32 * smooth(p.r, p.r * 0.4, Math.hypot(x - p.x, z - p.z)); return s; };
  const canals = id === 'kiyi' ? [{ x: 6.5, z0: -6, z1: H / 2 - 8 }, { x: W - 3, z0: -6, z1: H - 13 }] : [];
  const canalCut = (x, z) => { let c = 0; for (const k of canals) c = Math.max(c, smooth(1.3, 0.5, Math.abs(x - k.x)) * smooth(k.z0 - 1, k.z0 + 1, z) * smooth(k.z1 + 1, k.z1 - 1, z)); return -0.55 * c; };
  const riverbed = id === 'bozkir' ? (x, z) => { const zr = H * 0.7 + Math.sin(x * 0.08) * 6 + Math.sin(x * 0.21) * 1.5; return -0.42 * smooth(3.4, 1.0, Math.abs(z - zr)); } : () => 0;
  if (id === 'kiyi') { const f = (x, z) => {
    let h = inner(x, z) + bowl(x, z) + canalCut(x, z); const n = noise2(x * 0.05, z * 0.05, 3, 4);
    const zc = -9 + Math.sin(x * 0.07) * 2.5; h -= 1.5 * smooth(5.5, 2.2, Math.abs(z - zc)) * smooth(-1, -4, z) ;     // kuzey nehir yatağı
    h += 11 * smooth(-16, -42, z) * (0.45 + n);                                                                   // kuzey tepeleri
    h += 8 * smooth(W + 4, W + 26, x) * (0.4 + n) + 5 * smooth(H + 4, H + 26, z) * (0.4 + n);                      // doğu, güney
    const gateZone = smooth(16, 8, Math.abs(z - H / 2));
    h += 6 * smooth(-6, -30, x) * (0.4 + n) * (1 - gateZone * 0.85);                                              // batı (kapı düzlüğü)
    h += noise2(x * 0.3, z * 0.3, 9, 3) * 1.2 * smooth(3, 14, out(x, z));
    return h;
  }; f.canals = canals; return f; }
  if (id === 'bozkir') return (x, z) => {
    let h = inner(x, z) + bowl(x, z) + riverbed(x, z); const d = out(x, z); const n = noise2(x * 0.045, z * 0.045, 13, 4), r = 1 - Math.abs(noise2(x * 0.12, z * 0.12, 17, 3) * 2 - 1);
    let cliff = 20 * smooth(3, 18, d) * (0.5 + n) + 4 * r * smooth(4, 12, d);
    const ch = smooth(18, 10, Math.abs(x - W / 2)) * smooth(-2, -8, z);                                           // kuzey kanyon (köprü altı)
    cliff = cliff * (1 - ch) - ch * 10 * smooth(-4, -12, z);
    return h + cliff;
  };
  if (id === 'derin') return (x, z) => {
    const d = out(x, z); let h = inner(x, z) * 1.4 + bowl(x, z);
    h -= 34 * smooth(1.2, 9, d);                                                                                   // uçurum
    h += 3 * smooth(0.5, 2.5, d) * smooth(6, 2, d) * noise2(x * 0.4, z * 0.4, 23, 2);                              // kırık kenar
    return h;
  };
  // kapı sahnesi (merkez 0,0; meydan düz)
  return (x, z) => { const r = Math.hypot(x, z + 4); const n = noise2(x * 0.05, z * 0.05, 3, 4); return (noise2(x * 0.2, z * 0.2, 2, 2) - 0.5) * 0.12 + 12 * smooth(26, 60, r) * (0.35 + n) + 1.2 * smooth(18, 40, r) * noise2(x * 0.3, z * 0.3, 4, 3); };
}

// ---------- arazi ağı ----------
function terrain(heightAt, x0, z0, x1, z1, seg, kind, env, opts = {}) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, seg, seg); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.attributes.position, uv = g.attributes.uv; const col = new Float32Array(p.count * 3); const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, heightAt(x, z)); uv.setXY(i, x / 7, z / 7); }
  g.computeVertexNormals(); const nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), slope = 1 - nrm.getY(i); const x = p.getX(i), z = p.getZ(i); const n = noise2(x * 0.08, z * 0.08, 41, 3);
    if (kind === 'plain') {
      const big = noise2(x * 0.025, z * 0.025, 51, 3);
      c.setRGB(1, 1, 1); c.lerp(new THREE.Color(0xb08a5c), smooth(0.35, 0.7, big) * 0.55);                      // koyu toprak lekeleri
      c.lerp(new THREE.Color(0x8e9a5a), smooth(0.45, 0.8, n) * 0.6 * (1 - smooth(0.1, 0.4, slope)));            // ot lekeleri
      c.lerp(new THREE.Color(0x9a7f62), smooth(0.12, 0.45, slope));                                              // yamaç kayası
      c.multiplyScalar(0.82 + smooth(0, 10, y) * 0.22);                                                          // vadiler koyu, sırtlar açık
      if (y < -0.25) c.lerp(new THREE.Color(0x5e6a3a), smooth(-0.25, -0.9, y));
    }
    else if (kind === 'storm') {
      const big = noise2(x * 0.03, z * 0.03, 61, 3); c.setRGB(1, 1, 1); c.lerp(new THREE.Color(0xd09050), 0.5); c.lerp(new THREE.Color(0x9a7e60), smooth(0.3, 0.7, big) * 0.5);
      // yamaçlarda sarı-kızıl erozyon bantları
      const band = Math.sin(y * 1.1 + noise2(x * 0.08, z * 0.08, 63, 2) * 2.5) * 0.5 + 0.5;
      c.lerp(band > 0.5 ? new THREE.Color(0xd8925a) : new THREE.Color(0xa8543a), smooth(0.15, 0.5, slope) * smooth(0.8, 3, y) * 0.75);
      c.multiplyScalar(0.8 + n * 0.35); if (y > 12) c.lerp(new THREE.Color(0x6a5a58), smooth(12, 24, y) * 0.45);
      if (opts.tint) opts.tint(x, z, y, c);
    }
    else { c.setRGB(1, 1, 1); c.multiplyScalar(0.8 + n * 0.4); if (y < -2) c.lerp(new THREE.Color(0x3a1a4a), smooth(-2, -20, y)); }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const t = texSet(kind, texCfg.size, 1);
  const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, vertexColors: true, roughness: 1, metalness: 0 });
  m.normalScale.set(0.8, 0.8);
  if (opts.emissiveMap) { m.emissiveMap = opts.emissiveMap; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 1.0; }
  const crk = !!opts.crackMask;
  if (crk) {
    // çatlak ışıması bölgesel: düşük frekanslı maske (köşe başı) ile çarpılır → döşeme tekrarı kırılır
    const ck = new Float32Array(p.count); for (let i = 0; i < p.count; i++) ck[i] = opts.crackMask(p.getX(i), p.getZ(i));
    g.setAttribute('crk', new THREE.BufferAttribute(ck, 1));
  }
  // v5 arazi shader'ı: döşeme tekrarını kıran iki ölçekli örnekleme + büyük ölçekli ton değişimi + yamaçlarda üç düzlemli (triplanar) doku
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = (crk ? 'attribute float crk; varying float vCrk;\n' : '') + 'varying vec3 vTerrP; varying vec3 vTerrN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vTerrP = position; vTerrN = normal;' + (crk ? ' vCrk = crk;' : ''));
    let f = (crk ? 'varying float vCrk;\n' : '') + 'varying vec3 vTerrP; varying vec3 vTerrN;\n' + sh.fragmentShader;
    f = f.replace('#include <map_fragment>', `#ifdef USE_MAP
      vec4 tA = texture2D( map, vMapUv );
      vec4 tB = texture2D( map, vMapUv * 0.37 + vec2( 0.31, 0.17 ) );
      float macro = texture2D( map, vTerrP.xz * 0.0071 + vec2( 0.5, 0.2 ) ).g;
      float mixAB = smoothstep( 0.35, 0.65, macro );
      vec4 sampledDiffuseColor = mix( tA, tB, mixAB * 0.6 );
      vec3 wn = normalize( vTerrN ); float slope = 1.0 - wn.y;
      if ( slope > 0.06 ) {
        vec3 bw = pow( abs( wn ), vec3( 4.0 ) ); bw /= ( bw.x + bw.y + bw.z );
        vec4 tx = texture2D( map, vTerrP.zy * 0.19 ); vec4 tz = texture2D( map, vTerrP.xy * 0.19 );
        vec4 tri = tx * bw.x + sampledDiffuseColor * bw.y + tz * bw.z;
        sampledDiffuseColor = mix( sampledDiffuseColor, tri, smoothstep( 0.06, 0.28, slope ) );
      }
      diffuseColor *= sampledDiffuseColor;
      diffuseColor.rgb *= mix( 0.86, 1.1, macro );
    #endif`);
    if (crk) f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vCrk;');
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => 'terr' + (crk ? 'crk' : '');
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.userData.noCast = true;
  return mesh;
}

// ---------- ışık + gökyüzü + sis ----------
function atmosphere(scene, env, q, shadowBox = 16) {
  scene.background = new THREE.Color(env.horizon);
  scene.fog = new THREE.Fog(env.fog, env.fogNear * (q === 0 ? 0.8 : 1), env.fogFar * (q === 0 ? 0.75 : 1));
  const sky = makeSky(env, q); scene.add(sky);
  // v5: gerçek gölge varken ortam ışığı biraz düşer → hacim ve derinlik
  const hemi = new THREE.HemisphereLight(env.hemi[0], env.hemi[1], env.hemi[2] * (q > 0 ? (env.hemiShadow ?? 0.82) : 1)); scene.add(hemi);
  const sun = new THREE.DirectionalLight(env.sun[0], env.sun[1] * (q > 0 ? 1.12 : 1)); sun.position.set(...env.sun[2]); scene.add(sun);
  const fill = new THREE.DirectionalLight(env.fill[0], env.fill[1]); fill.position.set(...env.fill[2]); scene.add(fill);
  // arka kenar ışığı (rim): güneşin karşısından, siluetleri ayırır
  let rim = null;
  if (q > 0) { const sp = new THREE.Vector3(...env.sun[2]); rim = new THREE.DirectionalLight(env.rim ?? env.skyMid ?? 0x8ab4ff, env.rimI ?? 0.55); rim.position.set(-sp.x, Math.max(8, sp.y * 0.6), -sp.z); scene.add(rim); }
  const shadow = attachSunShadow(sun, scene, q, { box: shadowBox });
  return { sky, hemi, sun, fill, rim, shadow };
}

// yerleşim yardımcısı: keep noktalarından uzak rastgele nokta
function scatter(R, n, box, avoid = [], minD = 0, test = () => true) {
  const out = []; let tries = 0;
  while (out.length < n && tries++ < n * 30) {
    const x = box[0] + R() * (box[2] - box[0]), z = box[1] + R() * (box[3] - box[1]);
    if (avoid.some((k) => Math.hypot(k.x - x, k.z - z) < (k.r ?? minD))) continue; if (!test(x, z)) continue; out.push({ x, z });
  }
  return out;
}

// doğal toprak patika: yer üstüne serilen yumuşak kenarlı şerit (tek mesh)
let pathTex;
function dirtPath(points, heightAt, { width = 1.8, color = 0x8a6a46, opacity = 0.75 } = {}) {
  if (!pathTex) { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); const img = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const e = 1 - Math.abs(x / 63 * 2 - 1); const n = noise2(x * 0.15, y * 0.15, 5, 3); const a = Math.max(0, Math.min(1, (e - 0.15 + (n - 0.5) * 0.5) * 2.2)); const i = (y * 64 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 200 + n * 55; img.data[i + 3] = a * 255; }
    g.putImageData(img, 0, 0); pathTex = new THREE.CanvasTexture(c); pathTex.wrapT = THREE.RepeatWrapping; }
  // Catmull-Rom ile yumuşat
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, 0, p.z))); const n = Math.max(8, Math.round(curve.getLength() / 0.8));
  const pos = [], uv = [], idx = []; let acc = 0; let prev = null;
  for (let i = 0; i <= n; i++) { const t = i / n; const c = curve.getPointAt(t), tg = curve.getTangentAt(t); const nx = -tg.z, nz = tg.x; if (prev) acc += c.distanceTo(prev); prev = c;
    for (const s of [-1, 1]) { const x = c.x + nx * s * width / 2, z = c.z + nz * s * width / 2; pos.push(x, heightAt(x, z) + 0.04, z); uv.push(s < 0 ? 0 : 1, acc / 3); }
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.MeshLambertMaterial({ map: pathTex, color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 1; return mesh;
}
// çökmüş tapınak: eğik sütunlar + gömülmüş tapınak kademesi + dağılmış levhalar
function collapsedTemple(scene, x, z, ry, heightAt, kind = 'basalt', tint = 0x8a7aa0, scale = 1) {
  const g = new THREE.Group(); const y = heightAt(x, z);
  const zg = ziggurat(0.32 * scale, kind, tint); zg.position.set(0, -3.2 * scale, 0); zg.rotation.set(0.12, 0, 0.2); g.add(zg);
  g.add(columns([{ x: -5 * scale, z: 4 * scale, s: 0.9 * scale, broken: true, tilt: 0.35 }, { x: -2 * scale, z: 5 * scale, s: 0.9 * scale }, { x: 2.5 * scale, z: 5 * scale, s: 0.9 * scale, broken: true, tilt: -0.5 }, { x: 5.5 * scale, z: 3.8 * scale, s: 0.9 * scale, tilt: 0.7, broken: true }].map((c) => ({ ...c, y: -0.2 })), kind, tint));
  const sl = []; const R = rng(Math.round(x * 13 + z * 7)); for (let i = 0; i < 10; i++) sl.push({ x: (R() - 0.5) * 12 * scale, z: 6 * scale + R() * 4 * scale, ry: R() * 3, w: 1 + R() * 1.4, d: 0.8 + R(), y: -0.05 });
  g.add(slabs(sl, kind, tint)); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g); return g;
}

// geçit kemeri (bölgeler arası). userData.portal: MeshBasic (worldView renk/opaklık değiştirir)
export function passageArch(scale = 1) {
  const g = new THREE.Group(); const stone = std('stone', { color: 0xcfc0a2 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.0, 4.6, 1.0), stone); b.position.set(-2.8, 2.3, 0); g.add(b);
  const b2 = b.clone(); b2.position.x = 2.8; g.add(b2);
  const top = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.9, 1.3), std('glazed')); top.position.set(0, 4.9, 0); g.add(top);
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.4), new THREE.MeshBasicMaterial({ color: 0x6fd7ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  portal.position.set(0, 2.2, 0); g.add(portal); g.userData.portal = portal; g.scale.setScalar(scale); return g;
}

// =====================================================================
// buildZoneEnv: dünya sahnesine bölgenin bütün ortamını kurar
// =====================================================================
export function buildZoneEnv(scene, zoneId, lay, q = 1) {
  const env = ZONE_ENV[zoneId]; const W = lay.size.w, H = lay.size.h; const R = rng(zoneId.length * 7919 + 13);
  const updaters = []; const lods = []; // lods: [{ obj, d }] uzak dekor kameradan d'den uzaksa gizlenir
  const lodD = [55, 85, 1e9][q]; const lod = (obj, mult = 1) => { lods.push({ obj, d: lodD * mult }); return obj; };
  // su birikintileri (oyun alanında; geçitlerden, önemli noktalardan ve canavar yuvalarından uzak)
  const keep = [lay.entry, lay.guardianPos, ...lay.safeRings, ...lay.passages, ...(lay.gate ? [lay.gate] : [])].map((k) => ({ x: k.x, z: k.z, r: 6 }))
    .concat((lay.homes || []).map((h) => ({ x: h.x, z: h.z, r: 4.5 })))
    .concat(lay.camp ? [{ x: lay.camp.x, z: lay.camp.z, r: (lay.camp.safeRadius || 5) + 1.5 }] : [])
    .concat((lay.nodes || []).map((n) => ({ x: n.x, z: n.z, r: 2.2 })));
  const puddleN = zoneId === 'bozkir' ? 0 : zoneId === 'kiyi' ? 6 : 5;
  const puddles = scatter(R, puddleN, [6, 6, W - 6, H - 6], keep, 6).map((p) => ({ ...p, r: 1.6 + R() * 1.8 }));
  const heightAt = makeHeightFn(zoneId, W, H, puddles);
  const atm = atmosphere(scene, env, q);

  // arazi: iç (ince) + dış halka (kaba) — tek mesh, segment kaliteye göre
  const M = zoneId === 'derin' ? 50 : 70; const seg = [64, 100, 130][q];
  const crackMask = (x, z) => Math.max(0.04, smooth(0.46, 0.7, noise2(x * 0.03, z * 0.03, 71, 3)) * (0.7 + 0.6 * noise2(x * 0.11, z * 0.11, 73, 2)));
  const zr = (x) => H * 0.7 + Math.sin(x * 0.08) * 6 + Math.sin(x * 0.21) * 1.5;
  const tOpts = zoneId === 'derin' ? { emissiveMap: crackEmissive(512, 5, 0.55), crackMask }
    : zoneId === 'bozkir' ? { tint: (x, z, y, c) => { const d = Math.abs(z - zr(x)); if (d < 3.2 && x > -8 && x < W + 8) { const k = smooth(3.2, 1.2, d); c.lerp(new THREE.Color(0xe2c79a), k * 0.55); if (noise2(x * 0.9, z * 0.9, 77, 2) > 0.62) c.multiplyScalar(1 - 0.3 * k); } } } : {};
  const ground = terrain(heightAt, -M, -M, W + M, H + M, seg, env.ground, env, tOpts);
  if (zoneId === 'derin') { ground.material.emissiveMap.repeat.set(0.3, 0.3); ground.material.emissiveIntensity = 0.9; }
  scene.add(ground);
  const all = [...keep, ...puddles.map((p) => ({ x: p.x, z: p.z, r: p.r + 0.5 }))];
  const inPlay = (x, z, m = 0) => x > -m && x < W + m && z > -m && z < H + m;

  // su yüzeyleri
  const waterCol = zoneId === 'derin' ? { deep: 0x08040e, shallow: 0x2a1040, sky: 0x6a2a6a, glint: 0xd070ff, opacity: 0.92 } : { deep: 0x23505a, shallow: 0x5a9aa0, sky: 0xf2b27a, glint: 0xfff0c0 };
  for (const p of puddles) { const w = makeWater(p.r * 2.2, p.r * 2.2, { ...waterCol, circle: true }); w.position.set(p.x, -0.08, p.z); scene.add(w); }

  if (zoneId === 'kiyi') {
    // nehir (kuzey) ve kıyı sazları
    const river = makeWater(W + 160, 11, waterCol); river.position.set(W / 2, -0.5, -9); scene.add(river);
    const clumps = [];
    for (let i = 0; i < 70; i++) { const x = -40 + R() * (W + 80), zc = -9 + Math.sin(x * 0.07) * 2.5; const side = R() < 0.5 ? -1 : 1; clumps.push({ x, z: zc + side * (3.6 + R() * 2), r: 1.2, n: [10, 18, 26][q] }); }
    for (const p of puddles) for (let k = 0; k < 3; k++) { const a = R() * 6.28; clumps.push({ x: p.x + Math.cos(a) * (p.r + 0.3), z: p.z + Math.sin(a) * (p.r + 0.3), r: 0.7, n: [6, 10, 14][q] }); }
    scene.add(makeGrass(clumps, { color: 0x7d8a3c, color2: 0xb39a52, height: 1.5, width: 0.06, sway: 0.12, heightAt, seed: 5 }));
    // kurumuş ot (oyun alanında seyrek)
    const dry = scatter(R, [40, 80, 120][q], [-10, 0, W + 10, H + 10], all, 0).map((p) => ({ ...p, r: 0.9, n: 6 }));
    scene.add(makeGrass(dry, { color: 0xb59a5a, color2: 0x8f8a45, height: 0.5, width: 0.05, sway: 0.2, heightAt, seed: 6 }));
    // kapıdan doğuya taş yol
    const path = []; for (let x = 4; x < W * 0.55; x += 1.05) { if (R() < 0.18) continue; const z = H / 2 + Math.sin(x * 0.12) * 2.2; path.push({ x, z: z + (R() - 0.5) * 0.5, ry: R() * 0.4, w: 0.8 + R() * 0.4, d: 0.8 + R() * 0.3, y: heightAt(x, z) }); }
    scene.add(slabs(path, 'stone', 0xfff2dc));
    // tapınak temelleri ve yıkıntılar (oyun alanının kenarlarında, alçak)
    scene.add(ruinWalls([
      { x: 14, z: 6, len: 9, h: 0.9, ry: 0 }, { x: 9.6, z: 10, len: 8, h: 0.8, ry: Math.PI / 2 }, { x: 46, z: 52, len: 10, h: 1.0, ry: 0.3 }, { x: 52, z: 47, len: 6, h: 0.7, ry: 1.8 },
      { x: W + 6, z: 14, len: 12, h: 2.4, ry: 1.5 }, { x: 30, z: -16, len: 14, h: 2.8, ry: 0.1 }, { x: -12, z: 12, len: 10, h: 2.2, ry: 1.2 }, { x: W + 8, z: 44, len: 9, h: 2.6, ry: 1.7 },
    ].map((s) => ({ ...s, y: heightAt(s.x, s.z) - 0.1 })), 'mudbrick', 0xf0d4b0, 3));
    scene.add(columns([{ x: 20, z: -2.5, s: 0.7, broken: true }, { x: 26, z: -2.8, s: 0.7 }, { x: 32, z: -2.4, s: 0.7, broken: true, ry: 2 }, { x: W + 3, z: 30, s: 0.9 }, { x: W + 3, z: 36, s: 0.9, broken: true }, { x: 50, z: H + 3, s: 0.8 }, { x: 8, z: H + 3, s: 0.8, broken: true }].map((c) => ({ ...c, y: heightAt(c.x, c.z) })), 'stone', 0xe9d9bb));
    const st = brokenStatue(0.9); st.position.set(W + 4, heightAt(W + 4, 22), 22); st.rotation.y = -1.9; scene.add(st);
    const st2 = brokenStatue(0.8); st2.position.set(38, heightAt(38, H + 4), H + 4); st2.rotation.y = 2.6; scene.add(st2);
    // palmiyeler: nehir boyunca ve kenarlarda
    const pl = []; for (let i = 0; i < [12, 20, 26][q]; i++) { const x = -25 + R() * (W + 50), z = R() < 0.6 ? -14 - R() * 6 : (R() < 0.5 ? H + 2 + R() * 8 : 20 + R() * 20); const xx = z > 15 && z < 45 ? (R() < 0.5 ? -4 - R() * 8 : W + 3 + R() * 8) : x; pl.push({ x: xx, z, y: heightAt(xx, z) - 0.1, s: 0.9 + R() * 0.5 }); }
    scene.add(palms(pl, 7));
    // kayalar (kenar)
    const rocks = scatter(R, [40, 70, 100][q], [-45, -55, W + 45, H + 45], [], 0, (x, z) => !inPlay(x, z, 1.5) && Math.hypot(x - lay.gate.x + 5, z - lay.gate.z) > 9).map((p) => { const s0 = 0.6 + R() * 3.2 * (1 + smooth(4, 30, Math.max(-p.z, p.x - W, p.z - H))); return { ...p, y: heightAt(p.x, p.z) - s0 * 0.45, s: s0 }; });
    scene.add(rockField(rocks, 'stone', 0xd8c2a0, 3));
    const pebbles = scatter(R, [20, 40, 60][q], [0, 0, W, H], all, 0).map((p) => ({ ...p, y: heightAt(p.x, p.z), s: 0.12 + R() * 0.25 }));
    scene.add(rockField(pebbles, 'stone', 0xcdb898, 4));
    // uzak plan: zigurat ve şehir kalıntısı silueti
    const zg = ziggurat(1.6); zg.position.set(W + 55, heightAt(W + 55, -60) - 2, -60); zg.rotation.y = -0.5; scene.add(zg);
    const zg2 = ziggurat(0.9, 'mudbrick', 0x9a7a5a); zg2.position.set(-50, heightAt(-50, -55) - 1, -55); zg2.rotation.y = 0.4; scene.add(zg2);
    // Ruh Kapısı (batı)
    const gate = makeSpiritGate(q); gate.group.scale.setScalar(0.72); gate.group.position.set(lay.gate.x - 4.8, heightAt(lay.gate.x - 4.8, lay.gate.z) - 0.1, lay.gate.z); gate.group.rotation.y = Math.PI / 2; scene.add(gate.group); updaters.push(gate.update);
    // antik sulama kanalları (nehirden güneye), kerpiç kenarlı
    for (const k of heightAt.canals || []) { const len = k.z1 - k.z0; const w = makeWater(1.3, len, waterCol); w.position.set(k.x, -0.42, (k.z0 + k.z1) / 2); scene.add(w); scene.add(canalBanks(k.x, k.z0, k.x, k.z1, 2.1, heightAt));
      const cl = []; for (let z = k.z0; z < k.z1; z += 2.2) for (const sd of [-1, 1]) if (R() < 0.55) cl.push({ x: k.x + sd * 1.45, z: z + R(), r: 0.5, n: [5, 8, 12][q] });
      scene.add(makeGrass(cl, { color: 0x7d8a3c, color2: 0xb39a52, height: 1.2, width: 0.05, sway: 0.12, heightAt, seed: 15 })); }
    // doğal patikalar: girişten bekçiye ve doğu geçidine
    const gp = lay.guardianPos, nx = lay.passages.find((ps) => ps.x > W / 2);
    scene.add(dirtPath([{ x: lay.entry.x + 2, z: lay.entry.z }, { x: W * 0.3, z: H / 2 + 5 }, { x: W * 0.55, z: H / 2 - 3 }, { x: gp.x - 4, z: gp.z }], heightAt, { width: 1.9 }));
    if (nx) scene.add(dirtPath([{ x: W * 0.55, z: H / 2 - 3 }, { x: W * 0.72, z: H * 0.75 }, { x: nx.x - 4, z: nx.z }], heightAt, { width: 1.6, opacity: 0.6 }));
    scene.add(dirtPath([{ x: 14, z: 6 }, { x: 22, z: 14 }, { x: W * 0.3, z: H / 2 + 5 }], heightAt, { width: 1.2, opacity: 0.5 }));
    // kapının iki yanında kanatlı boğa koruyucular; kenarlarda devrik olanlar
    for (const sd of [-1, 1]) { const l = lamassu(0.62); l.position.set(lay.gate.x - 1.2, heightAt(lay.gate.x - 1.2, lay.gate.z + sd * 6.2), lay.gate.z + sd * 6.2); l.rotation.y = 0; scene.add(lod(l, 1.4)); }
    for (const [x, z, ry] of [[W + 5, 8, -2.2], [16, H + 5, 0.9], [-7, H - 8, 1.4]]) { const l = lamassu(0.8, { broken: true }); l.position.set(x, heightAt(x, z) - 0.15, z); l.rotation.y = ry; scene.add(lod(l)); }
    // kapı çevresinde ışık huzmeleri
    if (q > 0) { const sh = makeLightShafts([{ x: lay.gate.x - 3, z: lay.gate.z - 3, y: 7, h: 16, w: 2.6, ry: 0.4 }, { x: lay.gate.x - 1, z: lay.gate.z + 2, y: 7, h: 15, w: 2, ry: 0.5 }, { x: lay.gate.x + 1.5, z: lay.gate.z - 1, y: 6.5, h: 13, w: 1.6, ry: 0.3 }], { color: 0xffd9a0, opacity: 0.16 }); scene.add(sh); updaters.push(sh.userData.update); }
    // canlılık
    scene.add(makeParticles({ count: [40, 90, 140][q], box: [-10, 0.3, -10, W + 10, 5, H + 10], color: 0xffe2b0, size: 0.07, speed: 0.8, mode: 'dust', opacity: 0.55, seed: 2 }));
    const birds = makeBirds(q ? 9 : 5, { x: W / 2, z: -20 }, 30, 18); scene.add(birds); updaters.push(birds.userData.update);
    // tehlike uyarısı: Bozkır geçidi
    for (const ps of lay.passages) placeStele(scene, ps, heightAt, 0xff6a3a, updaters);
  }

  if (zoneId === 'bozkir') {
    // kayalık duvarlar zaten arazide; ek kaya iğneleri ve devrik kayalar
    const big = scatter(R, [40, 60, 80][q], [-45, -45, W + 45, H + 45], [], 0, (x, z) => !inPlay(x, z, 3)).map((p) => ({ ...p, y: heightAt(p.x, p.z) - 1, s: 1.5 + R() * 4, sy: 1.2 + R() * 1.5 }));
    scene.add(rockField(big, 'storm', 0xb0a898, 9));
    const spires = []; for (let i = 0; i < [10, 16, 22][q]; i++) { const a = R() * 6.28, r = 55 + R() * 25; const x = W / 2 + Math.cos(a) * r, z = H / 2 + Math.sin(a) * r; spires.push({ x, z, y: heightAt(x, z) - 2, s: 3 + R() * 3, sy: 3 + R() * 2.5 }); }
    scene.add(rockField(spires, 'storm', 0x8f8a82, 12));
    const mid = scatter(R, [12, 20, 28][q], [2, 2, W - 2, H - 2], all, 0).map((p) => ({ ...p, y: heightAt(p.x, p.z) - 0.1, s: 0.3 + R() * 0.45 }));
    scene.add(rockField(mid, 'storm', 0xa49a88, 13));
    // kuzey kanyonda kırık köprü
    const br = brokenBridge(44, 9); br.position.set(W / 2, heightAt(W / 2 - 25, -10) - 7, -11); scene.add(br);
    // eski savaş alanı: yıkık koruyucu heykeller, kırık mızraklar, kalkanlar
    for (const [x, z, ry, s] of [[-5, 20, 1.2, 1.3], [W + 5, 30, -1.6, 1.4], [30, H + 5, 2.8, 1.2], [W + 6, 66, -2.2, 1.1]]) { const st = brokenStatue(s, 'storm', 0xbab0a0); st.position.set(x, heightAt(x, z) - 0.2, z); st.rotation.y = ry; scene.add(st); }
    scene.add(columns([{ x: 18, z: -3, s: 1, broken: true }, { x: 60, z: -2.5, s: 1 }, { x: -3, z: 50, s: 1, broken: true, tilt: 0.3 }, { x: W + 3, z: 12, s: 1.1, broken: true }].map((c) => ({ ...c, y: heightAt(c.x, c.z) })), 'storm', 0xc8c0b0));
    spearsAndShields(scene, R, W, H, all, heightAt, q);
    // sarı-kızıl erozyon kayalıkları (kenar kuşağı ve uzak plan)
    const hd = []; for (let i = 0; i < [14, 24, 34][q]; i++) { const a = R() * 6.28, r = 46 + R() * 30; const x = W / 2 + Math.cos(a) * r, z = H / 2 + Math.sin(a) * r; if (inPlay(x, z, 6)) continue; hd.push({ x, z, y: heightAt(x, z) - 0.6, s: 1.4 + R() * 1.6, sy: 1.2 + R() * 1.2 }); }
    for (let i = 0; i < [4, 7, 10][q]; i++) { const x = R() < 0.5 ? -4 - R() * 6 : W + 4 + R() * 6, z = 8 + R() * (H - 16); hd.push({ x, z, y: heightAt(x, z) - 0.3, s: 0.7 + R() * 0.6, sy: 1 + R() * 0.6 }); }
    scene.add(hoodoos(hd, 5));
    // kurumuş nehir yatağı boyunca çakıl ve kuru dallar
    const rb = []; for (let x = 2; x < W - 2; x += 1.6) { if (R() < 0.45) continue; const z = H * 0.7 + Math.sin(x * 0.08) * 6 + Math.sin(x * 0.21) * 1.5 + (R() - 0.5) * 2.4; rb.push({ x, z, y: heightAt(x, z) - 0.05, s: 0.12 + R() * 0.3 }); }
    scene.add(rockField(rb, 'storm', 0xe0cfb0, 14));
    // uzakta yükselen antik kuleler
    for (const [x, z, sc, br] of [[-70, -40, 1.1, false], [W + 75, 20, 0.9, true], [W * 0.3, -95, 1.3, false], [W + 40, H + 70, 1, true]]) { const t = farTower(sc, 'mudbrick', 0xb07a52, br); t.position.set(x, heightAt(x, z) - 3, z); t.rotation.y = R() * 3; scene.add(lod(t, 3)); }
    // Anzû izleri: bekçinin çevresinde dev tüyler, yuva kalıntısı, pençe izleri
    const gp = lay.guardianPos;
    const fe = []; for (let i = 0; i < [6, 10, 14][q]; i++) { const a = R() * 6.28, r = 5 + R() * 14; const x = gp.x + Math.cos(a) * r * 0.7, z = gp.z + Math.sin(a) * r; if (Math.hypot(x - gp.x, z - gp.z) < 4.5) continue; fe.push({ x, z, y: heightAt(x, z), s: 0.55 + R() * 0.5 }); }
    for (let i = 0; i < 4; i++) { const x = W + 4 + R() * 6, z = gp.z - 10 + R() * 20; fe.push({ x, z, y: heightAt(x, z), s: 1 + R() * 0.6 }); }
    scene.add(giantFeathers(fe));
    const nest = nestRemains(1.1); nest.position.set(W + 2.5, heightAt(W + 2.5, gp.z - 9), gp.z - 9); scene.add(lod(nest, 1.6));
    for (const [x, z, ry] of [[gp.x - 9, gp.z + 6, 0.6], [gp.x - 14, gp.z - 7, -0.4], [W * 0.5, H * 0.3, 1.8]]) { const cm = clawMarks(3.4); cm.position.set(x, heightAt(x, z) + 0.05, z); cm.rotation.z = ry; scene.add(cm); }
    // fırtına: yıldırım, rüzgârla toz, yağmur (orta/yüksek)
    const ln = makeLightning(scene, atm.sky, [atm.hemi, atm.sun], { x0: -40, x1: W + 40, z: -70 }); updaters.push(ln.update);
    scene.add(makeParticles({ count: [60, 140, 220][q], box: [-10, 0.2, -10, W + 10, 4, H + 10], color: 0xc8bfae, size: 0.08, speed: 2.4, mode: 'dust', opacity: 0.5, seed: 3, additive: false }));
    if (q > 0) scene.add(makeParticles({ count: q === 2 ? 900 : 450, box: [-5, 0, -5, W + 5, 22, H + 5], color: 0xaab8cc, size: 0.09, speed: 1, mode: 'rain', opacity: 0.35, seed: 4 }));
    const dg = scatter(R, [40, 80, 120][q], [-8, -8, W + 8, H + 8], all, 0).map((p) => ({ ...p, r: 0.8, n: 5 }));
    scene.add(makeGrass(dg, { color: 0x8a8a66, color2: 0x5e5a48, height: 0.6, width: 0.05, sway: 0.35, heightAt, seed: 8 }));
    const birds = makeBirds(q ? 6 : 3, { x: W / 2, z: -30 }, 35, 25, 0x101014); scene.add(birds); updaters.push(birds.userData.update);
    for (const ps of lay.passages) if (ps.x > W / 2) placeStele(scene, ps, heightAt, 0xd040ff, updaters);
  }

  if (zoneId === 'derin') {
    // siyah taş iğneler uçurum kenarında
    const spires = []; for (let i = 0; i < [24, 36, 48][q]; i++) { const a = R() * 6.28, r = 46 + R() * 12; const x = W / 2 + Math.cos(a) * r, z = H / 2 + Math.sin(a) * r; if (inPlay(x, z, 2)) continue; spires.push({ x, z, y: heightAt(x, z) - 3, s: 1.5 + R() * 2.5, sy: 3 + R() * 4 }); }
    scene.add(rockField(spires, 'basalt', 0x8a7aa0, 21));
    const shards = scatter(R, [14, 22, 30][q], [2, 2, W - 2, H - 2], all, 0).map((p) => ({ ...p, y: heightAt(p.x, p.z) - 0.1, s: 0.25 + R() * 0.5, sy: 1.6 }));
    scene.add(rockField(shards, 'basalt', 0x9a8ab0, 22));
    // uçurumda süzülen kaya adaları
    const isl = []; for (let i = 0; i < [8, 14, 20][q]; i++) { const a = R() * 6.28, r = 70 + R() * 40; isl.push({ x: W / 2 + Math.cos(a) * r, z: H / 2 + Math.sin(a) * r, y: -6 + R() * 18, s: 2 + R() * 5, sy: 1.3 }); }
    const islands = rockField(isl, 'basalt', 0x5a4a6a, 23); scene.add(islands);
    updaters.push(() => { islands.position.y = Math.sin(clock.t * 0.3) * 0.8; });
    // dev kemikler ve kafatası
    const rb = ribcage(1.6); rb.position.set(-6, heightAt(-6, 30) - 0.5, 30); rb.rotation.y = 1.2; scene.add(rb);
    const rb2 = ribcage(1.2); rb2.position.set(W + 5, heightAt(W + 5, 55) - 0.5, 55); rb2.rotation.y = -0.4; scene.add(rb2);
    const sk = skull(1.8); sk.position.set(W / 2 + 18, heightAt(W / 2 + 18, -4) + 0.6, -4); sk.rotation.y = 0.5; scene.add(sk);
    // uzakta dev yapı: Tiamat'ın tapınağı (uçurumdan yükselen) + parlayan göz
    const tm = ziggurat(4.2, 'basalt', 0x8a7a9a); tm.position.set(W / 2, -40, -170); tm.material = tm.material.clone(); { const em = crackEmissive(512, 9).clone(); em.repeat.set(1, 1); em.needsUpdate = true; tm.material.emissiveMap = em; tm.material.emissive = new THREE.Color(0xff5a9a); tm.material.emissiveIntensity = 0.7; } scene.add(tm);
    const topY = -40 + 18.5 * 4.2;
    const eye = makeLightPillar(120, 5, 0xc23aff); eye.position.set(W / 2, topY, -170); scene.add(eye);
    const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff3a6a, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); eyeGlow.scale.set(26, 26, 1); eyeGlow.position.set(W / 2, topY + 4, -160); scene.add(eyeGlow);
    // tapınağa uzanan kırık kemer yolu (uçurum üstünde)
    const way = []; for (let i = 0; i < 13; i++) way.push({ x: W / 2 + Math.sin(i) * 2, z: -8 - i * 10, y: -2 - i * 1.2 + Math.sin(i * 2) * 1.5, ry: i * 0.3, w: 4.5, d: 4 });
    scene.add(slabs(way, 'basalt', 0xa090b8));
    // ilksel sular: uçurumun dibinde kara-mor deniz ve kenarda iki karanlık havuz
    const sea = makeWater(700, 700, { deep: 0x05020a, shallow: 0x1a0a2a, sky: 0x4a1a5a, glint: 0xb060ff, opacity: 0.96 }); sea.position.set(W / 2, -24, H / 2); scene.add(sea);
    for (const [x, z, r] of [[3.5, 12, 3.2], [W - 2.5, 22, 2.8]]) { const w = makeWater(r * 2.2, r * 2.2, { ...waterCol, circle: true }); w.position.set(x, heightAt(x, z) - 0.02, z); scene.add(w); }
    // çökmüş tapınaklar (kenarlarda)
    for (const [x, z, ry, sc] of [[-10, 22, 1.3, 1], [W + 10, 48, -1.6, 1.1], [40, H + 10, 3.1, 0.9]]) lod(collapsedTemple(scene, x, z, ry, heightAt, 'basalt', 0x8a7aa0, sc), 1.5);
    // mor-kızıl enerji parçacıkları ve uçurumdan yükselen ruhlar
    scene.add(makeParticles({ count: [60, 140, 220][q], box: [-10, 0.2, -10, W + 10, 6, H + 10], color: 0xd65aff, size: 0.09, speed: 0.4, mode: 'float', opacity: 0.8, seed: 5 }));
    scene.add(makeParticles({ count: [40, 90, 140][q], box: [-40, -30, -40, W + 40, 10, H + 40], color: 0xff3a6a, size: 0.25, speed: 1.2, mode: 'float', opacity: 0.6, seed: 6 }));
    // çatlakların nabzı
    updaters.push(() => { ground.material.emissiveIntensity = 0.8 + Math.sin(clock.t * 1.3) * 0.3; });
  }

  // 360° ufuk silüeti: kamera her yöne dönebildiği için bölgenin çevresine uzak kuleler, sivri kayalar ve harabe blokları
  horizonRing(scene, zoneId, W, H, heightAt, R, q);

  // dönüş yolu işareti: önceki bölgeye geçidin yanında turkuaz ışık sütunu
  for (const ps of lay.passages) if (ps.x < W / 2) { const p = makeLightPillar(50, 0.6, 0x7ff0e0); p.position.set(ps.x - 9, heightAt(ps.x - 9, ps.z), ps.z); scene.add(p); }

  const _cp = new THREE.Vector3(), _op = new THREE.Vector3();
  return {
    heightAt, atm, ground, lods,
    update(dt, camera) {
      tickFx(dt); for (const u of updaters) u(dt);
      if (camera && lods.length) { camera.getWorldPosition(_cp); for (const l of lods) { l.obj.getWorldPosition(_op); l.obj.visible = _op.distanceTo(_cp) < l.d; } }
    },
  };
}

function placeStele(scene, ps, heightAt, color, updaters, back = false) {
  for (const s of [-1, 1]) {
    const st = warningStele(color); const x = ps.x + (back ? 2.4 : -3.2), z = ps.z + s * 4.6;
    st.position.set(x, heightAt(x, z), z); st.rotation.y = back ? Math.PI / 2 : -Math.PI / 2; scene.add(st); updaters.push(st.userData.update);
  }
}

function spearsAndShields(scene, R, W, H, avoid, heightAt, q) {
  const n = [16, 28, 40][q];
  const sp = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.04, 2.4, 4).translate(0, 1.2, 0), std('stone', { color: 0x5a4a3a }), n);
  const sh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.5, metalness: 0.6 }), n);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
  const pts = scatter(R, n, [-6, -6, W + 6, H + 6], avoid, 0);
  pts.forEach((p, i) => {
    P.set(p.x, heightAt(p.x, p.z) - 0.2, p.z); E.set((R() - 0.5) * 0.9, R() * 6, (R() - 0.5) * 0.9); Q.setFromEuler(E); M.compose(P, Q, S); sp.setMatrixAt(i, M);
    P.set(p.x + 0.8, heightAt(p.x + 0.8, p.z + 0.5) + 0.05, p.z + 0.5); E.set((R() - 0.5) * 0.3, R() * 6, (R() - 0.5) * 0.3); Q.setFromEuler(E); M.compose(P, Q, S); sh.setMatrixAt(i, M);
  });
  sp.count = sh.count = pts.length; scene.add(sp, sh);
}

// =====================================================================
// Kapı sahnesi (açılış / ana üs): Ruh Kapısı merkezde, gün batımı ovası
// =====================================================================
export function buildGateEnv(scene, q = 1) {
  const env = ZONE_ENV.gate; const R = rng(4242); const updaters = [];
  const heightAt = makeHeightFn('gate', 0, 0); const atm = atmosphere(scene, env, q, 22);
  const ground = terrain(heightAt, -110, -110, 110, 110, [70, 110, 140][q], 'plain', env); scene.add(ground);
  const gate = makeSpiritGate(q); gate.group.position.set(0, 0, -7); scene.add(gate.group); updaters.push(gate.update);
  // meydan: taş döşeme (kapı önü), çatlak ve eksik levhalar
  const sl = []; for (let x = -7; x <= 7; x += 1.4) for (let z = -1.5; z <= 9; z += 1.4) { if (R() < 0.14) continue; if (Math.hypot(x, z - 1.4) < 3.7) continue; sl.push({ x: x + (R() - 0.5) * 0.15, z: z + (R() - 0.5) * 0.15, ry: (R() - 0.5) * 0.15, w: 1.3, d: 1.3, y: heightAt(x, z) }); }
  for (let z = 10; z < 40; z += 1.3) { if (R() < 0.2) continue; const x = Math.sin(z * 0.15) * 1.5; sl.push({ x: x + (R() - 0.5) * 0.6, z, ry: R() * 0.5, w: 1.1, d: 1.0, y: heightAt(x, z) }); }
  scene.add(slabs(sl, 'stone', 0xfff2dc));
  // tören yolu: iki yanda sırlı tuğla friz duvarları; girişte ve yol sonunda kanatlı boğa koruyucular
  scene.add(processionalWalls(11, 38, 3.6, 1.25));
  for (const [z, sc] of [[9.6, 0.82], [39.5, 0.75]]) for (const sd of [-1, 1]) { const l = lamassu(sc); l.position.set(sd * 4.9, heightAt(sd * 4.9, z), z); l.rotation.y = -Math.PI / 2; scene.add(l); }
  if (q > 0) { const sh = makeLightShafts([{ x: -3.5, z: -4, y: 9, h: 20, w: 3, ry: 0.15 }, { x: 0.5, z: -2.5, y: 9.5, h: 19, w: 2.2, ry: 0.25 }, { x: 4, z: -4.5, y: 8.5, h: 17, w: 2.6, ry: 0.1 }, { x: -7, z: 1, y: 8, h: 15, w: 1.8, ry: 0.3 }], { color: 0xffd6a0, opacity: 0.18 }); scene.add(sh); updaters.push(sh.userData.update); }
  // yan yıkıntılar ve heykeller
  scene.add(ruinWalls([{ x: -13, z: 2, len: 8, h: 2.2, ry: 1.4 }, { x: 14, z: 0, len: 9, h: 2.6, ry: -1.3 }, { x: -18, z: -14, len: 14, h: 3.4, ry: 0.2 }, { x: 19, z: -15, len: 12, h: 3.0, ry: -0.2 }, { x: -10, z: 16, len: 6, h: 1.2, ry: 0.6 }], 'mudbrick', 0xf0d4b0, 5));
  const st = brokenStatue(1.1, 'stone', 0xf4e8d0); st.position.set(-14, 0, 4); st.rotation.y = 1.4; scene.add(st);
  const st2 = brokenStatue(1.0, 'stone', 0xf4e8d0); st2.position.set(14, 0, 6); st2.rotation.y = -1.5; scene.add(st2);
  scene.add(columns([{ x: -12, z: -6, s: 1 }, { x: 12.5, z: -6, s: 1, broken: true }, { x: -15, z: 12, s: 0.9, broken: true, ry: 1 }, { x: 16, z: 14, s: 0.9 }]));
  // su birikintileri, sazlar, palmiyeler
  const pools = [{ x: -16, z: 22, r: 4 }, { x: 18, z: 26, r: 3.4 }, { x: -24, z: 4, r: 3 }];
  for (const p of pools) { const w = makeWater(p.r * 2, p.r * 2, { circle: true, deep: 0x23505a, shallow: 0x5a9aa0, sky: 0xf4b080, glint: 0xfff0c0 }); w.position.set(p.x, 0.05, p.z); scene.add(w); }
  const clumps = []; pools.forEach((p) => { for (let k = 0; k < 9; k++) { const a = R() * 6.28; clumps.push({ x: p.x + Math.cos(a) * (p.r + 0.2), z: p.z + Math.sin(a) * (p.r + 0.2), r: 0.8, n: [8, 14, 20][q] }); } });
  scene.add(makeGrass(clumps, { color: 0x7d8a3c, color2: 0xb39a52, height: 1.4, width: 0.06, sway: 0.12, heightAt, seed: 9 }));
  const dry = scatter(R, [60, 110, 160][q], [-40, -30, 40, 50], [{ x: 0, z: 2, r: 10 }, { x: 0, z: 25, r: 3 }], 0).map((p) => ({ ...p, r: 1.1, n: 7 }));
  scene.add(makeGrass(dry, { color: 0xb59a5a, color2: 0x8f8a45, height: 0.55, width: 0.05, sway: 0.2, heightAt, seed: 10 }));
  const pl = []; for (let i = 0; i < [12, 18, 24][q]; i++) { const a = R() * 6.28, r = 18 + R() * 30; const x = Math.cos(a) * r, z = Math.sin(a) * r - 2; if (Math.abs(x) < 9 && z > -16) continue; pl.push({ x, z, y: heightAt(x, z) - 0.1, s: 0.9 + R() * 0.6 }); }
  scene.add(palms(pl, 11));
  const rocks = scatter(R, [30, 45, 60][q], [-90, -90, 90, 90], [{ x: 0, z: 0, r: 24 }], 0).map((p) => ({ ...p, y: heightAt(p.x, p.z) - 0.4, s: 0.8 + R() * 2.6 }));
  scene.add(rockField(rocks, 'stone', 0xd8c2a0, 6));
  // uzak plan
  const zg = ziggurat(1.8); zg.position.set(-75, heightAt(-75, -110) - 3, -110); zg.rotation.y = 0.5; scene.add(zg);
  const zg2 = ziggurat(1.1, 'mudbrick', 0x9a7a5a); zg2.position.set(80, heightAt(80, -90) - 2, -90); zg2.rotation.y = -0.6; scene.add(zg2);
  const birds = makeBirds(q ? 8 : 4, { x: 0, z: -30 }, 28, 20); scene.add(birds); updaters.push(birds.userData.update);
  scene.add(makeParticles({ count: [40, 80, 120][q], box: [-25, 0.3, -15, 25, 4, 25], color: 0xffe2b0, size: 0.06, speed: 0.6, mode: 'dust', opacity: 0.5, seed: 12 }));
  return { heightAt, gate, atm, update(dt) { tickFx(dt); for (const u of updaters) u(dt); } };
}

// =====================================================================
// Savaş arka planı: aynı gökyüzü/ışık, daire içinde düz arena + uzak dekor
// =====================================================================
export function buildBattleEnv(scene, zoneId, q = 1) {
  const id = ZONE_ENV[zoneId] ? zoneId : 'kiyi'; const env = ZONE_ENV[id]; const R = rng(99 + id.length); const updaters = [];
  const atm = atmosphere(scene, { ...env, fogNear: 14, fogFar: 70 }, q, 9);
  const base = makeHeightFn(id === 'derin' ? 'gate' : 'gate', 0, 0);
  const hf = (x, z) => base(x * 0.9, z * 0.9 + 4) * (id === 'derin' ? -1 : 1) * 0.8;
  const ground = terrain(hf, -60, -60, 60, 60, [40, 60, 80][q], env.ground, env, id === 'derin' ? { emissiveMap: crackEmissive(512, 5, 0.6), crackMask: (x, z) => Math.max(0.08, smooth(0.42, 0.68, noise2(x * 0.05, z * 0.05, 71, 3))) } : {}); scene.add(ground);
  const kind = id === 'kiyi' ? 'stone' : id === 'bozkir' ? 'storm' : 'basalt';
  const rocks = []; for (let i = 0; i < 26; i++) { const a = Math.PI + R() * Math.PI, r = 10 + R() * 22; rocks.push({ x: Math.cos(a) * r, z: Math.sin(a) * r * 0.9 - 2, y: -0.3, s: 0.6 + R() * 2.2, sy: id === 'derin' ? 2 : 1 }); }
  scene.add(rockField(rocks, kind, id === 'derin' ? 0x8a7aa0 : 0xd0bca0, 31));
  if (id === 'kiyi') { scene.add(palms([{ x: -9, z: -9 }, { x: 10, z: -11 }, { x: -14, z: -4 }, { x: 15, z: -6 }], 3)); const w = makeWater(30, 6, { deep: 0x23505a, shallow: 0x5a9aa0, sky: 0xf2b27a, glint: 0xfff0c0 }); w.position.set(0, 0.03, -14); scene.add(w); }
  if (id === 'bozkir') { const st = brokenStatue(1.2, 'storm', 0xbab0a0); st.position.set(-10, 0, -10); st.rotation.y = 0.6; scene.add(st); const ln = makeLightning(scene, atm.sky, [atm.hemi, atm.sun], { x0: -40, x1: 40, z: -60 }); updaters.push(ln.update); }
  if (id === 'derin') { const rb = ribcage(1.2); rb.position.set(9, -0.3, -11); rb.rotation.y = -0.6; scene.add(rb); scene.add(makeParticles({ count: [30, 60, 90][q], box: [-12, 0.2, -12, 12, 5, 6], color: 0xd65aff, size: 0.09, speed: 0.4, mode: 'float', seed: 7 })); updaters.push(() => { ground.material.emissiveIntensity = 0.75 + Math.sin(clock.t * 1.3) * 0.25; }); }
  scene.add(columns([{ x: -6.5, z: -7, s: 0.6, broken: true }, { x: 7, z: -8, s: 0.6 }], kind === 'basalt' ? 'basalt' : 'stone'));
  return { atm, update(dt) { tickFx(dt); updaters.forEach((u) => u(dt)); } };
}

// Uzak ufuk halkası (tek InstancedMesh türü başına → 2–3 çizim çağrısı). Sis içinde silüet olarak görünür.
function horizonRing(scene, zoneId, W, H, heightAt, R, q) {
  const cx = W / 2, cz = H / 2; const r0 = Math.max(W, H) / 2 + 42;
  const n = [16, 24, 32][q] || 24;
  const pal = { kiyi: [0x8a6a4a, 0x6e5238], bozkir: [0x5a4a40, 0x7a5236], derin: [0x1a1020, 0x2a1434] }[zoneId] || [0x555555, 0x444444];
  const spireG = new THREE.CylinderGeometry(0.4, 2.6, 1, 6, 1); spireG.translate(0, 0.5, 0);           // sivri kaya / obelisk
  const towerG = new THREE.CylinderGeometry(2.2, 2.8, 1, 8, 1); towerG.translate(0, 0.5, 0);           // kule / zigurat basamağı
  const wallG = new THREE.BoxGeometry(1, 1, 1); wallG.translate(0, 0.5, 0);                            // yıkık duvar bloğu
  const dark = zoneId === 'derin';
  const mk = (g, col, count) => { const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial(dark ? { color: 0x07040a, emissive: 0x1c0828, roughness: 1, flatShading: true, fog: false } : { color: col, roughness: 0.95, flatShading: true }), count); m.frustumCulled = false; scene.add(m); return m; };
  const kinds = zoneId === 'derin' ? [['spire', 0.6], ['tower', 0.15], ['wall', 0.25]] : zoneId === 'bozkir' ? [['spire', 0.35], ['tower', 0.35], ['wall', 0.3]] : [['spire', 0.2], ['tower', 0.3], ['wall', 0.5]];
  const counts = kinds.map(([, f]) => Math.max(2, Math.round(n * f)));
  const meshes = { spire: mk(spireG, pal[0], counts[0]), tower: mk(towerG, pal[1], counts[1]), wall: mk(wallG, pal[1], counts[2]) };
  const idx = { spire: 0, tower: 0, wall: 0 }; const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  const total = counts.reduce((a, b) => a + b, 0); const order = [];
  kinds.forEach(([k], i) => { for (let j = 0; j < counts[i]; j++) order.push(k); });
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  order.forEach((k, i) => {
    const a = (i / total) * Math.PI * 2 + (R() - 0.5) * 0.18; const rr = r0 + R() * 34;
    const x = cx + Math.cos(a) * rr * (W / Math.max(W, H)) , z = cz + Math.sin(a) * rr * (H / Math.max(W, H));
    const y = heightAt(x, z) - 1.5;
    const big = 0.7 + R() * 0.9;
    if (k === 'spire') S.set(big * (0.8 + R() * 0.6), (zoneId === 'derin' ? 22 : 14) * big + R() * 10, big * (0.8 + R() * 0.6));
    else if (k === 'tower') S.set(big * 1.2, (zoneId === 'kiyi' ? 9 : 16) * big + R() * 8, big * 1.2);
    else S.set(6 + R() * 10, 3 + R() * 6, 1.4 + R() * 1.2);
    E.set((R() - 0.5) * (k === 'spire' ? 0.25 : 0.06), R() * Math.PI * 2, (R() - 0.5) * (k === 'spire' ? 0.25 : 0.06)); Q.setFromEuler(E);
    P.set(x, y, z); M4.compose(P, Q, S); meshes[k].setMatrixAt(idx[k]++, M4);
  });
  for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;
}
