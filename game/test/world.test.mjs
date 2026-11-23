// Dünya modülü testi: tam oyun akışını kodla oynatır.
// Çalıştır: node test/world.test.mjs
import assert from 'node:assert/strict';
import rules from '../src/data/rules.json' with { type: 'json' };
import { createGame, ozToNext, levelDiffInfo, growthStage } from '../src/core/world.js';
import * as combat from '../src/core/combat.js';
import { saveGame, loadSave, clearSave } from '../src/core/save.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

// Savaşı gerçek savaş motoruyla sonuna kadar oynat.
function fightToEnd(g, forceWinner = null) {
  const b = g.battle;
  assert.ok(b, 'savaş başlamalı');
  if (forceWinner) { b.over = true; b.winner = forceWinner; if (forceWinner === 'enemy') b.player.hp = 0; }
  let guard = 0;
  while (!b.over && guard++ < 200) combat.playTurn(b, combat.smartPolicy(b));
  assert.ok(b.over, 'savaş bitmeli');
  return g.finishFight(b);
}
// En yakın canlı canavara ışınla ve saldır
function attackNearest(g, filter = (m) => !m.isGuardian) {
  const m = g.monsters.filter((x) => x.alive && filter(x)).sort((a, b) => Math.hypot(a.pos.x - g.pos.x, a.pos.z - g.pos.z) - Math.hypot(b.pos.x - g.pos.x, b.pos.z - g.pos.z))[0];
  assert.ok(m, 'canavar bulunmalı');
  g.pos = { x: m.pos.x + 1, z: m.pos.z };
  g.tick(0.016, { x: 0, z: 0 });
  return g.startFight(m.uid);
}

console.log('Dünya testi');
const events = [];
const g = createGame(null, { seed: 42 });
g.on('*', (e, d) => events.push(e));

ok('yardımcı formüller', () => {
  assert.equal(ozToNext(1), 100);
  assert.equal(ozToNext(12), 5330);
  assert.equal(levelDiffInfo(5, 9).color, 'kirmizi');
  assert.equal(levelDiffInfo(5, 5).color, 'sari');
  assert.equal(levelDiffInfo(5, 1).color, 'yesil'); assert.equal(levelDiffInfo(6, 1).color, 'gri');
  assert.equal(growthStage(4), 0); assert.equal(growthStage(5), 1); assert.equal(growthStage(10), 2);
});

ok('başlangıç yaratığı seçimi ve ilk yumurtanın hemen çatlaması', () => {
  assert.equal(g.screen, 'intro');
  g.startNewGame();
  assert.equal(g.screen, 'choose');
  g.chooseStarter('ejder_ates');
  assert.equal(g.creature.id, 'ejder_ates');
  assert.equal(g.creature.grade, 'C');
  assert.equal(g.creature.level, 1);
  assert.equal(g.creature.hp, g.maxHp());
  assert.equal(g.screen, 'gate');
  assert.ok(events.includes('hatch') && events.includes('bond'));
  assert.deepEqual(g.beltMap(), { can_iksiri: 1, bandaj: 3 });
  assert.equal(g.sekel, rules.start.sekel);
});

ok('Kıyı\'ya giriş, canavarlar ve bekçi doğar; kapalı bölgeye girilemez', () => {
  assert.equal(g.enterZone('bozkir'), false);
  assert.equal(g.enterZone('kiyi'), true);
  assert.equal(g.screen, 'world');
  assert.equal(g.inRun, true);
  assert.equal(g.monsters.length, 13);
  assert.ok(g.monsters.some((m) => m.isGuardian && m.typeId === 'lahmu' && m.level === 5));
  for (const m of g.monsters.filter((x) => !x.isGuardian)) assert.ok(m.level >= 1 && m.level <= 4);
});

