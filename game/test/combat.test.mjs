// node test/combat.test.mjs — savaş motoru v2 (kombo) testleri + denge simülasyonu
import assert from 'node:assert/strict';
import R from '../src/data/rules.json' with { type: 'json' };
import { createRng } from '../src/core/rng.js';
import {
  makeCombatant, startBattle, playTurn, autoChoice, canUse, simulate, comboHints,
  critChance, blockChance, dodgeChance, baseDamage, smartPolicy, flatPolicy, unlockedChains, playableIds,
} from '../src/core/combat.js';
import { beltPolicy } from '../tools/policy.mjs';

const N = Number(process.env.SIM_N || 2000);
let fails = 0;
const check = (name, fn) => { try { fn(); console.log('  ok  ', name); } catch (e) { fails++; console.log('  FAIL', name, '-', e.message); } };
const K = R.combat2;
const dummy = (lv = 1, mods = {}) => makeCombatant({ kind: 'monster', id: 'test', level: lv, mods });

console.log('== Formül ve kural kontrolleri');
check('istatistik seviye 1 = base; 13. seviye S çarpanı', () => {
  const c = R.creatures.ugallu;
  assert.equal(makeCombatant({ kind: 'creature', id: 'ugallu', level: 1 }).maxHp, c.base.hp);
  const u = makeCombatant({ kind: 'creature', id: 'ugallu', level: 13, grade: 'S' });
  assert.equal(u.maxHp, Math.round((c.base.hp + 12 * c.growth.hp) * R.grades.S.statMult));
});
check('bölge sabitleri kaldırıldı', () => {
  assert.equal(R.constants.zones, undefined);
  assert.equal(R.constants.guardedMult, undefined);
  assert.equal(R.creatures.ugallu.favZone, undefined);
});
check('zincir açılışı: 1. zincir sv1, 2. zincir sv5, 3. zincir sv10 ve sadece A/S', () => {
  assert.equal(unlockedChains('ugallu', 1, 'C').length, 1);
  assert.equal(unlockedChains('ugallu', 5, 'C').length, 2);
  assert.equal(unlockedChains('ugallu', 13, 'B').length, 2);
  assert.equal(unlockedChains('ugallu', 9, 'S').length, 2);
  assert.equal(unlockedChains('ugallu', 10, 'A').length, 3);
});
check('her yaratıkta 3 zincir + bitirici; zincir adımları sadece quick/heavy', () => {
  for (const [id, c] of Object.entries(R.creatures)) {
    assert.equal(c.chains.length, 3, id);
    assert.ok(c.finisher?.name, id);
    for (const ch of c.chains) assert.ok(ch.seq.every((m) => m === 'quick' || m === 'heavy'), ch.id);
    const seqs = c.chains.map((ch) => ch.seq.join('-'));
    assert.equal(new Set(seqs).size, seqs.length, id + ' zincirleri farklı olmalı');
  }
});
check('şans tavanları ve savunma', () => {
  const f = { stats: { krit: 1000, blok: 1000, cev: 1000 }, statuses: [] };
  assert.equal(critChance(f), R.constants.chanceCap);
  assert.equal(blockChance(f), R.constants.chanceCap);
  assert.equal(dodgeChance(f, { stats: { cev: 0 }, statuses: [] }), R.constants.dodgeCap);
  assert.equal(baseDamage(50, 100), 25);
});
check('hamleler puan verir, tavan 5; bitirici puanları sıfırlar', () => {
  const b = startBattle(makeCombatant({ kind: 'creature', id: 'ugallu', level: 1 }), dummy(1, { hp: 50, atk: 0.01 }), { rng: createRng(1) });
  assert.equal(canUse(b, 'finisher'), false);
  playTurn(b, { action: 'quick' });
  assert.equal(b.player.points, 1);
  for (let i = 0; i < 6; i++) playTurn(b, { action: 'heavy' });
  assert.equal(b.player.points, K.maxPoints);
  const ev = playTurn(b, { action: 'finisher' });
  assert.ok(ev.some((x) => x.type === 'finisher' && x.by === 'player' && x.points === K.maxPoints));
  assert.equal(b.player.points, 0);
});
check('zincir: Ugallu 1. zinciri Ağır → Hızlı = Aslan Pençesi; ipucu sıradaki hamleyi gösterir', () => {
  const b = startBattle(makeCombatant({ kind: 'creature', id: 'ugallu', level: 1 }), dummy(1, { hp: 50, atk: 0.01 }), { rng: createRng(2) });
  assert.equal(R.creatures.ugallu.chains[0].seq.length, 2);
  assert.equal(comboHints(b)[0].next, 'heavy');
  playTurn(b, { action: 'heavy' });
  const h = comboHints(b)[0];
  assert.equal(h.step, 1); assert.equal(h.next, 'quick');
  const ev = playTurn(b, { action: 'quick' });
  assert.ok(ev.some((x) => x.type === 'combo' && x.chainId === 'aslan_pencesi'));
  assert.equal(b.player.points, 2 + K.chainExtraPoints);
  assert.equal(comboHints(b)[0].step, 0);
});
check('zincirler birbirini gölgelemez (her zincir tek başına tamamlanabilir)', () => {
  for (const id of Object.keys(R.creatures)) for (const ch of R.creatures[id].chains) {
    const b = startBattle(makeCombatant({ kind: 'creature', id, level: 13, grade: 'S' }), dummy(1, { hp: 500, atk: 0.01 }), { rng: createRng(4) });
    let ev = [];
    for (const m of ch.seq) ev = playTurn(b, { action: m });
    assert.ok(ev.some((x) => x.type === 'combo' && x.chainId === ch.id), `${id}/${ch.id}`);
  }
});
check('yanlış hamle zinciri bozar; savunma sürdürür', () => {
  const b = startBattle(makeCombatant({ kind: 'creature', id: 'ugallu', level: 1 }), dummy(1, { hp: 50, atk: 0.01 }), { rng: createRng(3) });
  playTurn(b, { action: 'heavy' }); playTurn(b, { action: 'guard' });
  assert.equal(comboHints(b)[0].step, 1);
  playTurn(b, { action: 'heavy' }); playTurn(b, { action: 'heavy' });
  assert.equal(comboHints(b)[0].step, 1); // son Ağır yeni zincirin ilk adımı
});
check('bitirici, kemer eşyası ve kaçış zinciri sıfırlar', () => {
  for (const act of [{ action: 'finisher' }, { action: 'item', itemId: 'bandaj' }, { action: 'flee' }]) {
    for (let seed = 1; seed < 40; seed++) {
      const b = startBattle(makeCombatant({ kind: 'creature', id: 'ugallu', level: 5 }), dummy(1, { hp: 500, atk: 0.01, cev: 1000 }), { rng: createRng(seed), belt: { bandaj: 3 } });
      playTurn(b, { action: 'quick' }); playTurn(b, { action: 'heavy' }); // F. Pençesi (H-H-A) ve Aslan P. ilerlemesi
      assert.ok(comboHints(b).some((h) => h.step > 0));
      playTurn(b, act);
      if (b.over) continue; // kaçış başarılı
      assert.ok(comboHints(b).every((h) => h.step === 0), act.action);
      break;
    }
  }
});
check('telgraf + savunma = karşı saldırı; savunmasız alınan hasardan az', () => {
  // düşman her tur telgraf eder
  const rs = { ...R, combat2: { ...K, telegraphChance: 1 } };
  let counter = 0, takenGuard = 0, takenOpen = 0;
  for (let s = 0; s < 200; s++) {
    for (const guard of [true, false]) {
      const b = startBattle(makeCombatant({ kind: 'creature', id: 'kusarikku', level: 5 }), dummy(5, { hp: 30 }), { rng: createRng(100 + s) });
      b.enemy.telegraph = 'heavy'; b.enemy.intent = 'heavy';
      const hp0 = b.player.hp;
      const ev = playTurn(b, { action: guard ? 'guard' : 'quick' });
      if (guard) { counter += ev.some((x) => x.type === 'counter') ? 1 : 0; takenGuard += hp0 - b.player.hp; }
      else takenOpen += hp0 - b.player.hp;
    }
  }
  void rs;
  assert.equal(counter, 200);
  assert.ok(takenGuard < takenOpen * 0.5, `${takenGuard} vs ${takenOpen}`);
});
check('düşman telgrafı tur başında belli (null | heavy)', () => {
  const b = startBattle(makeCombatant({ kind: 'creature', id: 'ugallu', level: 3 }), dummy(3), { rng: createRng(5) });
  let seen = 0;
  while (!b.over && b.turn < 40) { assert.ok(b.enemy.telegraph === null || b.enemy.telegraph === 'heavy'); if (b.enemy.telegraph) seen++; playTurn(b, autoChoice(b)); }
  assert.ok(b.over);
});
check('autoChoice: telgrafta savunma, 5 puanda bitirici', () => {
  const b = startBattle(makeCombatant({ kind: 'creature', id: 'ugallu', level: 1 }), dummy(1, { hp: 20 }), { rng: createRng(6) });
  b.enemy.telegraph = 'heavy'; assert.equal(autoChoice(b).action, 'guard');
  b.enemy.telegraph = null; b.player.points = 5; assert.equal(autoChoice(b).action, 'finisher');
});
check('olay tipleri ve savaş sonu', () => {
  const b = startBattle(makeCombatant({ kind: 'creature', id: 'girtablullu', level: 5 }), makeCombatant({ kind: 'monster', id: 'basmu', level: 4 }), { rng: createRng(7), belt: { can_iksiri: 1 } });
  let ev = [];
  while (!b.over && b.turn < 100) ev = ev.concat(playTurn(b, autoChoice(b)));
  assert.ok(b.over);
  assert.equal(ev.filter((x) => x.type === 'end').length, 1);
  assert.ok(ev.filter((x) => x.type === 'hit').every((x) => ['dodge', 'block', 'normal', 'crit'].includes(x.result) && ['quick', 'heavy', 'finisher', 'counter'].includes(x.move)));
  assert.ok(!ev.some((x) => 'zone' in x));
});
check('kemer eşyası; dönüş tableti savaşta kullanılamaz', () => {
  const p = makeCombatant({ kind: 'creature', id: 'kulullu', level: 3, hp: 20 });
  const b = startBattle(p, makeCombatant({ kind: 'monster', id: 'basmu', level: 1 }), { rng: createRng(8), belt: { can_iksiri: 1, donus_tableti: 1 } });
  assert.equal(canUse(b, 'item', 'donus_tableti'), false);
  const ev = playTurn(b, { action: 'item', itemId: 'can_iksiri' });
  assert.equal(b.belt.can_iksiri, 0);
  assert.ok(ev.some((x) => x.type === 'heal' && x.source === 'can_iksiri' && x.amount > 0));
});
check('durumlar üst üste binmez', () => {
  const b = startBattle(makeCombatant({ kind: 'creature', id: 'girtablullu', level: 5 }), dummy(1, { hp: 50, cev: 0, atk: 0.01 }), { rng: createRng(9) });
  for (let i = 0; i < 15 && !b.over; i++) playTurn(b, autoChoice(b));
  assert.ok(b.enemy.statuses.filter((s) => s.id === 'zehir').length <= 1);
});
check('öğretici savaşta canavar hasarı azalır', () => {
  const mk = () => makeCombatant({ kind: 'monster', id: 'basmu', level: 1 });
  const r1 = simulate(500, () => ({ player: makeCombatant({ kind: 'creature', id: 'ugallu', level: 1 }), enemy: mk(), tutorial: true }), { seed: 9 });
  const r2 = simulate(500, () => ({ player: makeCombatant({ kind: 'creature', id: 'ugallu', level: 1 }), enemy: mk() }), { seed: 9 });
  assert.ok(r1.avgHpLostOnWin < r2.avgHpLostOnWin);
});

