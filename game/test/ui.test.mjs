// Arayüz/model testi: her model kuruluyor mu, animasyon API'si eksiksiz mi, bütçeler (rules.performance),
// temas anı zamanlaması ve GLB yedeğe düşme.
import fs from 'fs';
import * as THREE from 'three';
import { getModel, updateTweens, DRAGON_IDS } from '../src/ui/models.js';
import { registerGlb, loadGlb, _setLoaderFactory, _clearGlbs, glbEntry } from '../src/ui/glb.js';
const R = JSON.parse(fs.readFileSync(new URL('../src/data/rules.json', import.meta.url)));
const stats = (o) => { let n = 0, dc = 0; o.traverse((m) => { if (m.isMesh) { dc++; const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return { tris: n, dc }; };
let fail = 0; const bad = (...a) => { console.log('HATA:', ...a); fail++; };
const ids = new Set(Object.keys(R.creatures)); DRAGON_IDS.forEach((d) => ids.add(d));
const guardians = new Set(R.zones.map((z) => z.guardian.id));
R.zones.forEach((z) => { z.monsters.forEach((m) => ids.add(m.id)); ids.add(z.guardian.id); });
const API = ['update', 'idle', 'walk', 'reset', 'attack', 'attackQuick', 'attackHeavy', 'finisher', 'guard', 'hit', 'block', 'dodge', 'die', 'victory', 'shake'];
const MAX_DC = 10;
for (const id of ids) for (const st of [1, 2, 3]) {
  const m = getModel(id, st); const { tris, dc } = stats(m.group);
  const cap = R.creatures[id] || DRAGON_IDS.includes(id) ? R.performance.creatureTris : guardians.has(id) ? R.performance.guardianTris : R.performance.monsterTris;
  for (const k of API) if (typeof m.anim[k] !== 'function') bad('eksik animasyon', id, st, k);
  if (tris > cap) bad('üçgen bütçesi aşıldı', id, st, tris, '>', cap);
  if (dc > MAX_DC) bad('çizim çağrısı fazla', id, st, dc);
  if (!m.meta || !m.meta.finisherFx || !m.meta.impactPoint) bad('meta eksik', id);
  if (st === 3) console.log(id.padEnd(20), String(Math.round(tris)).padStart(5), 'üçgen', dc, 'çağrı');
}
// evreler birbirinden farklı mı (siluet değişimi = parça/üçgen farkı)
for (const id of new Set([...Object.keys(R.creatures), ...DRAGON_IDS])) { const t = [1, 2, 3].map((s) => stats(getModel(id, s).group).tris); if (!(t[0] < t[1] && t[1] <= t[2])) bad('evreler arasında şekil farkı yok', id, t); }

// animasyon zamanlaması ve bozulmadan bitiş
async function run(m, name, arg) {
  let tImpact = null, t = 0; const dt = 1 / 60; let done = false;
  const p = m.anim[name](() => { tImpact = t; }, arg).then(() => (done = true));
  for (let i = 0; i < 300 && !done; i++) { t += dt; updateTweens(dt); m.anim.update(dt); await Promise.resolve(); await Promise.resolve(); }
  await p; for (let i = 0; i < 30; i++) { updateTweens(dt); m.anim.update(dt); }
  let nan = false; m.group.traverse((o) => { if ([o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z].some((v) => !Number.isFinite(v))) nan = true; });
  return { tImpact, t, nan };
}
const WANT = { attackQuick: [0.18, 0.5], attackHeavy: [0.55, 1.0], finisher: [0.75, 1.3] };
for (const id of new Set([...Object.keys(R.creatures), ...DRAGON_IDS, 'basmu', 'anzu'])) {
  const m = getModel(id, 3);
  for (const [name, [imp, maxT]] of Object.entries(WANT)) {
    const r = await run(m, name);
    if (r.tImpact === null) bad('temas anı çağrılmadı', id, name);
    else if (Math.abs(r.tImpact - imp) > 0.06) bad('temas anı kaydı', id, name, r.tImpact.toFixed(2), '≠', imp);
    if (r.t > maxT + 0.05) bad('animasyon uzun', id, name, r.t.toFixed(2));
    if (r.nan) bad('NaN dönüşüm', id, name);
  }
  for (const name of ['hit', 'dodge', 'block', 'victory']) { const r = await run(m, name); if (r.nan) bad('NaN', id, name); }
  // eylem bitince dinlenme pozuna döner
  m.anim.update(0.016); const r0 = m.root.position.z; if (Math.abs(r0) > 0.02) bad('eylem sonrası kök geri dönmedi', id, r0);
  m.anim.guard(true); for (let i = 0; i < 30; i++) m.anim.update(1 / 60); m.anim.guard(false);
  for (let i = 0; i < 20; i++) { m.anim.walk(1); m.anim.update(1 / 60); }
  const d = await run(m, 'die'); if (d.nan || Math.max(Math.abs(m.root.rotation.x), Math.abs(m.root.rotation.z)) < 1) bad('ölüm pozu yok', id);
}

// ---- v4 ejderhalar: ek API, meta, çizim çağrısı ≤6, emme/yemek/toplama/dinlenme ----
const DAPI = ['absorb', 'eat', 'rest', 'gather'];
const FXW = { ejder_ates: 'fire', ejder_su: 'water', ejder_zehir: 'poison', ejder_tas: 'horn' };
async function runFor(m, fn, maxSec = 6) { let done = false, t = 0; const pr = Promise.resolve(fn()).then(() => (done = true)); for (let i = 0; i < maxSec * 60 && !done; i++) { t += 1 / 60; updateTweens(1 / 60); m.anim.update(1 / 60); await Promise.resolve(); await Promise.resolve(); } await Promise.race([pr, Promise.resolve()]); return { done, t }; }
const finite = (m) => { let ok = true; m.group.traverse((o) => { if ([o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x].some((v) => !Number.isFinite(v))) ok = false; }); return ok; };
for (const id of DRAGON_IDS) for (const st of [1, 2, 3]) {
  const m = getModel(id, st); const { dc } = stats(m.group);
  if (dc > 6) bad('ejderha çizim çağrısı > 6', id, st, dc);
  for (const k of DAPI) if (typeof m.anim[k] !== 'function') bad('ejderha API eksik', id, st, k);
  if (m.meta.finisherFx !== FXW[id]) bad('finisherFx yanlış', id, m.meta.finisherFx);
  if (!m.meta.mouth || !m.meta.chest || typeof m.meta.glow !== 'function' || typeof m.meta.mouthWorld !== 'function') bad('ejderha meta eksik', id, st);
  if (!(m.meta.mouth.z > m.meta.chest.z && m.meta.mouth.y > m.meta.chest.y)) bad('ağız göğsün önünde/üstünde değil', id, st);
  m.meta.glow(0.7); if (Math.abs(m.meta.glowLevel - 0.7) > 1e-6) bad('parıltı ayarı çalışmıyor', id); m.meta.glow(0);
  if (st !== 3) continue;
  const tgt = new THREE.Vector3(1.5, 0.2, 2.5);
  const a = await runFor(m, () => m.anim.absorb(tgt, 1)); if (!a.done) bad('absorb Promise çözülmedi', id); else if (a.t < 0.95 || a.t > 1.9) bad('absorb süresi', id, a.t.toFixed(2));
  const a3 = await runFor(m, () => m.anim.absorb(tgt, 3.5)); if (!a3.done || a3.t < 3.4) bad('absorb (bekçi süresi) çözülmedi/kısa', id, a3.t.toFixed(2));
  const a0 = await runFor(m, () => m.anim.absorb(undefined)); if (!a0.done) bad('absorb hedefsiz çözülmedi', id);
  const e = await runFor(m, () => m.anim.eat(1.2)); if (!e.done) bad('eat çözülmedi', id);
  const g = await runFor(m, () => m.anim.gather(0.8)); if (!g.done) bad('gather çözülmedi', id);
  m.anim.rest(true); for (let i = 0; i < 90; i++) m.anim.update(1 / 60); const yRest = m.root.position.y; m.anim.rest(false); for (let i = 0; i < 120; i++) m.anim.update(1 / 60);
  if (!(yRest < -0.15)) bad('dinlenme pozu çökmüyor', id, yRest); if (Math.abs(m.root.position.y) > 0.05) bad('dinlenmeden kalkmadı', id, m.root.position.y);
  if (!finite(m)) bad('NaN (ejderha yeni animasyonlar)', id);
  // emme kesilirse (başka eylem) kilitlenme yok
  const pr = m.anim.absorb(tgt, 2); for (let i = 0; i < 20; i++) { updateTweens(1 / 60); m.anim.update(1 / 60); } const q = await run(m, 'attackQuick'); if (q.tImpact === null) bad('emme sonrası saldırı çalışmadı', id); await runFor(m, () => pr, 3);
  if (m.meta.glowLevel > 0.01) { for (let i = 0; i < 60; i++) { updateTweens(1 / 60); m.anim.update(1 / 60); } }
}
console.log('ejderhalar: ' + DRAGON_IDS.join(', '));

// GLB altyapısı: kayıtlı model yüklenemezse kod modeline düşer
_clearGlbs(); registerGlb('ugallu', 3, 'yok/ugallu_3.glb');
_setLoaderFactory(() => ({ loadAsync: () => Promise.reject(new Error('404 sahte')) }));
const ok = await loadGlb('ugallu', 3); const mf = getModel('ugallu', 3);
if (ok !== false || glbEntry('ugallu', 3).status !== 'fail' || mf.meta.source !== 'code') bad('GLB hatasında yedeğe düşülmedi');
// başarılı sahte GLB → glb kaynağı, animasyon API'si yine tam
_clearGlbs(); registerGlb('kulullu', undefined, 'sahte.glb', { height: 2 });
_setLoaderFactory(() => ({ loadAsync: async () => { const s = new THREE.Group(); s.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial())); return { scene: s, animations: [] }; } }));
await loadGlb('kulullu', 2); const mg = getModel('kulullu', 2);
if (mg.meta.source !== 'glb') bad('GLB yüklendiği halde kullanılmadı');
for (const k of API) if (typeof mg.anim[k] !== 'function') bad('GLB modelinde animasyon eksik', k);
const rg = await run(mg, 'attackHeavy'); if (rg.tImpact === null) bad('GLB modelinde temas yok');
_clearGlbs();

console.log(fail ? `HATA: ${fail}` : 'ui testi geçti'); process.exit(fail ? 1 : 0);