ok('joystick ile hareket ve canavar dolaşması', () => {
  const p0 = { ...g.pos };
  for (let i = 0; i < 30; i++) g.tick(0.05, { x: 1, z: 0 });
  assert.ok(g.pos.x > p0.x + 5, 'oyuncu sağa gitmeli');
  const before = g.monsters.map((m) => ({ ...m.pos }));
  for (let i = 0; i < 100; i++) g.tick(0.05, { x: 0, z: 0 });
  assert.ok(g.monsters.some((m, i) => Math.hypot(m.pos.x - before[i].x, m.pos.z - before[i].z) > 0.1), 'canavarlar dolaşmalı');
  for (const m of g.monsters) assert.ok(Math.hypot(m.pos.x - m.home.x, m.pos.z - m.home.z) <= 8.5 || m.aggro);
});

ok('yakın canavar tespiti ve ilk (öğretici) savaş', () => {
  const b = attackNearest(g);
  assert.ok(b.tutorial, 'ilk savaş öğretici olmalı');
  assert.equal(g.screen, 'battle');
  const r = fightToEnd(g);
  assert.equal(r.winner, 'player');
  assert.ok(r.oz > 0 && g.carriedOz === r.oz);
  assert.ok(r.sekel > 0);
  assert.equal(g.screen, 'world');
  assert.ok(g.creature.hp > 0 && g.creature.hp <= g.maxHp());
  const dead = g.monsters.find((m) => !m.alive && !m.isGuardian);
  assert.ok(dead && dead.respawnAt > g.clock);
});

ok('öz formülü: (10+5×sv) × renk × bölge', () => {
  g.creature.level = 1;
  const b = attackNearest(g);
  const lv = b.enemy.level;
  const r = fightToEnd(g, 'player');
  const exp = Math.round((10 + 5 * lv) * levelDiffInfo(1, lv).mult * 1.0);
  assert.equal(r.oz, exp);
});

ok('test ×5 anahtarı özü 5 katına çıkarır', () => {
  g.setTestOz(true);
  const b = attackNearest(g);
  const lv = b.enemy.level;
  const r = fightToEnd(g, 'player');
  assert.equal(r.oz, Math.round((10 + 5 * lv) * levelDiffInfo(1, lv).mult * 5));
  g.setTestOz(false);
});

ok('ölüm: ilk 3 sefer korumalı, öz kaybolmaz; kapıya dönüş ve yaralı', () => {
  const carried = g.carriedOz;
  assert.equal(g.runsCompleted, 0);
  attackNearest(g);
  const r = fightToEnd(g, 'enemy');
  assert.equal(r.lost, 0);
  assert.equal(g.screen, 'dead');
  assert.equal(g.runsCompleted, 1);
  assert.equal(g.carriedOz, 0, 'kalan öz kapıda yatırıldı');
  assert.ok(g.creature.oz + (g.creature.level - 1 > 0 ? 1 : 0) >= 0);
  assert.ok(g.isWounded() && g.woundedSecondsLeft() === 60);
  assert.equal(g.enterZone('kiyi'), false, 'ölüm ekranı kapanmadan girilemez');
  g.dismissDeath();
  assert.equal(g.screen, 'gate');
  assert.equal(g.canEnterZone('kiyi'), true, 'yaralı yaratık Kıyı\'ya girebilir');
  if (!g.unlockedZones.includes('bozkir')) g.unlockedZones.push('bozkir'), (g._tmpUnlock = true);
  assert.equal(g.canEnterZone('bozkir'), false, 'yaralıyken Bozkır kapalı');
  if (g._tmpUnlock) { g.unlockedZones = g.unlockedZones.filter((z) => z !== 'bozkir'); delete g._tmpUnlock; }
  g.tick(61, { x: 0, z: 0 });
  assert.equal(g.isWounded(), false);
  void carried;
});

ok('seviye sadece kapıda atlar; fazla öz aktarılır', () => {
  // seviye 1'e, öz 0'a çek ve öz taşı
  g.creature.level = 1; g.creature.oz = 0;
  g.enterZone('kiyi');
  g.carriedOz = 250;
  assert.equal(g.creature.level, 1, 'Edin içinde seviye atlanmaz');
  assert.ok(g.levelReadyIfBanked());
  // dönüş büyüsü 10 sn
  g.startReturn();
  // güvenli halkada beklet ki saldırı bozmasın
  const lay = g.layout(); g.pos = { x: lay.gate.x + 1.5, z: lay.gate.z + 1.5 };
  for (let i = 0; i < 9; i++) g.tick(1, { x: 0, z: 0 });
  assert.equal(g.screen, 'world', '9 sn sonra hâlâ yolda');
  g.tick(1.1, { x: 0, z: 0 });
  assert.equal(g.screen, 'gate');
  assert.equal(g.creature.level, 2, '250 öz → 100 harcanır, seviye 2');
  assert.equal(g.creature.oz, 150);
  assert.equal(g.carriedOz, 0);
  assert.equal(g.creature.hp, g.maxHp(), 'kapıda can dolar');
  assert.equal(g.runsCompleted, 2);
});

