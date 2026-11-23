// Savaş efektleri: vuruş türlerine ve yaratığa özel bitiricilere göre kısa ömürlü 3D efektler.
// Hepsi tek bir güncelleme listesinde yaşar, süresi bitince sahneden çıkarılır ve bellekten atılır.
import * as THREE from 'three';
import { glowTex } from './env/textures.js';

// yaratık → bitirici efekti (models.js meta.finisherFx yoksa)
export const FINISHER_FX = { ugallu: 'storm', girtablullu: 'poison', kulullu: 'water', kusarikku: 'horn', ejder_ates: 'fire', ejder_su: 'water', ejder_zehir: 'poison', ejder_tas: 'horn' };
export function finisherFxOf(model, id) { return (model && model.meta && model.meta.finisherFx) || FINISHER_FX[id] || 'fire'; }

const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false };
const geoCache = {};
const geo = (k, f) => (geoCache[k] ||= f());

export function createBattleFx(scene, { quality = 1, reduced = () => false } = {}) {
  const root = new THREE.Group(); scene.add(root);
  const live = [];
  const pc = (n) => Math.max(2, Math.round(n * [0.45, 1, 1.4][quality]));

  function add(obj, dur, tick) { root.add(obj); live.push({ obj, t: 0, dur, tick }); return obj; }
  function sprite(color, size, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }));
    s.scale.set(size, size, 1); return s;
  }
  // yay biçimli kesik (pençe / kılıç izi)
  function slash(pos, { color = 0xffffff, r = 0.9, w = 0.09, rot = 0, tilt = 0, dur = 0.28, arc = 2.2 } = {}) {
    const g = geo('slash' + r + w + arc, () => new THREE.RingGeometry(r - w, r, 24, 1, 0, arc));
    const m = new THREE.MeshBasicMaterial({ color, ...ADD, opacity: 1 }); const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(pos); mesh.rotation.set(tilt, Math.PI / 2, rot);
    return add(mesh, dur, (k) => { m.opacity = 1 - k; mesh.scale.setScalar(0.8 + k * 0.5); });
  }
  // yere yayılan şok halkası
  function ring(pos, { color = 0xffd27a, from = 0.3, to = 2.6, dur = 0.45, opacity = 0.9 } = {}) {
    const g = geo('ring', () => new THREE.RingGeometry(0.85, 1, 40));
    const m = new THREE.MeshBasicMaterial({ color, ...ADD, opacity }); const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2; mesh.position.copy(pos).setY(0.08);
    return add(mesh, dur, (k) => { const s = from + (to - from) * (1 - (1 - k) * (1 - k)); mesh.scale.setScalar(s); m.opacity = opacity * (1 - k); });
  }
  // parlama
  function flash(pos, color, size = 1.6, dur = 0.22) { const s = sprite(color, size); s.position.copy(pos); return add(s, dur, (k) => { s.material.opacity = 1 - k; s.scale.setScalar(size * (1 + k * 0.6)); }); }
  // parçacık püskürmesi (sprite tabanlı, yerçekimli)
  function sparks(pos, color, n = 12, { speed = 3, up = 2, size = 0.22, dur = 0.6, grav = 6, spread = 1 } = {}) {
    for (let i = 0; i < pc(n); i++) {
      const s = sprite(color, size); s.position.copy(pos);
      const v = new THREE.Vector3((Math.random() - 0.5) * speed * spread, Math.random() * up + 0.5, (Math.random() - 0.5) * speed);
      add(s, dur * (0.7 + Math.random() * 0.5), (k, dt) => { s.position.addScaledVector(v, dt); v.y -= grav * dt; s.material.opacity = 1 - k; });
    }
  }
  // yükselen buhar / sis
  function vapor(pos, color, n = 8, { rise = 1.4, size = 0.9, dur = 1.1, radius = 0.6 } = {}) {
    for (let i = 0; i < pc(n); i++) {
      const s = sprite(color, size, 0.7); s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * radius * 2, Math.random() * 0.4, (Math.random() - 0.5) * radius * 2));
      const y0 = s.position.y, d = dur * (0.7 + Math.random() * 0.6);
      add(s, d, (k) => { s.position.y = y0 + rise * k; s.material.opacity = 0.7 * (1 - k) * Math.min(1, k * 5); s.scale.setScalar(size * (0.6 + k)); });
    }
  }
  // zikzak yıldırım (yukarıdan hedefe)
  function bolt(to, color = 0xcfe6ff, h = 5, dur = 0.3) {
    const pts = []; let x = to.x + (Math.random() - 0.5) * 1.5, y = to.y + h;
    while (y > to.y) { pts.push(new THREE.Vector3(x, y, to.z)); y -= 0.5 + Math.random() * 0.6; x += (Math.random() - 0.5) * 0.7; } pts.push(to.clone());
    const v = []; const w = 0.07;
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; v.push(a.x - w, a.y, a.z, a.x + w, a.y, a.z, b.x - w, b.y, b.z, a.x + w, a.y, a.z, b.x + w, b.y, b.z, b.x - w, b.y, b.z); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const m = new THREE.MeshBasicMaterial({ color, ...ADD }); const mesh = new THREE.Mesh(g, m); mesh.userData.own = true;
    return add(mesh, dur, (k) => { m.opacity = k < 0.5 ? 1 : (1 - k) * 2 * (0.5 + 0.5 * Math.sin(k * 60)); });
  }
  // iki nokta arasında kavisli iz (akrep kuyruğu / su hortumu)
  function arcTrail(from, to, { color, radius = 0.12, height = 2.2, dur = 0.5 } = {}) {
    const mid = from.clone().lerp(to, 0.5); mid.y += height;
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    const g = new THREE.TubeGeometry(curve, 20, radius, 6, false);
    const m = new THREE.MeshBasicMaterial({ color, ...ADD }); const mesh = new THREE.Mesh(g, m); mesh.userData.own = true;
    g.setDrawRange(0, 0); const total = g.index.count;
    return add(mesh, dur, (k) => { g.setDrawRange(0, Math.floor(total * Math.min(1, k * 2.2))); m.opacity = k < 0.55 ? 1 : (1 - k) / 0.45; });
  }
  // yarım küre kalkan
  function dome(pos, { color = 0xffd27a, r = 1.4, dur = 0.9, opacity = 0.45 } = {}) {
    const g = geo('dome', () => new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2));
    const m = new THREE.MeshBasicMaterial({ color, ...ADD, opacity }); const mesh = new THREE.Mesh(g, m); mesh.position.copy(pos).setY(0.02);
    return add(mesh, dur, (k) => { mesh.scale.setScalar(r * (0.7 + 0.3 * Math.min(1, k * 4))); m.opacity = opacity * (k < 0.7 ? 1 : (1 - k) / 0.3); });
  }
  // dalga: zeminde ilerleyen su duvarı
  function wave(from, to, { color = 0x48d0ff, dur = 0.55 } = {}) {
    const g = geo('wave', () => new THREE.CylinderGeometry(1, 1, 1, 24, 1, true, -0.9, 1.8));
    const m = new THREE.MeshBasicMaterial({ color, ...ADD, opacity: 0.6 }); const mesh = new THREE.Mesh(g, m);
    const dir = to.clone().sub(from); dir.y = 0; const len = dir.length(); dir.normalize();
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    return add(mesh, dur, (k) => { const p = from.clone().addScaledVector(dir, len * k); mesh.position.set(p.x, 0.4 * (1 - k) + 0.3, p.z); mesh.scale.set(0.6 + k * 0.6, 0.9 * Math.sin(Math.PI * Math.min(1, k * 1.2)) + 0.1, 0.6 + k * 0.6); m.opacity = 0.65 * (1 - k * 0.7); });
  }

  const api = {
    root,
    // hafif, kısa: hızlı vuruş
    quick(at, dir = 1) { slash(at, { color: 0xffffff, r: 0.7, w: 0.06, rot: dir > 0 ? 0.6 : 2.5, dur: 0.2 }); sparks(at, 0xfff0c0, 5, { speed: 2.4, up: 1, size: 0.14, dur: 0.35 }); },
    // ağır: geniş iz + şok halkası + toz
    heavy(at, dir = 1) {
      slash(at, { color: 0xffd27a, r: 1.15, w: 0.14, rot: dir > 0 ? -0.4 : 3.5, dur: 0.32, arc: 2.6 });
      ring(at, { color: 0xffc66a, to: 2.4 }); sparks(at, 0xd8b890, 10, { speed: 3.5, up: 1.6, size: 0.3, dur: 0.6, grav: 8 });
      flash(at, 0xffe2a0, 1.8);
    },
    crit(at) { flash(at, 0xffd84a, 2.6, 0.28); sparks(at, 0xffd84a, 16, { speed: 4.5, up: 2.4, size: 0.2, dur: 0.6 }); },
    block(at) { flash(at, 0xb8d0ff, 1.2, 0.18); sparks(at, 0xdde8ff, 6, { speed: 3, up: 1, size: 0.12, dur: 0.3, grav: 4 }); },
    counter(at, defenderPos) { dome(defenderPos, { color: 0x8fc8ff, r: 1.3, dur: 0.6, opacity: 0.5 }); flash(at, 0xcfe8ff, 2.2, 0.25); sparks(at, 0x9fd0ff, 14, { speed: 4, up: 1.6, size: 0.18, dur: 0.5 }); ring(at, { color: 0x8fc8ff, to: 2 }); },
    guard(pos) { return dome(pos, { color: 0x9fc8ff, r: 1.25, dur: 0.9, opacity: 0.28 }); },
    // bitiriciler: kind = storm | poison | water | horn | fire ; from = saldıran, at = hedef temas noktası
    finisher(kind, from, at, points = 1, mouth = null) {
      const n = Math.max(1, points); const dir = Math.sign(at.x - from.x) || 1;
      if (kind === 'storm') {
        for (let i = 0; i < 3; i++) slash(at.clone().add(new THREE.Vector3(0, (i - 1) * 0.28, 0.05 * i)), { color: 0xbfe2ff, r: 1.0 + i * 0.1, w: 0.08, rot: (dir > 0 ? -0.7 : 3.8) + i * 0.08, dur: 0.38 });
        for (let i = 0; i < Math.min(3, 1 + Math.floor(n / 2)); i++) setTimeout(() => bolt(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.6, 0))), i * 90);
        sparks(at, 0x9fd8ff, 10 + n * 3, { speed: 4, up: 2, size: 0.2, dur: 0.6 }); flash(at, 0xcfe8ff, 2.4 + n * 0.2, 0.3);
      } else if (kind === 'poison') {
        arcTrail(from.clone().setY(from.y + 0.4), at, { color: 0x7cff6a, radius: 0.1, height: 2.4, dur: 0.55 });
        setTimeout(() => { vapor(at.clone().setY(0.2), 0x5fe050, 6 + n * 2, { rise: 1.6, size: 1.0, dur: 1.2, radius: 0.7 }); sparks(at, 0x9cff7a, 8 + n * 2, { speed: 3, up: 1.4, size: 0.18, dur: 0.5 }); flash(at, 0x8cff6a, 2.0, 0.25); }, 180);
      } else if (kind === 'water') {
        wave(from.clone().setY(0), at.clone().setY(0), { color: 0x48d0ff, dur: 0.5 });
        setTimeout(() => { ring(at, { color: 0x6fe0ff, to: 2.8, dur: 0.6 }); sparks(at, 0x8fe8ff, 12 + n * 3, { speed: 3.5, up: 3, size: 0.2, dur: 0.8, grav: 9 }); flash(at, 0x9feeff, 2.2, 0.3); }, 220);
        vapor(from.clone().setY(0.2), 0x5fd8ff, 4 + n, { rise: 1, size: 0.7, dur: 0.9, radius: 0.5 });
      } else if (kind === 'horn') {
        dome(from, { color: 0xffd27a, r: 1.5, dur: 1.0, opacity: 0.45 });
        ring(at, { color: 0xffc040, to: 3.0, dur: 0.55 }); flash(at, 0xffe08a, 2.6, 0.3);
        sparks(at, 0xffd060, 12 + n * 3, { speed: 4.5, up: 2.2, size: 0.22, dur: 0.6, grav: 9 });
      } else if (kind === 'fire') {
        // ateş nefesi: ağızdan hedefe genişleyen alev konisi + kor + yanık izi
        const m0 = (mouth || from.clone().setY(from.y + 0.5)).clone();
        const dirV = at.clone().sub(m0); const L = dirV.length(); dirV.normalize();
        const cols = [0xfff1a0, 0xffb040, 0xff6a20, 0xd8301a];
        const N = pc(26 + n * 4);
        for (let i = 0; i < N; i++) {
          const delay = (i / N) * 0.32;
          setTimeout(() => {
            const s = sprite(cols[(Math.random() * cols.length) | 0], 0.25, 0.95); s.position.copy(m0);
            const spread = 0.18 + Math.random() * 0.22;
            const v = dirV.clone().multiplyScalar(L * (1.6 + Math.random() * 0.6)).add(new THREE.Vector3((Math.random() - 0.5) * spread * 3, (Math.random() - 0.3) * spread * 2.2, (Math.random() - 0.5) * spread * 3));
            const sz = 0.22 + Math.random() * 0.25;
            add(s, 0.5 + Math.random() * 0.2, (k, dt) => { s.position.addScaledVector(v, dt * (1 - k * 0.6)); v.y += 1.6 * dt; s.scale.setScalar(sz * (1 + k * 3.2)); s.material.opacity = 0.95 * (1 - k); });
          }, delay * 1000);
        }
        flash(m0, 0xffc060, 1.2, 0.35);
        setTimeout(() => {
          flash(at, 0xff8a3a, 2.4 + n * 0.2, 0.35); ring(at, { color: 0xff6a20, to: 2.6, dur: 0.5 });
          sparks(at, 0xffa040, 10 + n * 3, { speed: 3.5, up: 2.4, size: 0.16, dur: 0.9, grav: 3 });
          vapor(at.clone().setY(0.3), 0x5a3020, 4 + n, { rise: 1.6, size: 1.0, dur: 1.2, radius: 0.5 });
        }, 220);
      } else {
        flash(at, 0xff8a3a, 2.4, 0.3); ring(at, { color: 0xff7a2a, to: 2.6 }); sparks(at, 0xff6a2a, 12 + n * 3, { speed: 4, up: 2, size: 0.22, dur: 0.6 });
      }
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const it = live[i]; it.t += dt; const k = Math.min(1, it.t / it.dur);
        it.tick && it.tick(k, dt);
        if (k >= 1) { root.remove(it.obj); if (it.obj.userData.own) it.obj.geometry.dispose(); it.obj.material && it.obj.material.dispose(); live.splice(i, 1); }
      }
    },
    count: () => live.length,
    dispose() { for (const it of live) { root.remove(it.obj); it.obj.material && it.obj.material.dispose(); } live.length = 0; scene.remove(root); },
  };
  return api;
}
