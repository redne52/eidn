// Edin haritası (bölge sahnesi) ve kapı sahnesi.
import * as THREE from 'three';
import { makeCrystal } from './crystal.js';
import R from '../data/rules.json';
import { getModel, tween, ease } from './models.js';
import { toScreen, stage } from './stage.js';
import { buildZoneEnv, buildGateEnv, passageArch, ZONE_ENV } from './env/zones.js';
import { ritualTex } from './env/textures.js';
import { blobShadow } from './env/fx.js';
import { tr, LEVEL_COLOR } from './labels.js';
import { camState, camOffset, stepCam } from './camCtl.js';
import { buildNode, buildCamp } from './env/resources.js';

const stageOf = (lv) => (lv >= 10 ? 3 : lv >= 5 ? 2 : 1);

export function createWorldView(game, tagLayer) {
  const zone = game.zone(); const lay = game.layout();
  const scene = new THREE.Scene(); const q = stage.quality;
  const env = buildZoneEnv(scene, zone.id, { ...lay, homes: (game.monsters || []).map((m) => m.home || m.pos).filter(Boolean) }, q); const H0 = env.heightAt;
  const [W, H] = zone.size;
  // güvenli halkalar: yerde dönen çivi yazılı ritüel dairesi
  const rings = [];
  for (const r of lay.safeRings) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), new THREE.MeshBasicMaterial({ map: ritualTex(), color: 0x9fe0ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(r.x, H0(r.x, r.z) + 0.06, r.z); scene.add(m); rings.push(m);
  }
  // geçitler (kapı Kıyı'da ortam tarafından kuruldu)
  const portals = [];
  for (const ps of lay.passages) {
    const ax = ps.x < W / 2 ? ps.x - 3.6 : ps.x + 2.2; const g = passageArch(0.9); g.position.set(ax, H0(ax, ps.z), ps.z); g.rotation.y = ps.x < W / 2 ? Math.PI / 2 : -Math.PI / 2; scene.add(g);
    portals.push({ g, open: () => game.unlockedZones.includes(ps.to) });
  }
  // bekçi bölgesi işareti
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.6, 32), new THREE.MeshBasicMaterial({ color: 0xff5544, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(lay.guardianPos.x, H0(lay.guardianPos.x, lay.guardianPos.z) + 0.08, lay.guardianPos.z); scene.add(ring);

  // v4: kamp ateşi ve toplanabilir kaynaklar
  let camp = null;
  if (lay.camp) { camp = buildCamp(q); camp.position.set(lay.camp.x, H0(lay.camp.x, lay.camp.z), lay.camp.z); camp.userData.safe.scale.setScalar(lay.camp.safeRadius); scene.add(camp); }
  if (camp) camp.traverse((x) => { if (x.isMesh) x.userData.noOcc = true; });
  const nodeObjs = new Map();
  (lay.nodes || []).forEach((n, i) => { const o = buildNode(n.type, i + 1); o.position.set(n.x, H0(n.x, n.z), n.z); o.rotation.y = i * 1.37; o.traverse((x) => { if (x.isMesh) x.userData.noOcc = true; }); scene.add(o); nodeObjs.set(n.id, o); });

  const player = getModel(game.creature.id, stageOf(game.creature.level)); player.group.scale.multiplyScalar(1.25); scene.add(player.group);
  const pShadow = blobShadow(0.9); scene.add(pShadow);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 320);
  // kamera: önceki takip mantığı aynı; hafif daha alçak ve ileri bakış → ufuk ve uzak yapılar görünür
  // kamera: parmakla döndürülebilir (camCtl). Varsayılan açı eski sabit görünümle aynı.
  const camOff = new THREE.Vector3(); const lookAhead = new THREE.Vector3(); const camTarget = new THREE.Vector3();
  const _look = new THREE.Vector3(); const _dir = new THREE.Vector3(); const _low = new THREE.Vector3(); const ray = new THREE.Raycaster(); let camDist = null; let frameN = 0; let wantDist = 1e9;
  // kamera engeli adayları: büyük, opak yapılar (zemin, su, gök, parçacık ve saydam efektler hariç)
  const occluders = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o === env.ground || o.userData.noOcc) return; const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.transparent || m.side === THREE.BackSide || m.blending === THREE.AdditiveBlending) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const sc = o.getWorldScale(new THREE.Vector3()); const r = o.geometry.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z);
    if (o.isInstancedMesh) { if (o.count <= 400 && o.geometry.boundingSphere.radius > 0.6 && !m.userData?.wind && m.side !== THREE.DoubleSide) occluders.push(o); }
    else if (r > 1.4 && r < 150) occluders.push(o);
  });
  function placeCamera(dt, py) {
    camOffset(camOff); const full = camOff.length();
    lookAhead.set(-Math.sin(camState.yaw) * 4.5, 0.9, -Math.cos(camState.yaw) * 4.5);
    // engel kontrolü (2 karede bir): yaratıktan kameraya ışın; yapıya çarparsa kamera öne gelir
    if ((frameN++ & 1) === 0) {
      _dir.copy(camOff).normalize(); const from = new THREE.Vector3(camTarget.x, camTarget.y + 0.6, camTarget.z);
      ray.set(from, _dir); ray.far = full; ray.near = 0.3;
      let d = full;
      const hit = occluders.length ? ray.intersectObjects(occluders, false)[0] : null; if (hit) d = Math.min(d, hit.distance - 0.6);
      // ekranın alt kenarı: kameranın biraz altına ikinci ışın (önde kalan duvar/kaya görüşü kapatmasın)
      if (occluders.length) {
        _low.copy(camOff).setY(camOff.y - 3.2).normalize(); ray.set(from, _low); ray.far = full;
        const h2 = ray.intersectObjects(occluders, false)[0]; if (h2) d = Math.min(d, h2.distance * (camOff.length() / Math.max(1, camOff.length())) - 0.6);
      }
      // arazi tepe/yamaçları: ışın boyunca yükseklik örnekle
      for (let i = 1; i <= 8; i++) { const t = (i / 8) * d; const x = from.x + _dir.x * t, y = from.y + _dir.y * t, z = from.z + _dir.z * t; if (H0(x, z) + 0.5 > y) { d = Math.min(d, t - 0.5); break; } }
      wantDist = Math.max(2.8, d);
    }
    if (camDist === null) camDist = wantDist;
    camDist += (wantDist - camDist) * Math.min(1, dt * (wantDist < camDist ? 14 : 3));
    camDist = Math.min(camDist, full);
    camera.position.copy(camTarget).addScaledVector(camOff, camDist / full);
    const gy = H0(camera.position.x, camera.position.z) + 0.8; if (camera.position.y < gy) camera.position.y = gy;
    camera.lookAt(_look.copy(camTarget).add(lookAhead));
  }
  const mobs = new Map(); const tags = new Map();
  let facing = Math.PI / 2; let lastPos = { ...game.pos };

  function tagFor(m) {
    let t = tags.get(m.uid);
    if (!t) {
      t = document.createElement('div'); t.className = 'tag' + (m.isGuardian ? ' boss' : '');
      tagLayer.appendChild(t); tags.set(m.uid, t);
    }
    const col = game.levelColor(m.level);
    t.style.color = LEVEL_COLOR[col.color] || '#fff';
    const txt = `${tr(m.typeId)} · ${m.level}`; if (t.textContent !== txt) t.textContent = txt;
    return t;
  }
  const TAG_RANGE = 13;
  const groundC = new Map();
  const view = {
    scene, camera, player, env, exposure: ZONE_ENV[zone.id].exposure, cine: null, isWorld: true, yaw: camState.yaw,
    update(dt) {
      env.update(dt, camera);
      // v4.1: çanta doluyken yere düşen çekirdekler — haritada parlayan kristal
      if (game.groundCores) {
        const alive = new Set();
        for (const gc of game.groundCores) {
          alive.add(gc.uid); let c = groundC.get(gc.uid);
          if (!c) { c = makeCrystal(gc.type, { size: 0.22 }); c.group.position.set(gc.x, H0(gc.x, gc.z) + 0.55, gc.z); scene.add(c.group); groundC.set(gc.uid, c); }
          c.update(dt); c.group.position.y = H0(gc.x, gc.z) + 0.55 + Math.sin(performance.now() / 300) * 0.08;
          const left = gc.expiresAt - (game.clock || 0); c.setGlow(left < 8 ? 0.5 + 0.5 * Math.sin(performance.now() / 90) : 0.3);
        }
        for (const [uid, c] of groundC) if (!alive.has(uid)) { scene.remove(c.group); c.dispose(); groundC.delete(uid); }
      }
      const dx = game.pos.x - lastPos.x, dz = game.pos.z - lastPos.z; const sp = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
      if (sp > 0.3) facing = Math.atan2(dx, dz);
      stepCam(dt, sp > 0.3 ? { x: dx, z: dz } : null); view.yaw = camState.yaw;
      const py = H0(game.pos.x, game.pos.z); player.group.position.set(game.pos.x, py, game.pos.z); pShadow.position.set(game.pos.x, py + 0.05, game.pos.z);
      player.group.rotation.y += ((facing - player.group.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 10);
      player.anim.update(dt); player.anim.walk(sp / 5);
      // v4: eylem animasyonları (toplama / yeme) ve kampta dinlenme
      const act = game.action; const ak = act ? act.type + ':' + act.id + ':' + act.total : null;
      if (ak !== view._ak) { view._ak = ak; if (act && act.type === 'gather') { player.anim.rest && player.anim.rest(false); player.anim.gather && player.anim.gather(act.total); } else if (act && act.type === 'eat') { player.anim.rest && player.anim.rest(false); player.anim.eat && player.anim.eat(act.total); } }
      if (act && act.type === 'gather') { const nd = lay.nodes.find((x) => x.id === act.id); if (nd) facing = Math.atan2(nd.x - game.pos.x, nd.z - game.pos.z); }
      const resting = !!view.resting || (game.atCamp && game.atCamp() && sp < 0.05 && !act);
      view._still = sp < 0.05 ? (view._still || 0) + dt : 0;
      const wantRest = !!view.resting || (resting && view._still > 1.2);
      if (wantRest !== !!view._resting) { view._resting = wantRest; player.anim.rest && player.anim.rest(wantRest); }
      if (camp) camp.userData.update(dt);
      for (const [id, o] of nodeObjs) {
        const ready = game.nodeReady ? game.nodeReady(id) : true; const u = o.userData;
        if (!ready && o.visible && !(act && act.type === 'gather' && act.id === id)) { o.visible = false; }
        else if (ready && !o.visible) { o.visible = true; o.scale.setScalar(0.01); u.pop = 0; }
        if (!o.visible) continue;
        u.t += dt; if (u.pop != null) { u.pop = Math.min(1, u.pop + dt * 2.5); o.scale.setScalar(ease.back ? Math.max(0.01, ease.back(u.pop)) : u.pop); if (u.pop >= 1) u.pop = null; }
        const near = game.nearbyNode && game.nearbyNode.id === id;
        u.ring.material.opacity = near ? 0.65 + Math.sin(u.t * 6) * 0.25 : 0.28;
        if (u.body.userData && u.body.material && u.type === 'sifali_ot') u.body.rotation.z = Math.sin(u.t * 1.7) * 0.05;
        if (o.userData.body.userData.glow) o.userData.body.userData.glow.material.emissiveIntensity = 1.2 + Math.sin(u.t * 2.2) * 0.4;
      }
      lastPos = { ...game.pos };
      camTarget.lerp(new THREE.Vector3(game.pos.x, py + 1, game.pos.z), Math.min(1, dt * 5));
      if (view.cine) { const c = view.cine; camera.position.set(c.pos.x, c.pos.y, c.pos.z); camera.lookAt(c.look.x, c.look.y, c.look.z); }
      else placeCamera(dt, py);
      const pulse = 0.45 + Math.sin(performance.now() / 400) * 0.15;
      for (const p of portals) { const o = p.open(); p.g.userData.portal.material.opacity = o ? pulse : 0.3; p.g.userData.portal.material.color.setHex(o ? 0x6fd7ff : 0xc0304a); }
      ring.rotation.z += dt * 0.5; for (const r of rings) r.rotation.z -= dt * 0.15;
      // canavarlar
      const seen = new Set(); const cand = [];
      for (const m of game.monsters) {
        const d = Math.hypot(m.pos.x - game.pos.x, m.pos.z - game.pos.z);
        if (!m.alive || d > R.constants.cullDistance) continue;
        seen.add(m.uid);
        let o = mobs.get(m.uid);
        if (!o) { o = getModel(m.typeId, m.isGuardian ? 3 : stageOf(m.level)); o.prev = { x: m.pos.x, z: m.pos.z }; scene.add(o.group); o.sh = blobShadow(m.isGuardian ? 1.8 : 0.9); scene.add(o.sh); mobs.set(m.uid, o); }
        const mdx = m.pos.x - o.prev.x, mdz = m.pos.z - o.prev.z;
        if (Math.hypot(mdx, mdz) > 0.001) o.group.rotation.y = Math.atan2(mdx, mdz);
        o.prev = { x: m.pos.x, z: m.pos.z };
        const my = H0(m.pos.x, m.pos.z); o.group.position.set(m.pos.x, my, m.pos.z); o.sh.position.set(m.pos.x, my + 0.05, m.pos.z); o.anim.update(dt); o.anim.walk(Math.hypot(mdx, mdz) / Math.max(dt, 1e-3) / 3);
        cand.push({ m, o, d, near: game.nearbyMonster?.uid === m.uid });
      }
      // etiketler: yakın olan önce; uzaktakiler, ekran dışındakiler, mini harita/HUD arkasındakiler ve çakışanlar gizlenir
      cand.sort((a, b) => (b.near - a.near) || (b.m.isGuardian - a.m.isGuardian) || a.d - b.d);
      const placed = []; const VW = innerWidth, VH = innerHeight;
      // açık bildirim kutusu varsa onun alanı da dolu sayılır (etiket bildirimin altında kalmasın)
      let toastR = null;
      const toastEl = typeof document !== 'undefined' && document.querySelector('.toast.show');
      if (toastEl) { const tr0 = toastEl.getBoundingClientRect(); if (tr0.width) { toastR = { x0: tr0.left - 4, x1: tr0.right + 4, y0: tr0.top - 4, y1: tr0.bottom + 4 }; placed.push(toastR); } }
      for (const { m, o, d, near } of cand) {
        const t = tagFor(m); const s = toScreen(o.group, camera, o.height + 0.3);
        const w = t.textContent.length * 6.6 + 8, h = 16;
        let r = { x0: s.x - w / 2, x1: s.x + w / 2, y0: s.y - h, y1: s.y };
        // hedef canavarın etiketi bildirimle çakışırsa bildirimin altına kaydır
        if (near && toastR && r.x0 < toastR.x1 && r.x1 > toastR.x0 && r.y0 < toastR.y1 && r.y1 > toastR.y0) { s.y = toastR.y1 + h + 2; r = { x0: s.x - w / 2, x1: s.x + w / 2, y0: s.y - h, y1: s.y }; }
        let show = !s.behind && (near || m.isGuardian || d <= TAG_RANGE) && r.x0 > 4 && r.x1 < VW - 4 && r.y0 > 4 && r.y1 < VH - 70;
        if (show && r.x1 > VW - 120 && r.y0 < 160) show = false;             // mini harita + pusula
        if (show && r.x0 < 250 && r.y0 < 96) show = false;                   // sol üst bilgi paneli
        if (show && placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) show = false;
        if (show) { placed.push(r); t.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`; }
        t.style.display = show ? 'block' : 'none';
        t.classList.toggle('near', near);
      }
      for (const [uid, o] of mobs) if (!seen.has(uid)) { scene.remove(o.group); scene.remove(o.sh); mobs.delete(uid); const t = tags.get(uid); if (t) { t.remove(); tags.delete(uid); } }
    },
    dispose() { for (const c of groundC.values()) c.dispose(); groundC.clear(); tags.forEach((t) => t.remove()); tags.clear(); scene.traverse((o) => o.geometry && o.geometry.dispose()); },
  };
  camTarget.set(game.pos.x, H0(game.pos.x, game.pos.z) + 1, game.pos.z); placeCamera(1, camTarget.y - 1);
  return view;
}

// ---------- KAPI sahnesi: açılış, yumurta seçimi, ana üs ----------
export function createGateView() {
  const scene = new THREE.Scene(); const env = buildGateEnv(scene, stage.quality);
  const keeper = getModel('keeper'); keeper.group.position.set(-3.2, 0, -1.4); keeper.group.rotation.y = 0.5; scene.add(keeper.group);
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.3, 320);
  const cam = { pos: new THREE.Vector3(0, 3.2, 9), look: new THREE.Vector3(0, 2.2, -2) };
  const live = [keeper];
  let creature = null, pedestalGroup = null, eggs = [], hatchEgg = null;
  const fx = new THREE.Group(); scene.add(fx);
  const view = {
    scene, camera, keeper, env, exposure: ZONE_ENV.gate.exposure,
    update(dt) {
      env.update(dt);
      camera.position.lerp(cam.pos, Math.min(1, dt * 3)); const l = new THREE.Vector3(); camera.getWorldDirection(l);
      view._look = view._look ? view._look.lerp(cam.look, Math.min(1, dt * 3)) : cam.look.clone(); camera.lookAt(view._look);
      live.forEach((m) => { m.anim.update(dt); if (m._spin) m.group.rotation.y += dt * 0.5; });
      fx.children.forEach((p) => { p.userData.v && p.position.addScaledVector(p.userData.v, dt); if (p.userData.v) p.userData.v.y -= 6 * dt; if (p.userData.v) p.material.opacity = Math.max(0, p.material.opacity - dt * 0.8); });
      if (view.onUpdate) view.onUpdate(dt);
    },
    setShot(name) {
      if (name === 'title') { cam.pos.set(0, 3.4, 17); cam.look.set(0, 5.2, -6); }
      if (name === 'cine') { cam.pos.set(-13, 4.5, 21); cam.look.set(0, 5, -6); }
      if (name === 'eggs') { cam.pos.set(0, 1.5, 5.2); cam.look.set(0, 0.25, 0.8); }
      if (name === 'hub') { cam.pos.set(1.6, 2.4, 6.5); cam.look.set(-0.6, 1.2, 0); }
      if (name === 'hatch') { cam.pos.set(0, 1.8, 4.2); cam.look.set(0, 1.0, 0.8); }
    },
    showEggs(ids, onPick) {
      pedestalGroup?.removeFromParent(); pedestalGroup = new THREE.Group(); scene.add(pedestalGroup); eggs = [];
      ids.forEach((id, i) => {
        const e = getModel('egg', 'C'); e.group.position.set((i - 1.5) * 1.55, 0, 0.8); e.group.scale.setScalar(0.75); e.eggOf = id;
        pedestalGroup.add(e.group); eggs.push(e); live.push(e);
      });
    },
    // seçim ekranında ejderha önizlemesi (seçili yumurtanın arkasında, yavaşça döner)
    previewDragon(i, id) {
      if (view._prev) { scene.remove(view._prev.group); live.splice(live.indexOf(view._prev), 1); view._prev = null; }
      if (id == null) return;
      const m = getModel(id, 1); const e = eggs[i];
      m.group.position.set(e ? e.group.position.x : 0, 0, -0.55); m.group.rotation.y = 0.6; m.group.scale.setScalar(0.01);
      m._spin = true; scene.add(m.group); live.push(m); view._prev = m;
      tween(0.35, (k) => m.group.scale.setScalar(Math.max(0.01, ease.back(k) * 0.95)));
      m.anim.victory && setTimeout(() => view._prev === m && m.anim.victory(), 380);
    },
    highlightEgg(i) { eggs.forEach((e, j) => { e.group.position.y = j === i ? 0.15 : 0; e.group.scale.setScalar(j === i ? 0.92 : 0.75); }); },
    async hatch(i, creatureId, grade = 'C') {
      view.previewDragon(null);
      const e = eggs[i]; eggs.forEach((x, j) => j !== i && (x.group.visible = false));
      await tween(0.6, (k) => e.group.position.setX(e.group.position.x * (1 - k)));
      view.setShot('hatch');
      await e.anim.shake(1); await e.anim.shake(0.8);
      const col = { C: 0xbfc4c9, B: 0x4caf6a, A: 0xa061e0, S: 0xf2c14e }[grade];
      burst(fx, new THREE.Vector3(0, 0.8, 0.8), col, 50);
      const fl = new THREE.PointLight(col, 8, 8); fl.position.set(0, 1.4, 1.6); scene.add(fl);
      tween(0.8, (k) => (fl.intensity = 8 * (1 - k))).then(() => scene.remove(fl));
      e.group.visible = false;
      view.setCreature(creatureId, 1, new THREE.Vector3(0, 0, 0.8));
      creature.group.scale.setScalar(0.01); await tween(0.5, (k) => creature.group.scale.setScalar(ease.back(k)));
      await creature.anim.victory();
    },
    setCreature(id, stage, posv) {
      if (creature) { scene.remove(creature.group); live.splice(live.indexOf(creature), 1); }
      creature = getModel(id, stage); creature.group.position.copy(posv || new THREE.Vector3(-0.6, 0, 0.6)); creature.group.rotation.y = 0.25;
      scene.add(creature.group); live.push(creature); return creature;
    },
    clearEggs() { view.previewDragon(null); pedestalGroup?.removeFromParent(); eggs.forEach((e) => live.splice(live.indexOf(e), 1)); eggs = []; },
    levelUpFx() { if (!creature) return; burst(fx, creature.group.position.clone().setY(1), 0xffd84a, 60); creature.anim.victory(); },
    get creature() { return creature; },
    // v4.1 çekirdek sahneleri için
    fx, addLive(m) { live.push(m); }, removeLive(m) { const i = live.indexOf(m); if (i >= 0) live.splice(i, 1); },
    setCam(pos, look) { cam.pos.copy(pos); cam.look.copy(look); },
    onUpdate: null,
    dispose() {},
  };
  view.setShot('title'); camera.position.copy(cam.pos); camera.lookAt(cam.look);
  return view;
}

export function burst(parent, at, color, n = 40) {
  const geo = new THREE.OctahedronGeometry(0.06);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
    m.position.copy(at); const a = Math.random() * Math.PI * 2, u = Math.random();
    m.userData.v = new THREE.Vector3(Math.cos(a) * (1 + u * 3), 2 + Math.random() * 4, Math.sin(a) * (1 + u * 3));
    parent.add(m); setTimeout(() => { parent.remove(m); m.material.dispose(); }, 1600);
  }
}
