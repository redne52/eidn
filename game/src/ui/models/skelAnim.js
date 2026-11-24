// İskeletli GLB (Tripo rig'i) için prosedürel iskelet animatörü.
// Katmanlar:
//   1) Gövde katmanı: rigidAnim.js'in katı gövde animatörü (kök konum/yön, kalça eğilmesi, nefes ölçeği).
//      Temas anları (hızlı 0,18 · ağır 0,55 · bitirici 0,75 sn) ve eylem promise'leri BURADAN gelir.
//   2) İskelet katmanı: kemiklere bind pozundan itibaren eklenen dönüşler (kanat, bacak, boyun, çene, kuyruk).
//      Her kare bütün eşlenmiş kemikler bind pozuna döner, sonra kanallardan hesaplanan dönüşler uygulanır.
// Dönüşler GLB sahnesinin kendi uzayındaki eksenlerle verilir (rigMap.frame) ve bind pozundaki ebeveyn
// yönelimiyle kemiğin yerel uzayına çevrilir: yerel = P⁻¹ · R · P · bindYerel. Çocuk kemikler ebeveynin
// dönüşünü taşır; bu yüzden zincirler (kanat, bacak, kuyruk) doğal biçimde birlikte hareket eder.
import * as THREE from 'three';
import { buildRigidGlbModel } from './rigidAnim.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]).normalize();

/** Haritadaki bütün kemik adları (gruplar dahil). */
export function rigBoneNames(map) {
  const out = [];
  const walk = (v) => { if (typeof v === 'string') { if (!v.startsWith('_')) out.push(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (k !== 'frame' && k !== '_not') walk(x); }); };
  walk(map); return [...new Set(out)];
}

/** Kemik haritasının sahnedeki kemiklerle eşleştiğini doğrular; eksikleri döner. */
export function checkRig(bones, map) {
  const need = rigBoneNames(map).filter((n) => !['misc'].includes(n));
  return need.filter((n) => !bones[n]);
}

/** Bind pozunu saklayan ve her kare dönüş biriktiren iskelet nesnesi. */
export function makeRig(sceneRoot, map) {
  const bones = {};
  sceneRoot.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const missing = checkRig(bones, map);
  if (missing.length) throw new Error('Kemik haritası eşleşmedi: ' + missing.slice(0, 5).join(', '));
  // bind yönelimleri: sahne kökünün kendi dönüşü hesaba katılmadan (eksenler sahne uzayında)
  const q0 = sceneRoot.quaternion.clone(), p0 = sceneRoot.position.clone(), s0 = sceneRoot.scale.clone();
  sceneRoot.quaternion.identity(); sceneRoot.position.set(0, 0, 0); sceneRoot.scale.set(1, 1, 1);
  sceneRoot.updateMatrixWorld(true);
  const info = {};
  const names = rigBoneNames(map);
  for (const n of names) {
    const b = bones[n]; if (!b) continue;
    const P = new THREE.Quaternion(); b.parent.getWorldQuaternion(P);
    info[n] = { bone: b, bind: b.quaternion.clone(), P, Pi: P.clone().invert(), D: new THREE.Quaternion(), touched: false };
  }
  const bindWorld = (n) => { const w = new THREE.Vector3(); bones[n].getWorldPosition(w); return w; };
  const anchors = { mouth: null, chest: null };
  try {
    const sk = bindWorld(map.skull), tip = bindWorld(map.jawTip || map.jaw);
    anchors.mouth = sk.clone().lerp(tip, 0.85).add(V(map.frame.forward).multiplyScalar(0.03));
    anchors.chest = bindWorld(map.chest).add(V(map.frame.forward).multiplyScalar(0.05));
  } catch (e) { /* işaretçiler yedek konumda kalır */ }
  sceneRoot.quaternion.copy(q0); sceneRoot.position.copy(p0); sceneRoot.scale.copy(s0); sceneRoot.updateMatrixWorld(true);
  const tmp = new THREE.Quaternion();
  const rig = {
    bones, info, anchors,
    F: V(map.frame.forward), L: V(map.frame.left), U: V(map.frame.up),
    /** Kemiğe sahne uzayı ekseninde dönüş ekler (aynı kare içinde birikir). */
    rot(name, axis, ang) {
      if (!ang || !Number.isFinite(ang)) return; const i = info[name]; if (!i) return;
      tmp.setFromAxisAngle(axis, ang); i.D.premultiply(tmp); i.touched = true;
    },
    /** Bütün kemikleri bind pozuna döndürür ve birikmiş dönüşleri sıfırlar. */
    begin() { for (const n in info) { const i = info[n]; i.D.identity(); i.touched = false; } },
    /** Birikmiş dönüşleri kemiklere yazar. */
    apply() {
      for (const n in info) {
        const i = info[n];
        if (!i.touched) { i.bone.quaternion.copy(i.bind); continue; }
        // yerel = P⁻¹ · D · P · bind
        i.bone.quaternion.copy(i.Pi).multiply(i.D).multiply(i.P).multiply(i.bind);
      }
    },
    /** Bütün kemikler bind pozunda mı? (test için) */
    atBind(eps = 1e-4) { return Object.values(info).every((i) => Math.abs(Math.abs(i.bone.quaternion.dot(i.bind)) - 1) < eps); },
  };
  return rig;
}

