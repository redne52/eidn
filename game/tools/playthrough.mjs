// 1→13 yapay oyuncu: node tools/playthrough.mjs [creatureId] [seed]
import { createGame, ozToNext } from '../src/core/world.js';
import * as combat from '../src/core/combat.js';
import { beltPolicy } from './policy.mjs';
import rules from '../src/data/rules.json' with { type: 'json' };

export function playthrough(cid = 'ejder_ates', seed = 1, { log = false, maxHours = 12, useFood = true } = {}) {
  const g = createGame(null, { seed });
  g.startNewGame(); g.chooseStarter(cid);
  const C = rules.constants, FIGHT_SEC = 30, GATE_SEC = 20; const EAT_AT = +(process.env.EAT_AT || 0.75);
  let t = 0; // oyun süresi (sn)
  const lvTime = { 1: 0 }; const brokeLv = [], deathZ = {}; let deaths = 0, guardKills = 0, fights = 0, broke = 0, minSekel = Infinity, potionsUsed = 0, gathered = 0, cooked = 0, eaten = 0, healedByFood = 0;
  const adv = (sec) => { let s = sec; while (s > 0) { const d = Math.min(0.5, s); g.tick(d, { x: 0, z: 0 }); s -= d; } t += sec; };
  const prepBelt = () => {
    // 4 cep: iksir, bandaj, panzehir, bandaj
    const want = [['can_iksiri', 1], ['bandaj', 3], ['panzehir', 2], ['bandaj', 3]];
    want.forEach(([id], i) => { if (!g.belt[i] || g.belt[i].itemId !== id) g.setPocket(i, null); });
    for (const [id, n] of want) {
      const have = (g.bag[id] || 0) + g.belt.filter((p) => p && p.itemId === id).reduce((a, p) => a + p.count, 0);
      const need = want.filter(([x]) => x === id).reduce((a, [, k]) => a + k, 0) - have;
      for (let k = 0; k < need; k++) if (!g.buy(id)) break;
    }
    want.forEach(([id], i) => { if (!g.belt[i]) g.setPocket(i, id); });
    g.refillBelt();
    minSekel = Math.min(minSekel, g.sekel);
    const total = g.belt.filter(Boolean).reduce((a, p) => a + p.count, 0);
    if (total === 0) { broke++; brokeLv.push(g.creature.level); }
  };
  const zoneFor = () => {
    const lv = g.creature.level; let best = rules.zones[0].id;
    for (const z of rules.zones) if (g.unlockedZones.includes(z.id) && lv >= z.levels[0]) best = z.id;
    return best;
  };
  let guardTry = {}; let stuck = 0;
  while (g.creature.level < 13 && t < maxHours * 3600) {
    // kapıda
    if (g.screen === 'dead') g.dismissDeath();
    prepBelt(); adv(GATE_SEC);
    for (let w = 0; !g.canEnterZone(zoneFor()) && w < 100; w++) adv(5);
    g.enterZone(zoneFor());
    const zone = rules.zones.find((z) => z.id === g.zoneId);
    guardTry = {};
    // sefer
    for (let guardLoop = 0; ; guardLoop++) {
      if (t > maxHours * 3600 || guardLoop > 5000) { stuck = (stuck || 0) + 1; if (log) console.log('TAKILDI', g.screen, g.zoneId, g.creature, g.carriedOz, g.pendingFightUid, g.returnSpell, g.monsters.filter(m=>m.alive).map(m=>[m.name,m.level,g.monsterColor(m),m.aggro])); break; }
      const lv = g.creature.level, hpR = g.creature.hp / g.maxHp();
      const beltLeft = g.belt.filter(Boolean).reduce((a, p) => a + p.count, 0);
      const levelReady = g.creature.oz + g.carriedOz >= ozToNext(lv);
      if (levelReady || hpR < 0.35 || (hpR < 0.5 && beltLeft === 0)) {
        g.startReturn(); let s = 0;
        while (g.screen === 'world' && s < 30) { adv(0.5); s += 0.5; if (g.pendingFightUid) break; }
        if (g.screen === 'world' && g.pendingFightUid) { /* zorunlu savaş */ } else break;
      }
      // v4: yiyecek politikası — yakındaki kaynağı topla, can düşükse ye, malzeme varsa kampta pişir
      if (useFood && !g.pendingFightUid) {
        const walk = (p) => { const d = Math.hypot(p.x - g.pos.x, p.z - g.pos.z); g.pos = { x: p.x, z: p.z }; adv(d / C.moveSpeed); };
        const nd = g.zoneNodes().filter((n) => n.ready && g.resourceRoom(n.type) > 0).sort((a, b) => Math.hypot(a.x - g.pos.x, a.z - g.pos.z) - Math.hypot(b.x - g.pos.x, b.z - g.pos.z))[0];
        if (nd && Math.hypot(nd.x - g.pos.x, nd.z - g.pos.z) < 14) { walk(nd); g.tick(0.01); if (g.startGather(nd.id)) { adv(rules.resources.gatherSeconds + 0.2); if (!g.action) gathered++; } }
        const hp = g.creature.hp / g.maxHp();
        const cookable = Object.keys(rules.recipes.list).filter((id) => { const r = rules.recipes.list[id]; return Object.entries(r.needs).every(([k, n]) => (g.resources[k] || 0) >= n); });
        if (hp < EAT_AT && g.edibles().length === 0 && cookable.length && g.cooksLeft() > 0) {
          walk(g.layout().camp); g.tick(0.01);
          for (const id of ['ruhlu_et', 'sifali_yahni', 'pismis_et']) while (g.cook(id)) cooked++;
          adv(rules.recipes.cookSeconds * 2);
        }
        if (g.creature.hp / g.maxHp() < EAT_AT) {
          const e = g.edibles().sort((a, b) => b.heal - a.heal)[0];
          if (e) { const before = g.creature.hp; if (g.startEat(e.id)) { adv(rules.recipes.eatSeconds + 0.2); if (!g.action) { eaten++; healedByFood += g.creature.hp - before; } } }
        }
      }
      // hedef: bekçi (hazırsa) ya da en yakın uygun canavar
      const guard = g.monsters.find((m) => m.isGuardian && m.alive);
      let target = null;
      if (g.pendingFightUid) target = g.monsters.find((m) => m.uid === g.pendingFightUid);
      else if (guard && lv >= zone.levels[1] && hpR > 0.9 && beltLeft >= 5 && (guardTry[zone.id] || 0) < 1) { target = guard; guardTry[zone.id] = (guardTry[zone.id] || 0) + 1; }
      else {
        const ok = g.monsters.filter((m) => m.alive && !m.isGuardian && g.monsterColor(m) !== 'gri');
        ok.sort((a, b) => Math.hypot(a.pos.x - g.pos.x, a.pos.z - g.pos.z) - Math.hypot(b.pos.x - g.pos.x, b.pos.z - g.pos.z));
        target = ok[0];
      }
      if (!target) { adv(5); continue; }
      const d = Math.hypot(target.pos.x - g.pos.x, target.pos.z - g.pos.z);
      g.pos = { x: target.pos.x + 1, z: target.pos.z }; adv(d / C.moveSpeed);
      if (!target.alive) continue;
      const b = g.startFight(target.uid); if (!b) { adv(1); continue; }
      const startBelt = Object.values(b.belt).reduce((a, x) => a + x, 0);
      while (!b.over && b.turn < 200) combat.playTurn(b, beltPolicy(b));
      potionsUsed += startBelt - Object.values(b.belt).reduce((a, x) => a + x, 0);
      fights++; t += FIGHT_SEC;
      const res = g.finishFight(b);
      if (target.isGuardian && res.winner === 'player') guardKills++;
      if (g.screen === 'dead' || res.winner !== 'player') { deaths++; deathZ[zone.id] = (deathZ[zone.id] || 0) + 1; break; }
    }
    if (g.screen === 'dead') g.dismissDeath();
    if (g.screen === 'world') g.arriveAtGate('sim');
    for (let L = 2; L <= g.creature.level; L++) if (lvTime[L] == null) lvTime[L] = t;
  }
  return { cid, seed, hours: t / 3600, lvTime, deaths, gathered, cooked, eaten, healedByFood, guardKills, fights, broke, minSekel, potionsUsed, sekel: g.sekel, level: g.creature.level, unlocked: g.unlockedZones, stuck, brokeLv, deathZ };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ids = process.argv[2] ? [process.argv[2]] : Object.keys(rules.creatures).filter((k) => !rules.creatures[k].legacy);
  const useFood = process.env.NOFOOD ? false : true;
  for (const id of ids) for (const seed of [1, 2, 3]) {
    const r = playthrough(id, seed, { log: !!process.env.LOG, useFood });
    const mins = Object.entries(r.lvTime).map(([L, s]) => `${L}:${(s / 60).toFixed(0)}`).join(' ');
    console.log(`${id} s${seed}: ${r.hours.toFixed(2)} sa, sv${r.level}, ölüm ${r.deaths}, topla ${r.gathered} pişir ${r.cooked} ye ${r.eaten} (+${r.healedByFood} can), bekçi ${r.guardKills}, savaş ${r.fights}, eşya ${r.potionsUsed}, kemersiz ${r.broke}, minŞekel ${r.minSekel}, şekel ${r.sekel} takılma ${r.stuck} kemersizSv ${r.brokeLv.join(',')} ölümBölge ${JSON.stringify(r.deathZ)} | dk: ${mins}`);
  }
}
