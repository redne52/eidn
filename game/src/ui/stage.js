// Ortak Three.js sahnesi: tek renderer, tek döngü; görünümler (dünya, kapı, savaş) değiştirilir.
import * as THREE from 'three';
import R from '../data/rules.json';
import { updateTweens } from './models.js';
import { texCfg } from './env/textures.js';

export const stage = { renderer: null, view: null, quality: 1, shake: 0, listeners: [], reducedFx: false, dtCap: /[?&]dtcap=/.test(location.search) ? 0.25 : 0.12 };
// Azaltılmış efekt: kamera sarsıntısı, yakınlaşma ve ekran flaşı kapanır
export function setReducedFx(v) { stage.reducedFx = !!v; if (v) stage.shake = 0; }

export function initStage(container) {
  const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, R.performance.maxPixelRatio));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.domElement.id = 'gl'; container.appendChild(r.domElement);
  stage.renderer = r; globalThis.__edinRenderer = r; resize();
  window.addEventListener('resize', resize);
  const loop = () => {
    const dt = Math.min(stage.dtCap, (stage._t1 = performance.now(), stage._dt = ((stage._t1 - (stage._t0 || stage._t1)) / 1000), stage._t0 = stage._t1, stage._dt));
    requestAnimationFrame(loop); // önce bir sonraki kareyi iste: bir hata döngüyü asla durdurmasın
    try { updateTweens(dt); } catch (e) { console.error(e); }
    for (const f of stage.listeners.slice()) { try { f(dt); } catch (e) { console.error(e); } }
    const v = stage.view;
    if (v) try {
      v.update && v.update(dt);
      const cam = v.camera;
      if (stage.shake > 0) { stage.shake = Math.max(0, stage.shake - dt); const a = stage.shake * 0.5; cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a; }
      if (v.exposure) r.toneMappingExposure = v.exposure;
      r.render(v.scene, cam);
    } catch (e) { console.error(e); }
  };
  requestAnimationFrame(loop);
}
// grafik kalitesi: 0 Düşük, 1 Orta (varsayılan), 2 Yüksek
export function setQuality(q) {
  stage.quality = q; texCfg.size = [128, 256, 512][q] || 256;
  const dpr = window.devicePixelRatio || 1;
  stage.renderer.setPixelRatio(q === 0 ? 1 : q === 1 ? Math.min(dpr, 1.25) : Math.min(dpr, R.performance.maxPixelRatio));
  resize();
}
export const QUALITY_NAMES = ['Düşük', 'Orta', 'Yüksek'];
export function perfInfo() { const i = stage.renderer?.info.render; return i ? { calls: i.calls, triangles: i.triangles, points: i.points } : null; }
export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  stage.renderer.setSize(w, h, false);
  stage.renderer.domElement.style.width = w + 'px'; stage.renderer.domElement.style.height = h + 'px';
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
