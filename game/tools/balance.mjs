// Denge ölçümü: node tools/balance.mjs [N]
import fs from 'fs';
import { setRules, makeCombatant, simulate } from '../src/core/combat.js';
const R = JSON.parse(fs.readFileSync(new URL('../src/data/rules.json', import.meta.url)));
setRules(R);
const N = +process.argv[2] || 3000;
const CR = Object.keys(R.creatures).filter((k) => !R.creatures[k].legacy);
const pct = (x) => (100 * x).toFixed(0) + '%';

import { beltPolicy } from './policy.mjs';
const out = {};
// 1) S vs C aynı yaratık, 13. seviye
out.svc = {};
for (const id of CR) {
  const r = simulate(N, () => ({ player: makeCombatant({ kind: 'creature', id, level: 13, grade: 'S' }), enemy: makeCombatant({ kind: 'creature', id, level: 13, grade: 'C' }) }));
  out.svc[id] = r;
}
// 2) Sıradan canavar aynı seviye
out.mob = {};
for (const id of CR) for (const z of R.zones) for (const m of z.monsters) {
  const lv = Math.round((m.levels[0] + m.levels[1]) / 2);
  const r = simulate(Math.min(N, 1000), () => ({ player: makeCombatant({ kind: 'creature', id, level: lv, grade: 'C' }), enemy: makeCombatant({ kind: 'monster', id: m.id, level: lv }) }));
  (out.mob[id] ||= []).push([m.id, lv, r.avgTurns, r.winRate, r.avgHpLostOnWin]);
}
// 3) Bekçi: bölge üst seviyesindeki oyuncu (bekçi seviyesi), kemer dolu
const belt = { can_iksiri: 1, bandaj: 3, panzehir: 2 };
out.guard = {};
for (const z of R.zones) {
  const g = z.guardian, lv = z.levels[1];
  out.guard[g.id] = {};
  for (const id of CR) {
    const r = simulate(N, () => ({ player: makeCombatant({ kind: 'creature', id, level: lv, grade: 'C' }), enemy: makeCombatant({ kind: 'monster', id: g.id, level: g.level }), belt: { ...belt } }), { policy: beltPolicy });
    out.guard[g.id][id] = r.winRate;
  }
}
console.log('S vs C (13):', Object.entries(out.svc).map(([k, r]) => `${k} ${pct(r.winRate)} (${r.avgTurns.toFixed(1)}t)`).join(' | '));
for (const [id, rows] of Object.entries(out.mob)) console.log('mob', id, rows.map(([m, lv, t, w, h]) => `${m}@${lv} ${t.toFixed(1)}t ${pct(w)} -${pct(h ?? 0)}`).join(' | '));
for (const [g, rows] of Object.entries(out.guard)) console.log('bekçi', g, Object.entries(rows).map(([k, w]) => `${k} ${pct(w)}`).join(' | '));
if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(out));
