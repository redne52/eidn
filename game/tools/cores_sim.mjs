// v4.1 Ruh Çekirdeği simülasyonu.
//   node tools/cores_sim.mjs [N=200]          → 1→13 (iki mitolojik aday × iki başlangıç seviyesi kuralı)
//   COLLECT=1 node tools/cores_sim.mjs [N]    → 13'ten sonra 4 mitolojiğin toplanması (AYRI ölçüm)
// Oyunun gerçek çekirdeği (world.js + combat.js) ile oynar; politika playthrough.mjs ile aynı + çekirdek politikası.
import { createGame, ozToNext } from '../src/core/world.js';
import * as combat from '../src/core/combat.js';
import { beltPolicy } from './policy.mjs';
import rules from '../src/data/rules.json' with { type: 'json' };

const SC = rules.soulCores;
const RANK = { C: 0, B: 1, A: 2, S: 3 };
const TOTAL_OZ = Array.from({ length: 12 }, (_, i) => ozToNext(i + 1)).reduce((a, b) => a + b, 0);

/** Kapıdaki çekirdek politikası: hepsini aç (10'lu öncelikli); mitolojiği tut; daha iyi dereceyi tut; gerisini yedir. */
function gatePolicy(g, st, t, { switchOnBetter = true } = {}) {
  // switchOnBetter: true = her daha iyi dereceye geç; 'high' = yalnız A/S ya da mitolojik ve aktiften iyiyse geç; false = hiç geçme
  for (const type of SC.order) {
    for (let guard = 0; guard < 50; guard++) {
      const have = g.cores.bag[type] + g.cores.depot[type];
      if (have <= 0) break;
      const r = g.openCores(type, have >= 10 ? 10 : 1);
      if (!r.ok) break;
      st.opened[type] = (st.opened[type] || 0) + (have >= 10 ? 10 : 1);
    }
  }
  for (const p of g.pendingPulls()) {
    if (p.mythic) {
      st.mythics.push(t); st.mythicSpecies.add(p.species);
      if (st.firstMythic == null) st.firstMythic = t;
    }
    const other = g.roster.find((c) => c.uid !== g.activeUid);
    const better = (x) => p.mythic || RANK[p.grade] > RANK[x.grade];
    let res;
    if (p.mythic || (g.roster.length < SC.rosterMax && RANK[p.grade] >= 1) || (other && better(other) && RANK[p.grade] >= 1)) {
      res = g.resolvePull(p.id, 'keep', other && g.roster.length >= SC.rosterMax ? { replaceUid: other.uid } : {});
    }
    if (!res || !res.ok) { const f = g.resolvePull(p.id, 'feed'); if (f.ok) st.fedOz += f.oz; continue; }
    st.kept++;
    const act = g.activeChar();
    // geçiş: yeni karakter aktiften belirgin iyiyse (mitolojik ya da daha yüksek derece) aktif yapılır
    const upgrade = act && (p.mythic && !act.mythic || RANK[p.grade] > RANK[act.grade]);
    if (act && switchOnBetter && upgrade && (switchOnBetter !== 'high' || p.mythic || RANK[p.grade] >= 2)) {
      const prevLevel = act.level;
      g.setActive(res.char.uid);
      st.switches.push({ t, from: prevLevel, start: res.char.level, back: null });
    }
  }
  // geçiş sonrası eski seviyeye dönüş süresi
  for (const sw of st.switches) if (sw.back == null && g.creature.level >= sw.from) sw.back = t - sw.t;
}

