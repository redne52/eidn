// Edin — Kayıt (DÜNYA PROGRAMCISI). localStorage yoksa bellek içi yedek.
// Anahtar v1'den beri aynı ('edin.save.v1'); sürüm kaydın içindeki version alanındadır. Geçiş: migrate.js.
import { migrateSave } from './migrate.js';
export { migrateSave };
export const SAVE_KEY = 'edin.save.v1';

const memory = new Map();
function store() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const k = '__edin_test__';
      localStorage.setItem(k, '1'); localStorage.removeItem(k);
      return localStorage;
    }
  } catch (e) { /* gizli mod vb. */ }
  return { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
}

export function saveGame(game) {
  try { store().setItem(SAVE_KEY, JSON.stringify(game.toSave())); return true; } catch (e) { return false; }
}

export function loadSave() {
  try {
    const raw = store().getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return migrateSave(data); // v1/v2 → v3 (kadro + çekirdek); tanınmayan → null
  } catch (e) { return null; }
}

export function hasSave() { return !!loadSave(); }
export function clearSave() { try { store().removeItem(SAVE_KEY); } catch (e) { /* yok say */ } }

// Otomatik kayıt: önemli olaylarda ve her N saniyede bir kaydeder. Geri dönüş: durdurma fonksiyonu.
export function autoSave(game, everySeconds = 10) {
  const evts = ['deposit', 'levelUp', 'fightEnd', 'bond', 'hatch', 'egg', 'buy', 'belt', 'zoneChanged', 'arriveGate', 'death', 'settings', 'zoneUnlocked', 'coresOpened', 'pullKept', 'pullFed', 'activeChanged', 'coresDeposited', 'coresWithdrawn', 'coreBagUpgraded', 'muhurUsed', 'coresDropped', 'corePicked', 'eggResult'];
  const offs = evts.map((e) => game.on(e, () => saveGame(game)));
  let acc = 0, lastClock = game.clock;
  const offTick = game.on('*', () => {
    acc += game.clock - lastClock; lastClock = game.clock;
    if (acc >= everySeconds) { acc = 0; saveGame(game); }
  });
  return () => { offs.forEach((f) => f()); offTick(); };
}
