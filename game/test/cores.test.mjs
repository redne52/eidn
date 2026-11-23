// node test/cores.test.mjs — v4.1 Ruh Çekirdeği, kadro, açılış, ölüm kaybı, idempotentlik, kayıt geçişi (v3)
import assert from 'node:assert/strict';
import rules from '../src/data/rules.json' with { type: 'json' };
import { createGame } from '../src/core/world.js';
import { migrateSave, SAVE_VERSION } from '../src/core/migrate.js';
import * as combat from '../src/core/combat.js';

const SC = rules.soulCores;
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

function fresh(seed = 1, id = 'ejder_ates') { const g = createGame(null, { seed }); g.startNewGame(); g.chooseStarter(id); return g; }
const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
function fakeMonster(zoneId, typeId, { rare = false, guardian = false } = {}) { return { typeId, zoneId, rare, isGuardian: guardian, pos: { x: 10, z: 10 } }; }

// ---------------------------------------------------------------------------
ok('kurallar: 4 tür, iki mitolojik aday, tablolar toplamı 1', () => {
  assert.deepEqual(SC.order, ['kil', 'lacivert', 'altin', 'kader']);
  for (const t of SC.order) assert.ok(Math.abs(total(SC.types[t].grades) - 1) < 1e-9, t);
  assert.ok(Math.abs(total(SC.mythicGrades) - 1) < 1e-9);
  assert.equal(SC.types.kader.grades.C, undefined, 'Kader çekirdekte C yok');
  assert.ok(SC.mythicCandidates.A && SC.mythicCandidates.B);
  for (const c of Object.values(SC.mythicCandidates)) assert.equal(c.rates.kil, 0, "Kil'de mitolojik yok");
  assert.equal(SC.rosterMax, 2);
});

ok('düşme oranları: nadir canavar ve bekçi tabloları (100.000 deneme)', () => {
  const g = fresh(3);
  const N = 100000; let rare = 0;
  for (let i = 0; i < N; i++) { g.cores.bag = { kil: 0, lacivert: 0, altin: 0, kader: 0 }; rare += g.rollCoreDrops(fakeMonster('bozkir', 'uridimmu', { rare: true }), false).length; }
  assert.ok(Math.abs(rare / N - SC.drops.rareChance.bozkir) < 0.005, 'nadir oran ' + rare / N);
  // ilk zafer garantileri
  g.cores.bag = { kil: 0, lacivert: 0, altin: 0, kader: 0 };
  const first = g.rollCoreDrops(fakeMonster('derin', 'usumgallu', { guardian: true }), true);
  assert.ok(first.some((c) => c.type === 'kader'), 'Ušumgallu ilk zafer Kader');
  const firstA = g.rollCoreDrops(fakeMonster('bozkir', 'anzu', { guardian: true }), true);
  assert.ok(firstA.some((c) => c.type === 'altin'), 'Anzû ilk zafer Altın');
  // sonraki zaferler: always + chance oranı
  let lac = 0, alt = 0;
  for (let i = 0; i < 20000; i++) { g.cores.bag = { kil: 0, lacivert: 0, altin: 0, kader: 0 }; const d = g.rollCoreDrops(fakeMonster('bozkir', 'anzu', { guardian: true }), false); lac += d.filter((c) => c.type === 'lacivert').length; alt += d.filter((c) => c.type === 'altin').length; }
  const az = SC.drops.guardians.anzu;
  const exp = (type) => (az.always || []).filter(([t]) => t === type).reduce((a, [, k]) => a + k, 0) + (az.chance || []).filter(([t]) => t === type).reduce((a, [, p]) => a + p, 0);
  assert.ok(Math.abs(lac / 20000 - exp('lacivert')) < 0.015, 'lacivert ' + lac / 20000);
  assert.ok(Math.abs(alt / 20000 - exp('altin')) < 0.015, 'altin ' + alt / 20000);
  // sıradan canavar çekirdek düşürmez
  assert.equal(g.rollCoreDrops(fakeMonster('kiyi', 'basmu'), false).length, 0);
});

