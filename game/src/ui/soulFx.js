// Ruh özü emme efekti (yalnızca görsel). Ödül çekirdekte (finishFight) bir kez verilir;
// bu efekt kesilse, hızlandırılsa ya da hiç oynamasa öz değişmez.
//
// Sıra: B) ruh göğüsten yükselir (turkuaz parçacık + hafif duman)  C) ejderha başını çevirip ağzını açar,
// enerji kıvrımlı CatmullRom yollarıyla hızlanarak ve küçük parçacıklara bölünerek ağza akar
// D) ağızdan göğse geçer, göz/boğaz/pul parlar  E) canavar bedeni çözünür.
// Tek THREE.Points (tek çizim çağrısı), en fazla 150 parçacık.
import * as THREE from 'three';
import { glowTex } from './env/textures.js';
import { applyDissolve } from './dissolve.js';

const MAXP = 150;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

const VERT = `
attribute float psize; attribute float palpha; attribute vec3 pcol;
uniform float uScale; varying vec3 vC; varying float vA;
void main(){ vC = pcol; vA = palpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = psize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const FRAG = `
uniform sampler2D uTex; varying vec3 vC; varying float vA;
void main(){ vec4 t = texture2D(uTex, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * (0.6 + t.rgb * 0.8), a); }`;

/**
 * @param scene THREE.Scene
 * @param o.from  ölen canavar modeli (getModel çıktısı)
 * @param o.to    ejderha modeli (meta.mouthWorld / chestWorld / glow)
 * @param o.camera, o.renderer  nokta boyutu ölçeği için
 * @param o.dur   saniye (normal ~1, nadir ~2, bekçi ~3,5; azaltılmışta yarısı)
 * @param o.kind  'normal' | 'rare' | 'guardian'
 */
export function createSoulAbsorb(scene, { from, to, camera, renderer, dur = 1, kind = 'normal', reduced = false, quality = 1, onLabel = () => {}, shadow = null }) {
  const base = { normal: 70, rare: 110, guardian: 150 }[kind] || 70;
  const N = Math.min(MAXP, Math.max(16, Math.round(base * [0.55, 0.85, 1][quality ?? 1] * (reduced ? 0.4 : 1))));
  const T = Math.max(0.35, dur);
  const tint = kind === 'guardian' ? new THREE.Color(0xffe08a) : kind === 'rare' ? new THREE.Color(0xc79bff) : null;

  // ---- konumlar ----
  from.group.updateMatrixWorld(true); to.group.updateMatrixWorld(true);
  const chestFrom = from.group.position.clone().setY((from.height || 1.6) * 0.5);
  const mouth = () => (to.meta && to.meta.mouthWorld ? to.meta.mouthWorld(new THREE.Vector3()) : to.group.position.clone().setY((to.height || 1.6) * 0.8));
  const chestTo = () => (to.meta && to.meta.chestWorld ? to.meta.chestWorld(new THREE.Vector3()) : to.group.position.clone().setY((to.height || 1.6) * 0.5));
  const rise = chestFrom.clone().add(new THREE.Vector3(-0.15, 0.3 + (from.height || 1.6) * 0.08, 0));

  // ---- parçacıklar ----
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pcol', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('palpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const H = renderer ? renderer.getDrawingBufferSize(new THREE.Vector2()).y : innerHeight;
  const uScale = (H * 0.5) / Math.tan(THREE.MathUtils.degToRad((camera?.fov || 40) / 2));
  const matl = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uTex: { value: glowTex() }, uScale: { value: uScale } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, matl); points.frustumCulled = false; points.renderOrder = 5; scene.add(points);

  const P = [];
  const cTeal = new THREE.Color(0x5ff6ff), cBlue = new THREE.Color(0x3a8cff), cWhite = new THREE.Color(0xe8ffff), cSmoke = new THREE.Color(0x2a6c80);
  for (let i = 0; i < N; i++) {
    const r = Math.random();
    const role = i < N * 0.16 ? 'smoke' : i < N * 0.62 ? 'soul' : 'trail';
    const c = role === 'smoke' ? cSmoke.clone() : (r < 0.3 ? cWhite : r < 0.7 ? cTeal : cBlue).clone();
    if (tint && role !== 'smoke' && Math.random() < (kind === 'guardian' ? 0.35 : 0.25)) c.copy(tint);
    col.set([c.r, c.g, c.b], i * 3);
    const off = new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
    P.push({
      role, off, delay: Math.random() * 0.35, lag: 0.04 + Math.random() * 0.1, leader: 0,
      sz: role === 'smoke' ? 0.9 + Math.random() * 0.8 : role === 'soul' ? 0.16 + Math.random() * 0.22 : 0.06 + Math.random() * 0.08,
      riseTo: rise.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.4) * 0.4, (Math.random() - 0.5) * 0.6)),
      spin: (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2.5), ph: Math.random() * Math.PI * 2,
      curve: null, p: new THREE.Vector3(),
    });
  }
  // iz parçacıkları bir öncü ruh parçacığını gecikmeli izler (bölünme görüntüsü)
  const souls = P.map((q, i) => (q.role === 'soul' ? i : -1)).filter((i) => i >= 0);
  P.forEach((q) => { if (q.role === 'trail') { q.leader = souls[(Math.random() * souls.length) | 0]; q.delay = P[q.leader].delay; } });

  // ---- canavar bedeni: güvenli çözülme efekti (GLB dahil; uyumsuzsa ya da hata olursa opaklık+küçülme yedeği) ----
  const dis = applyDissolve(from.group, { color: kind === 'guardian' ? 0xffd070 : kind === 'rare' ? 0xc79bff : 0x5ff6ff, scale: 2.6, shrink: 0.25 });
  const y0 = from.group.position.y;

  // ---- ışık (orta/yüksek kalitede, azaltılmışta yok) ----
  const light = !reduced && quality > 0 ? new THREE.PointLight(0x5ff0ff, 0, 6) : null;
  if (light) { light.position.copy(chestFrom); scene.add(light); }

  let t = 0, absorbStarted = false, labelShown = false, finished = false, resolve;
  const api = {
    speed: 1,
    done: new Promise((r) => (resolve = r)),
    get t() { return t; },
    update(dt) {
      if (finished) return;
      t += (dt * api.speed) / T;
      const m = mouth(), ch = chestTo();
      // C başlarken: ejderha başını çevirir, eğriler kurulur
      if (!absorbStarted && t >= 0.22) {
        absorbStarted = true;
        if (to.anim && to.anim.absorb) to.anim.absorb(rise.clone(), Math.max(0.4, ((0.8 - t) * T) / api.speed)).catch?.(() => {});
        for (const q of P) {
          if (q.role !== 'soul') continue;
          const a = q.riseTo.clone(); const side = new THREE.Vector3().subVectors(m, a); const len = side.length();
          const perp = new THREE.Vector3(-side.z, 0, side.x).normalize();
          const c1 = a.clone().lerp(m, 0.33).addScaledVector(perp, (Math.random() - 0.5) * 1.6 * Math.min(1.5, len * 0.4)).add(new THREE.Vector3(0, 0.1 + Math.random() * 0.4, 0));
          const c2 = a.clone().lerp(m, 0.72).addScaledVector(perp, (Math.random() - 0.5) * 0.8).add(new THREE.Vector3(0, Math.random() * 0.2, 0));
          q.curve = new THREE.CatmullRomCurve3([a, c1, c2, m.clone()], false, 'catmullrom', 0.5);
        }
      }
      const kB = smooth(t / 0.3);                 // yükseliş
      const kC = clamp01((t - 0.25) / 0.6);       // akış
      const kD = clamp01((t - 0.8) / 0.2);        // ağızdan göğse
      for (let i = 0; i < N; i++) {
        const q = P[i]; let a = 0, s = q.sz;
        if (q.role === 'smoke') {
          const k = clamp01(t / 0.55);
          q.p.copy(chestFrom).add(q.off).lerp(q.riseTo, smooth(k)); q.p.y += k * 0.3;
          a = 0.22 * Math.sin(Math.PI * k); s = q.sz * (0.6 + k);
        } else {
          const lead = q.role === 'trail' ? P[q.leader] : q;
          const pc = clamp01((kC - lead.delay) / (1 - 0.35) - (q.role === 'trail' ? q.lag : 0));
          const acc = Math.pow(pc, 1.4);           // hızlanarak
          if (!lead.curve || pc <= 0) {
            // B: göğüsten yükseliş + hafif girdap
            const w = t * 6 * q.spin + q.ph; const sw = new THREE.Vector3(Math.cos(w) * 0.12, 0, Math.sin(w) * 0.12);
            q.p.copy(chestFrom).add(q.off.clone().multiplyScalar(0.6)).lerp(q.riseTo, kB).add(sw);
            a = Math.min(1, t * 6) * (q.role === 'trail' ? 0.55 : 0.9);
          } else {
            lead.curve.points[3].copy(m);
            lead.curve.getPoint(acc, q.p);
            // eğri boyunca kıvrılma
            const wob = Math.sin(acc * 9 + q.ph) * 0.08 * (1 - acc); q.p.x += wob; q.p.z += Math.cos(acc * 7 + q.ph) * 0.06 * (1 - acc);
            if (pc >= 1) { q.p.lerpVectors(m, ch, smooth(kD)); }
            a = (q.role === 'trail' ? 0.6 : 1) * (pc >= 1 ? 1 - kD : 1);
            s = q.sz * (1 - 0.65 * acc) * (pc >= 1 ? 0.6 * (1 - kD) : 1);   // ağza yaklaştıkça küçülür
          }
        }
        pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z; size[i] = s; alpha[i] = a;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.psize.needsUpdate = true; geo.attributes.palpha.needsUpdate = true;
      // ışık parçacıkların ağırlık merkezini izler
      if (light) { light.position.lerpVectors(chestFrom, m, smooth(kC)); light.intensity = (kind === 'guardian' ? 6 : 3.5) * Math.sin(Math.PI * clamp01(t)) ; }
      // D: göz/boğaz/pul parıltısı
      if (to.meta && to.meta.glow && t > 0.75) to.meta.glow(0.4 * Math.sin(Math.PI * clamp01((t - 0.75) / 0.25)));
      if (!labelShown && t >= 0.82) { labelShown = true; onLabel(); }
      // E: beden çözünür (yavaş batma + saydamlaşma)
      const kE = smooth((t - 0.3) / 0.7);
      dis.set(kE);
      if (shadow && shadow.material) { shadow.material.transparent = true; shadow.material.opacity = (shadow.userData.op0 ??= shadow.material.opacity) * 0.45 * (1 - kE); }
      from.group.position.y = y0 - 0.45 * kE;
      if (t >= 1) api.finish();
    },
    finish() {
      if (finished) return; finished = true;
      if (!labelShown) { labelShown = true; onLabel(); }
      if (to.meta && to.meta.glow) to.meta.glow(0);
      from.group.visible = false;
      scene.remove(points); geo.dispose(); matl.dispose();
      if (light) scene.remove(light);
      dis.dispose();
      resolve();
    },
    count: N,
    get dissolveFallback() { return dis.fallback; },
  };
  return api;
}
