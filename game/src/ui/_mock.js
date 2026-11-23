// GEÇİCİ SAHTE ÇEKİRDEK — sözleşmedeki imzalarla çalışır, gerçek combat/world/save gelince
// src/ui/core.js içindeki tek satır değiştirilir. Sayılar rules.json'dan, mantık basitleştirilmiş.
import R from '../data/rules.json';

const C = R.constants;
export function createRng(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return { next, int: (a, b) => a + Math.floor(next() * (b - a + 1)), pick: (a) => a[Math.floor(next() * a.length)], chance: (p) => next() < p };
}

const ZONES = C.zones;
function statBlock(base, growth, level, mult = {}, gm = 1) {
  const o = {};
  for (const k of Object.keys(base)) o[k] = Math.round((base[k] + (growth[k] || 0) * (level - 1)) * (mult[k] || 1) * (k === 'hp' || k === 'atk' ? gm : 1));
  return o;
}
function monsterDef(id) {
  for (const z of R.zones) {
    const m = z.monsters.find((x) => x.id === id); if (m) return m;
    if (z.guardian.id === id) return z.guardian;
  }
  return null;
}
export function makeCombatant({ kind, id, level, grade = 'C', mods, hp }) {
  let stats, name, role = null, skills = {}, favZone = 'govde';
  if (kind === 'creature') {
    const d = R.creatures[id]; const gm = R.grades[grade].statMult;
    stats = statBlock(d.base, d.growth, level, {}, gm); name = d.name; role = d.role; favZone = d.favZone;
    skills = { active: level >= C.skillUnlockLevel ? d.active : null, active2: R.grades[grade].secondSkill && level >= C.secondSkillLevel ? d.second : null, passive: d.passive };
  } else {
    const d = monsterDef(id) || {}; const t = R.monsterTemplate;
    stats = statBlock(t.base, t.growth, level, { ...(d.mods || {}), ...(mods || {}) }); name = d.name || id; favZone = d.favZone || 'govde';
  }
  return { id, name, kind, level, grade, role, favZone, stats, maxHp: stats.hp, hp: hp ?? stats.hp, statuses: [], cooldowns: {}, skills };
}
export function startBattle(player, enemy, { rng = createRng(), tutorial = false, belt = {} } = {}) {
  return { turn: 0, player, enemy, belt: { ...belt }, over: false, winner: null, log: [], rng, tutorial, lastChoice: null, fled: false };
}
export function canUse(b, action, itemId) {
  const p = b.player;
  if (action === 'skill') return !!p.skills.active && !(p.cooldowns.skill > 0);
  if (action === 'skill2') return !!p.skills.active2 && !(p.cooldowns.skill2 > 0);
  if (action === 'item') return (b.belt[itemId] || 0) > 0;
  if (action === 'flee') return b.enemy.kind !== 'guardian';
  return true;
}
export function autoChoice(b) {
  const r = b.rng;
  return { attackZone: r.pick(ZONES), guardZone: b.lastChoice?.guardZone || r.pick(ZONES), action: 'attack' };
}
const chance = (a, d, cap) => Math.min(cap, a / (a + d + 100));
function strike(b, who, choice, guardOf, skill) {
  const A = who === 'player' ? b.player : b.enemy, D = who === 'player' ? b.enemy : b.player, r = b.rng, ev = [];
  const zone = choice.attackZone; let mult = skill?.effect?.damageMult ?? 1;
  if (skill && mult === 0) return ev;
  if (!(skill?.effect?.undodgeable) && r.chance(Math.min(C.dodgeCap, D.stats.cev / (D.stats.cev + A.stats.cev + 100)))) { ev.push({ type: 'hit', by: who, zone, result: 'dodge', dmg: 0, skill: skill?.id }); return ev; }
  let res = 'normal';
  let dmg = A.stats.atk * 100 / (100 + D.stats.def) * (C.randMin + r.next() * (C.randMax - C.randMin)) * mult;
  if (A.weak) dmg *= 0.8;
  if (guardOf === zone) { res = 'guarded'; dmg *= C.guardedMult; }
  else if (r.chance(chance(D.stats.blok, 0, C.chanceCap))) { res = 'block'; dmg *= C.blockMult; }
  else if (r.chance(chance(A.stats.krit, 0, C.chanceCap))) { res = 'crit'; dmg *= (A.skills?.passive?.effect?.critMult) || C.critMult; }
  if (D.defending) dmg *= C.defStanceTakenMult;
  if (A.defending) dmg *= C.defStanceDealtMult;
  if (b.tutorial && who === 'enemy') dmg *= 0.5;
  dmg = Math.max(C.minDamage, Math.round(dmg));
  D.hp = Math.max(0, D.hp - dmg);
  ev.push({ type: 'hit', by: who, zone, result: res, dmg, skill: skill?.id });
  if (res === 'crit' && zone === 'bas' && r.chance(C.headCritStunChance)) { D.stunned = true; ev.push({ type: 'stun', on: who === 'player' ? 'enemy' : 'player' }); }
  const pois = skill?.effect?.poison;
  if (pois) { D.statuses = D.statuses.filter((s) => s.id !== 'zehir'); D.statuses.push({ id: 'zehir', turns: pois.turns, dmg: Math.round(A.stats.atk * pois.perTurnAtkMult) }); ev.push({ type: 'status', on: who === 'player' ? 'enemy' : 'player', status: 'zehir', turns: pois.turns }); }
  if (who === 'enemy' && !skill && r.chance(0.25)) {
    const st = monsterDef(A.id)?.status;
    if (st) { D.statuses = D.statuses.filter((s) => s.id !== st); D.statuses.push({ id: st, turns: 2, dmg: Math.max(1, Math.round(A.stats.atk * 0.3)) }); ev.push({ type: 'status', on: 'player', status: st, turns: 2 }); }
  }
  return ev;
}
export function playTurn(b, choice) {
  if (b.over) return [];
  b.turn++; b.lastChoice = choice;
  const ev = [], r = b.rng, P = b.player, E = b.enemy;
  P.defending = choice.action === 'defend'; E.defending = false;
  const eChoice = { attackZone: r.chance(0.4) ? E.favZone : r.pick(ZONES), guardZone: r.pick(ZONES) };
  if (choice.action === 'flee') {
    const ok = canUse(b, 'flee') && r.chance(0.5);
    ev.push({ type: 'flee', ok });
    if (ok) { b.over = true; b.winner = 'fled'; ev.push({ type: 'end', winner: 'fled' }); return ev; }
  }
  if (choice.action === 'item') {
    b.belt[choice.itemId]--; ev.push({ type: 'item', itemId: choice.itemId });
    const heal = choice.itemId === 'can_iksiri' ? 0.35 : 0.1;
    const amt = Math.round(P.maxHp * heal); P.hp = Math.min(P.maxHp, P.hp + amt); ev.push({ type: 'heal', on: 'player', amount: amt, source: choice.itemId });
    if (choice.itemId === 'bandaj') P.statuses = P.statuses.filter((s) => s.id !== 'kanama');
    if (choice.itemId === 'panzehir') P.statuses = P.statuses.filter((s) => s.id !== 'zehir' && s.id !== 'yanik');
  }
  if (choice.action === 'defend') ev.push({ type: 'defend', by: 'player' });
  let pSkill = null;
  if (choice.action === 'skill') { pSkill = P.skills.active; P.cooldowns.skill = pSkill.cooldown + 1; }
  if (choice.action === 'skill2') { pSkill = P.skills.active2; P.cooldowns.skill2 = pSkill.cooldown + 1; }
  if (pSkill?.effect?.healMaxHp) { const amt = Math.round(P.maxHp * pSkill.effect.healMaxHp); P.hp = Math.min(P.maxHp, P.hp + amt); ev.push({ type: 'heal', on: 'player', amount: amt, source: pSkill.id }); }
  const first = P.stats.cev === E.stats.cev ? (r.chance(0.5) ? 'player' : 'enemy') : P.stats.cev > E.stats.cev ? 'player' : 'enemy';
  ev.push({ type: 'order', first });
  const pAttacks = ['attack', 'skill', 'skill2', 'defend'].includes(choice.action) || (choice.action === 'flee');
  const seq = first === 'player' ? ['player', 'enemy'] : ['enemy', 'player'];
  for (const who of seq) {
    if (P.hp <= 0 || E.hp <= 0) break;
    const actor = who === 'player' ? P : E;
    if (actor.stunned) { actor.stunned = false; continue; }
    if (who === 'player') { if (pAttacks && choice.action !== 'flee') ev.push(...strike(b, 'player', choice, eChoice.guardZone, pSkill)); }
    else ev.push(...strike(b, 'enemy', eChoice, choice.guardZone, null));
  }
  for (const [who, U] of [['player', P], ['enemy', E]]) {
    if (U.hp <= 0) continue;
    for (const s of U.statuses) { if (s.dmg) { U.hp = Math.max(0, U.hp - s.dmg); ev.push({ type: 'dot', on: who, status: s.id, dmg: s.dmg }); } s.turns--; }
    U.statuses = U.statuses.filter((s) => s.turns > 0);
  }
  for (const k in P.cooldowns) if (P.cooldowns[k] > 0) P.cooldowns[k]--;
  if (b.turn >= C.fatigueTurn) ev.push({ type: 'fatigue' });
  if (P.hp <= 0 || E.hp <= 0) { b.over = true; b.winner = P.hp <= 0 ? 'enemy' : 'player'; ev.push({ type: 'end', winner: b.winner }); }
  return ev;
}