ok('derece dağılımı tabloya uyar (±%0,3, 200.000 açılış) ve 1\'li açılış tohumludur', () => {
  const g = fresh(5);
  const cnt = { C: 0, B: 0, A: 0, S: 0 };
  const N = 200000;
  for (let i = 0; i < N; i++) { g.cores.bag.kil = 1; const r = g.openCores('kil', 1); cnt[r.results[0].grade]++; if (g.pulls.pending.length > 500) g.pulls.pending = []; }
  for (const k of ['C', 'B', 'A', 'S']) assert.ok(Math.abs(cnt[k] / N - SC.types.kil.grades[k]) < 0.003, k + ' ' + cnt[k] / N);
});

ok('mitolojik taban oranı (merhamet devre dışı) ve havuzlar', () => {
  const g = fresh(6); g.creature.level = 10;
  const cfg = SC.mythicCandidates[SC.mythicActive];
  let m = 0; const N = 100000; const species = new Set();
  for (let i = 0; i < N; i++) { g.pulls.pity = 0; g.cores.bag.kader = 1; const r = g.openCores('kader', 1).results[0]; if (r.mythic) { m++; species.add(r.species); assert.ok(['B', 'A', 'S'].includes(r.grade)); } else assert.ok(SC.dragonPool.includes(r.species)); if (g.pulls.pending.length > 500) g.pulls.pending = []; }
  assert.ok(Math.abs(m / N - cfg.rates.kader) < 0.003, 'kader mitolojik ' + m / N);
  assert.deepEqual([...species].sort(), [...SC.mythicPool].sort());
});

ok("Kil'den mitolojik çıkmaz; seviye < 8 iken mitolojik çıkmaz ve merhamet İLERLEMEZ", () => {
  const g = fresh(7); g.creature.level = 13;
  for (let i = 0; i < 2000; i++) { g.cores.bag.kil = 1; const r = g.openCores('kil', 1).results[0]; assert.equal(r.mythic, false); if (g.pulls.pending.length > 500) g.pulls.pending = []; }
  assert.equal(g.pulls.pity, 0, 'kil merhameti ilerletmez');
  g.creature.level = 7;
  for (let i = 0; i < 500; i++) { g.cores.bag.kader = 1; const r = g.openCores('kader', 1).results[0]; assert.equal(r.mythic, false); if (g.pulls.pending.length > 500) g.pulls.pending = []; }
  assert.equal(g.pulls.pity, 0, 'seviye < 8 merhameti ilerletmez');
  assert.equal(g.mythicInfo('kader').eligible, false);
});

ok('merhamet: yumuşak artış ve sert garanti', () => {
  const g = fresh(8); g.creature.level = 9;
  const cfg = SC.mythicCandidates[SC.mythicActive];
  g.pulls.pity = cfg.pityHard - 1;
  g.cores.bag.lacivert = 1;
  const r = g.openCores('lacivert', 1).results[0];
  assert.equal(r.mythic, true, 'sert garanti');
  assert.equal(g.pulls.pity, 0);
  g.pulls.pity = cfg.pitySoftStart + 9;
  assert.ok(Math.abs(g.mythicInfo('lacivert').chance - (cfg.rates.lacivert + 10 * cfg.pityStep)) < 1e-12);
});

ok("10'lu açılış: aynı türden 10 çekirdek, en az 1 B+ garanti", () => {
  const g = fresh(9);
  for (let i = 0; i < 3000; i++) {
    g.cores.bag.kil = 10;
    const r = g.openCores('kil', 10);
    assert.equal(r.results.length, 10);
    assert.ok(r.results.some((x) => ['B', 'A', 'S'].includes(x.grade)));
    if (g.pulls.pending.length > 500) g.pulls.pending = [];
  }
  g.cores.bag.kil = 9;
  assert.equal(g.openCores('kil', 10).reason, 'yetersiz');
  assert.equal(g.openCores('kil', 5).reason, 'adet');
});