// ------------------------------------------------------------------ simülasyon
const pct = (x) => ((x ?? 0) * 100).toFixed(0) + '%';
const IDS = playableIds(); // v4: ejderhalar
console.log(`\n== Simülasyon (${N} savaş/satır)`);
console.log('\n-- Sıradan canavar, aynı seviye: akıllı (A) vs düz (D) — hedef 4–9 tur; A belirgin iyi');
const mobRows = [];
for (const id of IDS) for (const lv of [1, 5, 9, 13]) {
  const setup = () => ({ player: makeCombatant({ kind: 'creature', id, level: lv }), enemy: dummy(lv) });
  const a = simulate(N, setup, { seed: lv * 7, policy: smartPolicy });
  const d = simulate(N, setup, { seed: lv * 7, policy: flatPolicy });
  mobRows.push({ id, lv, a, d });
  console.log(`${id.padEnd(12)} ${String(lv).padStart(2)}  A ${a.avgTurns.toFixed(1)} tur, -${pct(a.avgHpLostOnWin)} can, ${a.combosPerFight.toFixed(2)} kombo  |  D ${a && d.avgTurns.toFixed(1)} tur, -${pct(d.avgHpLostOnWin)} can, ${pct(d.winRate)}`);
}
check('sıradan canavar 4–9 tur (yuvarlanmış, iki politika)', () => {
  const bad = mobRows.filter((r) => [r.a, r.d].some((x) => Math.round(x.avgTurns) < 4 || Math.round(x.avgTurns) > 9));
  assert.equal(bad.length, 0, bad.map((r) => `${r.id}@${r.lv}`).join(', '));
});
check('akıllı politika sıradan savaşta ortalama ≥1,5 kombo', () => {
  const avg = mobRows.reduce((a, r) => a + r.a.combosPerFight, 0) / mobRows.length;
  console.log('    ortalama kombo', avg.toFixed(2));
  assert.ok(avg >= 1.5, avg.toFixed(2));
});
check('akıllı politika belirgin iyi (can kaybı ≥%20 az veya tur ≥%15 kısa)', () => {
  const bad = mobRows.filter((r) => !(r.a.avgHpLostOnWin <= r.d.avgHpLostOnWin * 0.8 || r.a.avgTurns <= r.d.avgTurns * 0.85));
  assert.equal(bad.length, 0, bad.map((r) => `${r.id}@${r.lv}`).join(', '));
});