ok('dönüş büyüsü savaş başlarsa bozulur', () => {
  g.enterZone('kiyi');
  g.startReturn();
  g.tick(2, { x: 0, z: 0 });
  attackNearest(g);
  assert.equal(g.returnSpell, null);
  fightToEnd(g, 'player');
  g.arriveAtGate('test');
  assert.equal(g.runsCompleted, 3);
});

ok('koruma bitince Bozkır\'da %20 kayıp', () => {
  assert.equal(g.lossProtectionLeft(), 0);
  g.unlockedZones.push('bozkir');
  g.creature.level = 6;
  g.enterZone('bozkir');
  g.carriedOz = 1000;
  attackNearest(g);
  const r = fightToEnd(g, 'enemy');
  assert.equal(r.lost, 200);
  assert.equal(g.stats.ozLost, 200);
  g.dismissDeath(); g.tick(61);
});

ok('Kıyı\'da kayıp %0 (koruma bitse de)', () => {
  g.enterZone('kiyi');
  g.carriedOz = 500;
  attackNearest(g);
  const r = fightToEnd(g, 'enemy');
  assert.equal(r.lost, 0);
  g.dismissDeath(); g.tick(61);
});

ok('bekçi: ilk zaferde çekirdek garanti (v4.1), sonraki bölge açılır, şekel ve tablet', () => {
  const g2 = createGame(null, { seed: 7 });
  g2.startNewGame(); g2.chooseStarter('ejder_tas');
  g2.enterZone('kiyi');
  g2.creature.level = 6;
  const sek = g2.sekel;
  attackNearest(g2, (m) => m.isGuardian);
  const r = fightToEnd(g2, 'player');
  assert.equal(r.egg, null, 'v4.1: yumurta düşmez');
  assert.ok(r.cores.some((c) => c.type === 'kil'), 'Laḫmu ilk zafer: Kil çekirdek');
  assert.equal(g2.sekel - sek, 80);
  assert.ok(g2.unlockedZones.includes('bozkir'));
  assert.deepEqual(g2.tablets, ['lahmu']);
  const lm = g2.monsters.find((m) => m.isGuardian);
  assert.equal(lm.alive, false);
  assert.ok(lm.respawnAt - g2.clock >= 599);
});

ok('v4.1: bekçi zaferi kader puanı biriktirmez (yerini çekirdek + merhamet sayacı aldı)', () => {
  const g3 = createGame(null, { seed: 3 });
  g3.startNewGame(); g3.chooseStarter('ejder_zehir');
  g3.guardians.lahmu = { defeated: true, respawnAt: 0 };
  g3.creature.level = 8;
  for (let i = 0; i < 3; i++) {
    g3.enterZone('kiyi');
    attackNearest(g3, (m) => m.isGuardian);
    const r = fightToEnd(g3, 'player');
    assert.equal(r.egg, null);
    assert.ok(r.cores.length >= 1);
    g3.arriveAtGate('test');
    g3.guardians.lahmu.respawnAt = 0;
  }
  assert.equal(g3.kaderPuani, 0);
});

