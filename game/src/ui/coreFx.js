// Ruh Çekirdeği sahneleri (Ruh Kapısı görünümünde, yalnızca görsel):
//  • revealPulls: kristal(ler) döner, çatlaklar derece renginde parlar, kırılır, ışık sütunu.
//    1'li: tek kristal. 10'lu: 10 kristal yan yana sırayla, en yüksek derece sona. skip() true olunca hemen biter.
//  • showChar: kartın arkasında çıkan karakterin 3D önizlemesi.
//  • feedScene: karakter ruhu yutma (spiritFeed) — hayalet + girdap.
// Sonuçlar çekirdekte (openCores) önceden üretilip kaydedilmiştir; bu sahneler hiçbir sayıyı değiştirmez.
import * as THREE from 'three';
import { getModel, tween, ease } from './models.js';
import { stage, shake } from './stage.js';
import { makeCrystal, shatterFx, PULL_COLOR, pullKey, RANK } from './crystal.js';
import { createSpiritFeed } from './spiritFeed.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const stageOf = (lv) => (lv >= 10 ? 3 : lv >= 5 ? 2 : 1);

export function coreScene(view) {
  const live = new Set(); // { update(dt) }
  view.onUpdate = (dt) => { for (const o of [...live]) o.update(dt); };
  let preview = null;
  const hideDragon = (on) => { if (view.creature) view.creature.group.visible = !on; };

  const api = {
    /** Açılış animasyonu. results: openCores sonuçları (kayıtlı). opts.skip(): true → hemen bitir. onReveal(i, p) her kırılmada. */
    async reveal(results, { coreType, reduced = stage.reducedFx, skip = () => false, onReveal = () => {} } = {}) {
      api.clearPreview(); hideDragon(true);
      const many = results.length > 1;
      view.setCam(many ? V(0, 1.75, 5.4) : V(0, 1.6, 3.9), many ? V(0, 1.05, 0.6) : V(0, 1.15, 0.6));
      // gösterim sırası: düşükten yükseğe (en yüksek sona)
      const order = results.map((p, i) => ({ p, i })).sort((a, b) => RANK[pullKey(a.p)] - RANK[pullKey(b.p)] || a.i - b.i);
      const crystals = order.map((o, k) => {
        const c = makeCrystal(coreType || o.p.coreType || 'kil', { size: many ? 0.2 : 0.34 });
        const x = many ? (k - (order.length - 1) / 2) * 0.5 : 0;
        c.group.position.set(x, many ? 1.05 + Math.sin(k * 1.7) * 0.06 : 1.15, 0.8);
        c.group.scale.setScalar(0.01); view.scene.add(c.group); live.add(c); return { c, o };
      });
      // belirme
      await tween(reduced ? 0.2 : 0.4, (k) => crystals.forEach(({ c }) => c.group.scale.setScalar(Math.max(0.01, ease.back(k)))));
      for (let j = 0; j < crystals.length; j++) {
        if (skip()) break;
        const { c, o } = crystals[j]; const key = pullKey(o.p); const col = PULL_COLOR[key];
        const last = j === crystals.length - 1;
        const dur = reduced ? 0.25 : many ? (last ? 0.9 : 0.32) : key === 'M' ? 1.5 : 1.0;
        // döner, çatlaklar parlar
        c.setCrack(0, col);
        await tween(dur, (k) => { c.mesh.rotation.y += 0.25 * k; c.setCrack(k, col); c.setGlow(k * 0.8); if (!reduced) c.group.position.x += Math.sin(k * 60) * 0.0025 * k; });
        // kırılır
        const sh = shatterFx(view.scene, c.group.position.clone(), col, { mythic: key === 'M', reduced, quality: stage.quality }); live.add(sh); sh.done.then(() => live.delete(sh));
        view.scene.remove(c.group); live.delete(c); c.dispose(); crystals[j].gone = true;
        if (key === 'M') shake(0.5); else if (key === 'S') shake(0.25);
        onReveal(o.i, o.p);
        if (many && !last) await wait(reduced ? 60 : 140);
      }
      // atlandıysa kalanları sessizce kaldır
      for (const x of crystals) if (!x.gone) { view.scene.remove(x.c.group); live.delete(x.c); x.c.dispose(); }
      if (!skip()) await wait(reduced ? 150 : 450);
    },
    /** Kartın arkasında karakter önizlemesi (tek sonuç). */
    showChar(p, startLevel = 1) {
      api.clearPreview(); hideDragon(true);
      const m = getModel(p.species, stageOf(startLevel));
      m.group.position.set(0.55, 0, 0.7); m.group.rotation.y = -0.5; m.group.scale.setScalar(0.01);
      view.scene.add(m.group); view.addLive(m); preview = m; m._spin = true;
      view.setCam(V(-0.6, 1.5, 4.3), V(0.35, 1.0, 0.6));
      tween(0.45, (k) => m.group.scale.setScalar(Math.max(0.01, ease.back(k))));
      setTimeout(() => preview === m && m.anim.victory && m.anim.victory(), 420);
      return m;
    },
    clearPreview() { if (preview) { view.scene.remove(preview.group); view.removeLive(preview); preview = null; } },
    /** Karakter ruhu yutma sahnesi. items: [{species, grade, mythic, oz}] */
    async feed(items, { speed = 1, reduced = stage.reducedFx, onLabel = () => {}, tapEl = null } = {}) {
      api.clearPreview(); hideDragon(false);
      const d = view.creature; if (!d) return;
      d.group.position.set(-1.5, 0, 0.6); d.group.rotation.y = Math.PI / 2 - 0.15;
      view.setCam(V(0.1, 1.85, 5.4), V(0.1, 1.0, 0.5));
      await wait(250);
      const sf = createSpiritFeed(view.scene, { dragon: d, items, ghostAt: V(1.5, 0, 0.6), camera: view.camera, renderer: stage.renderer, reduced, quality: stage.quality, stage: 2, onLabel });
      sf.speed = speed; live.add(sf);
      window.__edinFeed = { n: sf.count, items: items.length, t: () => sf.t, sp: () => sf.speed, fallback: () => sf.dissolveFallback };
      const fast = () => { sf.speed = Math.max(sf.speed, speed * 4); };
      if (tapEl) tapEl.addEventListener('pointerdown', fast);
      await Promise.race([sf.done, wait(9000)]);
      sf.finish(); live.delete(sf);
      if (tapEl) tapEl.removeEventListener('pointerdown', fast);
      await Promise.race([d.anim.victory ? d.anim.victory() : wait(0), wait(1100)]);
      d.group.position.set(-0.6, 0, 0.6); d.group.rotation.y = 0.25;
    },
    dispose() { api.clearPreview(); hideDragon(false); for (const o of live) o.dispose && o.dispose(); live.clear(); view.onUpdate = null; },
  };
  return api;
}