// ---------------- DÜNYA ----------------
const ozToNext = (l) => Math.round(100 * Math.pow(l, 1.6) / 10) * 10;
function diffColor(ml, pl) { const d = ml - pl; return R.levelDiff.find((x) => d >= x.minDiff); }
export function createGame(save) {
  const handlers = {};
  const g = {
    screen: 'title', keeper: { level: 1 }, creature: null, carriedOz: 0, bankedOz: 0, sekel: R.start.sekel,
    belt: { ...R.start.belt }, inventory: {}, runs: 0, kaderPuani: 0, zoneId: null, pos: { x: 0, z: 0 },
    monsters: [], flags: { unlocked: { kiyi: true }, tutorialDone: false }, nearbyMonster: null, wounded: 0,
    returning: 0, eggs: [], testMult: 1,
    ...(save || {}),
  };
  g.on = (e, fn) => ((handlers[e] ||= []).push(fn), g);
  const emit = (e, d) => (handlers[e] || []).forEach((f) => f(d));
  g.ozToNext = () => ozToNext(g.creature?.level || 1);
  g.zone = () => R.zones.find((z) => z.id === g.zoneId);
  g.chooseStarter = (id) => { g.creature = { id, grade: 'C', level: 1, oz: 0 }; g.eggs = []; emit('hatch', g.creature); };
  g.levelColor = (ml) => diffColor(ml, g.creature.level);
  g.enterZone = (id) => {
    const z = R.zones.find((x) => x.id === id); g.zoneId = id; g.pos = { x: 0, z: z.size[1] / 2 - 6 };
    const rng = createRng(); g.monsters = [];
    for (let i = 0; i < z.monsterCount; i++) {
      const m = rng.pick(z.monsters); const lv = rng.int(m.levels[0], m.levels[1]);
      const x = rng.int(-z.size[0] / 2 + 6, z.size[0] / 2 - 6), zz = rng.int(-z.size[1] / 2 + 4, z.size[1] / 2 - 14);
      g.monsters.push({ uid: 'm' + i, id: m.id, name: m.name, level: lv, x, z: zz, hx: x, hz: zz, behavior: m.behavior, alive: true, t: rng.next() * 6 });
    }
    if (!g.flags.tutorialDone && id === 'kiyi') { const m = g.monsters[0]; Object.assign(m, { id: 'basmu', name: 'Basmu', level: 1, x: 0, z: g.pos.z - 7, hx: 0, hz: g.pos.z - 7, behavior: 'sakin', tutorial: true }); }
    const gd = z.guardian; g.monsters.push({ uid: 'g', id: gd.id, name: gd.name, level: gd.level, x: 0, z: -z.size[1] / 2 + 8, hx: 0, hz: -z.size[1] / 2 + 8, behavior: 'sakin', guardian: true, alive: true, t: 0 });
    g.runs++; g.screen = 'world'; emit('zoneChanged', id);
  };
  g.tick = (dt, joy = { x: 0, z: 0 }) => {
    const z = g.zone(); if (!z) return;
    const sp = C.moveSpeed * (g.wounded > 0 ? 0.6 : 1);
    g.pos.x = Math.max(-z.size[0] / 2 + 1, Math.min(z.size[0] / 2 - 1, g.pos.x + joy.x * sp * dt));
    g.pos.z = Math.max(-z.size[1] / 2 + 1, Math.min(z.size[1] / 2 - 1, g.pos.z + joy.z * sp * dt));
    if (Math.hypot(joy.x, joy.z) > 0.1 && g.returning > 0) { g.returning = 0; emit('returnCancelled'); }
    if (g.wounded > 0) g.wounded = Math.max(0, g.wounded - dt);
    let near = null, nd = C.attackButtonRadius;
    for (const m of g.monsters) {
      if (!m.alive) { m.respawn -= dt; if (m.respawn <= 0 && !m.guardian) m.alive = true; continue; }
      m.t += dt;
      if (!m.guardian) { const a = m.t * 0.3 + m.hx; m.x = m.hx + Math.sin(a) * 2.5; m.z = m.hz + Math.cos(a * 0.7) * 2.5; }
      const d = Math.hypot(m.x - g.pos.x, m.z - g.pos.z); if (d < nd) { nd = d; near = m; }
    }
    g.nearbyMonster = near;
    if (g.returning > 0) { g.returning -= dt; if (g.returning <= 0) { g.returning = 0; g.arriveGate(); } }
  };
  g.startFight = (uid, rng = createRng()) => {
    const m = g.monsters.find((x) => x.uid === uid); if (!m) return null;
    const p = makeCombatant({ kind: 'creature', id: g.creature.id, level: g.creature.level, grade: g.creature.grade, hp: g.creature.hp });
    const e = makeCombatant({ kind: m.guardian ? 'guardian' : 'monster', id: m.id, level: m.level });
    g.fightMonster = m; g.returning = 0;
    return startBattle(p, e, { rng, tutorial: !!m.tutorial, belt: g.belt });
  };
  g.finishFight = (b) => {
    const m = g.fightMonster, z = g.zone(), res = { winner: b.winner, oz: 0, sekel: 0, drops: [], ozLost: 0, protectedRun: g.runs <= C.freeRunsWithoutLoss, eggHeat: null };
    g.belt = { ...b.belt }; g.creature.hp = b.player.hp;
    if (b.winner === 'player') {
      const col = g.levelColor(m.level);
      res.oz = Math.round((10 + 5 * m.level) * col.mult * z.ozMult * (m.guardian ? C.guardianOzMult : 1) * g.testMult);
      res.sekel = Math.round((2 + m.level) * z.ozMult) + (m.guardian ? C.guardianSekel[m.id] || 0 : 0);
      g.carriedOz += res.oz; g.sekel += res.sekel; m.alive = false; m.respawn = C.monsterRespawnSeconds;
      if (Math.random() < 0.12) { res.drops.push('bandaj'); g.inventory.bandaj = (g.inventory.bandaj || 0) + 1; }
      if (m.guardian) { g.flags.unlocked[{ lahmu: 'bozkir', anzu: 'derin' }[m.id] || 'x'] = true; if (Math.random() < 0.35) { res.egg = true; g.eggs.push({ id: 'ugallu', grade: 'B', wins: 0, need: R.eggHatchWins.B }); } else g.kaderPuani++; }
      if (m.tutorial) g.flags.tutorialDone = true;
      g.eggs.forEach((e) => (e.wins = Math.min(e.need, e.wins + 1)));
      if (g.eggs[0]) res.eggHeat = g.eggs[0].wins / g.eggs[0].need;
      emit('ozGained', res.oz);
    } else if (b.winner === 'enemy') {
      const loss = res.protectedRun ? 0 : z.lossOnDeath; res.ozLost = Math.round(g.carriedOz * loss);
      g.carriedOz -= res.ozLost; g.wounded = C.woundedSeconds; g.creature.hp = 1; emit('death', res); g.arriveGate(true);
    }
    return res;
  };
  g.returnToGate = () => { g.returning = C.returnSpellSeconds; };
  g.arriveGate = (dead) => {
    const before = g.creature.level; g.bankedOz += g.carriedOz; const dep = g.carriedOz; g.carriedOz = 0;
    let ups = 0;
    while (g.creature.level < R.meta.maxLevel && g.bankedOz >= ozToNext(g.creature.level)) { g.bankedOz -= ozToNext(g.creature.level); g.creature.level++; ups++; }
    g.creature.hp = undefined; g.zoneId = null; g.screen = 'gate'; g.monsters = [];
    g.lastArrival = { deposited: dep, from: before, to: g.creature.level, dead: !!dead };
    emit('deposit', g.lastArrival); if (ups) emit('levelUp', g.creature.level);
  };
  g.buy = (id, n = 1) => { const it = R.items[id]; if (g.sekel < it.price * n) return false; g.sekel -= it.price * n; g.inventory[id] = (g.inventory[id] || 0) + n; return true; };
  g.setBelt = (id, delta) => {
    const have = g.inventory[id] || 0, cur = g.belt[id] || 0;
    if (delta > 0 && have > 0 && (cur < (R.items[id].pocketStack || 1) * 2)) { g.inventory[id]--; g.belt[id] = cur + 1; }
    if (delta < 0 && cur > 0) { g.belt[id]--; g.inventory[id] = have + 1; }
  };
  g.toSave = () => { const { on, ...rest } = g; return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function')))); };
  return g;
}
export const loadSave = () => { try { return JSON.parse(localStorage.getItem('edin.save.v1')); } catch { return null; } };
export const writeSave = (g) => { try { localStorage.setItem('edin.save.v1', JSON.stringify(g.toSave())); } catch {} };
export const clearSave = () => { try { localStorage.removeItem('edin.save.v1'); } catch {} };