console.log('\n-- Düz politika Kıyı canavarlarında');
const kiyi = [];
for (const id of IDS) for (const m of R.zones[0].monsters) for (const lv of m.levels) {
  const r = simulate(N, () => ({ player: makeCombatant({ kind: 'creature', id, level: lv }), enemy: makeCombatant({ kind: 'monster', id: m.id, level: lv }) }), { seed: 3, policy: flatPolicy });
  kiyi.push(r.winRate);
}
console.log('  en düşük kazanma', pct(Math.min(...kiyi)));
check('düz politika Kıyı\'da kazanır (≥%95)', () => assert.ok(Math.min(...kiyi) >= 0.95));

console.log('\n-- Derece: 13. seviye, aynı yaratık, S vs C (hedef %75–91)');
const sRows = IDS.map((id) => ({ id, ...simulate(N, () => ({ player: makeCombatant({ kind: 'creature', id, level: 13, grade: 'S' }), enemy: makeCombatant({ kind: 'creature', id, level: 13, grade: 'C' }) }), { seed: 11 }) }));
console.log('  ' + sRows.map((r) => `${r.id} ${pct(r.winRate)}`).join(' · '));
check('S vs C %75–91', () => {
  const bad = sRows.filter((r) => r.winRate < 0.75 || r.winRate > 0.91);
  assert.equal(bad.length, 0, bad.map((r) => `${r.id}=${pct(r.winRate)}`).join(', '));
});

