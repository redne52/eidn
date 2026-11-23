// v4 Tur 3: kaynak toplama, yeniden doğma, torba sınırı, pişirme, yeme, iptal, buff, kayıt
import assert from 'node:assert/strict';
import { createGame } from '../src/core/world.js';
import { makeCombatant, playTurn } from '../src/core/combat.js';
import { migrateSave } from '../src/core/migrate.js';
import rules from '../src/data/rules.json' with { type: 'json' };

let n = 0; const t = (name, fn) => { fn(); n++; };
const RS = rules.resources, RC = rules.recipes, INV = rules.inventory;

function fresh(seed = 3) {
  const g = createGame(null, { seed });
  g.startNewGame(); g.chooseStarter('ejder_ates');
  g.enterZone('kiyi');
  // canavarları uzaklaştır: testler saldırıdan etkilenmesin
  for (const m of g.monsters) { m.alive = false; m.respawnAt = 1e9; }
  return g;
}
const runFor = (g, sec, joy = { x: 0, z: 0 }) => { for (let s = 0; s < sec; s += 0.1) g.tick(0.1, joy); };
const goTo = (g, p) => { g.pos = { x: p.x, z: p.z }; g.tick(0.01); };

t('düğümler ve kamp her bölgede tanımlı, yasak yerlerde değil', () => {
  for (const z of rules.zones) {
    const lay = createGame(null, { seed: 1 }).zoneLayout(z.id);
    assert.ok(lay.camp, 'kamp ' + z.id);
    const want = Object.values(RS.perZone[z.id]).reduce((a, b) => a + b, 0);
    assert.equal(lay.nodes.length, want);
    for (const nd of lay.nodes) {
      assert.ok(nd.x > 8 && nd.x < lay.size.w - 6 && nd.z > 4 && nd.z < lay.size.h - 4, 'oyun alanında ' + nd.id);
      assert.ok(Math.hypot(nd.x - lay.camp.x, nd.z - lay.camp.z) > lay.camp.safeRadius, 'kamptan uzak ' + nd.id);
      assert.ok(Math.hypot(nd.x - lay.guardianPos.x, nd.z - lay.guardianPos.z) > 5, 'bekçiden uzak ' + nd.id);
      for (const ps of lay.passages) assert.ok(Math.hypot(nd.x - ps.x, nd.z - ps.z) > 5, 'geçitten uzak ' + nd.id);
    }
  }
});

t('bolluk: Kıyı bol, Bozkır seyrek, Derin Edin nadir ama mantar ağırlıklı', () => {
  const tot = (id) => Object.values(RS.perZone[id]).reduce((a, b) => a + b, 0);
  assert.ok(tot('kiyi') > tot('bozkir') && tot('bozkir') > tot('derin'));
  assert.ok(RS.perZone.derin.ruh_mantari >= Math.max(...Object.entries(RS.perZone.derin).filter(([k]) => k !== 'ruh_mantari').map(([, v]) => v)));
});

t('toplama: süre dolunca kaynak eklenir, düğüm kaybolur ve süre sonra geri gelir', () => {
  const g = fresh();
  const nd = g.layout().nodes.find((x) => x.type === 'cig_et');
  goTo(g, nd);
  assert.equal(g.nearbyNode && g.nearbyNode.id, nd.id);
  assert.equal(g.startGather(), true);
  runFor(g, RS.gatherSeconds * 0.5);
  assert.equal(g.resources.cig_et || 0, 0, 'süre dolmadan verilmez');
  runFor(g, RS.gatherSeconds * 0.6);
  assert.equal(g.resources.cig_et, 1);
  assert.equal(g.nodeReady(nd.id), false);
  assert.equal(g.startGather(nd.id), false, 'aynı düğüm tekrar toplanamaz');
  runFor(g, RS.types.cig_et.respawnSeconds - 2);
  assert.equal(g.nodeReady(nd.id), false);
  runFor(g, 3);
  assert.equal(g.nodeReady(nd.id), true, 'yeniden doğdu');
});

t('toplama hareketle ya da saldırıyla iptal olur, malzeme verilmez, düğüm kalır', () => {
  const g = fresh();
  const nd = g.layout().nodes.find((x) => x.type === 'sifali_ot');
  goTo(g, nd); g.startGather();
  runFor(g, 0.3, { x: 1, z: 0 });
  assert.equal(g.action, null); assert.equal(g.resources.sifali_ot || 0, 0); assert.equal(g.nodeReady(nd.id), true);
  goTo(g, nd); g.startGather();
  // saldırgan canavar temas etti
  const m = g.monsters.find((x) => !x.isGuardian); m.alive = true; m.pos = { x: g.pos.x + 0.5, z: g.pos.z }; g.pendingFightUid = m.uid;
  g.tick(0.1);
  assert.equal(g.action, null, 'iptal'); assert.equal(g.resources.sifali_ot || 0, 0); assert.equal(g.nodeReady(nd.id), true);
  const b = g.startFight(); assert.ok(b, 'savaş normal başlar');
});

