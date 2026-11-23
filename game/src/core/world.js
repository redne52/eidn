// Edin v1 — Dünya mantığı (DÜNYA PROGRAMCISI). DOM yok, saf JS.
// Sayılar src/data/rules.json'dan okunur. Savaş mantığı combat.js'te.
import rules from '../data/rules.json' with { type: 'json' };
import * as realCombat from './combat.js';
import { createRng } from './rng.js';
import { migrateSave, mapCreatureId, SAVE_VERSION as MIG_VERSION } from './migrate.js';
import { installCores } from './cores.js';

const C = rules.constants;
const ZONES = rules.zones;
const SAVE_VERSION = MIG_VERSION; // v3: kadro + ruh çekirdekleri (bkz. migrate.js, NOTES-gecis.md)
const PROTECTED_RUNS = C.freeRunsWithoutLoss ?? 3;
const GATE_RADIUS = 3;          // Kıyı'daki kapı halkası (m)
const SAFE_RING_RADIUS = 3;     // geçit yanındaki güvenli taş halka (m)
const PASSAGE_RADIUS = 2;       // geçide bu kadar yaklaşınca bölge değişir
const CONTACT_RADIUS = 1.2;     // saldırgan canavar bu mesafede savaşı başlatır
const DEFAULT_KADER_LIMIT = 10;

// ---------- küçük yardımcılar ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function ozToNext(level) {
  return Math.round((100 * Math.pow(level, 1.6)) / 10) * 10;
}

export function levelDiffInfo(playerLevel, monsterLevel) {
  const diff = monsterLevel - playerLevel;
  for (const row of rules.levelDiff) if (diff >= row.minDiff) return { mult: row.mult, color: row.color, diff };
  const last = rules.levelDiff[rules.levelDiff.length - 1];
  return { mult: last.mult, color: last.color, diff };
}

export function growthStage(level) {
  const st = C.growthStages || [1, 5, 10];
  let idx = 0;
  st.forEach((lv, i) => { if (level >= lv) idx = i; });
  return idx; // 0 yavru, 1 genç, 2 yetişkin (sadece görünüş)
}

function rollGrade(rng, table) {
  const r = rng.next();
  let acc = 0;
  for (const g of ['C', 'B', 'A', 'S']) { acc += table[g] || 0; if (r < acc) return g; }
  return 'C';
}

// Bölge yerleşimi: kapı Kıyı'nın batı kenarında; geçitler doğu kenarında.
function zoneLayout(zone) {
  const [w, h] = zone.size;
  const idx = ZONES.findIndex((z) => z.id === zone.id);
  const prev = ZONES[idx - 1];
  const next = ZONES[idx + 1];
  const entry = { x: 4, z: h / 2 };
  const layout = {
    size: { w, h },
    entry,
    gate: zone.id === ZONES[0].id ? { x: 2, z: h / 2 } : null,
    passages: [],
    safeRings: [],
    guardianPos: { x: w - 10, z: h / 2 },
  };
  if (prev) { layout.passages.push({ to: prev.id, x: 1, z: h / 2 }); layout.safeRings.push({ x: 3, z: h / 2 }); }
  if (next) { layout.passages.push({ to: next.id, x: w - 1, z: h - 6 }); layout.safeRings.push({ x: w - 3, z: h - 6 }); }
  if (layout.gate) layout.safeRings.push({ x: layout.gate.x, z: layout.gate.z });
  // v4: kamp ateşi ve kaynak düğümleri (sabit noktalar, rules.json)
  const cp = rules.camps && rules.camps.byZone && rules.camps.byZone[zone.id];
  layout.camp = cp ? { x: cp.x, z: cp.z, safeRadius: rules.camps.safeRadius || 5, useRadius: rules.camps.useRadius || 3 } : null;
  layout.nodes = ((rules.resources && rules.resources.nodes && rules.resources.nodes[zone.id]) || []).map((n, i) => ({ id: zone.id + ':' + i, type: n.type, x: n.x, z: n.z }));
  return layout;
}

export const ITEM_IDS = Object.keys(rules.items);

