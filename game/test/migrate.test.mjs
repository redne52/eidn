// node test/migrate.test.mjs — v4: kayıt geçişi (v1 → v2 ejderha) ve ruh özü emme bilgisinin tekliği
import assert from 'node:assert/strict';
import rules from '../src/data/rules.json' with { type: 'json' };
import { createGame } from '../src/core/world.js';
import { migrateSave, mapCreatureId, SAVE_VERSION } from '../src/core/migrate.js';
import { saveGame, loadSave, clearSave, SAVE_KEY } from '../src/core/save.js';
import * as combat from '../src/core/combat.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

// Gerçek v1 kayıtlarına benzeyen elle yazılmış örnekler (v3 sürümünün toSave() çıktısı biçiminde)
const V1_GATE = {
  version: 1, savedAt: 1763830000000, clock: 812.4, keeper: { level: 1 },
  creature: { id: 'kulullu', grade: 'B', level: 6, oz: 410, hp: 151, woundedUntil: 0, woundedLeft: 0 },
  carriedOz: 0, location: 'gate', inRun: false, runsCompleted: 7, sekel: 312,
  bag: { bandaj: 4, panzehir: 1, donus_tableti: 1 },
  eggs: [{ uid: 'e2', species: 'ugallu', grade: 'A', heat: 5, hatched: false, source: 'monster' }, { uid: 'e3', species: 'kusarikku', grade: 'C', heat: 8, hatched: true, source: 'guardian' }],
  eggSeq: 4, belt: [{ itemId: 'can_iksiri', count: 1 }, { itemId: 'bandaj', count: 3 }, null, null], incubatingEggId: 'e2',
  unlockedZones: ['kiyi', 'bozkir'], guardians: { lahmu: { defeated: true, respawnLeft: 0 } }, tablets: [], kaderPuani: 3,
  stats: { fights: 40, wins: 36, losses: 3, flees: 1, ozLost: 22, ozGained: 900, deaths: 3 },
  settings: { sound: true, vibration: true, quality: 'auto', testOz: false }, flags: { firstFightDone: true, tutorialDone: true }, fight: null,
};
// Savaş ortasında, Bozkır'da kaydedilmiş v1
const V1_MIDFIGHT = {
  ...V1_GATE, creature: { id: 'girtablullu', grade: 'C', level: 8, oz: 120, hp: 200, woundedLeft: 0 },
  carriedOz: 95, location: { zoneId: 'bozkir', x: 22.5, z: 18.2 }, inRun: true, fight: { hp: 37 }, eggs: [],
};
// Sürüm alanı olmayan çok eski kayıt
const V0 = { creature: { id: 'ugallu', grade: 'C', level: 2, oz: 30, hp: 100 }, sekel: 50, location: 'gate' };

ok('eşleme tablosu: 4 eski yaratık → 4 ejderha', () => {
  assert.equal(mapCreatureId('ugallu'), 'ejder_ates');
  assert.equal(mapCreatureId('kulullu'), 'ejder_su');
  assert.equal(mapCreatureId('girtablullu'), 'ejder_zehir');
  assert.equal(mapCreatureId('kusarikku'), 'ejder_tas');
  assert.equal(mapCreatureId('ejder_tas'), 'ejder_tas');
  assert.deepEqual(rules.start.creatureChoice, ['ejder_ates', 'ejder_su', 'ejder_zehir', 'ejder_tas']);
});

