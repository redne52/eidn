// Edin — sıra tabanlı savaş motoru v2 (saf mantık, DOM yok).
// Bölge seçimi yok. FFXIV zincir kombo + WoW kombo puanı/bitirici + Blade&Soul telgraf/karşı saldırı.
// Bütün sayılar rules.json'dan okunur. Sözleşme: CONTRACT-v2-savas.md
import RULES from '../data/rules.json' with { type: 'json' };
import { createRng } from './rng.js';

let R = RULES;
/** Test/denge için kural setini değiştirmek (oyunda kullanılmaz). */
export function setRules(r) { R = r; }
export function getRules() { return R; }

const C = () => R.constants;
const K = () => R.combat2;
const STAT_KEYS = ['hp', 'atk', 'def', 'cev', 'krit', 'blok'];
const DOT_IDS = ['zehir', 'kanama', 'yanik'];
const GRADE_ORDER = ['C', 'B', 'A', 'S'];
export const MOVES = ['quick', 'heavy'];

// Ekranda gösterilecek Türkçe adlar
export const STATUS_NAMES = {
  zehir: 'Zehir', kanama: 'Kanama', yanik: 'Yanık', sersem: 'Sersem', yavas: 'Yavaş',
  zayif: 'Zayıf', kalkan: 'Siper', yansitma: 'Yansıtma', bandaj: 'Bandaj', ofke: 'Öfke',
};
export const MOVE_NAMES = { quick: 'Hızlı vuruş', heavy: 'Ağır vuruş', guard: 'Savunma', finisher: 'Bitirici', counter: 'Karşı saldırı' };

