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

// Ateş Ejderhası GLB — iskelet haritası bağlanmamışsa (kemiksiz sahte model) katı gövde animatörüne düşer: assets.json kaydıyla sahte model → API, temas zamanları, ölçek, ağız/göğüs
{
  const A = JSON.parse(fs.readFileSync(new URL('../src/ui/assets.json', import.meta.url)));
  const def = A.models.find((x) => x.id === 'ejder_ates'); if (!def || !def.rigged || def.rigMap !== 'ates') bad('assets.json: ejder_ates iskeletli kaydı yok');
  // 1) yükleme başarısız → kod modeline düş
  _clearGlbs(); registerGlb('ejder_ates', undefined, { 0: 'yok_lo.glb', 1: 'yok_hi.glb' }, def);
  _setLoaderFactory(() => ({ loadAsync: () => Promise.reject(new Error('404 sahte')) }));
  await loadGlb('ejder_ates'); if (getModel('ejder_ates', 3).meta.source !== 'code') bad('ejder_ates GLB hatasında yedeğe düşülmedi');
  // 2) başarılı (sahte geometri: boyu fit.height, ağız +Z'de) → katı gövde modeli
  _clearGlbs(); registerGlb('ejder_ates', undefined, { 0: 'lo.glb', 1: 'hi.glb' }, def);
  const H0 = def.fit.height;
  _setLoaderFactory(() => ({ loadAsync: async () => { const s = new THREE.Group(); const g = new THREE.BoxGeometry(0.9, H0, 0.98); g.translate(0, H0 / 2, 0); s.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial())); return { scene: s, animations: [] }; } }));
  await loadGlb('ejder_ates');
  const RAPI = [...API, 'absorb', 'eat', 'rest', 'gather'];
  for (const st of [1, 2, 3]) {
    const m = getModel('ejder_ates', st);
    if (m.meta.source !== 'glb' || !m.meta.rigid) { bad('ejder_ates GLB kullanılmadı', st); continue; }
    for (const k of RAPI) if (typeof m.anim[k] !== 'function') bad('katı animatörde eksik', k);
    for (const k of ['mouthWorld', 'chestWorld', 'glow']) if (typeof m.meta[k] !== 'function') bad('GLB meta eksik', k);
    if (m.meta.finisherFx !== 'fire' || m.meta.dragonType !== 'ates') bad('GLB meta tür/efekt yanlış', m.meta.finisherFx, m.meta.dragonType);
    if (!(m.meta.mouth.z > m.meta.chest.z && m.meta.mouth.y > m.meta.chest.y)) bad('ağız göğsün önünde/üstünde değil', st);
    // ölçek: boy = targetHeight × evre oranı; ayaklar zeminde
    m.group.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(m.root); const want = def.targetHeight * def.stageScale[st - 1];
    if (Math.abs(bb.max.y - want) > want * 0.03 || Math.abs(bb.min.y) > 0.02) bad('GLB ölçek/zemin hatası', st, bb.min.y.toFixed(3), bb.max.y.toFixed(3), want.toFixed(3));
    for (const [n, [lo, hi]] of Object.entries(WANT)) { const r = await run(m, n); if (r.tImpact === null || Math.abs(r.tImpact - lo) > 0.04 || r.t > hi + 0.1 || r.nan) bad('katı animatör temas zamanı', st, n, r.tImpact, r.t); }
    const pr = m.anim.absorb(new THREE.Vector3(2, 1, 2), 1); const ab = await runFor(m, () => pr, 3); if (!ab.done) bad('GLB absorb çözülmedi', st);
    for (const n of ['hit', 'block', 'dodge', 'victory', 'eat', 'gather']) { const r = await runFor(m, () => m.anim[n](n === 'hit' ? true : undefined), 4); if (!r.done) bad('katı animatör bitmedi', n); }
    m.anim.rest(true); for (let i = 0; i < 90; i++) { updateTweens(1 / 60); m.anim.update(1 / 60); } const yRest = m.root.position.y; m.anim.rest(false); for (let i = 0; i < 120; i++) { updateTweens(1 / 60); m.anim.update(1 / 60); } if (!(yRest < -0.05 && Math.abs(m.root.position.y) < 0.03)) bad('dinlenme çökmedi/kalkmadı', yRest, m.root.position.y);
    await runFor(m, () => m.anim.die(), 3); m.group.updateMatrixWorld(true); const ang = m.root.children[0].rotation.z; if (Math.abs(ang) < 1) bad('ölüm pozu yok', ang);
    m.anim.reset(); let nan = false; m.root.traverse((o) => { if (!Number.isFinite(o.position.x + o.rotation.z + o.scale.y)) nan = true; }); if (nan) bad('NaN');
  }
  _clearGlbs();
}

