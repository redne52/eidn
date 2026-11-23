import { smartPolicy, canUse, comboHints } from '../src/core/combat.js';
// Kemer kullanan akıllı politika: can <%40 iksir (her zaman); bandaj/panzehir sadece zincir ortasında değilken
// (kemer eşyası zinciri sıfırlar); telgrafta savunma önceliklidir
export function beltPolicy(b) {
  const p = b.player, c = smartPolicy(b);
  const has = (s) => p.statuses.some((x) => x.id === s);
  const r = p.hp / p.maxHp;
  if (r < 0.4 && canUse(b, 'item', 'can_iksiri')) return { action: 'item', itemId: 'can_iksiri' };
  if (c.action === 'guard') return c;
  const midChain = comboHints(b).some((h) => h.step > 0);
  if (midChain && r >= 0.3) return c;
  if ((has('zehir') || has('yanik')) && r < 0.7 && canUse(b, 'item', 'panzehir')) return { action: 'item', itemId: 'panzehir' };
  if (r < 0.55 && !has('bandaj') && canUse(b, 'item', 'bandaj')) return { action: 'item', itemId: 'bandaj' };
  return c;
}
