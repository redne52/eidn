// GEÇİCİ: v2 savaş API'si (CONTRACT-v2-savas.md) gerçek combat.js'te yokken arayüzün çalışması için
// eski motorun üstüne ince bir taklit. Gerçek motor comboHints'i dışa verince core.js otomatik geçer.
import R from '../data/rules.json';
import * as C from '../core/combat.js';

const DEFAULT_CHAINS = {
  ugallu: [
    { id: 'firtina_pencesi', name: 'Fırtına Pençesi', seq: ['quick', 'quick', 'heavy'] },
    { id: 'kukreme', name: 'Kükreme', seq: ['heavy', 'guard', 'heavy'], minLevel: 5 },
    { id: 'aslan_firtinasi', name: 'Aslan Fırtınası', seq: ['quick', 'heavy', 'quick', 'heavy'], minLevel: 10, minGrade: 'A' },
  ],
  girtablullu: [
    { id: 'zehirli_igne', name: 'Zehirli İğne', seq: ['quick', 'heavy'] },
    { id: 'kuyruk_karsiligi', name: 'Kuyruk Karşılığı', seq: ['guard', 'quick', 'quick'], minLevel: 5 },
    { id: 'akrep_dansi', name: 'Akrep Dansı', seq: ['quick', 'quick', 'quick', 'heavy'], minLevel: 10, minGrade: 'A' },
  ],
  kulullu: [
    { id: 'apsunun_suyu', name: "Apsû'nun Suyu", seq: ['guard', 'quick'] },
    { id: 'dalga', name: 'Dalga', seq: ['quick', 'heavy', 'heavy'], minLevel: 5 },
    { id: 'derin_akinti', name: 'Derin Akıntı', seq: ['guard', 'guard', 'heavy'], minLevel: 10, minGrade: 'A' },
  ],
  kusarikku: [
    { id: 'koruyucu_siper', name: 'Koruyucu Siper', seq: ['guard', 'heavy'] },
    { id: 'boynuz_hucumu', name: 'Boynuz Hücumu', seq: ['heavy', 'heavy', 'quick'], minLevel: 5 },
    { id: 'boga_depremi', name: 'Boğa Depremi', seq: ['guard', 'heavy', 'heavy', 'heavy'], minLevel: 10, minGrade: 'A' },
  ],
};
const GR = { C: 0, B: 1, A: 2, S: 3 };
const MAXP = 5;

function chainsOf(f) {
  const src = (R.creatures[f.id] && R.creatures[f.id].chains) || DEFAULT_CHAINS[f.id] || DEFAULT_CHAINS.ugallu;
  return src.filter((c) => (f.level || 1) >= (c.minLevel || 1) && GR[f.grade || 'C'] >= GR[c.minGrade || 'C']);
}
function ensure(b) {
  if (b._v2) return;
  b._v2 = true;
  b.player.points = b.player.points || 0; b.enemy.points = b.enemy.points || 0;
  b.player.chainProgress = []; b.player.chains = chainsOf(b.player);
  rollTelegraph(b);
}
function rollTelegraph(b) { b.enemy.telegraph = !b.over && Math.random() < 0.5 ? 'heavy' : null; }
function matched(progress, seq) {
  for (let k = Math.min(progress.length, seq.length); k > 0; k--) {
    let ok = true; for (let i = 0; i < k; i++) if (progress[progress.length - k + i] !== seq[i]) { ok = false; break; }
    if (ok) return k;
  }
  return 0;
}

export function comboHints(b) {
  ensure(b);
  return b.player.chains.map((c) => { const step = matched(b.player.chainProgress, c.seq); return { chainId: c.id, name: c.name, seq: c.seq, step: step >= c.seq.length ? 0 : step, len: c.seq.length, next: c.seq[step >= c.seq.length ? 0 : step] }; });
}
export function canUse(b, action, itemId) {
  ensure(b);
  if (action === 'finisher') return b.player.points >= 1;
  if (action === 'quick' || action === 'heavy' || action === 'guard') return true;
  return C.canUse(b, action, itemId);
}
export function autoChoice(b) {
  ensure(b);
  if (b.enemy.telegraph === 'heavy') return { action: 'guard' };
  if (b.player.points >= MAXP) return { action: 'finisher' };
  const h = comboHints(b).sort((a, z) => z.step - a.step)[0];
  return { action: h ? h.next : 'quick' };
}
const ZONES = R.constants.zones;
export function playTurn(b, choice) {
  ensure(b);
  const move = choice.action;
  const old = { attackZone: ZONES[Math.floor(Math.random() * ZONES.length)], guardZone: ZONES[Math.floor(Math.random() * ZONES.length)], action: 'attack', itemId: choice.itemId };
  if (move === 'guard') old.action = 'defend';
  else if (move === 'finisher') old.action = C.canUse(b, 'skill') ? 'skill' : 'attack';
  else if (move === 'item' || move === 'flee') old.action = move;
  const pre = [];
  if (b.enemy.telegraph === 'heavy' && move === 'guard') pre.push({ type: 'counter', by: 'player' });
  if (move === 'finisher') pre.push({ type: 'finisher', by: 'player', points: b.player.points, name: (b.player.chains[0] || {}).name || 'Bitirici' });
  const evs = C.playTurn(b, old);
  const out = [...pre];
  for (const e of evs) {
    if (e.type === 'hit') { e.move = e.by === 'player' ? (move === 'guard' ? 'counter' : move) : (b.enemy.telegraph === 'heavy' ? 'heavy' : 'quick'); if (e.result === 'guarded') e.result = 'block'; }
    if (e.type === 'end') {
      // önce puan/kombo, sonra son
      out.push(...after(b, move)); out.push(e); continue;
    }
    out.push(e);
  }
  if (!evs.some((e) => e.type === 'end')) out.push(...after(b, move));
  rollTelegraph(b);
  if (b.enemy.telegraph) out.push({ type: 'telegraph', on: 'enemy', move: 'heavy' });
  return out;
}
function after(b, move) {
  const out = [];
  const P = b.player;
  if (move === 'finisher') { P.points = 0; P.chainProgress = []; out.push({ type: 'points', on: 'player', value: 0 }); return out; }
  if (move === 'quick' || move === 'heavy' || move === 'guard') {
    P.chainProgress.push(move); if (P.chainProgress.length > 6) P.chainProgress.shift();
    let gain = move === 'guard' ? 0 : 1;
    if (move === 'guard' && out.length === 0 && b.enemy.telegraph === 'heavy') gain = 1;
    for (const c of P.chains) {
      const k = matched(P.chainProgress, c.seq);
      if (k === c.seq.length) { out.push({ type: 'combo', by: 'player', chainId: c.id, name: c.name }); gain += 1; P.chainProgress = []; break; }
    }
    P.points = Math.min(MAXP, P.points + gain);
    out.push({ type: 'points', on: 'player', value: P.points });
    if (Math.random() < 0.4) { b.enemy.points = Math.min(MAXP, (b.enemy.points || 0) + 1); out.push({ type: 'points', on: 'enemy', value: b.enemy.points }); }
  }
  return out;
}
