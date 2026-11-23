// Ortak Three.js sahnesi: tek renderer, tek döngü; görünümler (dünya, kapı, savaş) değiştirilir.
import * as THREE from 'three';
import R from '../data/rules.json';
import { updateTweens } from './models.js';
import { texCfg } from './env/textures.js';
import { createPost } from './post.js';

export const stage = { renderer: null, post: null, view: null, quality: 1, shake: 0, hitStop: 0, listeners: [], reducedFx: false, dtCap: /[?&]dtcap=/.test(location.search) ? 0.25 : 0.12 };
// Azaltılmış efekt: kamera sarsıntısı, yakınlaşma ve ekran flaşı kapanır
export function setReducedFx(v) { stage.reducedFx = !!v; if (v) stage.shake = 0; }

export function initStage(container) {
  const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, R.performance.maxPixelRatio));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.domElement.id = 'gl'; container.appendChild(r.domElement);
  r.info.autoReset = false; // son işlem ve gölge geçişleri dahil kare başına toplam ölçüm
  stage.renderer = r; globalThis.__edinRenderer = r; resize();
  window.addEventListener('resize', resize);
  const loop = () => {
    let dt = Math.min(stage.dtCap, (stage._t1 = performance.now(), stage._dt = ((stage._t1 - (stage._t0 || stage._t1)) / 1000), stage._t0 = stage._t1, stage._dt));
    // isabette mikro duraklama (hit-stop): oyun zamanı kısa süre durur, gerçek zaman akar
    if (stage.hitStop > 0) { stage.hitStop -= dt; dt = 0; }
    r.info.reset();
    requestAnimationFrame(loop); // önce bir sonraki kareyi iste: bir hata döngüyü asla durdurmasın
    try { updateTweens(dt); } catch (e) { console.error(e); }
    for (const f of stage.listeners.slice()) { try { f(dt); } catch (e) { console.error(e); } }
    const v = stage.view;
    if (v) try {
      v.update && v.update(dt);
      const cam = v.camera;
      if (stage.shake > 0) { stage.shake = Math.max(0, stage.shake - dt); const a = stage.shake * 0.5; cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a; }
      if (v.exposure) r.toneMappingExposure = v.exposure;
      if (v.shadowFocus) v.shadowFocus();
      if (stage.post && stage.quality > 0) { stage.post.setLook(v.lookId || 'kiyi'); stage.post.render(v.scene, cam, dt); }
      else r.render(v.scene, cam);
    } catch (e) { console.error(e); }
  };
  requestAnimationFrame(loop);
}
// grafik kalitesi: 0 Düşük, 1 Orta (varsayılan), 2 Yüksek
export function setQuality(q) {
  stage.quality = q; texCfg.size = [128, 256, 512][q] || 256;
  const dpr = window.devicePixelRatio || 1;
  const r = stage.renderer;
  r.setPixelRatio(q === 0 ? 1 : q === 1 ? Math.min(dpr, 1.25) : Math.min(dpr, R.performance.maxPixelRatio));
  // gerçek gölge yalnız Orta/Yüksek
  r.shadowMap.enabled = q > 0; r.shadowMap.type = THREE.PCFSoftShadowMap;
  if (q > 0) { try { if (!stage.post) stage.post = createPost(r); stage.post.setQuality(q); } catch (e) { console.error('son işlem kapatıldı', e); stage.post = null; } }
  resize();
}
// isabette kısa duraklama (azaltılmış efektte yok)
export function hitStop(ms = 60) { if (stage.reducedFx) return; stage.hitStop = Math.max(stage.hitStop, ms / 1000); }

// Ana yön ışığı için oyuncuyu izleyen dar gölge kutusu (Orta: 1024, Yüksek: 2048)
export function attachSunShadow(sun, scene, q, { box = 16, far = 120 } = {}) {
  if (!sun || q <= 0) return null;
  sun.castShadow = true; const s = q >= 2 ? 2048 : 1024; sun.shadow.mapSize.set(s, s);
  const c = sun.shadow.camera; c.left = -box; c.right = box; c.top = box; c.bottom = -box; c.near = 1; c.far = far; c.updateProjectionMatrix();
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  const dir = sun.position.clone().normalize(); if (!sun.target.parent) scene.add(sun.target);
  return (focus) => { sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(dir, far * 0.5); sun.target.updateMatrixWorld(); };
}
// sahnedeki uygun nesnelere gölge bayrakları: büyük opak yapılar ve karakterler düşürür, zemin alır
export function flagShadows(root, { cast = true, receive = true } = {}) {
  root.traverse((o) => {
    if (!o.isMesh || o.isPoints) return; const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.transparent || m.blending === THREE.AdditiveBlending || m.side === THREE.BackSide || m.userData?.wind) return;
    // gölge geçişini ucuz tut: her zaman çizilen (frustumCulled=false) ve haritaya yayılmış kalabalık örnekli dekor gölge düşürmez
    const wide = o.frustumCulled === false || (o.isInstancedMesh && o.count > 12);
    if (cast && !o.userData.noCast && !wide) o.castShadow = true; if (receive) o.receiveShadow = true;
  });
}
export const QUALITY_NAMES = ['Düşük', 'Orta', 'Yüksek'];
export function perfInfo() { const i = stage.renderer?.info.render; return i ? { calls: i.calls, triangles: i.triangles, points: i.points } : null; }
export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  stage.renderer.setSize(w, h, false);
  stage.renderer.domElement.style.width = w + 'px'; stage.renderer.domElement.style.height = h + 'px';
  if (stage.post) stage.post.resize();
  const v = stage.view; if (v?.camera) { v.camera.aspect = w / h; v.camera.updateProjectionMatrix(); }
}
export function setView(v) {
  if (stage.view && stage.view !== v && stage.view.dispose) stage.view.dispose();
  stage.view = v; resize();
}
export function shake(s = 0.35) { if (stage.reducedFx) return; stage.shake = Math.max(stage.shake, Math.min(0.6, s)); }

// dünya noktasını ekran pikseline çevirir
const _v = new THREE.Vector3();
export function toScreen(obj3dOrVec, camera, yOff = 0) {
  if (obj3dOrVec.isObject3D) obj3dOrVec.getWorldPosition(_v); else _v.copy(obj3dOrVec);
  _v.y += yOff; _v.project(camera);
  return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight, behind: _v.z > 1 };
}

export function makeLights(scene, { sky = 0xbfd8ff, ground = 0x8a6a40, sun = 0xfff1d0, sunI = 1.6, hemiI = 1.1 } = {}) {
  scene.add(new THREE.HemisphereLight(sky, ground, hemiI));
  const d = new THREE.DirectionalLight(sun, sunI); d.position.set(5, 10, 6); scene.add(d);
  return d;
}

export const ZONE_LOOK = {
  kiyi: { ground: 0xd9bf86, edge: 0x3f8fb0, fog: 0xcfe3e6, sky: 0x9fd0e6, props: ['reed', 'reed', 'palm', 'rock'] },
  bozkir: { ground: 0xc79f5f, edge: 0x9c7a44, fog: 0xe0c59a, sky: 0xe8c890, props: ['rock', 'palm', 'ruin', 'rock'] },
  derin: { ground: 0x4b3f5e, edge: 0x241d33, fog: 0x2b2440, sky: 0x2b2440, props: ['ruin', 'crystal', 'rock', 'crystal'] },
  gate: { ground: 0xd2b27a, edge: 0x9c7a44, fog: 0xf1d9ad, sky: 0xf4d9a6 },
};