ok('v1 kapı kaydı: ejderhaya geçer, seviye/derece/öz/can/eşyalar korunur', () => {
  const m = migrateSave(V1_GATE);
  assert.equal(m.version, SAVE_VERSION);
  assert.equal(m.creature.id, 'ejder_su'); assert.equal(m.creature.legacyId, 'kulullu');
  assert.equal(m.creature.level, 6); assert.equal(m.creature.grade, 'B'); assert.equal(m.creature.oz, 410); assert.equal(m.creature.hp, 151);
  // v3: çatlamamış yumurta derece+kuluçkasıyla kalır; çatlamış yumurta (e3) derece korunarak bekleyen sonuç olur
  assert.deepEqual(m.eggs.map((e) => e.species), ['ejder_ates']);
  assert.deepEqual(m.eggs.map((e) => [e.legacySpecies, e.grade, e.heat, e.legacy]), [['ugallu', 'A', 5, true]]);
  assert.deepEqual(m.pulls.pending.map((p) => [p.species, p.grade, p.source, p.state]), [['ejder_tas', 'C', 'egg', 'pending']]);
  assert.deepEqual(m.food, {}); assert.deepEqual(m.resources, {}); assert.deepEqual(m.camps, {});
  assert.equal(V1_GATE.creature.id, 'kulullu', 'girdi değişmemeli');
  const g = createGame(V1_GATE, { seed: 4 });
  assert.equal(g.screen, 'gate'); assert.equal(g.creature.id, 'ejder_su'); assert.equal(g.creature.legacyId, 'kulullu');
  assert.equal(g.sekel, 312); assert.equal(g.kaderPuani, 0); assert.equal(g.kaderMuhru, 0); assert.equal(g.pulls.pity, 6); assert.deepEqual(g.unlockedZones, ['kiyi', 'bozkir']);
  assert.equal(g.flags.migratedFrom, 1);
  // oynanabilir: bölgeye gir, savaş başlat, bitir
  assert.equal(g.enterZone('kiyi'), true);
  const m0 = g.monsters.find((x) => x.alive && !x.isGuardian); g.pos = { ...m0.pos };
  const b = g.startFight(m0.uid); assert.ok(b);
  let guard = 0; while (!b.over && guard++ < 200) combat.playTurn(b, combat.autoChoice(b));
  const r = g.finishFight(b); assert.ok(r);
});

ok('geçiş idempotent: iki kez uygulamak ya da v2 kaydı yeniden yüklemek aynı sonucu verir', () => {
  const a = migrateSave(V1_GATE), b = migrateSave(a);
  assert.deepEqual(b, a);
  const g = createGame(V1_GATE, { seed: 2 });
  const s2 = g.toSave(); assert.equal(s2.version, SAVE_VERSION);
  const g2 = createGame(s2, { seed: 2 });
  assert.equal(g2.creature.id, 'ejder_su'); assert.equal(g2.creature.level, 6); assert.equal(g2.creature.legacyId, 'kulullu');
  assert.deepEqual(g2.toSave().eggs, s2.eggs);
});

ok('v1 savaş ortası kayıt: Bozkır\'da açılır, can korunur (yenilemeyle iyileşme yok), taşınan öz korunur', () => {
  const g = createGame(V1_MIDFIGHT, { seed: 3 });
  assert.equal(g.creature.id, 'ejder_zehir');
  assert.equal(g.zoneId, 'bozkir'); assert.equal(g.screen, 'world');
  assert.equal(g.creature.hp, 37); assert.equal(g.carriedOz, 95);
  assert.equal(g.flags.resumedFromFight, true);
});

ok('sürümsüz çok eski kayıt v1 sayılır ve açılır; gelecekteki/bozuk kayıt reddedilir', () => {
  const g = createGame(V0, { seed: 1 });
  assert.equal(g.creature.id, 'ejder_ates'); assert.equal(g.screen, 'gate'); assert.equal(g.creature.level, 2);
  assert.equal(migrateSave({ ...V1_GATE, version: 99 }), null);
  assert.equal(migrateSave({ version: 1, creature: { id: 'yok_boyle', level: 1 } }), null);
  assert.equal(migrateSave(null), null);
});