/**
 * İskeletli GLB modeli kurar. Gövde ve meta rigidAnim ile aynıdır; animatör iskelet katmanıyla sarılır.
 * @returns model ya da hata fırlatır (çağıran rigid/kod modeline düşer)
 */
export function buildSkelGlbModel(id, st, glb, lib, map) {
  if (!map) throw new Error('Kemik haritası yok');
  // önce iskeleti bind pozunda ölç (rigid kurucu sahneyi döndürmeden önce)
  const rig = makeRig(glb.scene, map);
  const model = buildRigidGlbModel(id, st, glb, lib);
  model.meta.rigged = true; model.meta.rigid = false;
  model.rig = rig;
  // derilenmiş mesh: animasyonla bounding sphere değişir; kırpılmasın
  glb.scene.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
  // ağız ve göğüs işaretçilerini kemiklere bağla (ruh akışı ve ateş nefesi çeneyi izler)
  model.group.updateMatrixWorld(true);
  const mouthM = model.parts.mouth, chestM = model.parts.chest;
  const toWorldOfScene = (v) => glb.scene.localToWorld(v.clone());
  if (rig.anchors.mouth) { mouthM.position.copy(mouthM.parent.worldToLocal(toWorldOfScene(rig.anchors.mouth))); }
  if (rig.anchors.chest) { chestM.position.copy(chestM.parent.worldToLocal(toWorldOfScene(rig.anchors.chest))); }
  model.group.updateMatrixWorld(true);
  rig.bones[map.jaw].attach(mouthM);
  rig.bones[map.chest].attach(chestM);
  model.group.updateMatrixWorld(true);
  const loc = (mk) => model.group.worldToLocal(mk.getWorldPosition(new THREE.Vector3()));
  model.meta.mouth = loc(mouthM); model.meta.chest = loc(chestM);
  model.meta.impactPoint = model.meta.mouth.clone().setY(model.meta.mouth.y * 0.8);
  model.anim = makeSkelAnimator(model, model.anim, rig, map, lib);
  return model;
}

/** Varsayılan (bekleme) kanal değerleri. */
const DEF = { jaw: 0.04, wingOpen: -0.35, wingFwd: 0, flapAmp: 0, flapSpd: 9, neck: 0, head: 0, yaw: 0, crouch: 0, tailCurl: 0, droop: 0, legSplay: 0, roar: 0 };