// ---------------------------------------------------------------- yardımcılar
function findMonsterDef(id) {
  for (const z of R.zones) {
    if (z.guardian && z.guardian.id === id) return { def: z.guardian, guardian: true, zone: z };
    const m = z.monsters.find((x) => x.id === id);
    if (m) return { def: m, guardian: false, zone: z };
  }
  return null;
}
function levelStats(base, growth, level) {
  const s = {};
  for (const k of STAT_KEYS) s[k] = base[k] + growth[k] * (level - 1);
  return s;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gradeAtLeast = (g, min) => GRADE_ORDER.indexOf(g || 'C') >= GRADE_ORDER.indexOf(min || 'C');

/** Oynanabilir (eski olmayan) yaratık id'leri — v4'te ejderhalar */
export function playableIds() { return Object.keys(R.creatures).filter((k) => !R.creatures[k].legacy); }
/** Eski (legacy) yaratık id'leri */
export function legacyIds() { return Object.keys(R.creatures).filter((k) => R.creatures[k].legacy); }

/** Seviye ve dereceye göre açık zincirler */
export function unlockedChains(id, level, grade) {
  const def = R.creatures[id];
  if (!def) return [];
  const lv = C().chainUnlockLevels || [1, 5, 10];
  return (def.chains || []).filter((ch, i) => level >= (lv[i] ?? 99) && gradeAtLeast(grade, ch.minGrade));
}

// ---------------------------------------------------------------- dövüşçü
/**
 * makeCombatant({ kind:'creature'|'monster'|'guardian', id, level, grade?, mods?, hp?, name? })
 */
export function makeCombatant(opts) {
  const { id, level = 1 } = opts;
  let kind = opts.kind || 'monster';
  let stats, name, role = null, status = null, grade = opts.grade || null;
  const skills = { passive: null, chains: [], finisher: null };

  if (kind === 'creature') {
    const def = R.creatures[id];
    if (!def) throw new Error('Bilinmeyen yaratık: ' + id);
    grade = grade || 'C';
    const g = R.grades[grade];
    stats = levelStats(def.base, def.growth, level);
    stats.hp *= g.statMult;
    stats.atk *= g.statMult;
    name = def.name; role = def.role;
    skills.passive = def.passive || null;
    if (skills.passive?.effect?.flatBlok) stats.blok += skills.passive.effect.flatBlok;
    skills.chains = unlockedChains(id, level, grade);
    skills.finisher = def.finisher || null;
    // v4: geçici güçlendirme (ör. Ruhlu et: saldırı ×1,10) — canavarlardaki mods ile aynı çarpım; formül değişmez
    if (opts.mods) for (const k of Object.keys(opts.mods)) if (k in stats) stats[k] *= opts.mods[k];
  } else {
    const found = findMonsterDef(id);
    const t = R.monsterTemplate;
    stats = levelStats(t.base, t.growth, level);
    const mods = { ...(found?.def.mods || {}), ...(opts.mods || {}) };
    for (const k of Object.keys(mods)) if (k in stats) stats[k] *= mods[k];
    if (found) {
      name = found.def.name; status = found.def.status || null;
      skills.finisher = found.def.finisher || null;
      if (found.guardian) kind = 'guardian';
    } else {
      name = opts.name || 'Canavar'; status = opts.status || null;
      skills.finisher = { id: 'canavar_imza', name: 'Vahşi Darbe' };
    }
  }
  for (const k of STAT_KEYS) stats[k] = Math.round(stats[k] * 10) / 10;
  const maxHp = Math.round(stats.hp);
  return {
    id, name, kind, level, grade, role, monsterStatus: status,
    stats, maxHp, hp: opts.hp != null ? Math.min(opts.hp, maxHp) : maxHp,
    statuses: [], cooldowns: {}, skills,
    points: 0, history: [], guarding: false, raged: false,
    telegraph: null, intent: null,
  };
}

// ---------------------------------------------------------------- durumlar
function getStatus(f, sid) { return f.statuses.find((s) => s.id === sid); }
function addStatus(f, sid, turns, value = null) {
  const ex = getStatus(f, sid);
  if (ex) { ex.turns = turns; ex.value = value; } else f.statuses.push({ id: sid, turns, value });
}
function removeStatus(f, sid) { f.statuses = f.statuses.filter((s) => s.id !== sid); }

function effCev(f) { const s = getStatus(f, 'yavas'); return f.stats.cev * (s ? s.value : 1); }
function effAtk(f, battle) {
  let a = f.stats.atk;
  const w = getStatus(f, 'zayif'); if (w) a *= w.value;
  if (f.kind === 'guardian' && f.hp < f.maxHp * R.ai.guardianRageBelowHp) a *= R.ai.guardianRageAtkMult;
  if (battle.tutorial && f === battle.enemy) a *= R.ai.tutorialFirstFightMonsterAtkMult;
  return a;
}
export function critChance(f) { const k = f.stats.krit; return Math.min(C().chanceCap, k / (k + 100)); }
export function blockChance(f) { const b = f.stats.blok; return Math.min(C().chanceCap, b / (b + 100)); }
export function dodgeChance(def, att) {
  const d = effCev(def), a = effCev(att);
  return Math.min(C().dodgeCap, d / (d + a + 100));
}
export function baseDamage(atk, def) { return atk * 100 / (100 + def); }

function healMult(b) { return b.turn >= C().fatigueTurn ? C().fatigueHealMult : 1; }
function fatigueMult(b) {
  const c = C();
  return b.turn >= c.fatigueTurn ? 1 + c.fatigueDamagePerTurn * (b.turn - c.fatigueTurn + 1) : 1;
}

const side = (b, f) => (f === b.player ? 'player' : 'enemy');
const other = (b, f) => (f === b.player ? b.enemy : b.player);

// ---------------------------------------------------------------- zincirler
/** f'nin geçmişine göre her zincirin ilerlemesi */
function chainProgress(f) {
  const h = f.history;
  return f.skills.chains.map((ch) => {
    let step = 0;
    for (let k = Math.min(ch.seq.length - 1, h.length); k > 0; k--) {
      let ok = true;
      for (let i = 0; i < k; i++) if (h[h.length - k + i] !== ch.seq[i]) { ok = false; break; }
      if (ok) { step = k; break; }
    }
    return { chain: ch, step };
  });
}
/** Arayüz için: [{chainId, name, step, len, next}] */
export function comboHints(battle, who = 'player') {
  const f = battle[who];
  return chainProgress(f).map(({ chain, step }) => ({
    chainId: chain.id, name: chain.name, step, len: chain.seq.length, next: chain.seq[step], seq: chain.seq.slice(),
  }));
}
/** Bu hamle bir zinciri tamamlıyor mu? */
function completingChain(f, move) {
  const h = [...f.history, move];
  for (const ch of f.skills.chains) {
    const n = ch.seq.length;
    if (h.length < n) continue;
    let ok = true;
    for (let i = 0; i < n; i++) if (h[h.length - n + i] !== ch.seq[i]) { ok = false; break; }
    if (ok) return ch;
  }
  return null;
}

// ---------------------------------------------------------------- savaş
/** startBattle(player, enemy, { rng, tutorial?, belt? }) */
export function startBattle(player, enemy, opts = {}) {
  const b = {
    turn: 0, player, enemy,
    belt: { ...(opts.belt || {}) },
    tutorial: !!opts.tutorial,
    rng: opts.rng || createRng(),
    over: false, winner: null, log: [],
    lastPlayerChoice: null, fatigueAnnounced: false,
  };
  planEnemy(b);
  return b;
}

export function canUse(battle, action, itemId) {
  const p = battle.player;
  if (battle.over) return false;
  switch (action) {
    case 'quick': case 'heavy': case 'guard': return true;
    case 'finisher': return p.points >= K().moves.finisher.minPoints;
    case 'flee': return p.kind === 'creature';
    case 'item': {
      const it = R.items[itemId];
      return !!it && it.beltAllowed !== false && (battle.belt[itemId] || 0) > 0;
    }
    default: return false;
  }
}

/** Oyuncu için önerilen hamle (süre dolunca / otomatik kombo) */
export function autoChoice(battle) { return decide(battle, battle.player, battle.enemy); }

/** Akıllı karar (oyuncu otomatiği ve yaratık düşmanlar ortak) */
function decide(b, f, foe) {
  const max = K().maxPoints;
  if (foe.telegraph && f === b.player) return { action: 'guard' };
  const prog = chainProgress(f);
  // bir zincir tek adım kaldıysa önce onu tamamla
  const ready = prog.find((p) => p.step === p.chain.seq.length - 1);
  if (ready) return { action: ready.chain.seq[ready.step] };
  if (f.points >= max) return { action: 'finisher' };
  // bitirici öldürecekse erken bitir
  if (f.points >= 3) {
    const mult = K().finisherBase + K().finisherPerPoint * f.points;
    if (baseDamage(f.stats.atk, foe.stats.def) * mult * 0.9 >= foe.hp) return { action: 'finisher' };
  }
  if (!prog.length) return { action: b.rng.chance(0.5) ? 'quick' : 'heavy' };
  // en ilerlemiş zincir; eşitse sıradaki
  let best = prog[0];
  for (const p of prog) if (p.step > best.step) best = p;
  if (best.step === 0) {
    // iyileştirme zinciri canı düşükken öncelikli
    const heal = prog.find((p) => p.chain.effect?.healMaxHp);
    if (heal && f.hp < f.maxHp * 0.6) best = heal;
  }
  return { action: best.chain.seq[best.step] };
}

/** Düşmanın bu turki niyetini belirler (tur BAŞINDA; arayüz telgrafı gösterir) */
function planEnemy(b) {
  const e = b.enemy, k = K();
  e.telegraph = null; e.intent = null;
  if (b.over) return;
  if (getStatus(e, 'sersem')) { e.intent = 'stunned'; return; }
  if (e.kind === 'creature') {
    // yaratık düşman (ayna/PvP denemesi): telgraf yok, iki taraf eşit koşulda
    const ch = decide(b, e, b.player);
    e.intent = ch.action === 'guard' ? 'quick' : ch.action;
    return;
  }
  const at = k.enemy.finisherAt[e.kind] ?? k.enemy.finisherAt.monster;
  if (e.points >= at) { e.intent = 'finisher'; e.telegraph = 'heavy'; return; }
  const tc = b.tutorial ? k.telegraphChanceTutorial : (e.kind === 'guardian' ? (k.telegraphChanceGuardian ?? k.telegraphChance) : k.telegraphChance);
  if (b.rng.chance(tc)) { e.intent = 'heavy'; e.telegraph = 'heavy'; return; }
  e.intent = 'quick';
}
export function enemyChoose(b) { return { action: b.enemy.intent || 'quick' }; }

function fleeChance(b) {
  if (b.enemy.kind === 'guardian') return 0.25;
  const p = effCev(b.player), e = effCev(b.enemy);
  return clamp(p / (p + e), 0.25, 0.75);
}

function addPoints(b, f, n, events) {
  if (!n) return;
  const before = f.points;
  f.points = Math.min(K().maxPoints, f.points + n);
  if (f.points !== before) events.push({ type: 'points', on: side(b, f), value: f.points });
}

/**
 * Tek vuruş. o: { move, mult, undodgeable, dodgeMult, dodgeAdd, critBonus, name, chainId }
 */
function strike(b, att, dfn, o, events) {
  const c = C(), k = K(), rng = b.rng;
  const ev = { type: 'hit', by: side(b, att), move: o.move, result: 'normal', dmg: 0 };
  if (o.name) ev.name = o.name;
  if (o.chainId) ev.chainId = o.chainId;

  if (!o.undodgeable) {
    const dc = Math.min(k.dodgeHardCap, dodgeChance(dfn, att) * (o.dodgeMult ?? 1) + (o.dodgeAdd ?? 0));
    if (rng.chance(dc)) { ev.result = 'dodge'; events.push(ev); return ev; }
  }
  let dmg = baseDamage(effAtk(att, b), dfn.stats.def) * rng.range(c.randMin, c.randMax) * (o.mult ?? 1);
  let blocked = false;
  const cc = Math.min(0.95, critChance(att) + (o.critBonus || 0));
  if (o.forceCrit || rng.chance(cc)) {
    dmg *= att.skills.passive?.effect?.critMult ?? c.critMult; ev.result = 'crit';
  } else if (rng.chance(blockChance(dfn))) {
    dmg *= c.blockMult; ev.result = 'block'; blocked = true;
  }
  if (dfn.guarding) dmg *= o.counterTaken ?? k.moves.guard.takenMult;
  const sh = getStatus(dfn, 'kalkan'); if (sh) dmg *= sh.value;
  dmg *= fatigueMult(b);
  dmg = Math.max(c.minDamage, Math.round(dmg));
  ev.dmg = dmg;
  dfn.hp = Math.max(0, dfn.hp - dmg);
  events.push(ev);

  // blokta karşı vuruş (Kusarikku pasifi)
  const cnt = dfn.skills.passive?.effect?.counterOnBlockAtkMult;
  if (blocked && cnt && dfn.hp > 0) {
    const cd = Math.max(c.minDamage, Math.round(effAtk(dfn, b) * cnt * fatigueMult(b)));
    att.hp = Math.max(0, att.hp - cd);
    events.push({ type: 'hit', by: side(b, dfn), move: 'counter', result: 'normal', dmg: cd, name: dfn.skills.passive.name, passive: true });
  }
  // yansıtma
  const rf = getStatus(dfn, 'yansitma');
  if (rf && dmg > 0 && att.hp > 0) {
    const rd = Math.max(c.minDamage, Math.round(dmg * rf.value));
    att.hp = Math.max(0, att.hp - rd);
    events.push({ type: 'hit', by: side(b, dfn), move: 'counter', result: 'normal', dmg: rd, name: STATUS_NAMES.yansitma, passive: true });
  }
  // canavarın durum etkisi
  if (att.kind !== 'creature' && att.monsterStatus && dfn.hp > 0) {
    const ce = R.statusEffects.canavar_etkisi;
    if (rng.chance(ce.chance)) {
      const val = Math.max(1, Math.round(effAtk(att, b) * 0.3));
      addStatus(dfn, att.monsterStatus, ce.turns, val);
      events.push({ type: 'status', on: side(b, dfn), status: att.monsterStatus, turns: ce.turns });
    }
  }
  return ev;
}

function heal(b, f, amount, source, events) {
  const amt = Math.round(amount * healMult(b));
  const before = f.hp;
  f.hp = Math.min(f.maxHp, f.hp + amt);
  events.push({ type: 'heal', on: side(b, f), amount: f.hp - before, source });
}

/** Zincir/bitirici etkileri (vuruş sonrası) */
function applyEffect(b, att, dfn, e, landed, events, scale = 1) {
  if (e.healMaxHp) heal(b, att, att.maxHp * e.healMaxHp * scale, 'zincir', events);
  if (e.shield) { addStatus(att, 'kalkan', e.shield.turns, e.shield.takenMult); events.push({ type: 'status', on: side(b, att), status: 'kalkan', turns: e.shield.turns }); }
  if (e.reflect) { addStatus(att, 'yansitma', e.reflect.turns, e.reflect.value); events.push({ type: 'status', on: side(b, att), status: 'yansitma', turns: e.reflect.turns }); }
  if (!landed || dfn.hp <= 0) return;
  if (e.poison) {
    const val = Math.max(1, Math.round(effAtk(att, b) * e.poison.perTurnAtkMult * scale));
    addStatus(dfn, 'zehir', e.poison.turns, val);
    events.push({ type: 'status', on: side(b, dfn), status: 'zehir', turns: e.poison.turns });
  }
  if (e.weaken) { addStatus(dfn, 'zayif', e.weaken.turns, e.weaken.atkMult); events.push({ type: 'status', on: side(b, dfn), status: 'zayif', turns: e.weaken.turns }); }
  if (e.slow) { addStatus(dfn, 'yavas', e.slow.turns, e.slow.cevMult); events.push({ type: 'status', on: side(b, dfn), status: 'yavas', turns: e.slow.turns }); }
  if (e.stunChance && b.rng.chance(e.stunChance)) {
    addStatus(dfn, 'sersem', R.statusEffects.sersem.turns);
    events.push({ type: 'status', on: side(b, dfn), status: 'sersem', turns: R.statusEffects.sersem.turns });
  }
}

function doMove(b, f, move, events) {
  const k = K(), foe = other(b, f);
  const mv = k.moves[move];
  const ch = completingChain(f, move);
  const opt = { move, mult: mv.mult, dodgeMult: mv.dodgeMult, dodgeAdd: mv.dodgeAdd };
  if (ch) {
    const e = ch.effect || {};
    opt.mult *= k.chainBonusMult * (e.damageMult ?? 1);
    opt.undodgeable = !!e.undodgeable;
    opt.critBonus = e.critBonus || 0;
    opt.name = ch.name; opt.chainId = ch.id;
  }
  const ev = strike(b, f, foe, opt, events);
  addPoints(b, f, mv.points, events);
  if (ch) {
    events.push({ type: 'combo', by: side(b, f), chainId: ch.id, name: ch.name });
    applyEffect(b, f, foe, ch.effect || {}, ev.result !== 'dodge', events);
    addPoints(b, f, k.chainExtraPoints, events);
    f.history = [];
  } else {
    f.history.push(move);
    if (f.history.length > 6) f.history.shift();
  }
}

function doFinisher(b, f, events, telegraphed = false) {
  const k = K(), foe = other(b, f), pts = f.points;
  const fin = f.skills.finisher || { id: 'bitirici', name: 'Bitirici', effect: {} };
  const e = fin.effect || {};
  let mult;
  if (f.kind === 'creature') mult = k.finisherBase + (k.finisherPerPoint + (e.perPointBonus || 0)) * pts;
  else mult = k.enemy.finisherBase + k.enemy.finisherPerPoint * pts;
  f.points = 0;
  events.push({ type: 'points', on: side(b, f), value: 0 });
  events.push({ type: 'finisher', by: side(b, f), points: pts, name: fin.name, id: fin.id });
  const ev = strike(b, f, foe, {
    move: 'finisher', mult, undodgeable: k.moves.finisher.undodgeable,
    forceCrit: !!(e.critAtMax && pts >= k.maxPoints), name: fin.name,
  }, events);
  const landed = ev.result !== 'dodge';
  if (e.poisonPerPoint && landed && foe.hp > 0) {
    const val = Math.max(1, Math.round(effAtk(f, b) * e.poisonPerPoint * pts));
    addStatus(foe, 'zehir', e.poisonTurns, val);
    events.push({ type: 'status', on: side(b, foe), status: 'zehir', turns: e.poisonTurns });
  }
  if (e.healPerPoint) heal(b, f, f.maxHp * e.healPerPoint * pts, fin.id, events);
  if (e.shieldPerPoint) {
    const v = Math.max(0.4, 1 - e.shieldPerPoint * pts);
    addStatus(f, 'kalkan', e.shieldTurns, v);
    events.push({ type: 'status', on: side(b, f), status: 'kalkan', turns: e.shieldTurns });
  }
  // canavar bitiricisinde kendi durum etkisi kesin
  if (f.kind !== 'creature' && f.monsterStatus && landed && foe.hp > 0) {
    const ce = R.statusEffects.canavar_etkisi;
    addStatus(foe, f.monsterStatus, ce.turns, Math.max(1, Math.round(effAtk(f, b) * 0.3)));
    events.push({ type: 'status', on: side(b, foe), status: f.monsterStatus, turns: ce.turns });
  }
  f.history = [];
}

function useItem(b, f, itemId, events) {
  b.belt[itemId] = (b.belt[itemId] || 0) - 1;
  events.push({ type: 'item', itemId });
  const m = f.maxHp;
  if (itemId === 'can_iksiri') heal(b, f, m * 0.35, itemId, events);
  else if (itemId === 'bandaj') {
    removeStatus(f, 'kanama');
    // ilk iyileşme hemen (düşman vurmadan önce), kalan 2 tur tur sonunda
    heal(b, f, m * 0.10, itemId, events);
    addStatus(f, 'bandaj', 2, Math.round(m * 0.10));
    events.push({ type: 'status', on: side(b, f), status: 'bandaj', turns: 2 });
  } else if (itemId === 'panzehir') {
    removeStatus(f, 'zehir'); removeStatus(f, 'yanik');
    heal(b, f, m * 0.10, itemId, events);
  }
}

/** Tek bir dövüşçünün eylemi. counterInfo: oyuncu savunurken düşman telgraflı vurdu mu */
function act(b, f, action, events) {
  const foe = other(b, f), k = K();
  if (action === 'quick' || action === 'heavy') {
    // savunan oyuncuya telgraflı ağır/bitirici gelirse → karşı saldırı
    if (f === b.enemy && foe.guarding && f.telegraph) return counterAttack(b, f, action, events);
    return doMove(b, f, action, events);
  }
  if (action === 'finisher') {
    if (f === b.enemy && foe.guarding && f.telegraph) return counterAttack(b, f, 'finisher', events);
    if (f.points < (k.moves.finisher.minPoints || 1)) return doMove(b, f, 'quick', events);
    return doFinisher(b, f, events);
  }
  // guard / item / flee: vuruş yok
}

function counterAttack(b, e, action, events) {
  const k = K(), p = b.player, cn = k.counter;
  events.push({ type: 'counter', by: 'player', against: action });
  // düşmanın vuruşu büyük ölçüde engellenir
  if (action === 'finisher') {
    const pts = e.points; e.points = 0; e.history = [];
    events.push({ type: 'points', on: 'enemy', value: 0 });
    events.push({ type: 'finisher', by: 'enemy', points: pts, name: e.skills.finisher?.name || 'Bitirici', id: e.skills.finisher?.id, countered: true });
    strike(b, e, p, { move: 'finisher', mult: k.enemy.finisherBase + k.enemy.finisherPerPoint * pts, undodgeable: true, counterTaken: cn.takenMult }, events);
  } else {
    strike(b, e, p, { move: action, mult: k.moves[action].mult, undodgeable: true, counterTaken: cn.takenMult }, events);
    addPoints(b, e, k.moves[action].points, events);
  }
  if (p.hp <= 0) return;
  const ev = strike(b, p, e, { move: 'counter', mult: cn.strikeMult, undodgeable: true, name: MOVE_NAMES.counter }, events);
  addPoints(b, p, cn.points, events);
  if (ev.result !== 'dodge' && e.hp > 0 && b.rng.chance(cn.stunChance)) {
    addStatus(e, 'sersem', R.statusEffects.sersem.turns);
    events.push({ type: 'status', on: 'enemy', status: 'sersem', turns: R.statusEffects.sersem.turns });
  }
}

function endOfTurn(b, events) {
  for (const f of [b.player, b.enemy]) {
    if (f.hp <= 0) continue;
    for (const s of f.statuses) {
      if (DOT_IDS.includes(s.id) && s.value) {
        const d = Math.max(1, Math.round(s.value * fatigueMult(b)));
        f.hp = Math.max(0, f.hp - d);
        events.push({ type: 'dot', on: side(b, f), status: s.id, dmg: d });
      } else if (s.id === 'bandaj' && s.value) {
        heal(b, f, s.value, 'bandaj', events);
      }
    }
    const regen = f.skills.passive?.effect?.regenMaxHpPerTurn;
    if (regen && f.hp > 0 && f.hp < f.maxHp) heal(b, f, f.maxHp * regen, f.skills.passive.id, events);
  }
  for (const f of [b.player, b.enemy]) {
    for (const s of f.statuses) if (s.id !== 'sersem') s.turns -= 1;
    f.statuses = f.statuses.filter((s) => s.turns > 0);
    f.guarding = false;
  }
}

function checkEnd(b, events) {
  const pDead = b.player.hp <= 0, eDead = b.enemy.hp <= 0;
  if (!pDead && !eDead) return false;
  b.over = true;
  b.winner = pDead ? 'enemy' : 'player'; // ikisi birden ölürse oyuncu kaybeder
  b.enemy.telegraph = null;
  events.push({ type: 'end', winner: b.winner });
  return true;
}

/** playTurn(battle, {action, itemId?}) -> Event[] */
export function playTurn(b, choice) {
  if (b.over) return [];
  const events = [];
  const c = C();
  b.turn += 1;
  choice = { ...(choice || {}) };
  if (!choice.action) choice = autoChoice(b);
  if (!canUse(b, choice.action, choice.itemId)) choice = { action: 'quick' };
  const p = b.player, e = b.enemy;
  const ec = enemyChoose(b);
  b.lastPlayerChoice = { ...choice };

  if (e.telegraph) events.push({ type: 'telegraph', on: 'enemy', move: e.telegraph, intent: e.intent });
  if (b.turn === c.fatigueTurn && !b.fatigueAnnounced) { b.fatigueAnnounced = true; events.push({ type: 'fatigue' }); }
  // bitirici, kemer eşyası ve kaçış zinciri sıfırlar; savunma sürdürür
  if (choice.action === 'finisher' || choice.action === 'item' || choice.action === 'flee') p.history = [];
  p.guarding = choice.action === 'guard';
  if (p.guarding) events.push({ type: 'defend', by: 'player' }); // savunma zinciri bozmaz (tepki hamlesi)
  if (e.kind === 'guardian' && !e.raged && e.hp < e.maxHp * R.ai.guardianRageBelowHp) {
    e.raged = true; events.push({ type: 'status', on: 'enemy', status: 'ofke', turns: 99 });
  }

  if (choice.action === 'flee') {
    const ok = b.rng.chance(fleeChance(b));
    events.push({ type: 'flee', ok });
    if (ok) { b.over = true; b.winner = 'fled'; e.telegraph = null; events.push({ type: 'end', winner: 'fled' }); b.log.push(...events); return events; }
  }
  if (choice.action === 'item') useItem(b, p, choice.itemId, events);

  const pc = effCev(p), ecv = effCev(e);
  // Eşya kullanılan turda eşya her zaman önce işler; sonra düşman hamlesini yapar.
  const first = choice.action === 'item' ? 'player' : pc > ecv ? 'player' : pc < ecv ? 'enemy' : (b.rng.chance(0.5) ? 'player' : 'enemy');
  events.push({ type: 'order', first });
  const seq = first === 'player' ? [[p, choice.action], [e, ec.action]] : [[e, ec.action], [p, choice.action]];
  for (const [f, action] of seq) {
    if (f.hp <= 0 || other(b, f).hp <= 0) continue;
    if (getStatus(f, 'sersem')) { removeStatus(f, 'sersem'); events.push({ type: 'stun', on: side(b, f) }); continue; }
    act(b, f, action, events);
  }
  if (!checkEnd(b, events)) {
    endOfTurn(b, events);
    checkEnd(b, events);
  }
  if (!b.over) planEnemy(b); else e.telegraph = null;
  b.log.push(...events);
  return events;
}

// ---------------------------------------------------------------- politikalar & simülasyon
/** Akıllı politika: zinciri tamamlar, telgrafta savunur, 5 puanda (ya da öldürecekse) bitirir */
export function smartPolicy(b) { return autoChoice(b); }
/** Düz politika: rastgele hızlı/ağır, savunma ve bitirici yok */
export function flatPolicy(b) { return { action: b.rng.chance(0.5) ? 'quick' : 'heavy' }; }

/**
 * simulate(n, setupFn, { policy?, maxTurns?, seed? })
 * setupFn(i, rng) -> { player, enemy, tutorial?, belt? }
 */
export function simulate(n, setupFn, opts = {}) {
  const rng = createRng(opts.seed ?? 12345);
  const policy = opts.policy || smartPolicy;
  const maxTurns = opts.maxTurns ?? 100;
  let wins = 0, fled = 0, timeouts = 0, turns = 0, hpLostWin = 0, combos = 0, counters = 0, finishers = 0;
  for (let i = 0; i < n; i++) {
    const s = setupFn(i, rng);
    const b = startBattle(s.player, s.enemy, { rng, tutorial: s.tutorial, belt: s.belt });
    while (!b.over && b.turn < maxTurns) {
      const ev = playTurn(b, policy(b));
      for (const x of ev) {
        if (x.type === 'combo' && x.by === 'player') combos++;
        else if (x.type === 'counter') counters++;
        else if (x.type === 'finisher' && x.by === 'player') finishers++;
      }
    }
    if (!b.over) timeouts++;
    if (b.winner === 'player') { wins++; hpLostWin += 1 - b.player.hp / b.player.maxHp; }
    if (b.winner === 'fled') fled++;
    turns += b.turn;
  }
  return {
    n, winRate: wins / n, fledRate: fled / n, timeoutRate: timeouts / n,
    avgTurns: turns / n, avgHpLostOnWin: wins ? hpLostWin / wins : null,
    combosPerFight: combos / n, countersPerFight: counters / n, finishersPerFight: finishers / n,
  };
}