t('kaynak torbası sınırı: yığın doluysa toplanmaz, uyarı', () => {
  const g = fresh();
  const nd = g.layout().nodes.find((x) => x.type === 'cig_et');
  g.resources.cig_et = INV.resourceStack;
  let full = 0; g.on('bagFull', () => full++);
  goTo(g, nd);
  assert.equal(g.startGather(), false); assert.equal(full, 1);
  assert.equal(g.resources.cig_et, INV.resourceStack);
});

t('pişirme: sadece kampta, malzeme düşer, yemek eklenir, seferlik hak sınırı', () => {
  const g = fresh();
  g.resources = { cig_et: 9, sifali_ot: 4, ruh_mantari: 1 };
  assert.equal(g.cook('pismis_et'), false, 'kamp dışında olmaz');
  goTo(g, g.layout().camp);
  assert.equal(g.atCamp(), true);
  assert.equal(g.cook('pismis_et'), true);
  assert.equal(g.resources.cig_et, 7); assert.equal(g.food.pismis_et, 1);
  assert.equal(g.cook('sifali_yahni'), true);
  assert.deepEqual([g.resources.cig_et, g.resources.sifali_ot, g.food.sifali_yahni], [6, 2, 1]);
  assert.equal(g.cook('ruhlu_et'), true);
  assert.equal(g.resources.ruh_mantari, 0);
  assert.equal(g.cook('ruhlu_et'), false, 'mantar yok');
  assert.equal(g.cook('pismis_et'), true);
  assert.equal(g.cooksLeft(), 0);
  assert.equal(g.cook('pismis_et'), false, 'bu seferde hak bitti');
  assert.equal(g.resources.cig_et, 2, 'başarısız pişirmede malzeme düşmez');
});

t('yeme: can max\'ı aşmaz, yemek düşer, buff gelir; savaşta yeme yok', () => {
  const g = fresh();
  const max = g.maxHp();
  g.food = { pismis_et: 1, ruhlu_et: 1 }; g.resources = { sifali_meyve: 1 };
  g.creature.hp = Math.round(max * 0.5);
  assert.equal(g.startEat('pismis_et'), true);
  runFor(g, RC.eatSeconds + 0.2);
  assert.equal(g.creature.hp, Math.round(max * 0.5 + max * RC.list.pismis_et.heal));
  assert.equal(g.food.pismis_et, 0);
  g.creature.hp = max - 2;
  g.startEat('sifali_meyve'); runFor(g, RC.eatSeconds + 0.2);
  assert.equal(g.creature.hp, max, 'max aşılmaz'); assert.equal(g.resources.sifali_meyve, 0);
  g.creature.hp = max;
  assert.equal(g.startEat('ruhlu_et'), true, 'buff\'lı yemek can doluyken de yenebilir');
  runFor(g, RC.eatSeconds + 0.2);
  assert.deepEqual(g.buffs, { atk: RC.list.ruhlu_et.buff.atk, fights: RC.list.ruhlu_et.buff.fights });
  // savaşta yeme yok
  g.food.pismis_et = 1;
  const m = g.monsters.find((x) => !x.isGuardian); m.alive = true; m.pos = { x: g.pos.x + 1, z: g.pos.z };
  g.startFight(m.uid);
  assert.equal(g.screen, 'battle');
  assert.equal(g.startEat('pismis_et'), false);
});

t('yeme saldırıyla iptal olursa yemek harcanmaz', () => {
  const g = fresh();
  g.food = { pismis_et: 1 }; g.creature.hp = 10;
  g.startEat('pismis_et'); runFor(g, 0.5);
  const m = g.monsters.find((x) => !x.isGuardian); m.alive = true; m.pos = { x: g.pos.x + 0.5, z: g.pos.z }; g.pendingFightUid = m.uid;
  g.tick(0.1);
  assert.equal(g.action, null); assert.equal(g.food.pismis_et, 1); assert.equal(g.creature.hp, 10);
});

