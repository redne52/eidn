// KARAKTER RUHU YUTMA (savaş yutmasından ayrı, yalnızca görsel). Ödül çekirdekte resolvePull/feedAllPending ile
// BİR KEZ verilir; bu sahne kesilse/hızlandırılsa sayılar değişmez.
//
// Sıra: 1) yedirilen karakterin yarı saydam HAYALETİ belirir (fresnel kenar, derece renginde iç parıltı)
//       2) başını eğer  3) uçlardan ışık şeritlerine çözülür (dissolve, edgeFirst)
//       4) ejderhanın ağzının önünde dönen GİRDAP oluşur, parçacıklar sarmal içeri çekilir
//       5) göğüste derece renginde 2 nabız + kısa nefes buharı, "+N öz".
// Süre: C/B 2 sn · A/S 2,5 sn · mitolojik 4 sn · çoklu ("Hepsini yedir") ≤ 4 sn. Dokununca ×4 (speed).
// Bütçe: ≤ 180 parçacık (tek THREE.Points) + 3 şerit çizgi + hayalet başına 1–4 çizim çağrısı.
import * as THREE from 'three';
import { getModel } from './models.js';
import { glowTex } from './env/textures.js';
import { applyDissolve } from './dissolve.js';
import { PULL_COLOR, pullKey, haloTex } from './crystal.js';
// Hayalet renkleri: C derece gri-beyaz yerine sıcak toprak tonu (kristal/ışık sütunu C gri kalır)
const GHOST_COLOR = { C: 0xc98a4b };

const MAXP = 180;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const FORCE_FALLBACK = typeof location !== 'undefined' && /[?&]dissolve=fallback/.test(location.search);

export function feedDuration(items, reduced = false) {
  const one = (p) => (p.mythic ? 4 : p.grade === 'A' || p.grade === 'S' ? 2.5 : 2);
  const d = items.length === 1 ? one(items[0]) : Math.min(4, 2.2 + items.length * 0.18);
  return reduced ? d * 0.5 : d;
}

