// İskeleti olmayan GLB modelleri (Tripo/Meshy çıktısı) için "katı gövde" modeli ve animatörü.
// Model bükülemediği için bütün hareketler gövdenin tamamına uygulanır:
//   group → root (konum + yön) → hip (kalça etrafında eğilme/yuvarlanma + nefes ölçeği) → fit (ölçek, ayak hizası) → GLB sahnesi
// Animasyon API'si kod modellerininkiyle aynıdır (models.js makeAnimator):
//   update, idle, walk, guard, attack, attackQuick, attackHeavy, finisher, hit, block, dodge, die, victory,
//   absorb, eat, rest, gather, shake, reset. Temas anları: hızlı 0,18 sn · ağır 0,55 sn · bitirici 0,75 sn.
import * as THREE from 'three';

const lerp = (a, b, k) => a + (b - a) * k;
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/**
 * @param {string} id
 * @param {number} st evre 1..3
 * @param {{scene: THREE.Object3D, opts: object}} glb instantiateGlb sonucu
 * @param {{tween: Function, ease: object, shadowMat: Function}} lib models.js yardımcıları (döngüsel içe aktarmayı önlemek için parametre)
 */
export function buildRigidGlbModel(id, st, glb, lib) {
  const o = glb.opts || {}; const fit = o.fit || { height: 1, mouth: [0, 0.8, 0.4], chest: [0, 0.5, 0.2], hip: [0, 0.4, 0], foot: [0, 0, 0] };
  const stageK = (o.stageScale || [0.65, 0.85, 1])[Math.max(0, Math.min(2, st - 1))];
  const s = ((o.targetHeight || 1.9) * stageK) / (fit.height || 1) * (glb.scale || 1);
  const group = new THREE.Group();
  const root = new THREE.Group(); group.add(root);
  const hipL = v3(fit.hip), footL = v3(fit.foot || [0, 0, 0]);
  const hip = new THREE.Group(); hip.position.set(0, hipL.y * s, (hipL.z - footL.z) * s); root.add(hip);
  const fitN = new THREE.Group(); fitN.scale.setScalar(s); fitN.position.set(-footL.x * s - hip.position.x, -hip.position.y, -footL.z * s - hip.position.z); hip.add(fitN);
  glb.scene.rotation.y = glb.rotY || 0; fitN.add(glb.scene);
  // ağız ve göğüs işaretçileri: animasyonla birlikte hareket eder
  const mouthM = new THREE.Object3D(); mouthM.position.copy(v3(fit.mouth)); fitN.add(mouthM);
  const chestM = new THREE.Object3D(); chestM.position.copy(v3(fit.chest)); fitN.add(chestM);
  // modele özel malzeme kopyaları (parıltı ve vuruş parlaması başka kopyaları etkilemesin)
  const meshes = []; const glowColor = new THREE.Color(o.glowColor || '#ff5a1e');
  glb.scene.traverse((m) => { if (!m.isMesh) return; m.material = m.material.clone(); m.material.emissive = glowColor.clone(); m.material.emissiveIntensity = 0; if (m.material.map) m.material.emissiveMap = m.material.map; m.userData.kind = 'body'; meshes.push(m); });
  // parıltı dokuyu izler (emissiveMap = renk dokusu): düz turuncu boya yerine "kor gibi ısınan" pullar
  // temas gölgesi diski (gölge haritası olmayan Düşük ayar için; diğer ayarlarda görünüm onu soluklaştırır)
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.42 * (o.targetHeight || 1.9) * stageK, 14), lib.shadowMat());
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; group.add(sh);
  const height = (o.targetHeight || 1.9) * stageK;
  group.updateMatrixWorld(true);
  const loc = (mk) => group.worldToLocal(mk.getWorldPosition(new THREE.Vector3()));
  const meta = {
    source: 'glb', rigid: true, kind: 'dragon', dragonType: o.type, finisherFx: o.finisherFx || 'fire', height,
    mouth: loc(mouthM), chest: loc(chestM),
    mouthWorld: (out = new THREE.Vector3()) => mouthM.getWorldPosition(out),
    chestWorld: (out = new THREE.Vector3()) => chestM.getWorldPosition(out),
  };
  meta.impactPoint = meta.mouth.clone().setY(meta.mouth.y * 0.8);
  let gk = 0, flashK = 0; const flashC = new THREE.Color();
  const applyEmissive = () => meshes.forEach((m) => {
    m.material.emissive.copy(glowColor).lerp(flashC, flashK > gk ? 1 : 0);
    m.material.emissiveIntensity = Math.max(gk * 0.9, flashK * 0.8);
  });
  meta.glow = (k) => { gk = Math.max(0, Math.min(1, k || 0)); applyEmissive(); };
  Object.defineProperty(meta, 'glowLevel', { get: () => gk });
  const model = { id, group, root, parts: { hip, mouth: mouthM, chest: chestM }, meshes, anim: null, height, meta, clips: glb.clips || [] };
  model.anim = makeRigidAnimator(model, hip, lib, { flash: (c, p) => { flashC.set(c); flashK = p; applyEmissive(); }, unit: height });
  return model;
}