export function makeSkelAnimator(m, body, rig, map, { tween, ease }) {
  const { F, L, U } = rig;
  const cur = { ...DEF }, tgt = { ...DEF }, rate = Object.fromEntries(Object.keys(DEF).map((k) => [k, 8]));
  let t = Math.random() * 10, walkTarget = 0, walkAmp = 0, walkPh = 0, flapPh = 0, flapAuto = 0, nextFlap = 2 + Math.random() * 2;
  let sseq = 0, dead = false, guardOn = false, restOn = false;
  const set = (o, r = 8) => { for (const k in o) { tgt[k] = o[k]; rate[k] = r; } };
  const defaults = (r = 6) => set({ ...DEF, ...(guardOn ? GUARD : {}), ...(restOn ? REST : {}) }, r);
  const wait = (s) => tween(Math.max(0.001, s), () => {});
  const GUARD = { wingFwd: 1.3, wingOpen: 0.1, head: 0.25, neck: -0.1, crouch: 0.35, jaw: 0.04 };
  const REST = { crouch: 1, wingOpen: -0.9, head: 0.45, neck: 0.25, tailCurl: 0.6, jaw: 0 };
  const start = () => ++sseq;
  const alive = (my) => my === sseq;

  // ---- iskelet katmanı: her kare kanallardan kemik dönüşleri ----
  const wing = (side, open, fwd, flap) => {
    const w = side === 'L' ? map.wingL : map.wingR, sg = side === 'L' ? 1 : -1;
    // kaldırma: ön eksen etrafında (sol +, sağ −); açma: kanat yana ve aşağı açılır; ileri: kalkan gibi öne kapanır
    const raise = 0.32 * open + flap * 0.55 - 0.25 * fwd;
    const sweep = -0.55 * fwd + 0.12 * open; // + değer: kanat öne gelir
    const up = w.upper;
    rig.rot(up, F, sg * raise);
    rig.rot(up, U, -sg * sweep);
    if (w.fore) rig.rot(w.fore, F, sg * (0.18 * open + flap * 0.25));
    // el ve parmaklar: açılınca yelpaze genişler, kapanınca toplanır, çırpışta gecikmeli takip
    rig.rot(w.hand, F, sg * (0.15 * open + flap * 0.3));
    w.fingers.forEach((ch, i) => { const k = (i - 1.5) / 1.5; rig.rot(ch[0], U, -sg * k * 0.22 * open); rig.rot(ch[0], F, sg * flap * 0.12); });
  };
  const leg = (side, swing, bend, crouch) => {
    const g = side === 'L' ? map.legL : map.legR;
    // L ekseni etrafında: − değer bacağı öne savurur
    rig.rot(g.hip, L, -swing - 0.42 * crouch);
    rig.rot(g.knee, L, bend + 0.75 * crouch);
    rig.rot(g.ankle, L, -bend * 0.6 - 0.38 * crouch);
    rig.rot(g.foot, L, bend * 0.35 + swing * 0.3);
  };
  const skelUpdate = (dt) => {
    t += dt;
    for (const k in cur) cur[k] += (tgt[k] - cur[k]) * Math.min(1, dt * rate[k]);
    walkAmp += (walkTarget - walkAmp) * Math.min(1, dt * 8);
    walkPh += dt * (5.5 + 4.5 * walkAmp) * (walkAmp > 0.02 ? 1 : 0);
    // koşarken ara sıra iki kanat çırpışı
    if (walkAmp > 0.75 && !dead) { nextFlap -= dt; if (nextFlap <= 0) { flapAuto = 1.6; nextFlap = 2.5 + Math.random() * 2.5; } }
    flapAuto = Math.max(0, flapAuto - dt);
    const autoAmp = flapAuto > 0 ? Math.sin((1.6 - flapAuto) / 1.6 * Math.PI) * 0.7 : 0;
    flapPh += dt * cur.flapSpd;
    const flap = (cur.flapAmp + autoAmp) * Math.sin(flapPh);
    rig.begin();
    const br = Math.sin(t * 2.2), iw = dead ? 0 : 1 - walkAmp * 0.5;
    // omurga ve boyun: nefes, bakınma, eğilme
    map.spine.forEach((n, i) => rig.rot(n, L, br * 0.012 * iw + cur.crouch * 0.06 + walkAmp * 0.04));
    const look = Math.sin(t * 0.55) * 0.12 * iw + Math.sin(t * 1.7) * 0.03 * iw;
    map.neck.forEach((n) => { rig.rot(n, L, (cur.neck + cur.droop * 0.5) / 3 + br * 0.01 * iw); rig.rot(n, U, (cur.yaw + look) / 3); });
    rig.rot(map.head, L, cur.head + cur.droop * 0.3 - cur.roar * 0.25);
    rig.rot(map.jaw, L, clamp(cur.jaw + cur.roar * 0.6, 0, 1.2) * 0.55 + (walkAmp > 0.5 ? Math.max(0, Math.sin(walkPh)) * 0.05 : 0));
    // kanatlar
    const wFlut = Math.sin(t * 3.1) * 0.03 * iw;
    wing('L', cur.wingOpen + walkAmp * -0.25, cur.wingFwd, flap + wFlut);
    wing('R', cur.wingOpen + walkAmp * -0.25, cur.wingFwd, flap + wFlut);
    // bacaklar: yürüyüş döngüsü (yarım faz farkı), çömelme, ölümde açılma
    const sw = Math.sin(walkPh), sw2 = Math.sin(walkPh + Math.PI);
    const A = 0.42 * walkAmp, B = 0.65 * walkAmp;
    leg('L', A * sw, B * Math.max(0, Math.cos(walkPh)) + cur.legSplay * 0.3, cur.crouch);
    leg('R', A * sw2, B * Math.max(0, Math.cos(walkPh + Math.PI)) + cur.legSplay * 0.3, cur.crouch);
    // kuyruk: dalga + denge + kıvrılma
    map.tail.forEach((n, i) => {
      const k = i / map.tail.length;
      rig.rot(n, U, Math.sin(t * 1.3 - i * 0.45) * (0.035 + 0.03 * k) * (dead ? 0 : 1) + Math.sin(walkPh - i * 0.5) * 0.06 * walkAmp);
      rig.rot(n, L, -cur.tailCurl * 0.06 + cur.droop * 0.04);
    });
    rig.apply();
  };

  // ---- eylemler: gövde promise'i (temas anları) + paralel iskelet zaman çizelgesi ----
  const a = {
    update(dt) {
      body.update(dt);
      skelUpdate(dt);
      // çömelmede gövdeyi indir (rigid kök konumunu her kare yeniden kurar; üstüne ekliyoruz)
      const H = m.height || 1.9; m.root.position.y -= cur.crouch * 0.12 * H;
    },
    idle() { if (!dead) { start(); defaults(); } return body.idle(); },
    walk(x, y) { const sp = y === undefined ? x : y; walkTarget = clamp(sp || 0, 0, 1); body.walk(x, y); },
    guard(on = true) { guardOn = !!on; if (!dead) defaults(10); body.guard(on); },
    attack(onImpact) { return a.attackQuick(onImpact); },
    attackQuick(onImpact) { // ısırık: baş geri → ileri, çene aç-kapa
      const my = start();
      (async () => { set({ neck: -0.25, head: -0.15, jaw: 0.5 }, 18); await wait(0.11); if (!alive(my)) return; set({ neck: 0.45, head: 0.25, jaw: 1.0 }, 22); await wait(0.08); if (!alive(my)) return; set({ jaw: 0.05 }, 30); await wait(0.12); if (alive(my)) defaults(8); })();
      return body.attackQuick(onImpact);
    },
    attackHeavy(onImpact) { // kanatlar açılır, şaha kalkar, iki büyük çırpış, öne çarpma
      const my = start();
      (async () => {
        set({ wingOpen: 1, neck: -0.35, head: -0.2, jaw: 0.6, flapAmp: 0, tailCurl: -0.4 }, 9); await wait(0.2); if (!alive(my)) return;
        set({ flapAmp: 0.75, flapSpd: 15 }, 12); await wait(0.33); if (!alive(my)) return;
        set({ flapAmp: 0, neck: 0.5, head: 0.3, jaw: 1, wingOpen: 0.6 }, 18); await wait(0.15); if (!alive(my)) return;
        set({ jaw: 0.1 }, 12); await wait(0.15); if (alive(my)) defaults(6);
      })();
      return body.attackHeavy(onImpact);
    },
    finisher(onImpact) { // kanat açık yükselme, baş geri, sonra ileri: çene ardına kadar açık ateş nefesi
      const my = start();
      (async () => {
        set({ wingOpen: 1.1, neck: -0.55, head: -0.35, jaw: 0.35, flapAmp: 0.35, flapSpd: 11, tailCurl: -0.6 }, 8); await wait(0.45); if (!alive(my)) return;
        set({ flapAmp: 0, neck: 0.4, head: 0.35, jaw: 1.2, wingOpen: 0.9 }, 14); await wait(0.55); if (!alive(my)) return;
        set({ jaw: 0.15 }, 10); await wait(0.1); if (alive(my)) defaults(5);
      })();
      return body.finisher(onImpact);
    },
    hit(arg) {
      if (dead) return Promise.resolve(); const my = start(); const heavy = arg === true;
      (async () => { set({ neck: -0.35 * (heavy ? 1.4 : 1), head: -0.2, jaw: 0.5, flapAmp: heavy ? 0.3 : 0.15, flapSpd: 22 }, 20); await wait(0.14); if (alive(my)) defaults(8); })();
      return body.hit(arg);
    },
    block() {
      if (dead) return Promise.resolve(); const my = start();
      (async () => { set({ wingFwd: 1, wingOpen: 0.3, head: 0.2 }, 22); await wait(0.18); if (alive(my)) defaults(8); })();
      return body.block();
    },
    dodge() {
      if (dead) return Promise.resolve(); const my = start();
      (async () => { set({ wingOpen: 0.9, flapAmp: 0.6, flapSpd: 16 }, 18); await wait(0.22); if (alive(my)) defaults(8); })();
      return body.dodge();
    },
    die() { // diz çöküp yana devrilme, kanatlar yere serilir
      const my = start();
      (async () => { set({ crouch: 0.6, neck: 0.2, jaw: 0.5, wingOpen: 0.4 }, 6); await wait(0.25); if (!alive(my)) return; set({ crouch: 0.9, droop: 1, wingOpen: 0.8, wingFwd: 0, jaw: 0.35, legSplay: 0.6, tailCurl: 0 }, 4); await wait(0.55); dead = true; })();
      return body.die().then(() => { dead = true; });
    },
    victory() { // şaha kalkıp kanat çırparak kükreme
      if (dead) return Promise.resolve(); const my = start();
      (async () => { set({ wingOpen: 1.1, neck: -0.4, head: -0.35, roar: 1, flapAmp: 0.55, flapSpd: 12, tailCurl: -0.5 }, 8); await wait(0.75); if (alive(my)) defaults(5); })();
      return body.victory();
    },
    absorb(target, dur = 1) { // baş hedefe döner, çene açık, kanatlar hafif açık
      if (dead) return Promise.resolve(); const my = start(); dur = Math.max(0.4, dur || 1);
      let yaw = 0, pitch = 0;
      if (target && Number.isFinite(target.x)) { m.group.updateMatrixWorld(true); const l = m.group.worldToLocal(target.clone()); yaw = clamp(Math.atan2(l.x, Math.max(0.05, l.z)), -1.1, 1.1); pitch = clamp(-Math.atan2(l.y - (m.meta.mouth?.y || 1), Math.max(0.3, Math.hypot(l.x, l.z))), -0.5, 0.5); }
      (async () => { set({ yaw: yaw * 0.6, neck: pitch * 0.5 - 0.1, head: pitch * 0.4, jaw: 1.05, wingOpen: 0.35 }, 9); await wait(dur * 0.8); if (!alive(my)) return; set({ jaw: 0.1 }, 10); await wait(dur * 0.2); if (alive(my)) defaults(6); })();
      return body.absorb(target, dur);
    },
    eat(dur = 1.2) { // eğilip çiğneme
      if (dead) return Promise.resolve(); const my = start(); dur = Math.max(0.6, dur || 1.2);
      (async () => { set({ neck: 0.45, head: 0.35, crouch: 0.3 }, 7); await wait(dur * 0.2); for (let i = 0; i < 4 && alive(my); i++) { set({ jaw: 0.7 }, 20); await wait(dur * 0.08); set({ jaw: 0.05 }, 20); await wait(dur * 0.07); } if (alive(my)) defaults(6); })();
      return body.eat(dur);
    },
    rest(on = true) { restOn = !!on; if (!dead) defaults(3); body.rest(on); },
    gather(dur = 0.8) { // koklama, eşeleme
      if (dead) return Promise.resolve(); const my = start(); dur = Math.max(0.4, dur || 0.8);
      (async () => { set({ neck: 0.5, head: 0.3, crouch: 0.25, jaw: 0.2 }, 9); await wait(dur * 0.7); if (alive(my)) defaults(6); })();
      return body.gather(dur);
    },
    shake(n = 1) { return body.shake(n); },
    reset() { start(); dead = false; guardOn = false; restOn = false; walkTarget = 0; walkAmp = 0; flapAuto = 0; Object.assign(cur, DEF); Object.assign(tgt, DEF); body.reset(); skelUpdate(0); },
    /** test/hata ayıklama: anlık kanal değerleri */
    _channels: () => ({ ...cur, walkAmp, flapAuto }),
    /** test: iskeleti tamamen bind pozuna döndürür (kanallar sıfır) */
    _bindPose() { rig.begin(); rig.apply(); },
    _atBind: () => rig.atBind(),
  };
  return a;
}