console.log('\n-- Bekçiler (bölge üst seviyesi, C, kemer dolu, akıllı politika)');
const belt = { can_iksiri: 1, bandaj: 3, panzehir: 2 };
const target = { lahmu: [0.70, 0.85], anzu: [0.55, 0.70], usumgallu: [0.50, 0.65] };
const gRows = [];
for (const z of R.zones) {
  const g = z.guardian, lv = z.levels[1];
  const rs = IDS.map((id) => simulate(N, () => ({ player: makeCombatant({ kind: 'creature', id, level: lv }), enemy: makeCombatant({ kind: 'monster', id: g.id, level: g.level }), belt: { ...belt } }), { seed: 5, policy: beltPolicy }));
  const avg = rs.reduce((a, r) => a + r.winRate, 0) / rs.length;
  const combos = rs.reduce((a, r) => a + r.combosPerFight, 0) / rs.length;
  gRows.push({ id: g.id, avg, combos });
  console.log(`  ${g.id.padEnd(10)} ort ${pct(avg)} · ` + IDS.map((id, i) => `${id} ${pct(rs[i].winRate)}`).join(' · ') + ` · kombo ${combos.toFixed(1)}`);
}
check('bekçi ortalamaları hedefte', () => {
  const bad = gRows.filter((r) => r.avg < target[r.id][0] || r.avg > target[r.id][1]);
  assert.equal(bad.length, 0, bad.map((r) => `${r.id}=${pct(r.avg)}`).join(', '));
});
check('bekçide ortalama ≥3 kombo', () => {
  const bad = gRows.filter((r) => r.combos < 3);
  assert.equal(bad.length, 0, bad.map((r) => `${r.id}=${r.combos.toFixed(1)}`).join(', '));
});
check('zaman aşımı yok (100 tur)', () => assert.ok(sRows.every((r) => r.timeoutRate < 0.01)));


