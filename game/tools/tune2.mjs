import fs from 'fs';
import { setRules, makeCombatant, simulate } from '../src/core/combat.js';
import { beltPolicy } from './policy.mjs';
const P = new URL('../src/data/rules.json', import.meta.url);
const R = JSON.parse(fs.readFileSync(P));
setRules(R);
const CR = Object.keys(R.creatures).filter((k) => !R.creatures[k].legacy);
const belt = { can_iksiri: 1, bandaj: 3, panzehir: 2 };
const target = { lahmu: 0.775, anzu: 0.625, usumgallu: 0.575 };
const N = 600;
for (const z of R.zones) {
  const g = z.guardian, lv = z.levels[1];
  const base = { ...g.mods };
  const run = (f) => {
    g.mods = { ...base, atk: +(base.atk * f).toFixed(3) };
    const rs = CR.map((id) => simulate(N, () => ({ player: makeCombatant({ kind: 'creature', id, level: lv }), enemy: makeCombatant({ kind: 'monster', id: g.id, level: g.level }), belt: { ...belt } }), { seed: 5, policy: beltPolicy }).winRate);
    return rs.reduce((a, b) => a + b, 0) / rs.length;
  };
  let lo = 0.6, hi = 1.6;
  for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (run(m) > target[g.id]) lo = m; else hi = m; }
  const f = (lo + hi) / 2; const w = run(f);
  console.log(g.id, 'f', f.toFixed(3), 'mods', JSON.stringify(g.mods), 'win', w.toFixed(3));
}
fs.writeFileSync(P, JSON.stringify(R, null, 1));