ok('localStorage yolu: eski v1 metni loadSave ile v2 olarak döner', () => {
  clearSave();
  const g = createGame(null, { seed: 1 }); // sadece saveGame'in store'una erişim için
  // saveGame g.toSave() yazar; eski kaydı taklit etmek için doğrudan v1 JSON yazalım
  const store = globalThis.localStorage;
  if (store) store.setItem(SAVE_KEY, JSON.stringify(V1_GATE));
  else { // bellek yedeği: saveGame ile v1'e benzer bir kayıt yaz
    g.toSave = () => V1_GATE; saveGame(g);
  }
  const d = loadSave();
  assert.equal(d.version, SAVE_VERSION); assert.equal(d.creature.id, 'ejder_su');
  clearSave();
});

ok('ruh özü emme: absorb bilgisi doğru tür ve süreyle gelir, öz bir kez verilir', () => {
  const g = createGame(null, { seed: 7 });
  g.startNewGame(); g.chooseStarter('ejder_ates'); g.enterZone('kiyi');
  const m0 = g.monsters.find((x) => x.alive && !x.isGuardian); g.pos = { ...m0.pos };
  const before = g.carriedOz;
  const b = g.startFight(m0.uid);
  b.enemy.hp = 1; let guard = 0; while (!b.over && guard++ < 50) combat.playTurn(b, { action: 'quick' });
  assert.equal(b.winner, 'player');
  const r = g.finishFight(b);
  assert.equal(r.absorb.kind, m0.rare ? 'rare' : 'normal');
  assert.equal(r.absorb.dur, rules.absorbFx.durations[r.absorb.kind]);
  assert.equal(r.absorb.oz, r.oz);
  assert.equal(g.carriedOz, before + r.oz);
  // aynı savaşı ikinci kez bitirmek (animasyon tekrar tetiklense) ödül vermez
  const again = g.finishFight(b);
  assert.equal(g.carriedOz, before + r.oz, 'ikinci finishFight öz vermemeli');
  assert.equal(again, r, 'aynı sonuç döner, yeniden hesaplanmaz');
  // emme animasyonu sırasında kayıt alınıp yüklenirse öz bir kez sayılmış olmalı
  const s = g.toSave(); const h = createGame(s, { seed: 7 });
  assert.equal(h.carriedOz, before + r.oz);
});

ok('nadir ve bekçi türleri', () => {
  const rare = rules.zones.flatMap((z) => z.monsters).filter((m) => m.rare).map((m) => m.id);
  assert.ok(rare.length >= 1);
  const g = createGame(null, { seed: 9 });
  g.startNewGame(); g.chooseStarter('ejder_tas'); g.unlockedZones = rules.zones.map((z) => z.id); g.enterZone('bozkir');
  const rm = g.monsters.find((x) => x.rare && x.alive);
  if (rm) {
    g.pos = { ...rm.pos }; const b = g.startFight(rm.uid); b.enemy.hp = 1;
    let k = 0; while (!b.over && k++ < 50) combat.playTurn(b, { action: 'quick' });
    if (b.winner === 'player') assert.equal(g.finishFight(b).absorb.kind, 'rare');
  }
  const gd = g.monsters.find((x) => x.isGuardian && x.alive);
  g.pos = { ...gd.pos }; const b2 = g.startFight(gd.uid); b2.enemy.hp = 1;
  let k2 = 0; while (!b2.over && k2++ < 50) combat.playTurn(b2, { action: 'quick' });
  if (b2.winner === 'player') { const r2 = g.finishFight(b2); assert.equal(r2.absorb.kind, 'guardian'); assert.equal(r2.absorb.dur, rules.absorbFx.durations.guardian); }
});

ok('eski kimlikler veri olarak yaşıyor: yabani düşman ve koleksiyon', () => {
  for (const old of Object.keys(rules.legacyMap.creatures)) {
    assert.equal(rules.creatures[old].legacy, true);
    assert.ok(rules.collection.entries.some((e) => e.id === old));
    assert.ok(combat.makeCombatant({ kind: 'monster', id: old + '_yabani', level: 3 }).maxHp > 0);
  }
  assert.deepEqual(combat.playableIds(), rules.start.creatureChoice);
});

console.log(`\n${n} geçiş testi geçti.`);