/** Katı gövde animatörü. Kanallar: root px/py/pz/ry, hip rx/ry/rz ve sq (ölçek). */
export function makeRigidAnimator(m, hip, { tween, ease }, fx) {
  const root = m.root; const H = fx.unit || 1.9;
  let t = Math.random() * 10, state = 'idle', seq = 0;
  let walkAmp = 0, walkTarget = 0, walkPh = 0, guardW = 0, guardT = 0, idleW = 1, idleT = 1, restW = 0, restT = 0;
  const base = { rp: root.position.clone(), rr: root.rotation.clone(), hp: hip.position.clone(), hr: hip.rotation.clone() };
  const CH = ['px', 'py', 'pz', 'ry', 'rx', 'hy', 'rz', 'sq'];
  const act = Object.fromEntries(CH.map((c) => [c, 0]));
  const blendTo = (dur, tg, e = ease.inOut) => {
    const my = seq; const from = { ...act };
    return tween(dur, (k) => { if (my !== seq) return; const kk = e(k); for (const c in tg) act[c] = lerp(from[c], tg[c], kk); });
  };
  const clearAct = (dur = 0.18) => blendTo(dur, Object.fromEntries(CH.map((c) => [c, 0])));
  const begin = (s) => { seq++; state = s; idleT = 0.35; return seq; };
  const end = async (my, dur = 0.2) => { if (my !== seq) return; await clearAct(dur); if (my === seq) { state = 'idle'; idleT = 1; } };
  let flashing = null;
  const flash = (color, power = 0.9) => { if (flashing) return flashing; flashing = tween(0.24, (k) => fx.flash(color, power * (1 - k))).then(() => { fx.flash(color, 0); flashing = null; }); return flashing; };
  // yüksekliğe göre ölçeklenen konum birimi (kod modelleriyle aynı his: 1,9 boyda 1 birim)
  const U = H / 1.9;

  const a = {
    update(dt) {
      t += dt;
      guardW += (guardT - guardW) * Math.min(1, dt * 10); idleW += (idleT - idleW) * Math.min(1, dt * 6);
      walkAmp += (walkTarget - walkAmp) * Math.min(1, dt * 8); walkTarget = 0; walkPh += dt * 9 * Math.max(0.35, walkAmp);
      restW += (restT - restW) * Math.min(1, dt * 3);
      root.position.copy(base.rp); root.rotation.copy(base.rr); hip.position.copy(base.hp); hip.rotation.copy(base.hr); hip.scale.setScalar(1);
      let px = act.px, py = act.py, pz = act.pz, ry = act.ry, rx = act.rx, hy = act.hy, rz = act.rz, sq = act.sq;
      if (state !== 'dead') {
        const br = Math.sin(t * 2.2), iw = idleW * (1 - walkAmp * 0.6);
        // bekleme: nefes (göğüs kabarır), hafif baş-gövde salınımı
        sq += br * 0.018 * iw; rx += br * 0.022 * iw; hy += Math.sin(t * 0.6) * 0.06 * iw; rz += Math.sin(t * 0.9) * 0.015 * iw;
        // yürüme: sekme, öne eğilme, yan sallanma
        if (walkAmp > 0.01) { const s = Math.sin(walkPh), w = walkAmp; py += Math.abs(s) * 0.07 * U * w; rx += 0.1 * w + Math.sin(walkPh * 2) * 0.03 * w; rz += Math.cos(walkPh) * 0.06 * w; hy += Math.cos(walkPh) * 0.05 * w; }
        // savunma: çömelip geri yaslanır (kanatlar öndeymiş gibi)
        if (guardW > 0.01) { const g = guardW; rx -= 0.16 * g; py -= 0.06 * U * g; pz -= 0.12 * U * g; sq -= 0.03 * g; }
        // dinlenme: yere çöker, yana yatar
        if (restW > 0.01) { const w = restW; py -= 0.22 * U * w; rx += 0.18 * w; rz += 0.12 * w; hy += 0.25 * w; }
      }
      root.position.x += px; root.position.y += py; root.position.z += pz; root.rotation.y += ry;
      hip.rotation.x += rx; hip.rotation.y += hy; hip.rotation.z += rz; hip.scale.set(1 + sq * 0.6, 1 + sq, 1 + sq * 0.6);
    },
    idle() { if (state !== 'dead') { seq++; state = 'idle'; idleT = 1; return clearAct(0.2); } return Promise.resolve(); },
    walk(x, y) { const sp = y === undefined ? x : y; walkTarget = Math.max(0, Math.min(1, sp || 0)); },
    guard(on = true) { guardT = on ? 1 : 0; },
    attack(onImpact) { return a.attackQuick(onImpact); },
    async attackQuick(onImpact) { // ~0,35 sn, temas 0,18 sn
      const my = begin('attack');
      await blendTo(0.11, { rx: -0.14, pz: -0.15 * U, py: 0.02 * U }, ease.out);
      await blendTo(0.07, { rx: 0.26, pz: 1.25 * U, py: 0 }, ease.in);
      onImpact && onImpact();
      await blendTo(0.05, { pz: 1.15 * U, rx: 0.18 });
      await end(my, 0.13);
    },
    async attackHeavy(onImpact) { // ~0,8 sn, temas 0,55 sn: şaha kalkar, sonra bütün ağırlığıyla iner
      const my = begin('attack');
      await blendTo(0.38, { rx: -0.42, py: 0.16 * U, pz: -0.35 * U, sq: 0.04 }, ease.out);
      await blendTo(0.17, { rx: 0.42, py: -0.04 * U, pz: 1.4 * U, sq: -0.05 }, ease.in);
      onImpact && onImpact();
      await blendTo(0.1, { rx: 0.3, pz: 1.3 * U, sq: 0 });
      await end(my, 0.15);
    },
    async finisher(onImpact) { // ~1,1 sn, temas 0,75 sn: doğrulup nefes alır, öne atılarak ateş püskürtür
      const my = begin('attack');
      await blendTo(0.45, { rx: -0.55, py: 0.26 * U, pz: -0.3 * U, sq: 0.07 }, ease.out);
      if (m.meta.glow) m.meta.glow(0.8);
      await blendTo(0.3, { rx: 0.32, py: 0.05 * U, pz: 1.0 * U, sq: -0.02 }, ease.in);
      onImpact && onImpact();
      await blendTo(0.2, { rx: 0.25, pz: 1.05 * U });
      if (m.meta.glow) tween(0.35, (k) => m.meta.glow(0.8 * (1 - k)));
      await end(my, 0.15);
    },
    async hit(arg) { // arg: ağır mı (true) ya da parıltı rengi (sayı)
      if (state === 'dead') return; const my = begin('hit'); const heavy = arg === true;
      flash(typeof arg === 'number' ? arg : 0xff3b3b, heavy ? 1.1 : 0.8);
      await blendTo(0.08, { rx: -0.22 * (heavy ? 1.5 : 1), pz: -0.3 * U * (heavy ? 1.6 : 1), rz: 0.06 }, ease.out);
      await end(my, 0.22);
    },
    async block() {
      if (state === 'dead') return; const my = begin('block'); flash(0x7fb8ff, 0.7);
      await blendTo(0.08, { rx: -0.2, pz: -0.18 * U, sq: -0.04 }, ease.out);
      await end(my, 0.2);
    },
    async dodge() {
      if (state === 'dead') return; const my = begin('dodge'); const sd = Math.random() < 0.5 ? -1 : 1;
      await blendTo(0.14, { px: 0.85 * U * sd, rz: -0.28 * sd, pz: -0.2 * U, py: 0.08 * U }, ease.out);
      await end(my, 0.22);
    },
    async die() { // yana devrilip yere batar; ölü kalır
      const my = begin('die');
      await blendTo(0.25, { rx: -0.2, py: 0.08 * U }, ease.out);
      await blendTo(0.55, { rz: 1.35, rx: 0.1, py: -0.18 * U, px: 0.25 * U }, ease.in);
      if (my === seq) state = 'dead';
    },
    async victory() {
      if (state === 'dead') return; const my = begin('victory');
      await blendTo(0.3, { rx: -0.45, py: 0.22 * U, sq: 0.05 }, ease.out);
      if (m.meta.glow) { await tween(0.15, (k) => m.meta.glow(0.6 * k)); tween(0.4, (k) => m.meta.glow(0.6 * (1 - k))); }
      await tween(0.35, (k) => { if (my === seq) act.hy = Math.sin(k * Math.PI * 2) * 0.12; });
      await end(my, 0.3);
    },
    async absorb(target, dur = 1) { // hedefe döner, başını kaldırıp ruhu içine çeker
      if (state === 'dead') return; const my = begin('absorb'); dur = Math.max(0.4, dur || 1);
      let yaw = 0;
      if (target && Number.isFinite(target.x)) { m.group.updateMatrixWorld(true); const l = m.group.worldToLocal(target.clone()); yaw = Math.max(-1.3, Math.min(1.3, Math.atan2(l.x, Math.max(0.05, l.z)))); }
      await blendTo(dur * 0.25, { ry: yaw * 0.6, rx: -0.18, py: 0.05 * U, sq: 0.03 }, ease.out);
      if (my !== seq) return;
      await tween(dur * 0.5, (k) => { if (my !== seq) return; act.sq = 0.03 + Math.sin(k * Math.PI * 6) * 0.012; act.rx = -0.18 - Math.sin(k * Math.PI) * 0.06; if (m.meta.glow) m.meta.glow(k * 0.5); });
      if (my !== seq) return;
      await blendTo(dur * 0.25, { ry: yaw * 0.25, rx: -0.05, py: 0, sq: 0 }, ease.inOut);
      if (m.meta.glow) { await tween(0.12, (k) => m.meta.glow(0.5 + 0.5 * k)); tween(0.45, (k) => m.meta.glow(1 - k)); }
      await end(my, 0.25);
    },
    async eat(dur = 1.2) { // yiyeceğe eğilir, çiğner, yutar
      if (state === 'dead') return; const my = begin('eat'); dur = Math.max(0.6, dur || 1.2);
      await blendTo(dur * 0.25, { rx: 0.38, pz: 0.08 * U, py: -0.04 * U }, ease.out);
      await tween(dur * 0.5, (k) => { if (my !== seq) return; act.rx = 0.38 + Math.abs(Math.sin(k * Math.PI * 4)) * 0.06; });
      if (my !== seq) return;
      await blendTo(dur * 0.25, { rx: -0.12, pz: 0, py: 0.02 * U }, ease.inOut);
      await end(my, 0.25);
    },
    rest(on = true) { if (state !== 'dead') restT = on ? 1 : 0; },
    async gather(dur = 0.8) { // koklar, eşeler
      if (state === 'dead') return; const my = begin('gather'); dur = Math.max(0.4, dur || 0.8);
      await blendTo(dur * 0.3, { rx: 0.42, pz: 0.12 * U }, ease.out);
      await tween(dur * 0.4, (k) => { if (my !== seq) return; act.hy = Math.sin(k * Math.PI * 4) * 0.1; act.rx = 0.42 + Math.sin(k * Math.PI * 4) * 0.04; });
      if (my !== seq) return;
      await end(my, dur * 0.3);
    },
    async shake(n = 1) {
      if (state === 'dead') return; const my = begin('shake');
      await tween(0.25 * n, (k) => { if (my === seq) act.rz = Math.sin(k * Math.PI * 8 * n) * 0.06 * (1 - k); });
      await end(my, 0.1);
    },
    reset() { seq++; state = 'idle'; idleW = 1; idleT = 1; guardT = 0; guardW = 0; restT = 0; restW = 0; walkAmp = 0; if (m.meta?.glow) m.meta.glow(0); for (const c of CH) act[c] = 0; a.update(0); },
  };
  return a;
}