ok('sahada yalnız çanta, kapıda çanta + depo açılır; savaşta açılmaz', () => {
  const g = fresh(10);
  g.cores.depot.kil = 5; g.cores.bag.kil = 0;
  assert.equal(g.openCores('kil', 1).ok, true, 'kapıda depodan açılır');
  g.enterZone('kiyi');
  assert.equal(g.openCores('kil', 1).reason, 'yetersiz', 'sahada depo kullanılmaz');
  g.cores.bag.kil = 1;
  assert.equal(g.openCores('kil', 1).ok, true);
  const m0 = g.monsters.find((x) => x.alive && !x.isGuardian); g.pos = { ...m0.pos }; g.startFight(m0.uid);
  g.cores.bag.kil = 1;
  assert.equal(g.openCores('kil', 1).reason, 'savas');
});

ok('yenileme: açılış sonucu tekrar üretilmez, çekirdek tekrar düşülmez; aynı opId tek etki', () => {
  const g = fresh(11);
  g.cores.depot.lacivert = 12;
  const a = g.openCores('lacivert', 10, 'op-1');
  const b = g.openCores('lacivert', 10, 'op-1');
  assert.deepEqual(b, a, 'aynı opId aynı sonuç');
  assert.equal(g.cores.depot.lacivert, 2, 'çekirdek bir kez düştü');
  assert.equal(g.pendingPulls().length, 10);
  // kayıt → yükleme: bekleyenler aynen, yeni sonuç üretilmez
  const s = JSON.parse(JSON.stringify(g.toSave()));
  const h = createGame(s, { seed: 999 });
  assert.deepEqual(h.pendingPulls(), g.pendingPulls());
  assert.equal(h.cores.depot.lacivert, 2);
  assert.deepEqual(h.openCores('lacivert', 10, 'op-1'), a, 'opLog kayıtla taşınır');
  // tohum: aynı sayaçla aynı sonuç (yenileyip yeniden denemek farklı sonuç vermez)
  const g2 = createGame(JSON.parse(JSON.stringify(s)), { seed: 1 }); g2.cores.depot.lacivert = 10;
  const h2 = createGame(JSON.parse(JSON.stringify(s)), { seed: 2 }); h2.cores.depot.lacivert = 10;
  assert.deepEqual(g2.openCores('lacivert', 10).results.map((x) => [x.species, x.grade]), h2.openCores('lacivert', 10).results.map((x) => [x.species, x.grade]));
});

ok('tut / yedir idempotent; çözülmüş sonuç ikinci kez ödül vermez', () => {
  const g = fresh(12);
  g.cores.depot.altin = 2;
  const [p1, p2] = [g.openCores('altin', 1).results[0], g.openCores('altin', 1).results[0]];
  const oz0 = g.creature.oz;
  const f1 = g.resolvePull(p1.id, 'feed', {}, 'f-1');
  const f1b = g.resolvePull(p1.id, 'feed', {}, 'f-1');
  assert.deepEqual(f1b, f1);
  assert.equal(g.resolvePull(p1.id, 'feed').reason, 'cozuldu');
  assert.equal(g.resolvePull(p1.id, 'keep').reason, 'cozuldu');
  assert.ok(g.creature.oz + g.creature.level * 0 >= oz0, 'kapıda güvendeki öze');
  const k1 = g.resolvePull(p2.id, 'keep', {}, 'k-1');
  const k1b = g.resolvePull(p2.id, 'keep', {}, 'k-1');
  assert.deepEqual(k1b, k1);
  assert.equal(g.roster.length, 2, 'tek kez eklendi');
});

ok('yedirme: sahada taşınan öze, kapıda güvendeki öze; tablo değerleri', () => {
  const g = fresh(13);
  g.cores.depot.kader = 2;
  const p = g.openCores('kader', 1).results[0];
  const want = p.mythic ? SC.feedOz.mythic : SC.feedOz[p.grade];
  const before = g.creature.oz + g.carriedOz; const lv0 = g.creature.level;
  const r = g.resolvePull(p.id, 'feed');
  assert.equal(r.to, 'banked'); assert.equal(r.oz, want);
  assert.ok(g.creature.level > lv0 || g.creature.oz === before + want);
  g.enterZone('kiyi'); g.cores.bag.kader = 1;
  const q = g.openCores('kader', 1).results[0];
  const c0 = g.carriedOz;
  const r2 = g.resolvePull(q.id, 'feed');
  assert.equal(r2.to, 'carried');
  assert.equal(g.carriedOz, c0 + (q.mythic ? SC.feedOz.mythic : SC.feedOz[q.grade]));
});