// ---------- Oyun ----------
export function createGame(saveData = null, opts = {}) {
  const combat = opts.combat || realCombat;
  const rng = opts.rng || createRng(opts.seed ?? Date.now());
  const listeners = {};

  const g = {
    rules,
    rng,
    screen: 'intro',              // intro | choose | gate | world | battle | dead
    clock: 0,                     // oyun içi saniye (tick ile ilerler)
    keeper: { level: 1 },         // kapı bekçisi seviyesi: ilk sürümde sabit
    creature: null,               // { id, grade, level, oz, hp, woundedUntil }
    carriedOz: 0,
    sekel: rules.start.sekel,
    bag: {},                      // itemId -> adet
    food: {},                     // v4: yemek id -> adet (Tur 3)
    resources: {},                // v4: kaynak id -> adet (Tur 3)
    camps: {},                    // v4: kamp durumu: zoneId -> { cooks } (bu seferde pişirme sayısı)
    nodes: {},                    // v4: kaynak düğümü id -> respawnAt (oyun saati); yoksa düğüm hazır
    buffs: { atk: 0, fights: 0 }, // v4: Ruhlu et vb. (sonraki N savaşta saldırı çarpanı)
    action: null,                 // v4: { type:'gather'|'eat', id, remaining, total }
    nearbyNode: null,             // v4: yakındaki toplanabilir düğüm
    collection: {},               // v4: mitolojik koleksiyon (gelecek sürüm)
    eggs: [],                     // { uid, species, grade, heat, hatched }
    incubatingEggId: null,
    belt: [null, null, null, null],
    kaderPuani: 0,
    runsCompleted: 0,
    inRun: false,
    runLossApplied: 0,
    zoneId: null,
    pos: { x: 0, z: 0 },
    facing: 0,
    monsters: [],
    unlockedZones: [ZONES[0].id],
    guardians: {},                // id -> { defeated:bool, respawnAt:clock }
    tablets: [],
    stats: { fights: 0, wins: 0, losses: 0, flees: 0, ozLost: 0, ozGained: 0, deaths: 0 },
    settings: { sound: true, vibration: true, quality: 'auto', testOz: false },
    flags: { tutorialDone: false, firstFightDone: false, lastHint: null },
    battle: null,
    battleMonsterUid: null,
    nearbyMonster: null,
    returnSpell: null,            // { remaining }
    pendingFightUid: null,
    lastFightResult: null,
    eggSeq: 1,
  };

  // ----- olaylar -----
  g.on = (evt, fn) => { (listeners[evt] ||= []).push(fn); return () => g.off(evt, fn); };
  g.off = (evt, fn) => { listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn); };
  const emit = (evt, data) => { (listeners[evt] || []).forEach((f) => f(data)); (listeners['*'] || []).forEach((f) => f(evt, data)); };
  g.emit = emit;

  // ----- v4.1: ruh çekirdekleri + kadro (cores.js) -----
  installCores(g, {
    rules, emit, gateFullHeal: !!C.gateFullHeal,
    maxHpOf: (ch) => combat.makeCombatant({ kind: 'creature', id: ch.id, level: ch.level, grade: ch.grade }).maxHp,
    levelUpLoop: () => g.depositOz(),
  });

  // ----- hesaplar -----
  g.zone = () => ZONES.find((z) => z.id === g.zoneId) || null;
  g.layout = () => (g.zone() ? zoneLayout(g.zone()) : null);
  g.zoneLayout = (id) => zoneLayout(ZONES.find((z) => z.id === id));

  g.creatureCombatant = (hp, mods = null) => {
    const cr = g.creature;
    return combat.makeCombatant({ kind: 'creature', id: cr.id, level: cr.level, grade: cr.grade, hp, mods });
  };
  g.maxHp = () => (g.creature ? g.creatureCombatant().maxHp : 0);
  g.ozNeeded = () => (g.creature ? ozToNext(g.creature.level) : 0);
  g.canLevelUp = () => !!g.creature && g.creature.level < rules.meta.maxLevel && g.creature.oz >= ozToNext(g.creature.level);
  g.levelReadyIfBanked = () => !!g.creature && g.creature.level < rules.meta.maxLevel && g.creature.oz + g.carriedOz >= ozToNext(g.creature.level);
  g.isWounded = () => !!g.creature && g.creature.woundedUntil > g.clock;
  g.woundedSecondsLeft = () => (g.isWounded() ? Math.ceil(g.creature.woundedUntil - g.clock) : 0);
  g.lossProtectionLeft = () => Math.max(0, PROTECTED_RUNS - g.runsCompleted);
  g.ozMultiplier = () => (g.settings.testOz ? 5 : 1) * (C.debugOzMult || 1);
  g.beltMap = () => {
    const m = {};
    g.belt.forEach((p) => { if (p && p.count > 0) m[p.itemId] = (m[p.itemId] || 0) + p.count; });
    return m;
  };
  g.monsterColor = (m) => (g.creature ? levelDiffInfo(g.creature.level, m.level).color : 'sari');
  g.bagCount = () => Object.keys(g.bag).filter((k) => g.bag[k] > 0).length + g.eggs.filter((e) => !e.bonded).length;

  // ----- başlangıç -----
  g.startNewGame = () => { g.screen = 'choose'; emit('screen', g.screen); };

  g.chooseStarter = (id) => {
    id = mapCreatureId(id); // eski id verilirse karşılık gelen ejderha
    if (!rules.start.creatureChoice.includes(id)) throw new Error('Geçersiz başlangıç yaratığı: ' + id);
    if (g.creature) throw new Error('Zaten bir kan bağın var');
    // İlk yumurta ısınmayı beklemez: hemen çatlar, C derece, 1. seviye.
    g.rosterAddInitial({ id, grade: rules.start.grade, level: 1, oz: 0, hp: 0, woundedUntil: 0 });
    g.creature.hp = g.maxHp();
    g.belt = [null, null, null, null];
    let i = 0;
    for (const [itemId, count] of Object.entries(rules.start.belt)) g.belt[i++] = { itemId, count };
    g.sekel = rules.start.sekel;
    emit('hatch', { species: id, grade: g.creature.grade, starter: true });
    emit('bond', { creature: { ...g.creature } });
    g.screen = 'gate';
    emit('screen', g.screen);
    return g.creature;
  };

  // ----- yumurtalar -----
  function addEgg(species, grade, source) {
    species = mapCreatureId(species);
    const egg = { uid: 'e' + g.eggSeq++, species, grade, heat: 0, hatched: false, source };
    g.eggs.push(egg);
    if (!g.incubatingEggId) g.incubatingEggId = egg.uid;
    emit('egg', { egg: { uid: egg.uid, species, source } }); // derece gizli
    return egg;
  }
  g.addEgg = addEgg;
  g.eggProgress = (egg) => (egg.hatched ? 1 : Math.min(1, egg.heat / rules.eggHatchWins[egg.grade]));
  g.publicEggs = () => g.eggs.map((e) => ({ uid: e.uid, species: e.species, hatched: e.hatched, grade: e.hatched ? e.grade : null, progress: g.eggProgress(e), incubating: e.uid === g.incubatingEggId }));
  g.setIncubating = (uid) => {
    const egg = g.eggs.find((e) => e.uid === uid && !e.hatched);
    if (!egg) return false;
    g.incubatingEggId = uid; emit('incubate', { uid }); return true;
  };
  function heatEgg() {
    const egg = g.eggs.find((e) => e.uid === g.incubatingEggId);
    if (!egg || egg.hatched) return;
    egg.heat += 1;
    if (egg.heat >= rules.eggHatchWins[egg.grade]) {
      // v4.1: eski yumurta çatlayınca derecesi korunarak bekleyen açılış sonucu olur (Tut / Yedir).
      g.eggs = g.eggs.filter((e) => e !== egg);
      g.incubatingEggId = (g.eggs.find((e) => !e.hatched) || {}).uid || null;
      const p = g.pendingFromEgg(egg);
      emit('hatch', { uid: egg.uid, species: egg.species, grade: egg.grade, starter: false, pullId: p.id });
    }
  }
  // Kan bağını yenile: eski yaratık salınır, yenisi 1. seviyeden başlar. Güvendeki öz geçmez.
  g.bondEgg = (uid) => {
    // v4.1: kan bağı artık kadro ile (resolvePull 'keep'). Eski çağrılar için: çatlamış yumurta varsa bekleyen sonuca çevrilir.
    const egg = g.eggs.find((e) => e.uid === uid && e.hatched);
    if (!egg) return false;
    if (g.pendingFromEgg) { g.eggs = g.eggs.filter((e) => e !== egg); g.pendingFromEgg(egg); return true; }
    if (g.inRun) return false; // sadece kapıda
    const old = g.creature ? { ...g.creature } : null;
    g.eggs = g.eggs.filter((e) => e !== egg);
    g.creature = { id: egg.species, grade: egg.grade, level: 1, oz: 0, hp: 0, woundedUntil: 0 };
    g.creature.hp = g.maxHp();
    emit('bond', { creature: { ...g.creature }, released: old });
    return true;
  };
  g.sellEgg = (uid) => {
    const egg = g.eggs.find((e) => e.uid === uid);
    if (!egg || g.inRun) return false;
    g.eggs = g.eggs.filter((e) => e !== egg);
    if (g.incubatingEggId === uid) g.incubatingEggId = (g.eggs.find((e) => !e.hatched) || {}).uid || null;
    g.sekel += C.eggSellPrice;
    emit('sekel', { sekel: g.sekel });
    return true;
  };

  // ----- bölge, canavarlar -----
  function spawnMonsters(zone) {
    const lay = zoneLayout(zone);
    const list = [];
    const types = zone.monsters;
    for (let i = 0; i < zone.monsterCount; i++) {
      const t = types[i % types.length];
      let home;
      for (let tries = 0; tries < 30; tries++) {
        home = { x: rng.int(8, lay.size.w - 6), z: rng.int(4, lay.size.h - 4) };
        const nearSafe = [...lay.safeRings, lay.entry].some((r) => dist(r, home) < SAFE_RING_RADIUS + 6);
        const nearOther = list.some((m) => dist(m.home, home) < 4);
        const nearCamp = lay.camp && dist(lay.camp, home) < lay.camp.safeRadius + 6;
        const nearNode = lay.nodes.some((n) => dist(n, home) < 3);
        if (!nearSafe && !nearOther && !nearCamp && !nearNode) break;
      }
      list.push(makeMonster(t, home, false, zone));
    }
    const gd = zone.guardian;
    const gs = g.guardians[gd.id];
    const gm = makeMonster({ id: gd.id, name: gd.name, levels: [gd.level, gd.level], behavior: 'sakin', mods: gd.mods, status: gd.status || null, favZone: gd.favZone || 'govde' }, { ...lay.guardianPos }, true, zone);
    if (gs && gs.respawnAt > g.clock) { gm.alive = false; gm.respawnAt = gs.respawnAt; }
    list.push(gm);
    return list;
  }
  let monsterSeq = 1;
  function makeMonster(t, home, isGuardian, zone) {
    return {
      uid: 'm' + monsterSeq++,
      typeId: t.id,
      name: t.name,
      level: isGuardian ? t.levels[0] : rng.int(t.levels[0], t.levels[1]),
      levels: t.levels,
      behavior: t.behavior,
      mods: t.mods || {},
      status: t.status || null,
      favZone: t.favZone || 'govde',
      eggOf: t.eggOf || null,
      rare: !!t.rare,
      isGuardian,
      zoneId: zone.id,
      home: { ...home },
      pos: { ...home },
      target: null,
      wait: rng.next() * 2,
      alive: true,
      respawnAt: 0,
      aggro: false,
      aggroChecked: false,
    };
  }

  // Yaralı yaratık sadece ilk (kayıpsız) bölgeye girebilir.
  g.canEnterZone = (id) => g.unlockedZones.includes(id) && !!g.creature && (!g.isWounded() || id === ZONES[0].id);

  // Kapıdan bir bölgeye gir (sefer başlar) ya da geçitten geçerken bölge değiştir.
  g.enterZone = (id, viaPassageFrom = null) => {
    const zone = ZONES.find((z) => z.id === id);
    if (!zone) throw new Error('Bilinmeyen bölge: ' + id);
    if (!g.canEnterZone(id)) return false;
    if (!viaPassageFrom && g.screen === 'dead') return false; // önce ölüm ekranı kapatılmalı
    g.action = null; g.nearbyNode = null;
    if (!g.inRun) {
      g.inRun = true;
      g.camps = {}; // her seferde kamp pişirme hakları yenilenir
      g.creature.hp = g.creature.hp > 0 ? g.creature.hp : g.maxHp();
      emit('runStart', { protectedRunsLeft: g.lossProtectionLeft() });
    }
    g.zoneId = id;
    g.monsters = spawnMonsters(zone);
    const lay = zoneLayout(zone);
    if (viaPassageFrom) {
      const p = lay.passages.find((ps) => ps.to === viaPassageFrom);
      g.pos = p ? { x: p.x + (p.x < lay.size.w / 2 ? 3 : -3), z: p.z } : { ...lay.entry };
    } else {
      g.pos = lay.gate ? { x: lay.gate.x + GATE_RADIUS + 2, z: lay.gate.z } : { ...lay.entry };
    }
    g.returnSpell = null;
    g.nearbyMonster = null;
    g.pendingFightUid = null;
    g.screen = 'world';
    emit('zoneChanged', { zoneId: id, name: zone.name });
    emit('screen', g.screen);
    return true;
  };

  const inCampRing = (p, lay = g.layout()) => !!lay && !!lay.camp && dist(lay.camp, p) < lay.camp.safeRadius;
  const inSafeRing = (p) => {
    const lay = g.layout();
    return !!lay && (lay.safeRings.some((r) => dist(r, p) < SAFE_RING_RADIUS) || inCampRing(p, lay));
  };
  g.atCamp = () => { const lay = g.layout(); return g.screen === 'world' && !!lay && !!lay.camp && dist(lay.camp, g.pos) <= lay.camp.useRadius; };
  g.inCampRing = () => g.screen === 'world' && inCampRing(g.pos);
  g.inSafeRing = () => inSafeRing(g.pos);

  // Her karede çağrılır. joystick: { x, z } -1..1
  g.tick = (dt, joystick = { x: 0, z: 0 }) => {
    g.clock += dt;
    // bekçi yeniden doğma zamanları kayıt için de saat üzerinden
    if (g.screen !== 'world' || !g.zone()) return;
    const lay = g.layout();
    g.tickGroundCores();

    // oyuncu hareketi
    const jl = Math.hypot(joystick.x || 0, joystick.z || 0);
    if (jl > 0.05 && g.action) cancelAction('hareket');
    if (jl > 0.05) {
      const k = Math.min(1, jl);
      const nx = (joystick.x / jl) * k, nz = (joystick.z / jl) * k;
      g.pos.x = clamp(g.pos.x + nx * C.moveSpeed * dt, 0.5, lay.size.w - 0.5);
      g.pos.z = clamp(g.pos.z + nz * C.moveSpeed * dt, 0.5, lay.size.h - 0.5);
      g.facing = Math.atan2(nx, nz);
    }

    // kapıya yürüyerek varış
    if (lay.gate && dist(g.pos, lay.gate) < GATE_RADIUS * 0.7 && jl > 0.05) { arriveAtGate('walk'); return; }
    // geçitler
    for (const ps of lay.passages) {
      if (dist(g.pos, ps) < PASSAGE_RADIUS && jl > 0.05) {
        if (g.unlockedZones.includes(ps.to)) { const from = g.zoneId; g.enterZone(ps.to, from); return; }
        if (g.flags.lastHint !== 'locked:' + ps.to) { g.flags.lastHint = 'locked:' + ps.to; emit('hint', { text: 'Bu geçit kapalı. Önce bölgenin bekçisini yen.' }); }
      }
    }

    // dönüş büyüsü
    if (g.returnSpell) {
      g.returnSpell.remaining -= dt;
      emit('returnProgress', { remaining: Math.max(0, g.returnSpell.remaining), total: C.returnSpellSeconds });
      if (g.returnSpell.remaining <= 0) { g.returnSpell = null; arriveAtGate('spell'); return; }
    }

    // canavarlar
    const safe = inSafeRing(g.pos);
    let nearest = null, nd = Infinity;
    for (const m of g.monsters) {
      if (!m.alive) {
        if (g.clock >= m.respawnAt) {
          m.alive = true; m.pos = { ...m.home }; m.aggro = false; m.aggroChecked = false;
          if (!m.isGuardian) m.level = rng.int(m.levels[0], m.levels[1]);
          emit('monsterRespawn', { uid: m.uid });
        }
        continue;
      }
      const d = dist(m.pos, g.pos);
      const beh = rules.behaviors[m.behavior] || rules.behaviors.sakin;
      // saldırganlık kontrolü (yaklaşınca bir kez zar atılır)
      if (!m.aggro && !safe && beh.aggroRadius > 0 && d <= beh.aggroRadius) {
        if (!m.aggroChecked) {
          m.aggroChecked = true;
          if (rng.chance(beh.aggroChance)) { m.aggro = true; emit('monsterAggro', { uid: m.uid, name: m.name }); }
        }
      } else if (d > beh.aggroRadius + 2) {
        m.aggroChecked = false;
      }
      if (m.aggro && safe) m.aggro = false;

      if (m.aggro) {
        const sp = C.monsterWanderSpeed * 2;
        const dx = g.pos.x - m.pos.x, dz = g.pos.z - m.pos.z, l = Math.hypot(dx, dz) || 1;
        const np = { x: m.pos.x + (dx / l) * sp * dt, z: m.pos.z + (dz / l) * sp * dt };
        if (inCampRing(np, lay)) { m.aggro = false; } else { m.pos = np; }
        if (dist(m.pos, g.pos) <= CONTACT_RADIUS && !g.pendingFightUid) {
          g.pendingFightUid = m.uid;
          if (g.returnSpell) { g.returnSpell = null; emit('returnCancelled', { reason: 'saldiri' }); }
          emit('fightForced', { uid: m.uid, name: m.name });
        }
      } else {
        // dolaşma
        if (m.wait > 0) m.wait -= dt;
        else {
          if (!m.target) {
            const a = rng.next() * Math.PI * 2, r = rng.next() * C.monsterWanderRadius;
            m.target = { x: clamp(m.home.x + Math.cos(a) * r, 1, lay.size.w - 1), z: clamp(m.home.z + Math.sin(a) * r, 1, lay.size.h - 1) };
          }
          const dx = m.target.x - m.pos.x, dz = m.target.z - m.pos.z, l = Math.hypot(dx, dz);
          if (l < 0.2) { m.target = null; m.wait = 1 + rng.next() * 3; }
          else {
            const step = Math.min(l, C.monsterWanderSpeed * dt);
            const np = { x: m.pos.x + (dx / l) * step, z: m.pos.z + (dz / l) * step };
            if (!lay.safeRings.some((r) => dist(r, np) < SAFE_RING_RADIUS) && !inCampRing(np, lay)) m.pos = np; else { m.target = null; m.wait = 1; }
          }
        }
      }
      if (d < nd) { nd = d; nearest = m; }
    }
    const prevNear = g.nearbyMonster;
    g.nearbyMonster = nearest && nd <= C.attackButtonRadius && !safe ? nearest : null;
    if ((prevNear && prevNear.uid) !== (g.nearbyMonster && g.nearbyMonster.uid)) emit('nearby', { monster: g.nearbyMonster });

    // v4: kaynak düğümleri (yeniden doğma + yakınlık)
    const RR = rules.resources || {};
    let nn = null, nnd = Infinity;
    for (const n of lay.nodes) {
      const ra = g.nodes[n.id];
      if (ra != null && g.clock >= ra) { delete g.nodes[n.id]; emit('nodeRespawn', { id: n.id }); }
      if (g.nodes[n.id] != null) continue;
      const d = dist(n, g.pos);
      if (d < nnd) { nnd = d; nn = n; }
    }
    const prevNode = g.nearbyNode;
    g.nearbyNode = nn && nnd <= (RR.gatherRadius || 1.8) ? nn : null;
    if ((prevNode && prevNode.id) !== (g.nearbyNode && g.nearbyNode.id)) emit('nearbyNode', { node: g.nearbyNode });

    // v4: süren eylem (toplama / yeme). Saldırgan canavar temas ederse güvenle iptal.
    if (g.action) {
      if (g.pendingFightUid) cancelAction('saldiri');
      else {
        g.action.remaining -= dt;
        emit('actionProgress', { type: g.action.type, k: 1 - Math.max(0, g.action.remaining) / g.action.total });
        if (g.action.remaining <= 0) completeAction();
      }
    }
  };

  // ----- v4: kaynak, yemek, kamp -----
  const RES = () => (rules.resources && rules.resources.types) || {};
  const REC = () => (rules.recipes && rules.recipes.list) || {};
  const INV = () => rules.inventory || { foodSlots: 6, foodStack: 10, resourceSlots: 8, resourceStack: 20 };
  const countKinds = (obj) => Object.values(obj).filter((v) => v > 0).length;
  g.resourceRoom = (type) => {
    const inv = INV(); const have = g.resources[type] || 0;
    if (have <= 0 && countKinds(g.resources) >= inv.resourceSlots) return 0;
    return Math.max(0, inv.resourceStack - have);
  };
  g.foodRoom = (id) => {
    const inv = INV(); const have = g.food[id] || 0;
    if (have <= 0 && countKinds(g.food) >= inv.foodSlots) return 0;
    return Math.max(0, inv.foodStack - have);
  };
  g.zoneNodes = () => { const lay = g.layout(); return lay ? lay.nodes.map((n) => ({ ...n, ready: g.nodes[n.id] == null, respawnLeft: g.nodes[n.id] != null ? Math.max(0, g.nodes[n.id] - g.clock) : 0 })) : []; };
  g.nodeReady = (id) => g.nodes[id] == null;
  // Yenebilir şeyler: pişmiş yemekler + çiğ yenebilir kaynaklar (şifalı meyve)
  g.edibles = () => {
    const out = [];
    for (const [id, n] of Object.entries(g.food)) if (n > 0 && REC()[id]) out.push({ id, kind: 'food', name: REC()[id].name, count: n, heal: REC()[id].heal, buff: REC()[id].buff || null });
    for (const [id, n] of Object.entries(g.resources)) if (n > 0 && RES()[id] && RES()[id].edible) out.push({ id, kind: 'resource', name: RES()[id].name, count: n, heal: RES()[id].edible.heal, buff: null });
    return out;
  };

  function cancelAction(reason) {
    if (!g.action) return;
    const a = g.action; g.action = null;
    emit('actionCancelled', { type: a.type, id: a.id, reason }); // malzeme/yemek harcanmaz, düğüm yerinde kalır
  }
  g.cancelAction = cancelAction;

  g.startGather = (nodeId = null) => {
    if (g.screen !== 'world' || g.action || g.pendingFightUid) return false;
    const n = nodeId ? (g.layout().nodes.find((x) => x.id === nodeId)) : g.nearbyNode;
    if (!n || g.nodes[n.id] != null) return false;
    if (dist(n, g.pos) > ((rules.resources && rules.resources.gatherRadius) || 1.8) + 0.3) return false;
    const t = RES()[n.type]; if (!t) return false;
    if (g.resourceRoom(n.type) < (t.yield || 1)) { emit('hint', { text: 'Kaynak torban dolu.' }); emit('bagFull', { kind: 'resource', type: n.type }); return false; }
    const sec = (rules.resources && rules.resources.gatherSeconds) || 1.2;
    g.action = { type: 'gather', id: n.id, nodeType: n.type, remaining: sec, total: sec };
    emit('actionStart', { type: 'gather', id: n.id, nodeType: n.type, seconds: sec });
    return true;
  };

  g.startEat = (id) => {
    if (g.screen !== 'world' || g.action || g.battle || g.pendingFightUid) return false; // savaşta yemek yok
    const e = g.edibles().find((x) => x.id === id);
    if (!e) return false;
    if (g.creature.hp >= g.maxHp() && !e.buff) { emit('hint', { text: 'Canın zaten dolu.' }); return false; }
    const sec = (rules.recipes && rules.recipes.eatSeconds) || 1.5;
    g.action = { type: 'eat', id, kind: e.kind, remaining: sec, total: sec };
    emit('actionStart', { type: 'eat', id, seconds: sec });
    return true;
  };

  function completeAction() {
    const a = g.action; g.action = null;
    if (a.type === 'gather') {
      const n = g.layout().nodes.find((x) => x.id === a.id); const t = RES()[a.nodeType];
      if (!n || g.nodes[n.id] != null || !t) { emit('actionCancelled', { type: a.type, id: a.id, reason: 'yok' }); return; }
      const amt = Math.min(t.yield || 1, g.resourceRoom(n.type));
      if (amt <= 0) { emit('hint', { text: 'Kaynak torban dolu.' }); emit('actionCancelled', { type: a.type, id: a.id, reason: 'dolu' }); return; }
      g.resources[n.type] = (g.resources[n.type] || 0) + amt;
      g.nodes[n.id] = g.clock + (t.respawnSeconds || 240);
      if (g.nearbyNode && g.nearbyNode.id === n.id) { g.nearbyNode = null; emit('nearbyNode', { node: null }); }
      emit('gathered', { id: n.id, type: n.type, amount: amt, total: g.resources[n.type] });
    } else if (a.type === 'eat') {
      const e = g.edibles().find((x) => x.id === a.id);
      if (!e) { emit('actionCancelled', { type: a.type, id: a.id, reason: 'yok' }); return; }
      if (e.kind === 'food') g.food[a.id] -= 1; else g.resources[a.id] -= 1;
      const max = g.maxHp(); const before = g.creature.hp;
      g.creature.hp = Math.min(max, Math.round(before + max * e.heal));
      if (e.buff) { g.buffs = { atk: e.buff.atk, fights: e.buff.fights }; emit('buff', { ...g.buffs }); }
      emit('ate', { id: a.id, healed: g.creature.hp - before, hp: g.creature.hp, max });
    }
  }

  g.canCook = (recipeId) => {
    const r = REC()[recipeId]; if (!r) return { ok: false, why: 'yok' };
    if (!g.atCamp()) return { ok: false, why: 'kamp' };
    const camp = g.camps[g.zoneId] || { cooks: 0 };
    if (camp.cooks >= ((rules.camps && rules.camps.cooksPerRunPerCamp) || 4)) return { ok: false, why: 'hak' };
    for (const [k, n] of Object.entries(r.needs)) if ((g.resources[k] || 0) < n) return { ok: false, why: 'malzeme' };
    if (g.foodRoom(recipeId) < 1) return { ok: false, why: 'dolu' };
    return { ok: true };
  };
  g.cooksLeft = () => Math.max(0, ((rules.camps && rules.camps.cooksPerRunPerCamp) || 4) - ((g.camps[g.zoneId] || {}).cooks || 0));
  g.cook = (recipeId) => {
    const c = g.canCook(recipeId);
    if (!c.ok) { emit('hint', { text: { kamp: 'Pişirmek için kamp ateşinin yanında olmalısın.', hak: 'Bu seferde bu kampta daha fazla pişiremezsin.', malzeme: 'Malzemen yetmiyor.', dolu: 'Yemek torban dolu.', yok: 'Bilinmeyen tarif.' }[c.why] }); return false; }
    const r = REC()[recipeId];
    for (const [k, n] of Object.entries(r.needs)) g.resources[k] -= n;
    g.food[recipeId] = (g.food[recipeId] || 0) + 1;
    g.camps[g.zoneId] = { cooks: ((g.camps[g.zoneId] || {}).cooks || 0) + 1 };
    emit('cooked', { id: recipeId, count: g.food[recipeId], cooksLeft: g.cooksLeft() });
    return true;
  };

  // ----- dönüş -----
  g.startReturn = () => {
    if (g.screen !== 'world' || g.returnSpell) return false;
    g.returnSpell = { remaining: C.returnSpellSeconds };
    emit('returnStart', { seconds: C.returnSpellSeconds });
    return true;
  };
  g.cancelReturn = () => { if (g.returnSpell) { g.returnSpell = null; emit('returnCancelled', { reason: 'oyuncu' }); } };
  g.useReturnTablet = () => {
    if (g.screen !== 'world' || !(g.bag.donus_tableti > 0)) return false;
    g.bag.donus_tableti -= 1;
    arriveAtGate('tablet');
    return true;
  };

  function endRun(reason) {
    if (!g.inRun) return;
    g.inRun = false;
    g.runsCompleted += 1;
    emit('runEnd', { reason, runsCompleted: g.runsCompleted, protectedRunsLeft: g.lossProtectionLeft() });
  }

  // Kapıya varış: taşınan öz güvenceye alınır, can dolar, sefer biter.
  function arriveAtGate(how) {
    g.returnSpell = null;
    g.action = null; g.nearbyNode = null;
    g.groundCores = [];
    g.zoneId = null;
    g.monsters = [];
    g.nearbyMonster = null;
    g.pendingFightUid = null;
    g.depositOz();
    if (C.gateFullHeal && g.creature) g.creature.hp = g.maxHp();
    endRun(how);
    g.screen = 'gate';
    if (g.cores.autoDeposit) g.depositCores();
    emit('arriveGate', { how });
    emit('screen', g.screen);
  }
  g.arriveAtGate = arriveAtGate;

  // Kapıda öz yatırma + seviye atlama (sadece kapıda).
  g.depositOz = () => {
    if (!g.creature) return 0;
    const amount = g.carriedOz;
    if (amount > 0) {
      g.creature.oz += Math.round(amount * g.catchUpMult(g.creature));
      g.carriedOz = 0;
      emit('deposit', { amount, banked: g.creature.oz });
    }
    let ups = 0;
    while (g.creature.level < rules.meta.maxLevel && g.creature.oz >= ozToNext(g.creature.level)) {
      const oldStage = growthStage(g.creature.level);
      g.creature.oz -= ozToNext(g.creature.level);
      g.creature.level += 1;
      ups++;
      g.creature.hp = g.maxHp();
      emit('levelUp', { level: g.creature.level });
      const ns = growthStage(g.creature.level);
      if (ns !== oldStage) emit('growthStage', { stage: ns, level: g.creature.level });
      if (g.creature.level === C.skillUnlockLevel) emit('skillUnlocked', { level: g.creature.level, which: 'active' });
      if (g.creature.level === C.secondSkillLevel && rules.grades[g.creature.grade].secondSkill) emit('skillUnlocked', { level: g.creature.level, which: 'second' });
    }
    return ups;
  };

  // ----- savaş -----
  g.startFight = (uid = null) => {
    const id = uid || g.pendingFightUid || (g.nearbyMonster && g.nearbyMonster.uid);
    const m = g.monsters.find((x) => x.uid === id && x.alive);
    if (!m || g.screen !== 'world') return null;
    if (g.returnSpell) { g.returnSpell = null; emit('returnCancelled', { reason: 'savas' }); }
    if (g.action) cancelAction('savas');
    const tutorial = !g.flags.firstFightDone;
    const buffMods = g.buffs && g.buffs.fights > 0 && g.buffs.atk ? { atk: 1 + g.buffs.atk } : null;
    const player = g.creatureCombatant(g.creature.hp, buffMods);
    const enemy = combat.makeCombatant({
      kind: m.isGuardian ? 'guardian' : 'monster',
      id: m.typeId, name: m.name, level: m.level, mods: m.mods, status: m.status, favZone: m.favZone,
    });
    const battle = combat.startBattle(player, enemy, { rng, tutorial, belt: g.beltMap() });
    g.battle = battle;
    g.battleMonsterUid = m.uid;
    g.pendingFightUid = null;
    g.screen = 'battle';
    g.stats.fights += 1;
    emit('fightStart', { uid: m.uid, name: m.name, level: m.level, color: g.monsterColor(m), tutorial, guardian: m.isGuardian });
    emit('screen', g.screen);
    return battle;
  };

  function syncBeltAfter(battle) {
    const left = { ...(battle.belt || {}) };
    for (let i = 0; i < g.belt.length; i++) {
      const p = g.belt[i];
      if (!p) continue;
      const have = left[p.itemId] || 0;
      const keep = Math.min(p.count, have);
      left[p.itemId] = have - keep;
      g.belt[i] = keep > 0 ? { itemId: p.itemId, count: keep } : null;
    }
  }

  // Savaş bittiğinde (battle.over) arayüz bunu çağırır.
  g.finishFight = (battle = g.battle) => {
    if (!battle) return null;
    // İdempotent: aynı savaş ikinci kez bitirilirse (animasyon tekrar tetiklendi vb.) ödül/ceza yeniden uygulanmaz.
    if (battle._finished) return g.lastFightResult || null;
    battle._finished = true;
    const m = g.monsters.find((x) => x.uid === g.battleMonsterUid);
    const winner = battle.winner;
    syncBeltAfter(battle);
    g.flags.firstFightDone = true;
    if (g.buffs && g.buffs.fights > 0) { g.buffs.fights -= 1; if (g.buffs.fights <= 0) g.buffs = { atk: 0, fights: 0 }; emit('buff', { ...g.buffs }); }
    const result = { winner, oz: 0, sekel: 0, drops: [], egg: null, color: null, kader: null, absorb: null };
    g.battle = null;
    g.battleMonsterUid = null;

    if (winner === 'player' && m) {
      g.creature.hp = Math.max(1, Math.round(battle.player.hp));
      const zone = g.zone();
      const ld = levelDiffInfo(g.creature.level, m.level);
      result.color = ld.color;
      let oz = (10 + 5 * m.level) * ld.mult * zone.ozMult * g.ozMultiplier();
      if (m.isGuardian) oz *= C.guardianOzMult;
      oz = Math.round(oz);
      g.carriedOz += oz;
      g.stats.ozGained += oz;
      result.oz = oz;
      // Ruh özü emme: sadece görsel bilgi. Ödül yukarıda BİR KEZ verildi; animasyon bunu değiştirmez.
      { const kind = m.isGuardian ? 'guardian' : (m.rare ? 'rare' : 'normal'); const fx = rules.absorbFx || { durations: {} };
        result.absorb = { kind, oz, dur: (fx.durations && fx.durations[kind]) || 1, monsterUid: m.uid, pos: { x: m.pos.x, z: m.pos.z } }; }
      let sekel = Math.round(((C.sekelPerKillBase ?? 2) + m.level) * zone.ozMult);
      if (m.isGuardian) sekel = (C.guardianSekel && C.guardianSekel[m.typeId]) || sekel;
      g.sekel += sekel;
      result.sekel = sekel;
      g.stats.wins += 1;
      if (ld.color !== 'gri') heatEgg();
      // düşmeler (gri canavar da eşya düşürür ama yumurta ısıtmaz)
      // v4.1: nadir canavar / bekçi çekirdek düşürür (ilk zafer garantisi). Ödül bu savaş için BİR KEZ.
      result.cores = (m.rare || m.isGuardian) ? g.rollCoreDrops(m, m.isGuardian && !(g.guardians[m.typeId] || {}).defeated) : [];
      if (!m.isGuardian) {
        for (const [itemId, p] of Object.entries(rules.drops.itemDropChance)) {
          if (rng.chance(p) && addToBag(itemId, 1)) { result.drops.push(itemId); emit('drop', { itemId }); }
        }
        if (m.eggOf && rules.drops.eggDropChanceOwnType > 0 && rng.chance(rules.drops.eggDropChanceOwnType)) {
          result.egg = addEgg(m.eggOf, rollGrade(rng, rules.eggOdds.normal), 'monster').uid;
        }
      } else {
        result.kader = guardianReward(m, result);
      }
      // canavar ölür, yeniden doğar
      m.alive = false; m.aggro = false; m.aggroChecked = false;
      m.respawnAt = g.clock + (m.isGuardian ? (zone.guardian.respawnSeconds || 600) : C.monsterRespawnSeconds);
      if (m.isGuardian) g.guardians[m.typeId] = { ...(g.guardians[m.typeId] || {}), defeated: true, respawnAt: m.respawnAt };
      emit('ozGained', { amount: oz, carried: g.carriedOz, color: ld.color });
      emit('sekel', { sekel: g.sekel, gained: sekel });
      if (g.levelReadyIfBanked() && g.flags.lastHint !== 'levelReady') { g.flags.lastHint = 'levelReady'; emit('hint', { text: 'Kapıya dön, seviye atla' }); }
      g.screen = 'world';
      emit('fightEnd', result);
      emit('screen', g.screen);
    } else if (winner === 'fled') {
      g.creature.hp = Math.max(1, Math.round(battle.player.hp));
      g.stats.flees += 1;
      if (m) {
        m.aggro = false; m.aggroChecked = true;
        const dx = g.pos.x - m.pos.x, dz = g.pos.z - m.pos.z, l = Math.hypot(dx, dz) || 1;
        const lay = g.layout();
        g.pos.x = clamp(g.pos.x + (dx / l) * 4, 0.5, lay.size.w - 0.5);
        g.pos.z = clamp(g.pos.z + (dz / l) * 4, 0.5, lay.size.h - 0.5);
      }
      g.screen = 'world';
      emit('fightEnd', result);
      emit('screen', g.screen);
    } else {
      // yenilgi (oyuncu kaybeder, ya da savaştan çıkış)
      g.stats.losses += 1;
      result.lost = applyDeath();
      result.coresLost = g.lastDeathCores || null;
      emit('fightEnd', result);
    }
    g.lastFightResult = result;
    return result;
  };

  // Savaşın ortasında çıkış = yenilgi
  g.quitFight = () => {
    if (!g.battle) return null;
    g.battle.over = true; g.battle.winner = 'enemy';
    return g.finishFight(g.battle);
  };

  function guardianReward(m, result) {
    const gs = g.guardians[m.typeId] || {};
    const first = !gs.defeated;
    const limit = DEFAULT_KADER_LIMIT;
    let eggGiven = false;
    const legacyEggs = (rules.drops.guardianEggChance || 0) > 0 || rules.drops.firstGuardianKillEggGuaranteed;
    if (!legacyEggs) { /* v4.1: yumurta/kader puanı yok; ödül çekirdeklerle (rollCoreDrops) */ }
    else if (g.kaderPuani >= limit) {
      const grade = rng.chance(0.8) ? 'A' : 'S';
      result.egg = addEgg(rng.pick(rules.start.creatureChoice), grade, 'kader').uid;
      g.kaderPuani = 0;
      eggGiven = true;
      emit('kader', { points: 0, used: true });
    } else if ((first && rules.drops.firstGuardianKillEggGuaranteed) || rng.chance(rules.drops.guardianEggChance)) {
      result.egg = addEgg(rng.pick(rules.start.creatureChoice), rollGrade(rng, rules.eggOdds.guardian), 'guardian').uid;
      eggGiven = true;
    }
    if (!eggGiven && legacyEggs) { g.kaderPuani += 1; emit('kader', { points: g.kaderPuani, limit }); }
    if (first) {
      const idx = ZONES.findIndex((z) => z.guardian.id === m.typeId);
      const next = ZONES[idx + 1];
      if (next && !g.unlockedZones.includes(next.id)) {
        g.unlockedZones.push(next.id);
        emit('zoneUnlocked', { zoneId: next.id, name: next.name });
      }
      g.tablets.push(m.typeId);
      emit('tablet', { id: m.typeId });
    }
    return { points: g.kaderPuani, eggGiven };
  }

  // Ölüm: taşınan özün bölge oranı kadarı gider (ilk 3 sefer korumalı), kapıya dönüş, yaralı.
  function applyDeath() {
    const zone = g.zone();
    const protectedRun = g.runsCompleted < PROTECTED_RUNS;
    const rate = protectedRun ? 0 : (zone ? zone.lossOnDeath : 0);
    const lost = Math.round(g.carriedOz * rate);
    g.carriedOz -= lost;
    g.stats.ozLost += lost;
    g.stats.deaths += 1;
    g.creature.woundedUntil = g.clock + C.woundedSeconds;
    const coreLoss = g.applyCoreDeathLoss(g.zoneId, protectedRun);
    g.lastDeathCores = coreLoss.lost;
    emit('death', { lost, rate, protectedRun, zoneId: g.zoneId, coresLost: coreLoss.lost, coresLostCount: coreLoss.k });
    if (lost > 0) emit('ozLost', { amount: lost, carried: g.carriedOz });
    arriveAtGate('death');
    g.screen = 'dead';
    emit('screen', g.screen);
    return lost;
  }
  g.dismissDeath = () => { if (g.screen === 'dead') { g.screen = 'gate'; emit('screen', g.screen); } };

  // ----- çanta, dükkân, kemer -----
  function addToBag(itemId, n) {
    const has = (g.bag[itemId] || 0) > 0;
    if (!has && g.bagCount() >= C.bagSlots) return false;
    const room = C.bagStack - (g.bag[itemId] || 0);
    if (room <= 0) return false;
    g.bag[itemId] = (g.bag[itemId] || 0) + Math.min(n, room);
    return true;
  }
  g.addToBag = addToBag;

  g.atGate = () => g.screen === 'gate' || g.screen === 'dead';
  g.shopItems = () => Object.entries(rules.items).map(([id, it]) => ({ id, name: it.name, price: it.price, beltAllowed: it.beltAllowed !== false }));
  g.buy = (itemId, n = 1) => {
    const it = rules.items[itemId];
    if (!it || !g.atGate()) return false;
    if (g.sekel < it.price * n) { emit('hint', { text: 'Yeterli şekelin yok.' }); return false; }
    for (let i = 0; i < n; i++) { if (!addToBag(itemId, 1)) return false; g.sekel -= it.price; }
    emit('buy', { itemId, n });
    emit('sekel', { sekel: g.sekel });
    return true;
  };
  g.sell = (itemId, n = 1) => {
    const it = rules.items[itemId];
    if (!it || !g.atGate() || (g.bag[itemId] || 0) < n) return false;
    g.bag[itemId] -= n;
    g.sekel += Math.max(1, Math.floor(it.price * C.sellRatio)) * n;
    emit('sekel', { sekel: g.sekel });
    return true;
  };
  // Cebe çantadan eşya tak (sadece kapıda). count: pocketStack'e kadar.
  g.setPocket = (index, itemId) => {
    if (!g.atGate() || index < 0 || index >= C.beltPockets) return false;
    const cur = g.belt[index];
    if (cur) { g.bag[cur.itemId] = (g.bag[cur.itemId] || 0) + cur.count; g.belt[index] = null; }
    if (!itemId) { emit('belt', { belt: g.belt }); return true; }
    const it = rules.items[itemId];
    if (!it || it.beltAllowed === false || !(g.bag[itemId] > 0)) { emit('belt', { belt: g.belt }); return false; }
    const n = Math.min(it.pocketStack || 1, g.bag[itemId]);
    g.bag[itemId] -= n;
    g.belt[index] = { itemId, count: n };
    emit('belt', { belt: g.belt });
    return true;
  };
  g.refillBelt = () => {
    if (!g.atGate()) return false;
    for (const p of g.belt) {
      if (!p) continue;
      const max = rules.items[p.itemId].pocketStack || 1;
      const need = Math.min(max - p.count, g.bag[p.itemId] || 0);
      if (need > 0) { p.count += need; g.bag[p.itemId] -= need; }
    }
    emit('belt', { belt: g.belt });
    return true;
  };

  // ----- ayarlar -----
  g.setTestOz = (on) => { g.settings.testOz = !!on; emit('settings', { ...g.settings }); };
  g.setSetting = (k, v) => { g.settings[k] = v; emit('settings', { ...g.settings }); };

  // ----- kayıt -----
  g.toSave = () => ({
    version: SAVE_VERSION,
    savedAt: Date.now(),
    clock: g.clock,
    keeper: { ...g.keeper },
    creature: g.creature ? { ...g.creature, woundedLeft: Math.max(0, g.creature.woundedUntil - g.clock) } : null,
    carriedOz: g.carriedOz,
    location: g.zoneId ? { zoneId: g.zoneId, x: g.pos.x, z: g.pos.z } : 'gate',
    inRun: g.inRun,
    runsCompleted: g.runsCompleted,
    sekel: g.sekel,
    bag: { ...g.bag },
    eggs: g.eggs.map((e) => ({ ...e })),
    eggSeq: g.eggSeq,
    belt: g.belt.map((p) => (p ? { ...p } : null)),
    incubatingEggId: g.incubatingEggId,
    unlockedZones: [...g.unlockedZones],
    guardians: Object.fromEntries(Object.entries(g.guardians).map(([k, v]) => [k, { defeated: !!v.defeated, respawnLeft: Math.max(0, (v.respawnAt || 0) - g.clock) }])),
    tablets: [...g.tablets],
    food: { ...g.food },
    resources: { ...g.resources },
    camps: JSON.parse(JSON.stringify(g.camps)),
    nodes: Object.fromEntries(Object.entries(g.nodes).map(([k, v]) => [k, Math.max(0, v - g.clock)])), // kalan saniye
    buffs: { ...g.buffs },
    collection: { ...g.collection },
    kaderPuani: g.kaderPuani,
    stats: { ...g.stats },
    settings: { ...g.settings },
    flags: { ...g.flags },
    ...g.coresToSave(),
    // Savaş ortasında kaydedilirse: yüklemede kaçış sayılır, yaratığın o anki canı korunur (yenilemeyle iyileşme yok).
    fight: g.battle && !g.battle.over ? { hp: Math.max(1, Math.round(g.battle.player.hp)) } : null,
  });

  // Eski (v1 / sürümsüz) kayıtlar önce ejderha sürümüne geçirilir.
  if (saveData) { const mig = migrateSave(saveData); if (mig) loadInto(mig); }

  function loadInto(s) {
    g.clock = 0;
    g.keeper = { ...(s.keeper || { level: 1 }) };
    // v3: kadro (roster) esas; migrate.js eski kayıtta creature'dan roster üretir.
    g.coresLoad(s);
    if (!g.creature && s.creature) {
      const c = { id: s.creature.id, grade: s.creature.grade, level: s.creature.level, oz: s.creature.oz || 0, hp: s.creature.hp, woundedUntil: s.creature.woundedLeft || 0 };
      if (s.creature.legacyId) c.legacyId = s.creature.legacyId;
      g.rosterAddInitial(c);
    }
    g.food = { ...(s.food || {}) }; g.resources = { ...(s.resources || {}) }; g.camps = JSON.parse(JSON.stringify(s.camps || {})); g.collection = { ...(s.collection || {}) };
    g.nodes = Object.fromEntries(Object.entries(s.nodes || {}).filter(([, v]) => typeof v === 'number' && v > 0)); // kalan saniye (saat 0'dan)
    g.buffs = s.buffs && typeof s.buffs === 'object' ? { atk: +s.buffs.atk || 0, fights: +s.buffs.fights || 0 } : { atk: 0, fights: 0 };
    if (s.migratedFrom) g.flags = { ...g.flags, migratedFrom: s.migratedFrom };
    g.carriedOz = s.carriedOz || 0;
    g.runsCompleted = s.runsCompleted || 0;
    g.sekel = s.sekel ?? rules.start.sekel;
    g.bag = { ...(s.bag || {}) };
    g.eggs = (s.eggs || []).map((e) => ({ ...e }));
    g.eggSeq = s.eggSeq || g.eggs.length + 1;
    g.belt = (s.belt || [null, null, null, null]).map((p) => (p ? { ...p } : null));
    g.incubatingEggId = s.incubatingEggId || null;
    g.unlockedZones = s.unlockedZones && s.unlockedZones.length ? [...s.unlockedZones] : [ZONES[0].id];
    g.guardians = Object.fromEntries(Object.entries(s.guardians || {}).map(([k, v]) => [k, { defeated: !!v.defeated, respawnAt: v.respawnLeft || 0 }]));
    g.tablets = [...(s.tablets || [])];
    g.kaderPuani = s.kaderPuani || 0;
    g.stats = { ...g.stats, ...(s.stats || {}) };
    g.settings = { ...g.settings, ...(s.settings || {}) };
    g.flags = { ...g.flags, ...(s.flags || {}) };
    if (s.fight && g.creature) { g.creature.hp = Math.min(g.creature.hp ?? s.fight.hp, s.fight.hp); g.flags.resumedFromFight = true; }
    if (!g.creature) { g.screen = 'intro'; return; }
    // Bölgede kaydedildiyse aynı bölgede, aynı yerde devam (canavarlar yeniden doğar).
    if (s.location && s.location !== 'gate' && g.unlockedZones.includes(s.location.zoneId)) {
      g.inRun = false;
      const ok = g.enterZone(s.location.zoneId);
      if (ok) { g.pos = { x: s.location.x, z: s.location.z }; g.camps = JSON.parse(JSON.stringify(s.camps || {})); } // aynı sefer: kamp hakları korunur
      else g.screen = 'gate';
    } else {
      g.inRun = false;
      g.screen = 'gate';
    }
  }

  return g;
}

export { zoneLayout };