t('Ruhlu et buff\'ı: sonraki 2 savaşta saldırı çarpanı, sonra biter', () => {
  const g = fresh();
  g.buffs = { atk: 0.1, fights: 2 };
  const base = makeCombatant({ kind: 'creature', id: 'ejder_ates', level: 1, grade: 'C' }).stats.atk;
  for (let i = 0; i < 2; i++) {
    const m = g.monsters.find((x) => !x.isGuardian); m.alive = true; m.pos = { x: g.pos.x + 1, z: g.pos.z };
    const b = g.startFight(m.uid);
    assert.ok(Math.abs(b.player.stats.atk - Math.round(base * 1.1 * 10) / 10) < 0.11, 'saldırı ×1,10');
    b.over = true; b.winner = 'fled'; g.finishFight(b);
  }
  assert.deepEqual(g.buffs, { atk: 0, fights: 0 });
  const m = g.monsters.find((x) => !x.isGuardian); m.alive = true; m.pos = { x: g.pos.x + 1, z: g.pos.z };
  const b = g.startFight(m.uid);
  assert.equal(b.player.stats.atk, base, 'buff bitti');
});

t('kamp halkası: canavar girmez, saldırmaz; kamp öz güvenceye almaz', () => {
  const g = fresh();
  const camp = g.layout().camp;
  goTo(g, camp);
  g.carriedOz = 50;
  const m = g.monsters.find((x) => !x.isGuardian);
  m.alive = true; m.behavior = 'saldirgan'; m.aggro = true; m.pos = { x: camp.x + camp.safeRadius + 1, z: camp.z };
  runFor(g, 6);
  assert.ok(Math.hypot(m.pos.x - camp.x, m.pos.z - camp.z) >= camp.safeRadius - 0.05, 'halkaya girmedi');
  assert.equal(g.pendingFightUid, null);
  assert.equal(g.carriedOz, 50); assert.equal(g.creature.oz, 0, 'kamp öz yatırmaz');
});

t('kayıt: kaynak, yemek, düğüm süresi, buff, kamp hakkı korunur; eski kayıt açılır', () => {
  const g = fresh();
  const nd = g.layout().nodes[0];
  goTo(g, nd); g.startGather(); runFor(g, RS.gatherSeconds + 0.1);
  g.food = { pismis_et: 2 }; g.buffs = { atk: 0.1, fights: 1 };
  goTo(g, g.layout().camp); g.resources.cig_et = (g.resources.cig_et || 0) + 2; g.cook('pismis_et');
  const s = JSON.parse(JSON.stringify(g.toSave()));
  const g2 = createGame(s, { seed: 9 });
  assert.deepEqual(g2.resources, g.resources);
  assert.deepEqual(g2.food, g.food);
  assert.deepEqual(g2.buffs, g.buffs);
  assert.equal(g2.nodeReady(nd.id), false);
  assert.ok(Math.abs(g2.nodes[nd.id] - (g.nodes[nd.id] - g.clock)) < 0.01, 'kalan süre korunur');
  assert.deepEqual(g2.camps, g.camps);
  // v1 (sürümsüz) ve v2 (Tur 3 alanları olmadan) kayıtlar
  const v1 = { creature: { id: 'ugallu', grade: 'B', level: 4, oz: 10, hp: 50 }, carriedOz: 0, location: 'gate', unlockedZones: ['kiyi'] };
  const m1 = migrateSave(v1); assert.deepEqual(m1.nodes, {}); assert.deepEqual(m1.buffs, { atk: 0, fights: 0 });
  const g3 = createGame(v1, { seed: 2 });
  assert.equal(g3.creature.id, 'ejder_ates'); assert.deepEqual(g3.food, {}); assert.deepEqual(g3.buffs, { atk: 0, fights: 0 });
  assert.equal(g3.enterZone('kiyi'), true); assert.ok(g3.zoneNodes().every((x) => x.ready));
  const v2 = { version: 2, creature: { id: 'ejder_su', grade: 'C', level: 2, oz: 0, hp: 40 }, location: 'gate', food: {}, resources: {}, camps: {}, collection: {} };
  const g4 = createGame(v2, { seed: 2 }); assert.equal(g4.creature.id, 'ejder_su'); assert.deepEqual(g4.nodes, {});
});

t('sefer başında kamp pişirme hakları yenilenir', () => {
  const g = fresh();
  g.camps = { kiyi: { cooks: 4 } };
  g.arriveAtGate('test');
  g.enterZone('kiyi');
  assert.deepEqual(g.camps, {});
});

console.log(`${n} kaynak/kamp testi geçti.`);