// ------------------------------------------------------------------ v4: ejderha = eski rol (denge korunur)
console.log('\n-- v4: ejderhalar eski rollerle aynı sayılarla dövüşür (aynı tohum)');
const LEG = R.legacyMap.creatures; // eski -> ejderha
check('ejderha istatistik/zincir/bitirici sayıları eski rolle birebir', () => {
  for (const [old, nid] of Object.entries(LEG)) {
    const a = R.creatures[old], b = R.creatures[nid];
    assert.deepEqual(b.base, a.base); assert.deepEqual(b.growth, a.growth);
    assert.deepEqual(b.passive.effect, a.passive.effect);
    assert.deepEqual(b.chains.map((c) => [c.seq, c.effect, c.minGrade]), a.chains.map((c) => [c.seq, c.effect, c.minGrade]));
    assert.deepEqual(b.finisher.effect, a.finisher.effect);
    assert.ok(!b.legacy && a.legacy, 'legacy işaretleri');
  }
});
const NS = Math.min(N, 600);
const sameRows = [];
for (const [old, nid] of Object.entries(LEG)) {
  const sv = (id) => simulate(NS, () => ({ player: makeCombatant({ kind: 'creature', id, level: 13, grade: 'S' }), enemy: makeCombatant({ kind: 'creature', id, level: 13, grade: 'C' }) }), { seed: 11 }).winRate;
  const gv = (id) => simulate(NS, () => ({ player: makeCombatant({ kind: 'creature', id, level: 9 }), enemy: makeCombatant({ kind: 'monster', id: 'anzu', level: R.zones[1].guardian.level }), belt: { ...belt } }), { seed: 5, policy: beltPolicy }).winRate;
  const row = { old, nid, sOld: sv(old), sNew: sv(nid), gOld: gv(old), gNew: gv(nid) };
  sameRows.push(row);
  console.log(`  ${nid.padEnd(12)} S vs C ${pct(row.sNew)} (eski ${old} ${pct(row.sOld)}) · Anzû ${pct(row.gNew)} (eski ${pct(row.gOld)})`);
}
check('aynı tohumla ejderha sonuçları eski rolle ±1 puan', () => {
  const bad = sameRows.filter((r) => Math.abs(r.sOld - r.sNew) > 0.01 || Math.abs(r.gOld - r.gNew) > 0.01);
  assert.equal(bad.length, 0, bad.map((r) => r.nid).join(', '));
});

// Eşya önceliği: düşman daha çevik olsa bile eşya etkisi düşman vuruşundan önce gelir
{
  const { startBattle: sb, makeCombatant: mc, playTurn: pt } = await import('../src/core/combat.js');
  const { createRng: cr } = await import('../src/core/rng.js');
  for (const itemId of ['can_iksiri', 'bandaj']) {
    for (let seed = 1; seed <= 30; seed++) {
      const p = mc({ kind: 'creature', id: 'ugallu', level: 3 });
      const e = mc({ kind: 'creature', id: 'ugallu', level: 3 }); e.stats.cev = 999; e.kind = 'monster';
      const b = sb(p, e, { rng: cr(seed), belt: { [itemId]: 1 } });
      p.hp = Math.round(p.maxHp * 0.3);
      const ev = pt(b, { action: 'item', itemId });
      const iHeal = ev.findIndex((x) => x.type === 'heal' && x.on === 'player');
      const iHit = ev.findIndex((x) => x.type === 'hit' && x.by === 'enemy');
      if (iHeal < 0 || (iHit >= 0 && iHit < iHeal)) { console.error('eşya önceliği hatası', itemId, seed, ev.map((x) => x.type)); process.exit(1); }
    }
  }
  console.log('eşya önceliği testi geçti');
}

console.log(fails ? `\n${fails} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fails ? 1 : 0);
