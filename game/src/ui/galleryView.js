// ?gallery=1 : bütün modelleri yan yana gösterir (modelci ve test için)
// ?gallery=1&close=<id> : tek yaratığın 3 büyüme evresi yakın plan
// ?gallery=1&close=<id>&anim=<attackQuick|attackHeavy|finisher|guard|victory|absorb|eat|gather|rest|die> : evre 3 + animasyon tekrarı
// ?gallery=1&set=dragons : 4 ejderha × 3 evre
import * as THREE from 'three';
import { getModel } from './models.js';
import { makeLights, toScreen } from './stage.js';
import { tr as tr0 } from './labels.js';
const DN = { ejder_ates: 'Ateş Ejderhası', ejder_su: 'Su Ejderhası', ejder_zehir: 'Zehir Ejderhası', ejder_tas: 'Taş Ejderhası' };
const tr = (id) => DN[id] || tr0(id);
const DIDS = Object.keys(DN).flatMap((d) => [[d, 1], [d, 2], [d, 3]]);
const IDS = [['ugallu', 1], ['ugallu', 2], ['ugallu', 3], ['girtablullu', 1], ['girtablullu', 3], ['kulullu', 1], ['kulullu', 3], ['kusarikku', 1], ['kusarikku', 3], ['basmu', 1], ['uridimmu', 1], ['mushussu', 3], ['lahmu', 3], ['anzu', 3], ['usumgallu', 3], ['keeper', 1], ['egg', 'S']];
export function createGallery(ui) {
  const q = new URLSearchParams(location.search); const close = q.get('close'); const animName = q.get('anim');
  const scene = new THREE.Scene(); scene.background = new THREE.Color(close ? 0x2a2230 : 0xe8d5a8); makeLights(scene, close ? { sunI: 2.0, hemiI: 0.9, sky: 0xd8e6ff, ground: 0x4a3a30 } : undefined);
  if (close) { const rim = new THREE.DirectionalLight(0x9fd0ff, 1.2); rim.position.set(-6, 4, -6); scene.add(rim); const fl = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.95 })); fl.rotation.x = -Math.PI / 2; scene.add(fl); }
  const cam = new THREE.PerspectiveCamera(close ? 30 : 35, innerWidth / innerHeight, 0.1, 100);
  const ms = []; const lay = document.createElement('div'); lay.className = 'tags'; ui.appendChild(lay);
  const dragons = q.get('set') === 'dragons';
  const list = close ? (animName ? [[close, 3]] : [[close, 1], [close, 2], [close, 3]]) : dragons ? DIDS : IDS;
  list.forEach(([id, st], i) => {
    const m = getModel(id, st);
    if (close) { m.group.position.set(animName ? 0 : (i - 1) * 2.6, 0, 0); m.group.rotation.y = animName ? 0.9 : 0.55; }
    else if (dragons) { const row = Math.floor(i / 6), col = i % 6; m.group.position.set((col - 2.5) * 3.4, 0, row ? -4.5 : 2.5); m.group.rotation.y = 0.75; }
    else { const row = i < 9 ? 0 : 1; const col = row ? i - 9 : i; m.group.position.set((col - (row ? 3.5 : 4)) * 2.7, 0, row ? -5 : 3); m.group.rotation.y = 0.5; }
    scene.add(m.group); ms.push(m);
    const t = document.createElement('div'); t.className = 'tag'; t.style.color = close ? '#f3ead6' : '#222'; t.style.textShadow = close ? '0 1px 2px #000' : 'none'; t.textContent = close ? `${tr(id)} · evre ${st} (sv ${[1, 5, 10][st - 1]})` : `${tr(id)} ${st}`; lay.appendChild(t); m.tag = t;
  });
  if (close) { cam.position.set(0, animName ? 2.2 : 2.6, animName ? 6.2 : 8.4); cam.lookAt(0, animName ? 1.0 : 1.05, 0); } else if (dragons) { cam.position.set(0, 6.5, 15); cam.lookAt(0, 0.6, -1); } else { cam.position.set(0, 10, 25); cam.lookAt(0, 0.5, -1); }
  let loopT = 0, busy = false;
  return {
    scene, camera: cam,
    update(dt) {
      ms.forEach((m) => { m.anim.update(dt); const s = toScreen(m.group, cam, close ? -0.25 : -0.3); m.tag.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,0)`; });
      if (animName && !busy) { loopT += dt; if (loopT > 0.8) { loopT = 0; busy = true; const a = ms[0].anim; const tgt = new THREE.Vector3(-1.6, 0.3, 2.2); if (animName === 'absorb' && !ms.tgt) { ms.tgt = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0x6fe8ff })); ms.tgt.position.copy(tgt); scene.add(ms.tgt); }
        const p = animName === 'guard' ? (a.guard(true), new Promise((r) => setTimeout(() => { a.guard(false); r(); }, 1500))) : animName === 'rest' ? (a.rest(true), new Promise((r) => setTimeout(() => { a.rest(false); setTimeout(r, 1200); }, 2500))) : animName === 'absorb' ? a.absorb(tgt, 2) : animName === 'die' ? a.die().then(() => new Promise((r) => setTimeout(() => { a.reset(); r(); }, 1200))) : a[animName](); Promise.resolve(p).then(() => (busy = false)); } }
    },
  };
}