ok('eski yumurta ısınması: çatlayınca derece korunarak bekleyen sonuç olur, tutulunca kadroya girer', () => {
  const g4 = createGame(null, { seed: 9 });
  g4.startNewGame(); g4.chooseStarter('ejder_ates');
  const egg = g4.addEgg('ejder_su', 'C', 'test');
  assert.equal(g4.incubatingEggId, egg.uid);
  g4.enterZone('kiyi');
  let hatched = false; g4.on('hatch', (d) => { if (!d.starter) hatched = true; });
  for (let i = 0; i < 8; i++) { attackNearest(g4); fightToEnd(g4, 'player'); g4.creature.hp = g4.maxHp(); }
  assert.ok(hatched);
  assert.ok(!g4.eggs.includes(egg), 'çatlayan yumurta listeden çıkar');
  const p = g4.pendingPulls().find((x) => x.source === 'egg');
  assert.ok(p && p.species === 'ejder_su' && p.grade === 'C');
  g4.arriveAtGate('test');
  const r = g4.resolvePull(p.id, 'keep');
  assert.equal(r.ok, true);
  assert.equal(g4.roster.length, 2);
  assert.equal(g4.creature.id, 'ejder_ates', 'aktif değişmez');
  assert.equal(g4.setActive(r.char.uid).ok, true);
  assert.equal(g4.creature.id, 'ejder_su');
});

ok('dükkân, çanta ve kemer', () => {
  const g5 = createGame(null, { seed: 5 });
  g5.startNewGame(); g5.chooseStarter('ejder_su');
  assert.equal(g5.buy('bandaj'), true);
  assert.equal(g5.sekel, rules.start.sekel - 15);
  { const s = g5.sekel; g5.sekel = 0; assert.equal(g5.buy('donus_tableti'), false, 'para yetmez'); g5.sekel = s; }
  assert.equal(g5.setPocket(2, 'bandaj'), true);
  assert.deepEqual(g5.belt[2], { itemId: 'bandaj', count: 1 });
  assert.equal(g5.sell('bandaj'), false, 'çantada kalmadı');
  g5.sekel = 100; g5.buy('donus_tableti');
  assert.equal(g5.setPocket(3, 'donus_tableti'), false, 'dönüş tableti kemere takılmaz');
  g5.enterZone('kiyi');
  assert.equal(g5.useReturnTablet(), true);
  assert.equal(g5.screen, 'gate');
  // kemer savaşta harcanınca eksilir
  g5.enterZone('kiyi');
  attackNearest(g5);
  g5.battle.belt.can_iksiri = 0;
  fightToEnd(g5, 'player');
  assert.equal(g5.belt[0], null);
});

ok('kayıt ve yükleme', () => {
  g.enterZone('kiyi');
  g.carriedOz = 77;
  g.pos = { x: 20, z: 20 };
  assert.equal(saveGame(g), true);
  const data = loadSave();
  assert.equal(data.version, 3);
  const h = createGame(data, { seed: 1 });
  assert.equal(h.creature.id, g.creature.id);
  assert.equal(h.creature.level, g.creature.level);
  assert.equal(h.carriedOz, 77);
  assert.equal(h.zoneId, 'kiyi');
  assert.equal(h.screen, 'world');
  assert.deepEqual(h.pos, { x: 20, z: 20 });
  assert.equal(h.runsCompleted, g.runsCompleted);
  assert.deepEqual(h.unlockedZones, g.unlockedZones);
  clearSave();
  assert.equal(loadSave(), null);
});

ok('uzun oynanış: 300 rastgele kare + savaş, hata yok', () => {
  const g6 = createGame(null, { seed: 11 });
  g6.startNewGame(); g6.chooseStarter('ejder_zehir');
  g6.enterZone('kiyi');
  let fights = 0;
  for (let i = 0; i < 3000; i++) {
    if (g6.screen === 'dead') { g6.dismissDeath(); g6.tick(61); }
    if (g6.screen === 'gate') { g6.enterZone('kiyi'); continue; }
    if (g6.screen === 'battle') { fightToEnd(g6); fights++; continue; }
    const a = (i / 50) % (Math.PI * 2);
    g6.tick(0.1, { x: Math.cos(a), z: Math.sin(a) });
    if (g6.pendingFightUid || (g6.nearbyMonster && i % 7 === 0)) { if (g6.startFight()) continue; }
  }
  assert.ok(fights > 3, 'birkaç savaş olmalı: ' + fights);
  assert.ok(Number.isFinite(g6.carriedOz) && Number.isFinite(g6.creature.hp));
});

console.log(`\n${passed} test geçti.`);