/** Hayalet malzemesi: standart malzeme + fresnel kenar (tek geçersiz kılma malzemesi). Yedek: saydam MeshBasic. */
function ghostMaterial(color, vivid = false) {
  if (FORCE_FALLBACK) { const b = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: vivid ? 0.7 : 0.5, depthWrite: false }); b.userData.ghost = true; return b; }
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: vivid ? 1.25 : 0.55, roughness: 1, metalness: 0, transparent: true, opacity: vivid ? 0.8 : 0.55, depthWrite: false });
  m.userData.ghost = true;
  const rim = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: rim };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  float gfr = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
  gl_FragColor.rgb += uRim * gfr * ${vivid ? '2.2' : '1.4'};
  gl_FragColor.a *= (${vivid ? '0.6 + 0.4' : '0.35 + 0.65'} * gfr);`);
  };
  m.customProgramCacheKey = () => (vivid ? 'ghostFresnelV' : 'ghostFresnel');
  return m;
}

const VERT = `attribute float psize; attribute float palpha; attribute vec3 pcol; uniform float uScale; varying vec3 vC; varying float vA;
void main(){ vC = pcol; vA = palpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const FRAG = `uniform sampler2D uTex; varying vec3 vC; varying float vA;
void main(){ vec4 t = texture2D(uTex, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * (0.6 + t.rgb * 0.8), a); }`;

/**
 * @param scene
 * @param o.dragon   yutan ejderha modeli (meta.mouthWorld/chestWorld/glow, anim.absorb)
 * @param o.items    [{ species, grade, mythic, oz }]
 * @param o.ghostAt  hayaletlerin merkezi (dünya)
 */
export function createSpiritFeed(scene, { dragon, items, ghostAt, camera, renderer, reduced = false, quality = 1, stage = 2, onLabel = () => {}, vivid = false, ghostScale = 1 }) {
  const T = feedDuration(items, reduced);
  const n = items.length;
  const mouth = () => (dragon.meta && dragon.meta.mouthWorld ? dragon.meta.mouthWorld(new THREE.Vector3()) : dragon.group.position.clone().setY(1.4));
  const chest = () => (dragon.meta && dragon.meta.chestWorld ? dragon.meta.chestWorld(new THREE.Vector3()) : dragon.group.position.clone().setY(0.9));
  const m0 = mouth();
  const toGhost = new THREE.Vector3().subVectors(ghostAt, m0).setY(0).normalize();
  const vortexC = m0.clone().addScaledVector(toGhost, 0.75).add(new THREE.Vector3(0, 0.05, 0));
  const axis = new THREE.Vector3().subVectors(m0, vortexC).normalize();
  const perpA = new THREE.Vector3(0, 1, 0).cross(axis).normalize(); if (perpA.lengthSq() < 0.01) perpA.set(1, 0, 0);
  const perpB = new THREE.Vector3().crossVectors(axis, perpA).normalize();

  // ---- hayaletler ----
  const span = n === 1 ? 1 : 0.62;
  const ghosts = items.map((it, i) => {
    const col = GHOST_COLOR[pullKey(it)] ?? PULL_COLOR[pullKey(it)];
    const m = getModel(it.species, stage);
    // tek geçersiz kılma malzemesi (gölge diski gizlenir)
    const gm = ghostMaterial(col, vivid);
    m.group.traverse((o) => { if (o.isMesh) { if (o.geometry && o.geometry.type === 'CircleGeometry') { o.visible = false; return; } o.material = gm; o.renderOrder = 3; } });
    // yerleşim: tekse ghostAt; çoksa yay üzerinde
    // çoklu: kameraya göre yan yana iki sıra (öndeki/arkadaki), soldan sağa uzaklaşır
    const side = new THREE.Vector3(-toGhost.z, 0, toGhost.x);
    const f = n === 1 ? 0 : i / (n - 1);
    const pos = n === 1 ? ghostAt.clone() : ghostAt.clone().addScaledVector(toGhost, -0.8 + f * 2.6).addScaledVector(side, i % 2 ? 0.9 : -0.7);
    const sc = (n === 1 ? 1 : n > 6 ? 0.58 : 0.7) * ghostScale;
    m.group.position.copy(pos); m.group.scale.setScalar(sc);
    m.group.lookAt(m0.x, pos.y, m0.z);
    scene.add(m.group);
    m.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.group); const center = box.getCenter(new THREE.Vector3()); const radius = Math.max(0.4, box.getSize(new THREE.Vector3()).length() * 0.5);
    const dis = applyDissolve(m.group, { color: col, scale: 3.6, edgeFirst: true, center, radius, shrink: 0.4 });
    dis.set(0, 0);
    // yüzey örnekleri (grup yerel uzayında)
    const samples = [];
    m.group.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry) return; const pa = o.geometry.attributes.position; if (!pa) return;
      const step = Math.max(1, Math.floor(pa.count / 60));
      for (let k = 0; k < pa.count; k += step) samples.push(m.group.worldToLocal(o.localToWorld(new THREE.Vector3().fromBufferAttribute(pa, k))));
    });
    const t0 = n === 1 ? 0 : (i / Math.max(1, n - 1)) * (1 - span) * 0.85;
    return { it, m, col: new THREE.Color(col), dis, center, samples, t0, sc };
  });

  // ---- parçacıklar ----
  const N = Math.min(MAXP, Math.round((reduced ? 50 : [90, 140, 180][quality ?? 1]) ));
  const pos = new Float32Array(N * 3), pcol = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pcol', new THREE.BufferAttribute(pcol, 3));
  geo.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('palpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const H = renderer ? renderer.getDrawingBufferSize(new THREE.Vector2()).y : innerHeight;
  const uScale = (H * 0.5) / Math.tan(THREE.MathUtils.degToRad((camera?.fov || 42) / 2));
  const pmat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uTex: { value: glowTex() }, uScale: { value: uScale } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, pmat); points.frustumCulled = false; points.renderOrder = 6; scene.add(points);
  const P = [];
  const nBreath = reduced ? 0 : 10;
  for (let i = 0; i < N; i++) {
    const breath = i >= N - nBreath;
    const g = ghosts[i % ghosts.length];
    const c = breath ? new THREE.Color(0xdfefff) : g.col.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.4);
    pcol[i * 3] = c.r; pcol[i * 3 + 1] = c.g; pcol[i * 3 + 2] = c.b;
    P.push({ g, breath, rel: 0.36 + Math.random() * 0.34, sz: 0.06 + Math.random() * 0.12, ph: Math.random() * 6.28, r0: 0.25 + Math.random() * 0.45, w: 5 + Math.random() * 6, start: null, p: new THREE.Vector3(), bv: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6) });
  }

  // ---- girdap şeritleri (3 sarmal çizgi; azaltılmışta yok) ----
  const lines = [];
  if (!reduced) for (let L = 0; L < 3; L++) {
    const lg = new THREE.BufferGeometry(); const la = new Float32Array(40 * 3); lg.setAttribute('position', new THREE.BufferAttribute(la, 3).setUsage(THREE.DynamicDrawUsage));
    const lm = new THREE.LineBasicMaterial({ color: ghosts[L % ghosts.length].col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(lg, lm); line.frustumCulled = false; scene.add(line); lines.push({ line, la, lm, ph: (L / 3) * Math.PI * 2 });
  }
  // ---- göğüs nabzı ----
  const pulseCol = ghosts.reduce((best, g) => (pullRank(g.it) > pullRank(best.it) ? g : best), ghosts[0]).col;
  const pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(pulseCol).multiplyScalar(1.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false }));
  pulse.renderOrder = 7; scene.add(pulse);
  const light = !reduced && quality > 0 ? new THREE.PointLight(pulseCol, 0, 6) : null; if (light) scene.add(light);

  let t = 0, absorbStarted = false, labelShown = false, finished = false, resolve;
  const tmp = new THREE.Vector3();
  const api = {
    speed: 1, count: N,
    done: new Promise((r) => (resolve = r)),
    get t() { return t; },
    get dissolveFallback() { return ghosts.some((g) => g.dis.fallback); },
    get ghostGroups() { return ghosts.map((g) => g.m.group); },
    update(dt) {
      if (finished) return;
      t += (dt * api.speed) / T;
      const m = mouth();
      // ejderha: girdaba döner, ağız açılır
      if (!absorbStarted && t >= 0.26) { absorbStarted = true; if (dragon.anim && dragon.anim.absorb) dragon.anim.absorb(vortexC.clone(), Math.max(0.4, (0.62 * T) / api.speed)).catch?.(() => {}); }
      // hayaletler
      for (const g of ghosts) {
        const u = clamp01((t - g.t0) / span);
        const appear = smooth(u / 0.15);
        const bow = u < 0.15 ? 0 : Math.sin(Math.PI * clamp01((u - 0.15) / 0.2)) * 0.32;   // başını eğer
        g.m.group.rotation.x = bow; g.m.group.position.y = (1 - appear) * -0.4;
        if (g.m.anim) g.m.anim.update(dt * 0.4);
        const kd = smooth((u - 0.32) / 0.45);
        g.dis.set(kd, appear);
      }
      // parçacıklar
      const kSpin = t * 10;
      for (let i = 0; i < N; i++) {
        const q = P[i]; let a = 0, s = q.sz;
        if (q.breath) {
          const k = clamp01((t - 0.9) / 0.1);
          if (k > 0) { q.p.copy(m).addScaledVector(q.bv, k * 0.9).addScaledVector(toGhost, k * 0.4); a = 0.5 * Math.sin(Math.PI * k); s = q.sz * (1 + k * 2); }
        } else {
          const u = clamp01((t - q.g.t0) / span);
          if (u >= q.rel) {
            if (!q.start) { const smp = q.g.samples.length ? q.g.samples[(Math.random() * q.g.samples.length) | 0] : new THREE.Vector3(); q.start = q.g.m.group.localToWorld(smp.clone()); }
            const k = clamp01((u - q.rel) / (1 - q.rel + 0.0001));          // 0 ayrılış → 1 ağız
            const toV = smooth(k / 0.45), inV = clamp01((k - 0.45) / 0.55);
            // girdap merkezi etrafında sarmal: yarıçap küçülür, açısal hız artar
            const ang = q.ph + kSpin * (1 + inV * 2) * (q.w / 8);
            const r = q.r0 * (1 - inV) * (0.6 + 0.4 * toV);
            tmp.copy(vortexC).addScaledVector(perpA, Math.cos(ang) * r).addScaledVector(perpB, Math.sin(ang) * r).addScaledVector(axis, inV * vortexC.distanceTo(m));
            q.p.copy(q.start).lerp(tmp, toV);
            a = (1 - Math.max(0, (inV - 0.85) / 0.15)) * 0.95;
            s = q.sz * (1 - 0.6 * inV);
          }
        }
        pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z; size[i] = s; alpha[i] = a;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.psize.needsUpdate = true; geo.attributes.palpha.needsUpdate = true;
      // şeritler: girdabın görünür sarmalları
      const kL = Math.sin(Math.PI * clamp01((t - 0.3) / 0.55));
      for (const L of lines) {
        for (let j = 0; j < 40; j++) {
          const f = j / 39; const ang = L.ph + kSpin * 1.6 + f * 9; const r = 0.55 * (1 - f) + 0.03;
          tmp.copy(vortexC).addScaledVector(perpA, Math.cos(ang) * r).addScaledVector(perpB, Math.sin(ang) * r).addScaledVector(axis, f * vortexC.distanceTo(m));
          L.la[j * 3] = tmp.x; L.la[j * 3 + 1] = tmp.y; L.la[j * 3 + 2] = tmp.z;
        }
        L.line.geometry.attributes.position.needsUpdate = true; L.lm.opacity = kL * 0.7;
      }
      // göğüste 2 nabız
      const kp = clamp01((t - 0.8) / 0.2);
      const beat = kp > 0 ? Math.max(0, Math.sin(kp * Math.PI * 2)) : 0;
      pulse.position.copy(chest()); pulse.scale.setScalar(0.4 + beat * 1.1); pulse.material.opacity = beat * 0.9;
      if (light) { light.position.copy(pulse.position); light.intensity = beat * 5; }
      if (dragon.meta && dragon.meta.glow && t > 0.78) dragon.meta.glow(0.45 * beat);
      if (!labelShown && t >= 0.86) { labelShown = true; onLabel(); }
      if (t >= 1) api.finish();
    },
    finish() {
      if (finished) return; finished = true;
      if (!labelShown) { labelShown = true; onLabel(); }
      if (dragon.meta && dragon.meta.glow) dragon.meta.glow(0);
      for (const g of ghosts) { scene.remove(g.m.group); g.dis.dispose(); g.m.group.traverse((o) => o.geometry && o.geometry.dispose()); }
      scene.remove(points); geo.dispose(); pmat.dispose();
      for (const L of lines) { scene.remove(L.line); L.line.geometry.dispose(); L.lm.dispose(); }
      scene.remove(pulse); pulse.material.dispose(); if (light) scene.remove(light);
      resolve();
    },
  };
  return api;
}
function pullRank(it) { return it.mythic ? 4 : { C: 0, B: 1, A: 2, S: 3 }[it.grade] ?? 0; }