// İskeletli Ateş Ejderhası: kemik haritası + prosedürel iskelet animatörü (skelAnim.js)
{
  const { rigBoneNames, checkRig } = await import('../src/ui/models/skelAnim.js');
  const MAP = JSON.parse(fs.readFileSync(new URL('../src/ui/models/atesRigMap.json', import.meta.url)));
  const A = JSON.parse(fs.readFileSync(new URL('../src/ui/assets.json', import.meta.url)));
  const def = A.models.find((x) => x.id === 'ejder_ates');
  // 1) harita grupları dolu
  const groups = { kanatSol: MAP.wingL, kanatSag: MAP.wingR, bacakSol: MAP.legL, bacakSag: MAP.legR, boyun: MAP.neck, kafa: MAP.head, cene: MAP.jaw, kuyruk: MAP.tail, omurga: MAP.spine, gogus: MAP.chest };
  for (const [g, v] of Object.entries(groups)) if (!v || rigBoneNames(v).length === 0) bad('kemik haritası grubu boş', g);
  for (const s of ['wingL', 'wingR']) if (!MAP[s].upper || !MAP[s].hand || MAP[s].fingers.length < 3) bad('kanat zinciri eksik', s);
  for (const s of ['legL', 'legR']) for (const k of ['hip', 'knee', 'ankle', 'foot']) if (!MAP[s][k]) bad('bacak zinciri eksik', s, k);
  const names = rigBoneNames(MAP); if (new Set(names).size !== names.length) bad('haritada yinelenen kemik');
  // 2) gerçek GLB dosyalarındaki kemiklerle eşleşme (JSON parçası okunur; ad temizleme three ile aynı)
  for (const f of ['ejder_ates_hi.glb', 'ejder_ates_lo.glb']) {
    const buf = fs.readFileSync(new URL('../assets/' + f, import.meta.url));
    const len = buf.readUInt32LE(12); const J = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
    const skin = J.skins?.[0]; if (!skin || skin.joints.length !== 78) { bad('GLB iskeleti yok/eksik', f, skin?.joints.length); continue; }
    const prim = J.meshes.flatMap((m) => m.primitives); if (!prim.every((p) => p.attributes.JOINTS_0 !== undefined && p.attributes.WEIGHTS_0 !== undefined)) bad('GLB skin öznitelikleri kayıp', f);
    const bones = {}; for (const i of skin.joints) bones[THREE.PropertyBinding.sanitizeNodeName(J.nodes[i].name || '')] = true;
    const miss = checkRig(bones, MAP); if (miss.length) bad('kemik haritası GLB ile eşleşmedi', f, miss.slice(0, 4));
  }
  // 3) haritaya uygun sahte iskeletli sahne (zincirler, bir SkinnedMesh)
  const fakeRigScene = (map) => {
    const s = new THREE.Group(); const B = {}; const all = [];
    const mk = (n, parent, off) => { if (B[n]) return B[n]; const b = new THREE.Bone(); b.name = n; b.position.set(...off); (parent || s).add(b); B[n] = b; all.push(b); return b; };
    const chain = (list, parent, off) => { let p = parent; for (const n of list) p = mk(n, p, off); return p; };
    const root = mk(map.root, null, [0, 0.35, 0]);
    const sp = chain(map.spine, root, [-0.04, 0.03, 0]); const su = chain(map.spineUpper, sp, [-0.03, 0.04, 0]);
    const nk = chain(map.neck, su, [-0.02, 0.05, 0]); const hd = mk(map.head, nk, [-0.03, 0.03, 0]); const sk = mk(map.skull, hd, [-0.04, 0, 0]);
    const jw = mk(map.jaw, hd, [-0.02, -0.02, 0]); mk(map.jawTip, jw, [-0.06, 0, 0]);
    for (const [k, side] of [['wingL', 1], ['wingR', -1]]) { const w = map[k]; let p = sp; if (w.clavicle) p = mk(w.clavicle, p, [0, 0.03, 0.05 * side]); p = mk(w.upper, p, [0, 0.05, 0.1 * side]); if (w.fore) p = mk(w.fore, p, [0, 0.05, 0.1 * side]); const h = mk(w.hand, p, [0, 0.04, 0.08 * side]); for (const f of w.fingers) chain(f, h, [0.04, -0.03, 0.06 * side]); }
    for (const [k, side] of [['legL', 1], ['legR', -1]]) { const l = map[k]; const f = chain([l.hip, l.knee, l.ankle, l.foot], root, [0, -0.08, 0.04 * side]); for (const t of l.toes) mk(t, f, [-0.03, -0.02, 0]); }
    chain(map.tail, root, [0.05, -0.01, 0]); for (const n of map.misc || []) mk(n, root, [0, 0, 0]);
    s.updateMatrixWorld(true);
    const g = new THREE.BoxGeometry(0.4, 0.86, 0.3); g.translate(0, 0.43, 0); const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 ? 0 : 1)), 4));
    const mesh = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial()); s.add(mesh); mesh.bind(new THREE.Skeleton(all)); return s;
  };
  const yieldF = () => new Promise((r) => setTimeout(r, 0));
  const step = async (m, sec) => { for (let i = 0; i < sec * 60; i++) { updateTweens(1 / 60); m.anim.update(1 / 60); if (i % 4 === 0) await yieldF(); } };
  const nanFree = (m) => { let ok = true; m.group.traverse((o) => { if (![o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w].every(Number.isFinite)) ok = false; }); return ok; };
  _clearGlbs(); registerGlb('ejder_ates', undefined, { 0: 'lo.glb', 1: 'hi.glb' }, { ...def, rigMap: MAP });
  _setLoaderFactory(() => ({ loadAsync: async () => ({ scene: fakeRigScene(MAP), animations: [] }) }));
  await loadGlb('ejder_ates');
  const SAPI = [...API, 'absorb', 'eat', 'rest', 'gather'];
  const DEFCH = (m) => m.anim._channels();
  for (const st of [1, 3]) {
    const m = getModel('ejder_ates', st);
    if (m.meta.source !== 'glb' || !m.meta.rigged) { bad('iskeletli model kurulmadı', st, m.meta.source); continue; }
    for (const k of SAPI) if (typeof m.anim[k] !== 'function') bad('iskelet animatöründe eksik', k);
    if (m.meta.finisherFx !== 'fire' || m.meta.dragonType !== 'ates' || typeof m.meta.glow !== 'function') bad('iskeletli meta eksik');
    // ağız işaretçisi çene kemiğine, göğüs göğüs kemiğine bağlı
    const parents = (n) => { const out = []; let o = n; while (o) { out.push(o.name); o = o.parent; } return out; };
    const mouthOk = parents(m.parts.mouth).includes(MAP.jaw), chestOk = parents(m.parts.chest).includes(MAP.chest);
    if (!mouthOk || !chestOk) bad('ağız/göğüs işaretçisi kemiğe bağlı değil', mouthOk, chestOk);
    const base = DEFCH(m);
    m.anim.idle(); await step(m, 0.5);
    for (const [n, [lo, hi]] of Object.entries(WANT)) { const r = await run(m, n); if (r.tImpact === null || Math.abs(r.tImpact - lo) > 0.04 || r.t > hi + 0.1 || r.nan) bad('iskelet temas zamanı', st, n, r.tImpact, r.t); }
    for (const n of ['hit', 'block', 'dodge', 'victory', 'eat', 'gather']) { const r = await runFor(m, () => m.anim[n](n === 'hit' ? true : undefined), 5); if (!r.done) bad('iskelet eylemi bitmedi', n); }
    const ab = await runFor(m, () => m.anim.absorb(new THREE.Vector3(2, 1, 2), 1), 3); if (!ab.done) bad('iskelet absorb çözülmedi');
    // yürüme: koşu hızında kanatlar zaman zaman çırpar
    let maxFlap = 0; for (let i = 0; i < 60 * 7; i++) { m.anim.walk(1); updateTweens(1 / 60); m.anim.update(1 / 60); maxFlap = Math.max(maxFlap, DEFCH(m).flapAuto); if (i % 4 === 0) await yieldF(); }
    if (maxFlap < 0.2) bad('koşarken kanat çırpışı yok', maxFlap.toFixed(2));
    m.anim.walk(0);
    m.anim.idle(); m.anim.guard(true); await step(m, 0.6); if (DEFCH(m).wingFwd < 0.5) bad('savunmada kanatlar öne gelmedi'); m.anim.guard(false);
    await step(m, 2.5);
    const ch = DEFCH(m); const off = Object.keys(base).filter((k) => k !== 'walkAmp' && k !== 'flapAuto' && Math.abs(ch[k] - base[k]) > 0.05);
    if (off.length || ch.walkAmp > 0.05) bad('eylemler sonrası boşta pozuna dönülmedi', off, ch.walkAmp);
    if (!nanFree(m)) bad('iskelet NaN');
    m.anim._bindPose(); if (!m.anim._atBind()) bad('bind pozuna dönülmedi');
    await runFor(m, () => m.anim.die(), 4); if (!nanFree(m)) bad('ölümde NaN');
    m.anim.reset(); await step(m, 0.2); if (!nanFree(m) || DEFCH(m).crouch > 0.05) bad('reset sonrası poz bozuk');
  }
  // 4) yedek zinciri: harita eşleşmezse katı gövde, yükleme başarısızsa kod modeli
  const bogus = { ...MAP, jaw: 'olmayan_kemik' };
  _clearGlbs(); registerGlb('ejder_ates', undefined, { 0: 'lo.glb', 1: 'hi.glb' }, { ...def, rigMap: bogus });
  _setLoaderFactory(() => ({ loadAsync: async () => ({ scene: fakeRigScene(MAP), animations: [] }) }));
  const warn = console.warn; console.warn = () => {}; await loadGlb('ejder_ates'); const mr = getModel('ejder_ates', 2); console.warn = warn;
  if (mr.meta.source !== 'glb' || !mr.meta.rigid || mr.meta.rigged) bad('iskelet hatasında katı gövdeye düşülmedi', mr.meta.rigid, mr.meta.rigged);
  else { const r = await run(mr, 'attackHeavy'); if (r.tImpact === null || r.nan) bad('katı yedek animasyonu bozuk'); }
  _clearGlbs(); registerGlb('ejder_ates', undefined, { 0: 'lo.glb', 1: 'hi.glb' }, { ...def, rigMap: MAP });
  _setLoaderFactory(() => ({ loadAsync: () => Promise.reject(new Error('404 sahte')) }));
  await loadGlb('ejder_ates'); if (getModel('ejder_ates', 3).meta.source !== 'code') bad('iskeletli yükleme hatasında kod modeline düşülmedi');
  _clearGlbs();
}

console.log(fail ?  `HATA: ${fail}` : 'ui testi geçti'); process.exit(fail ? 1 : 0);