export function run(seed, { candidate = 'A', startMode = 'percentOfMax', collect = false, maxHours = 12, collectHours = 60, switchOnBetter = true } = {}) {
  SC.mythicActive = candidate;
  SC.newCharStart.mode = startMode;
  const g = createGame(null, { seed });
  g.startNewGame(); g.chooseStarter(SC.dragonPool[seed % 4]);
  const C = rules.constants, FIGHT_SEC = 30, GATE_SEC = 20, EAT_AT = 0.75;
  let t = 0;
  const st = { opened: {}, mythics: [], mythicSpecies: new Set(), firstMythic: null, fedOz: 0, kept: 0, switches: [], drops: {}, t13: null, deaths: 0 };
  g.on('coresDropped', (d) => { for (const c of d.cores) st.drops[c.type] = (st.drops[c.type] || 0) + 1; });
  const adv = (sec) => { let s = sec; while (s > 0) { const d = Math.min(0.5, s); g.tick(d, { x: 0, z: 0 }); s -= d; } t += sec; };
  const prepBelt = () => {
    const want = [['can_iksiri', 1], ['bandaj', 3], ['panzehir', 2], ['bandaj', 3]];
    want.forEach(([id], i) => { if (!g.belt[i] || g.belt[i].itemId !== id) g.setPocket(i, null); });
    for (const [id] of want) {
      const have = (g.bag[id] || 0) + g.belt.filter((p) => p && p.itemId === id).reduce((a, p) => a + p.count, 0);
      const need = want.filter(([x]) => x === id).reduce((a, [, k]) => a + k, 0) - have;
      for (let k = 0; k < need; k++) if (!g.buy(id)) break;
    }
    want.forEach(([id], i) => { if (!g.belt[i]) g.setPocket(i, id); });
    g.refillBelt();
  };
  const zoneFor = () => {
    const lv = g.creature.level; let best = rules.zones[0].id;
    for (const z of rules.zones) if (g.unlockedZones.includes(z.id) && lv >= z.levels[0]) best = z.id;
    return best;
  };
  const done = () => (collect ? st.mythicSpecies.size >= SC.mythicPool.length || t > collectHours * 3600 : g.creature.level >= 13 || t > maxHours * 3600);
  let guardTry = {};
  while (!done()) {
    if (g.screen === 'dead') g.dismissDeath();
    gatePolicy(g, st, t, { switchOnBetter });
    if (g.creature.level >= 13 && st.t13 == null) st.t13 = t;
    if (done()) break;
    prepBelt(); adv(GATE_SEC);
    for (let w = 0; !g.canEnterZone(zoneFor()) && w < 100; w++) adv(5);
    g.enterZone(zoneFor());
    const zone = rules.zones.find((z) => z.id === g.zoneId);
    guardTry = {};
    for (let loop = 0; loop < 5000; loop++) {
      const lv = g.creature.level, hpR = g.creature.hp / g.maxHp();
      const beltLeft = g.belt.filter(Boolean).reduce((a, p) => a + p.count, 0);
      const levelReady = lv < 13 && g.creature.oz + g.carriedOz >= ozToNext(lv);
      const runLong = collect && lv >= 13 && g.carriedOz > 2000; // 13'ten sonra: sefer sonu
      if (levelReady || runLong || hpR < 0.35 || (hpR < 0.5 && beltLeft === 0)) {
        g.startReturn(); let s = 0;
        while (g.screen === 'world' && s < 30) { adv(0.5); s += 0.5; if (g.pendingFightUid) break; }
        if (!(g.screen === 'world' && g.pendingFightUid)) break;
      }
      if (!g.pendingFightUid) {
        const walk = (p) => { const d = Math.hypot(p.x - g.pos.x, p.z - g.pos.z); g.pos = { x: p.x, z: p.z }; adv(d / C.moveSpeed); };
        const nd = g.zoneNodes().filter((n) => n.ready && g.resourceRoom(n.type) > 0).sort((a, b) => Math.hypot(a.x - g.pos.x, a.z - g.pos.z) - Math.hypot(b.x - g.pos.x, b.z - g.pos.z))[0];
        if (nd && Math.hypot(nd.x - g.pos.x, nd.z - g.pos.z) < 14) { walk(nd); g.tick(0.01); if (g.startGather(nd.id)) adv(rules.resources.gatherSeconds + 0.2); }
        const cookable = Object.keys(rules.recipes.list).filter((id) => Object.entries(rules.recipes.list[id].needs).every(([k, n]) => (g.resources[k] || 0) >= n));
        if (g.creature.hp / g.maxHp() < EAT_AT && g.edibles().length === 0 && cookable.length && g.cooksLeft() > 0) {
          walk(g.layout().camp); g.tick(0.01);
          for (const id of ['ruhlu_et', 'sifali_yahni', 'pismis_et']) while (g.cook(id));
          adv(rules.recipes.cookSeconds * 2);
        }
        if (g.creature.hp / g.maxHp() < EAT_AT) { const e = g.edibles().sort((a, b) => b.heal - a.heal)[0]; if (e && g.startEat(e.id)) adv(rules.recipes.eatSeconds + 0.2); }
      }
      const guard = g.monsters.find((m) => m.isGuardian && m.alive);
      let target = null;
      if (g.pendingFightUid) target = g.monsters.find((m) => m.uid === g.pendingFightUid);
      else if (guard && lv >= guard.level - 1 && hpR > 0.9 && beltLeft >= 5 && (guardTry[zone.id] || 0) < (collect && lv >= 13 ? 3 : 1)) { target = guard; guardTry[zone.id] = (guardTry[zone.id] || 0) + 1; }
      else {
        const ok = g.monsters.filter((m) => m.alive && !m.isGuardian && g.monsterColor(m) !== 'gri');
        ok.sort((a, b) => Math.hypot(a.pos.x - g.pos.x, a.pos.z - g.pos.z) - Math.hypot(b.pos.x - g.pos.x, b.pos.z - g.pos.z));
        target = ok[0];
      }
      if (!target) { adv(5); continue; }
      const d = Math.hypot(target.pos.x - g.pos.x, target.pos.z - g.pos.z);
      g.pos = { x: target.pos.x + 1, z: target.pos.z }; adv(d / C.moveSpeed);
      if (!target.alive) continue;
      const b = g.startFight(target.uid); if (!b) { adv(1); continue; }
      while (!b.over && b.turn < 200) combat.playTurn(b, beltPolicy(b));
      t += FIGHT_SEC;
      const res = g.finishFight(b);
      if (g.screen === 'dead' || res.winner !== 'player') { st.deaths++; break; }
    }
    if (g.screen === 'dead') g.dismissDeath();
    if (g.screen === 'world') g.arriveAtGate('sim');
  }
  if (g.creature.level >= 13 && st.t13 == null) st.t13 = t; // önce ölç, sonra son kapı politikası
  gatePolicy(g, st, t, { switchOnBetter });
  return { seed, hours: t / 3600, t13: st.t13 != null ? st.t13 / 3600 : null, opened: st.opened, drops: st.drops, fedOz: st.fedOz, mythics: st.mythics.length, mythicSpecies: st.mythicSpecies.size, firstMythic: st.firstMythic != null ? st.firstMythic / 3600 : null, switches: st.switches.map((s) => ({ ...s, back: s.back != null ? s.back / 3600 : null })), deaths: st.deaths, maxLv: g.maxRosterLevel(), activeLv: g.creature.level };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

if (import.meta.url === `file://${process.argv[1]}`) {
  const N = +(process.argv[2] || 200);
  if (!process.env.COLLECT) {
    const configs = [['A', 'level1', true], ['A', 'percentOfMax', true], ['B', 'level1', true], ['B', 'percentOfMax', true], ['A', 'level1', 'high'], ['A', 'percentOfMax', 'high'], ['A', 'percentOfMax', false]];
    for (const [cand, mode, sw0] of configs) {
      const rs = []; for (let s = 1; s <= N; s++) rs.push(run(s, { candidate: cand, startMode: mode, switchOnBetter: sw0 }));
      const t13 = rs.map((r) => (r.t13 ?? r.hours));
      const anyM = rs.filter((r) => r.firstMythic != null && r.firstMythic <= (r.t13 ?? r.hours)).length / N;
      const sw = rs.flatMap((r) => r.switches);
      const back = sw.filter((s) => s.back != null).map((s) => s.back * 60);
      const op = (k) => mean(rs.map((r) => r.drops[k] || 0)).toFixed(1);
      console.log(JSON.stringify({
        aday: cand, baslangic: mode, gecis_politikasi: sw0 === 'high' ? 'yalniz A/S/mitolojik' : sw0 ? 'her daha iyi dereceye' : 'gecis yok', N,
        sure_1_13_saat: { medyan: +median(t13).toFixed(2), p10: +pct(t13, 0.1).toFixed(2), p90: +pct(t13, 0.9).toFixed(2), bitmeyen: rs.filter((r) => r.t13 == null).length },
        birikim_ort: { kil: +op('kil'), lacivert: +op('lacivert'), altin: +op('altin'), kader: +op('kader') },
        yedirme_ozu_orani_yuzde: +(100 * mean(rs.map((r) => r.fedOz)) / TOTAL_OZ).toFixed(2),
        mitolojik_13te_en_az_1_yuzde: +(100 * anyM).toFixed(1),
        gecis_sayisi_ort: +mean(rs.map((r) => r.switches.length)).toFixed(2),
        gecis_seviyeleri: { onceki_medyan: median(sw.map((s) => s.from)), yeni_baslangic_medyan: median(sw.map((s) => s.start)) },
        eski_seviyeye_donus_dk: back.length ? { medyan: +median(back).toFixed(0), p90: +pct(back, 0.9).toFixed(0), donemeyen: sw.length - back.length } : null,
        olum_ort: +mean(rs.map((r) => r.deaths)).toFixed(1),
      }));
    }
  } else {
    const mode = process.env.MODE || 'percentOfMax';
    for (const cand of (process.env.CANDS || 'A,B').split(',')) {
      const rs = []; for (let s = 1; s <= N; s++) rs.push(run(1000 + s, { candidate: cand, startMode: mode, collect: true, collectHours: +(process.env.CAP || 60) }));
      const first = rs.map((r) => (r.firstMythic ?? Infinity));
      const all = rs.map((r) => (r.mythicSpecies >= 4 ? r.hours : Infinity));
      const fmt = (x) => (x === Infinity ? '>' + (process.env.CAP || 60) : +x.toFixed(1));
      console.log(JSON.stringify({ aday: cand, baslangic: mode, N, ilk_mitolojik_saat: { medyan: fmt(median(first)), p25: fmt(pct(first, 0.25)), p75: fmt(pct(first, 0.75)) }, dort_mitolojik_saat: { medyan: fmt(median(all)), p25: fmt(pct(all, 0.25)), tamamlayan_yuzde: +(100 * rs.filter((r) => r.mythicSpecies >= 4).length / N).toFixed(0) }, mitolojik_ort: +mean(rs.map((r) => r.mythics)).toFixed(1) }));
    }
  }
}