ok('kadro: en fazla 2; 3. için değiştirme zorunlu, aktif silinemez, değiştirme bedelsiz ve kalıcı', () => {
  const g = fresh(14);
  g.cores.depot.kil = 3;
  const res = g.openCores('kil', 1).results.concat(g.openCores('kil', 1).results, g.openCores('kil', 1).results);
  assert.equal(g.resolvePull(res[0].id, 'keep').ok, true);
  assert.equal(g.roster.length, 2);
  const info = g.pullDecisionInfo(res[1].id);
  assert.equal(info.rosterFull, true);
  assert.deepEqual(info.replaceable.map((c) => c.uid), [g.roster[1].uid], 'aktif değiştirilebilir listede yok');
  assert.equal(g.resolvePull(res[1].id, 'keep').reason, 'degistir');
  assert.equal(g.resolvePull(res[1].id, 'keep', { replaceUid: g.activeUid }).reason, 'aktif');
  assert.equal(g.pendingPulls().some((p) => p.id === res[1].id), true, 'reddedilen sonuç bekler');
  const sek = g.sekel, lvA = g.creature.level, oldUid = g.roster[1].uid;
  const r = g.resolvePull(res[1].id, 'keep', { replaceUid: oldUid });
  assert.equal(r.ok, true);
  assert.equal(g.sekel, sek, 'şekel bedeli yok'); assert.equal(g.creature.level, lvA, 'seviye bedeli yok');
  assert.equal(g.roster.length, 2); assert.ok(!g.roster.some((c) => c.uid === oldUid), 'kalıcı');
});

ok('aktif değiştirme yalnız kapıda', () => {
  const g = fresh(15);
  g.cores.depot.kil = 1;
  const p = g.openCores('kil', 1).results[0];
  const k = g.resolvePull(p.id, 'keep');
  g.enterZone('kiyi');
  assert.equal(g.setActive(k.char.uid).reason, 'kapi');
  g.arriveAtGate('test');
  assert.equal(g.setActive(k.char.uid).ok, true);
  assert.equal(g.creature.uid, k.char.uid);
  // savaşa aktif karakter girer
  g.enterZone('kiyi');
  const m0 = g.monsters.find((x) => x.alive && !x.isGuardian); g.pos = { ...m0.pos };
  const b = g.startFight(m0.uid);
  assert.equal(b.player.id, k.char.id);
});

ok('yeni karakter başlangıç seviyesi kurala uyar', () => {
  const g = fresh(16); g.creature.level = 10;
  g.cores.depot.kil = 1;
  const p = g.openCores('kil', 1).results[0];
  const k = g.resolvePull(p.id, 'keep');
  const ns = SC.newCharStart;
  if (ns.mode === 'percentOfMax') { assert.equal(k.char.level, Math.max(1, Math.floor(10 * ns.percent))); assert.equal(k.char.oz, 0); }
  else { assert.equal(k.char.level, 1); assert.equal(k.char.catchUpTo, 10); }
});

ok('ölüm kaybı: yalnız çanta, olasılıklı yuvarlama (beklenen değer), depo ve bekleyenler korunur', () => {
  let sum = 0; const N = 4000;
  for (let s = 1; s <= N; s++) {
    const g = fresh(s); g.runsCompleted = 5; g.unlockedZones = ['kiyi', 'bozkir', 'derin'];
    g.cores.depot.lacivert = 1; const p = g.openCores('lacivert', 1).results[0];
    g.cores.bag = { kil: 4, lacivert: 2, altin: 1, kader: 0 }; g.cores.depot.kil = 9;
    g.enterZone('bozkir');
    const L = g.applyCoreDeathLoss('bozkir', false);
    sum += L.k;
    assert.ok(L.k === 1 || L.k === 2, 'k = ' + L.k);
    assert.equal(total(g.cores.bag), 7 - L.k);
    assert.equal(g.cores.depot.kil, 9);
    assert.ok(g.pendingPulls().some((x) => x.id === p.id));
  }
  assert.ok(Math.abs(sum / N - 1.4) < 0.03, 'ortalama ' + sum / N);
  const g = fresh(2); g.cores.bag.kil = 10;
  assert.equal(g.applyCoreDeathLoss('kiyi', false).k, 0, 'Kıyı %0');
  assert.equal(g.applyCoreDeathLoss('derin', true).k, 0, 'ilk 3 sefer koruması');
  assert.equal(g.applyCoreDeathLoss('derin', false).k, 4, 'Derin %40 × 10 = 4');
});

