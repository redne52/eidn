// node tools/sim2.mjs [N] — v2 kombo denge ölçümü
import fs from 'fs';
import { setRules, makeCombatant, simulate, flatPolicy, smartPolicy } from '../src/core/combat.js';
import { beltPolicy } from './policy.mjs';
const R = JSON.parse(fs.readFileSync(new URL('../src/data/rules.json', import.meta.url)));
setRules(R);
const N = +process.argv[2] || 2000;
const CR = Object.keys(R.creatures).filter((k) => !R.creatures[k].legacy);
const pct = (x) => (100 * (x ?? 0)).toFixed(0) + '%';
const mob = (lv) => makeCombatant({ kind: 'monster', id: 'test', level: lv, mods: {} });
console.log('-- sıradan canavar: akıllı vs düz (tur / can kaybı / kazanma)');
for (const id of CR) {
  const row = [];
  for (const lv of [1, 5, 9, 13]) {
    const s = simulate(N, () => ({ player: makeCombatant({ kind: 'creature', id, level: lv }), enemy: mob(lv) }), { seed: lv, policy: smartPolicy });
    const f = simulate(N, () => ({ player: makeCombatant({ kind: 'creature', id, level: lv }), enemy: mob(lv) }), { seed: lv, policy: flatPolicy });
    row.push(`sv${lv} A ${s.avgTurns.toFixed(1)}t -${pct(s.avgHpLostOnWin)} k${s.combosPerFight.toFixed(1)} | D ${f.avgTurns.toFixed(1)}t -${pct(f.avgHpLostOnWin)} ${pct(f.winRate)}`);
  }
  console.log(id.padEnd(12), row.join(' || '));
}
console.log('-- Kıyı canavarları düz politika (sv eşit)');
for (const id of CR) {
  const out = [];
  for (const m of R.zones[0].monsters) for (const lv of [m.levels[0], m.levels[1]]) {
    const f = simulate(N, () => ({ player: makeCombatant({ kind: 'creature', id, level: lv }), enemy: makeCombatant({ kind: 'monster', id: m.id, level: lv }) }), { seed: 3, policy: flatPolicy });
    out.push(`${m.id}@${lv} ${pct(f.winRate)} ${f.avgTurns.toFixed(1)}t`);
  }
  console.log(id.padEnd(12), out.join(' | '));
}
console.log('-- S vs C 13. sv (akıllı)');
console.log(CR.map((id) => { const r = simulate(N, () => ({ player: makeCombatant({ kind: 'creature', id, level: 13, grade: 'S' }), enemy: makeCombatant({ kind: 'creature', id, level: 13, grade: 'C' }) }), { seed: 11 }); return `${id} ${pct(r.winRate)} ${r.avgTurns.toFixed(1)}t`; }).join(' | '));
console.log('-- bekçiler (bölge üst seviyesi, C, kemer, akıllı)');
const belt = { can_iksiri: 1, bandaj: 3, panzehir: 2 };
for (const z of R.zones) {
  const g = z.guardian, lv = z.levels[1];
  const rs = CR.map((id) => simulate(N, () => ({ player: makeCombatant({ kind: 'creature', id, level: lv }), enemy: makeCombatant({ kind: 'monster', id: g.id, level: g.level }), belt: { ...belt } }), { seed: 5, policy: beltPolicy }));
  const avg = rs.reduce((a, r) => a + r.winRate, 0) / rs.length;
  console.log(g.id.padEnd(10), 'ort', pct(avg), '|', CR.map((id, i) => `${id} ${pct(rs[i].winRate)} ${rs[i].avgTurns.toFixed(1)}t k${rs[i].combosPerFight.toFixed(1)} c${rs[i].countersPerFight.toFixed(1)}`).join(' | '));
}
