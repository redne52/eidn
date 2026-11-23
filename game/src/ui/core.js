// Arayüzün çekirdeğe tek giriş kapısı — GERÇEK çekirdek (combat.js + world.js + save.js).
// Mantık çekirdekte; burada sadece arayüzün kullandığı küçük kolaylık adları var (uyarlayıcı).
// (Eski sahte çekirdek ./_mock.js artık kullanılmıyor.)
import * as world from '../core/world.js';
import * as save from '../core/save.js';

import * as realCombat from '../core/combat.js';
import * as mock2 from './_mockCombat2.js';
export { makeCombatant, startBattle, STATUS_NAMES } from '../core/combat.js';
// v2 savaş (zincir kombo): gerçek motor comboHints verince otomatik ona geçer; yoksa geçici taklit.
const RC = { ...realCombat };
export const COMBAT_V2_REAL = typeof RC.comboHints === 'function';
const V2 = COMBAT_V2_REAL ? RC : mock2;
export const playTurn = (...a) => V2.playTurn(...a);
export const canUse = (...a) => V2.canUse(...a);
export const autoChoice = (...a) => V2.autoChoice(...a);
export const comboHints = (...a) => V2.comboHints(...a);
export { ozToNext, levelDiffInfo, growthStage, zoneLayout } from '../core/world.js';
export const loadSave = save.loadSave;
export const writeSave = save.saveGame;
export const clearSave = save.clearSave;

export function createGame(saveData = null, opts = {}) {
  const g = world.createGame(saveData, opts);

  // Seviye rengi: { color, mult, diff }
  g.levelColor = (monsterLevel) => world.levelDiffInfo(g.creature ? g.creature.level : 1, monsterLevel);
  g.ozToNext = () => g.ozNeeded();
  Object.defineProperty(g, 'bankedOz', { get: () => (g.creature ? g.creature.oz : 0) });
  Object.defineProperty(g, 'returning', { get: () => (g.returnSpell ? Math.max(0.001, g.returnSpell.remaining) : 0) });
  g.returnToGate = () => g.startReturn();

  // Kapıya varış özeti (arayüzdeki varış ekranı için)
  let runFrom = null, deposited = 0;
  g.on('runStart', () => { runFrom = g.creature.level; deposited = 0; });
  g.on('deposit', (e) => { deposited += e.amount || 0; });
  g.on('death', (e) => { g.lastDeath = e; });
  g.on('arriveGate', (e) => {
    g.lastArrival = { deposited, from: runFrom ?? g.creature.level, to: g.creature.level, dead: e.how === 'death', how: e.how };
    deposited = 0; runFrom = null;
  });
  return g;
}