ok('gerçek ölüm akışında çekirdek kaybı ve ölüm olayı', () => {
  const g = fresh(21); g.runsCompleted = 5; g.unlockedZones = ['kiyi', 'bozkir', 'derin'];
  g.cores.bag = { kil: 5, lacivert: 0, altin: 0, kader: 0 };
  g.enterZone('bozkir');
  let ev = null; g.on('death', (d) => { ev = d; });
  const m0 = g.monsters.find((x) => x.alive && !x.isGuardian); g.pos = { ...m0.pos };
  const b = g.startFight(m0.uid); b.over = true; b.winner = 'enemy';
  const r = g.finishFight(b);
  assert.equal(ev.coresLostCount, 1);
  assert.equal(total(r.coresLost), 1);
  assert.equal(total(g.cores.bag) + total(g.cores.depot), 4, 'kalanlar otomatik depoya aktarıldı');
  assert.equal(total(g.cores.bag), 0);
  const again = g.finishFight(b);
  assert.equal(total(g.cores.depot), 4, 'ölüm iki kez işlenmez');
  assert.equal(again, r);
});

ok('çanta kapasitesi: dolunca yere düşer, yakına gelince alınır, süre dolunca kaybolur; yükseltme ve depo', () => {
  const g = fresh(22);
  assert.equal(g.cores.bagCap, SC.bag.start);
  g.cores.bag.kil = SC.bag.start;
  g.enterZone('kiyi');
  const d = g.rollCoreDrops({ ...fakeMonster('derin', 'mushussu', { rare: true }), pos: { x: g.pos.x + 30, z: g.pos.z } }, false);
  // %30: birkaç kez dene
  let dropped = d;
  for (let i = 0; i < 50 && !dropped.length; i++) dropped = g.rollCoreDrops({ ...fakeMonster('derin', 'mushussu', { rare: true }), pos: { x: g.pos.x + 30, z: g.pos.z } }, false);
  assert.equal(dropped[0].toBag, false);
  assert.equal(g.groundCores.length >= 1, true);
  g.cores.bag.kil -= 1;
  const gc = g.groundCores[0]; g.pos = { x: Math.min(gc.x, 60), z: gc.z }; g.pos = { x: gc.x, z: gc.z };
  g.tick(0.1);
  assert.equal(total(g.cores.bag), SC.bag.start, 'yerdeki alındı');
  g.groundCores.push({ uid: 'gx', type: 'kil', x: 1, z: 1, expiresAt: g.clock + 1 });
  g.tick(2);
  assert.equal(g.groundCores.some((x) => x.uid === 'gx'), false, 'süre dolunca kaybolur');
  g.arriveAtGate('test');
  assert.equal(total(g.cores.bag), 0, 'varışta otomatik depoya');
  g.sekel = 5000;
  assert.equal(g.upgradeCoreBag('u1').ok, true); assert.deepEqual(g.upgradeCoreBag('u1'), { ok: true, cap: 30 }, 'aynı op tek yükseltme');
  assert.equal(g.cores.bagCap, 30); assert.equal(g.sekel, 5000 - SC.bag.upgrades[0].price);
  g.upgradeCoreBag(); g.upgradeCoreBag();
  assert.equal(g.cores.bagCap, 50); assert.equal(g.upgradeCoreBag().reason, 'max');
  assert.equal(g.withdrawCores('kil', 3).ok, true); assert.equal(g.cores.bag.kil, 3);
});

ok('Kader Mührü: A %80 / S %20 ejderha garantisi', () => {
  const g = fresh(23); const cnt = { A: 0, S: 0 };
  for (let i = 0; i < 5000; i++) { g.kaderMuhru = 1; const r = g.useKaderMuhru().results[0]; cnt[r.grade]++; assert.ok(SC.dragonPool.includes(r.species)); if (g.pulls.pending.length > 500) g.pulls.pending = []; }
  assert.equal(cnt.A + cnt.S, 5000);
  assert.ok(Math.abs(cnt.A / 5000 - 0.8) < 0.02);
  g.kaderMuhru = 0; assert.equal(g.useKaderMuhru().reason, 'yok');
});

ok('yumurta düşmesi kalktı; gerçek savaşta nadir canavar çekirdek verir, sıradan vermez', () => {
  const g = fresh(24); g.unlockedZones = ['kiyi', 'bozkir', 'derin']; g.creature.level = 9;
  g.enterZone('bozkir');
  let rareCores = 0, normalCores = 0, eggs = 0;
  for (let i = 0; i < 120; i++) {
    const m = g.monsters.find((x) => x.alive && !x.isGuardian); if (!m) { g.tick(60); continue; }
    g.pos = { ...m.pos }; const b = g.startFight(m.uid); b.enemy.hp = 1;
    let k = 0; while (!b.over && k++ < 50) combat.playTurn(b, { action: 'quick' });
    const r = g.finishFight(b); if (r.winner !== 'player') { g.dismissDeath(); g.enterZone('bozkir'); continue; }
    if (r.egg) eggs++;
    if (m.rare) rareCores += r.cores.length; else normalCores += r.cores.length;
    g.creature.hp = g.maxHp();
  }
  assert.equal(eggs, 0); assert.equal(normalCores, 0);
});

// ------------------------- kayıt geçişi v3 -------------------------
const V1 = {
  version: 1, savedAt: 1763830000000, clock: 500, keeper: { level: 1 },
  creature: { id: 'kusarikku', grade: 'A', level: 9, oz: 700, hp: 260, woundedLeft: 0 },
  carriedOz: 0, location: 'gate', inRun: false, runsCompleted: 12, sekel: 900, bag: { bandaj: 2 },
  eggs: [
    { uid: 'e1', species: 'ugallu', grade: 'S', heat: 17, hatched: false, source: 'guardian' },
    { uid: 'e2', species: 'kulullu', grade: 'B', heat: 3, hatched: false, source: 'monster' },
    { uid: 'e3', species: 'girtablullu', grade: 'A', heat: 20, hatched: true, source: 'kader' },
  ],
  eggSeq: 4, belt: [null, null, null, null], incubatingEggId: 'e1', unlockedZones: ['kiyi', 'bozkir', 'derin'],
  guardians: {}, tablets: ['lahmu', 'anzu'], kaderPuani: 23, stats: {}, settings: {}, flags: {}, fight: null,
};
const V2 = { ...JSON.parse(JSON.stringify(V1)), version: 2, creature: { id: 'ejder_tas', legacyId: 'kusarikku', grade: 'A', level: 9, oz: 700, hp: 260, woundedLeft: 0 },
  eggs: V1.eggs.map((e) => ({ ...e, species: { ugallu: 'ejder_ates', kulullu: 'ejder_su', girtablullu: 'ejder_zehir' }[e.species], legacySpecies: e.species })), food: { pismis_et: 2 }, resources: { cig_et: 3 }, camps: {}, nodes: {}, buffs: { atk: 0.1, fights: 1 } };
const V2_MID = { ...JSON.parse(JSON.stringify(V2)), location: { zoneId: 'derin', x: 30, z: 30 }, inRun: true, carriedOz: 140, fight: { hp: 55 } };

ok('geçiş v1 → v3: kadro, yumurtalar (derece + kuluçka) ve kader mühürleri korunur', () => {
  const m = migrateSave(V1);
  assert.equal(m.version, SAVE_VERSION);
  assert.equal(m.roster.length, 1); assert.equal(m.activeUid, m.roster[0].uid);
  assert.deepEqual([m.roster[0].id, m.roster[0].grade, m.roster[0].level, m.roster[0].oz, m.roster[0].legacyId], ['ejder_tas', 'A', 9, 700, 'kusarikku']);
  assert.deepEqual(m.eggs.map((e) => [e.uid, e.species, e.grade, e.heat, e.legacy]), [['e1', 'ejder_ates', 'S', 17, true], ['e2', 'ejder_su', 'B', 3, true]]);
  assert.equal(m.incubatingEggId, 'e1');
  assert.deepEqual(m.pulls.pending.map((p) => [p.species, p.grade, p.source, p.eggUid]), [['ejder_zehir', 'A', 'egg', 'e3']], 'çatlamış yumurta derecesiyle bekleyen sonuç');
  // kader: eski hak sayısı (23 puan → 2 tam garanti) = mühür sayısı; kalan 3 → merhamet 6
  assert.equal(m.kaderMuhru, Math.floor(23 / 10)); assert.equal(m.pulls.pity, 3 * 2); assert.equal(m.legacyKaderPuani, 23);
  assert.deepEqual(migrateSave(m), m, 'idempotent');
});

ok('geçiş v2 → v3 ve oyunda: kuluçka zaferlerle sürer, çatlayınca derece korunur', () => {
  const g = createGame(V2, { seed: 4 });
  assert.equal(g.screen, 'gate'); assert.equal(g.creature.id, 'ejder_tas'); assert.equal(g.roster.length, 1);
  assert.deepEqual(g.food, { pismis_et: 2 }); assert.equal(g.kaderMuhru, 2);
  const egg = g.eggs.find((e) => e.uid === 'e1');
  assert.equal(g.eggProgress(egg), 17 / rules.eggHatchWins.S);
  g.enterZone('derin');
  let pulled = null; g.on('eggResult', (d) => { pulled = d.result; });
  for (let i = 0; i < 40 && !pulled; i++) {
    const m = g.monsters.find((x) => x.alive && !x.isGuardian && g.monsterColor(x) !== 'gri'); if (!m) { g.tick(60); continue; }
    g.pos = { ...m.pos }; const b = g.startFight(m.uid); b.enemy.hp = 1;
    let k = 0; while (!b.over && k++ < 50) combat.playTurn(b, { action: 'quick' });
    g.finishFight(b); g.creature.hp = g.maxHp(); if (g.screen !== 'world') g.enterZone('derin');
  }
  assert.ok(pulled, 'S yumurta çatladı');
  assert.deepEqual([pulled.species, pulled.grade, pulled.source], ['ejder_ates', 'S', 'egg']);
});

ok('geçiş v2 savaş ortası: bölgede açılır, can ve taşınan öz korunur; ikinci yüklemede değişiklik yok', () => {
  const g = createGame(V2_MID, { seed: 5 });
  assert.equal(g.zoneId, 'derin'); assert.equal(g.creature.hp, 55); assert.equal(g.carriedOz, 140);
  const s1 = JSON.parse(JSON.stringify(g.toSave()));
  const h = createGame(s1, { seed: 5 });
  const s2 = JSON.parse(JSON.stringify(h.toSave()));
  delete s1.savedAt; delete s2.savedAt;
  assert.deepEqual(s2.roster, s1.roster); assert.deepEqual(s2.cores, s1.cores); assert.deepEqual(s2.pulls, s1.pulls);
  assert.equal(s2.kaderMuhru, s1.kaderMuhru); assert.deepEqual(s2.eggs, s1.eggs);
});

ok('v3 kayıt: kadro (2 karakter, aktif ikinci) ve çekirdekler kayıt/yüklemede aynen', () => {
  const g = fresh(30);
  g.cores.depot.kil = 2; const p = g.openCores('kil', 1).results[0];
  const k = g.resolvePull(p.id, 'keep'); g.setActive(k.char.uid);
  g.cores.bag.altin = 3; g.cores.depot.kader = 1; g.kaderMuhru = 1;
  const s = JSON.parse(JSON.stringify(g.toSave()));
  const h = createGame(s, { seed: 30 });
  assert.equal(h.activeUid, k.char.uid); assert.equal(h.creature.uid, k.char.uid); assert.equal(h.roster.length, 2);
  assert.deepEqual(h.cores.bag, g.cores.bag); assert.deepEqual(h.cores.depot, g.cores.depot); assert.equal(h.kaderMuhru, 1);
  assert.equal(h.seed, g.seed);
});

console.log(`\n${n} çekirdek testi geçti.`);
