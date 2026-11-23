// Edin v4.1 — Ruh Çekirdeği ve kadro (Kan Bağları) mantığı. DOM / Three.js YOK.
// Plan: PLAN-v4.1-cekirdek.md (13. bölüm esas). Sayılar rules.json > soulCores.
// world.js createGame içinde installCores(g, ctx) ile kurulur.
//
// Güvenlik ilkeleri:
//  - Her dış işlem (aç, tut/yedir, aktif değiştir, depo, yükseltme, mühür) bir işlem kimliği (opId) alabilir.
//    Aynı opId ikinci kez gelirse işlem YAPILMAZ, ilk sonucun kopyası döner (opLog).
//  - Açılış sonuçları tohumludur: tohum = (oyun tohumu, açılış sayacı). Sayaç sonuç üretmeden ÖNCE artar.
//    Bütün değişiklik eşzamanlı yapılır; tek bir kayıt (toSave) hepsini birlikte yakalar.
//  - Bekleyen sonuçlar (pulls.pending) çekirdek değildir; ölümde kaybolmaz.
import { createRng } from './rng.js';

const GRADE_RANK = { C: 0, B: 1, A: 2, S: 3 };

/** Basit 32 bit karışım (tohum türetmek için). */
export function mixSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  }
  return h >>> 0;
}

function rollTable(rng, table) {
  const entries = Object.entries(table).filter(([, p]) => p > 0);
  const total = entries.reduce((a, [, p]) => a + p, 0);
  let r = rng.next() * total;
  for (const [k, p] of entries) { if ((r -= p) < 0) return k; }
  return entries[entries.length - 1][0];
}

export function emptyCoreCounts(order) { return Object.fromEntries(order.map((t) => [t, 0])); }

/** Varsayılan çekirdek/kadro durumu (yeni oyun ve geçiş için). */
export function defaultCoreState(SC) {
  return {
    cores: { bag: emptyCoreCounts(SC.order), depot: emptyCoreCounts(SC.order), bagCap: SC.bag.start, capLevel: 0, autoDeposit: SC.autoDepositDefault !== false },
    pulls: { counter: 0, seq: 1, pity: 0, pending: [], history: { opened: 0, mythics: 0, byType: emptyCoreCounts(SC.order) } },
    kaderMuhru: 0,
    opLog: [],
  };
}

export function installCores(g, ctx) {
  const { rules, emit } = ctx;
  const SC = rules.soulCores;
  const ORDER = SC.order;
  const sum = (o) => ORDER.reduce((a, t) => a + (o[t] || 0), 0);

  // ---------- durum ----------
  Object.assign(g, defaultCoreState(SC));
  g.seed = g.seed ?? (g.rng.int(1, 2 ** 31 - 2));
  g.roster = [];            // [{ uid, id, grade, level, oz, hp, woundedUntil, mythic, catchUpTo?, legacyId? }]
  g.activeUid = null;
  g.charSeq = 1;
  g.groundCores = [];       // sahada yere düşmüş çekirdekler (kayda girmez; bölgeden çıkınca kaybolur)
  g.coreSeq = 1;

  const mythicCfg = () => SC.mythicCandidates[SC.mythicActive] || SC.mythicCandidates.A;
  const atGate = () => !g.inRun && g.screen !== 'battle' && g.screen !== 'world';

  // ---------- işlem kaydı (idempotentlik) ----------
  function withOp(opId, fn) {
    if (opId != null) {
      const hit = g.opLog.find((e) => e.id === opId);
      if (hit) return clone(hit.res);
    }
    const res = fn();
    if (opId != null) {
      g.opLog.push({ id: opId, res: clone(res) });
      const max = SC.opLogSize || 50;
      if (g.opLog.length > max) g.opLog.splice(0, g.opLog.length - max);
    }
    return res;
  }
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

  // ---------- kadro ----------
  function newChar(id, grade, level, extra = {}) {
    const ch = { uid: 'c' + g.charSeq++, id, grade, level, oz: 0, hp: 0, woundedUntil: 0, mythic: SC.mythicPool.includes(id), ...extra };
    ch.hp = ctx.maxHpOf(ch);
    return ch;
  }
  /** Başlangıç yaratığı / geçiş: kadroya ekle ve aktif yap. */
  g.rosterAddInitial = (ch) => {
    if (!ch.uid) ch.uid = 'c' + g.charSeq++;
    if (ch.mythic == null) ch.mythic = SC.mythicPool.includes(ch.id);
    g.roster = [ch];
    g.activeUid = ch.uid;
    g.creature = ch;
    return ch;
  };
  g.activeChar = () => g.roster.find((c) => c.uid === g.activeUid) || null;
  g.rosterView = () => g.roster.map((c) => ({ ...c, active: c.uid === g.activeUid }));
  g.maxRosterLevel = () => g.roster.reduce((a, c) => Math.max(a, c.level), 1);

  /** Aktif karakteri değiştir — yalnız Ruh Kapısı'nda. */
  g.setActive = (uid, opId = null) => withOp(opId, () => {
    const ch = g.roster.find((c) => c.uid === uid);
    if (!ch) return { ok: false, reason: 'yok' };
    if (!atGate()) return { ok: false, reason: 'kapi' };
    if (g.activeUid === uid) return { ok: true, unchanged: true };
    g.activeUid = uid;
    g.creature = ch;
    if (ctx.gateFullHeal) ch.hp = ctx.maxHpOf(ch);
    emit('activeChanged', { uid, id: ch.id });
    emit('roster', { roster: g.rosterView() });
    return { ok: true, uid };
  });

  /** Yeni tutulan karakterin başlangıç seviyesi (kural rules.json > newCharStart). */
  g.newCharStartLevel = () => {
    const ns = SC.newCharStart || {};
    if (ns.mode === 'percentOfMax') return Math.max(1, Math.floor(g.maxRosterLevel() * (ns.percent ?? 0.7)));
    return 1;
  };

  /** Öz eklenirken yakalama yardımı (mode 'level1'): karakter catchUpTo'ya ulaşana kadar ×(1+bonus). */
  g.catchUpMult = (ch = g.activeChar()) => {
    const ns = SC.newCharStart || {};
    if (!ch || ns.mode !== 'level1' || !ch.catchUpTo || ch.level >= ch.catchUpTo) return 1;
    return 1 + (ns.catchUpBonus ?? 0.5);
  };

  // ---------- çekirdek sayıları ----------
  g.coreCounts = () => ({ bag: { ...g.cores.bag }, depot: { ...g.cores.depot }, bagTotal: sum(g.cores.bag), depotTotal: sum(g.cores.depot), bagCap: g.cores.bagCap, depotCap: SC.depotCap });
  g.coreRoom = () => Math.max(0, g.cores.bagCap - sum(g.cores.bag));

  /** Çekirdeği çantaya koy; yer yoksa false. */
  function addCoreToBag(type, n = 1) {
    if (!SC.types[type]) return 0;
    const put = Math.min(n, g.coreRoom());
    g.cores.bag[type] += put;
    return put;
  }

  /** Savaş ödülü: nadir canavar / bekçi çekirdekleri. finishFight içinden BİR KEZ çağrılır. */
  g.rollCoreDrops = (m, first) => {
    const out = [];
    const give = (type, n) => {
      for (let i = 0; i < n; i++) {
        const put = addCoreToBag(type, 1);
        if (put) out.push({ type, toBag: true });
        else {
          // çanta dolu: yere düşer (groundSeconds sonra kaybolur)
          const gc = { uid: 'g' + g.coreSeq++, type, x: m.pos.x + (g.rng.next() - 0.5), z: m.pos.z + (g.rng.next() - 0.5), expiresAt: g.clock + (SC.groundSeconds || 30) };
          g.groundCores.push(gc);
          out.push({ type, toBag: false, groundUid: gc.uid });
        }
      }
    };
    if (m.isGuardian) {
      const t = SC.drops.guardians[m.typeId];
      if (t) {
        for (const [type, n] of (first ? t.first : t.always) || []) give(type, n);
        for (const [type, p] of t.chance || []) if (g.rng.chance(p)) give(type, 1);
      }
    } else if (m.rare) {
      const zid = m.zoneId;
      const p = (SC.drops.rareChance || {})[zid] || 0;
      const type = (SC.drops.rareType || {})[zid];
      if (type && g.rng.chance(p)) give(type, 1);
    }
    if (out.length) emit('coresDropped', { cores: out, counts: g.coreCounts() });
    return out;
  };

  /** Yerdeki çekirdekleri topla / süresi dolanı sil (tick içinden). */
  g.tickGroundCores = () => {
    if (!g.groundCores.length) return;
    const R = SC.pickupRadius || 1.8;
    const keep = [];
    for (const gc of g.groundCores) {
      if (gc.expiresAt <= g.clock) { emit('coreExpired', { uid: gc.uid, type: gc.type }); continue; }
      if (Math.hypot(gc.x - g.pos.x, gc.z - g.pos.z) <= R && g.coreRoom() > 0) { addCoreToBag(gc.type, 1); emit('corePicked', { uid: gc.uid, type: gc.type, counts: g.coreCounts() }); continue; }
      keep.push(gc);
    }
    g.groundCores = keep;
  };

  // ---------- depo ----------
  g.depositCores = (opId = null) => withOp(opId, () => {
    if (!atGate()) return { ok: false, reason: 'kapi' };
    const moved = emptyCoreCounts(ORDER);
    for (const t of ORDER) {
      const room = SC.depotCap - sum(g.cores.depot);
      const n = Math.min(g.cores.bag[t], room);
      if (n > 0) { g.cores.bag[t] -= n; g.cores.depot[t] += n; moved[t] = n; }
    }
    const total = sum(moved);
    if (total) emit('coresDeposited', { moved, counts: g.coreCounts() });
    return { ok: true, moved, total };
  });
  g.withdrawCores = (type, n = 1, opId = null) => withOp(opId, () => {
    if (!atGate()) return { ok: false, reason: 'kapi' };
    if (!SC.types[type]) return { ok: false, reason: 'tur' };
    const k = Math.min(n, g.cores.depot[type], g.coreRoom());
    if (k <= 0) return { ok: false, reason: g.coreRoom() <= 0 ? 'canta' : 'yok' };
    g.cores.depot[type] -= k; g.cores.bag[type] += k;
    emit('coresWithdrawn', { type, n: k, counts: g.coreCounts() });
    return { ok: true, n: k };
  });
  g.setAutoDeposit = (on) => { g.cores.autoDeposit = !!on; emit('settings', { autoDepositCores: g.cores.autoDeposit }); };
  g.nextBagUpgrade = () => (SC.bag.upgrades || [])[g.cores.capLevel] || null;
  g.upgradeCoreBag = (opId = null) => withOp(opId, () => {
    if (!atGate()) return { ok: false, reason: 'kapi' };
    const up = g.nextBagUpgrade();
    if (!up) return { ok: false, reason: 'max' };
    if (g.sekel < up.price) return { ok: false, reason: 'sekel' };
    g.sekel -= up.price; g.cores.capLevel += 1; g.cores.bagCap = up.cap;
    emit('sekel', { sekel: g.sekel });
    emit('coreBagUpgraded', { cap: up.cap, counts: g.coreCounts() });
    return { ok: true, cap: up.cap };
  });

  // ---------- açılış ----------
  /** Mitolojik olasılık (bilgi + hesap). */
  g.mythicInfo = (type) => {
    const cfg = mythicCfg();
    const base = cfg.rates[type] || 0;
    const act = g.activeChar();
    const eligible = base > 0 && !!act && act.level >= SC.mythicMinLevel;
    const pity = g.pulls.pity;
    const soft = Math.max(0, pity - cfg.pitySoftStart + 1);
    const p = !eligible ? 0 : (pity + 1 >= cfg.pityHard ? 1 : Math.min(1, base + soft * cfg.pityStep));
    return { base, chance: p, eligible, pity, pityHard: cfg.pityHard, pitySoftStart: cfg.pitySoftStart, minLevel: SC.mythicMinLevel, candidate: SC.mythicActive };
  };

  function makeResult(rng, type) {
    const info = g.mythicInfo(type);
    let mythic = false;
    if (info.eligible) {
      mythic = rng.next() < info.chance;
      g.pulls.pity = mythic ? 0 : g.pulls.pity + 1; // seviye < minLevel iken ya da kil'de ilerlemez
    }
    const species = mythic ? rng.pick(SC.mythicPool) : rng.pick(SC.dragonPool);
    const grade = rollTable(rng, mythic ? SC.mythicGrades : SC.types[type].grades);
    return { species, grade, mythic };
  }

  /** Bekleyen sonuç ekle (çekirdek, eski yumurta, kader mührü). */
  function addPending(r, source, coreType = null) {
    const p = { id: 'p' + g.pulls.seq++, coreType, species: r.species, grade: r.grade, mythic: !!r.mythic, source, state: 'pending' };
    g.pulls.pending.push(p);
    return p;
  }
  g.pendingPulls = () => g.pulls.pending.filter((p) => p.state === 'pending').map((p) => ({ ...p }));

  /**
   * Çekirdek aç. count: 1 ya da 10 (aynı türden). Sahada yalnız çanta, kapıda önce çanta sonra depo.
   * Döner: { ok, results:[pending...] } — sonuçlar pulls.pending'e yazılmıştır.
   */
  g.openCores = (type, count = 1, opId = null) => withOp(opId, () => {
    if (!SC.types[type]) return { ok: false, reason: 'tur' };
    if (g.screen === 'battle' || g.battle) return { ok: false, reason: 'savas' };
    if (count !== 1 && count !== (SC.tenPull.count || 10)) return { ok: false, reason: 'adet' };
    const inField = g.inRun;
    const have = g.cores.bag[type] + (inField ? 0 : g.cores.depot[type]);
    if (have < count) return { ok: false, reason: 'yetersiz', have };
    // 1) çekirdekleri düş
    const fromBag = Math.min(count, g.cores.bag[type]);
    g.cores.bag[type] -= fromBag;
    g.cores.depot[type] -= count - fromBag;
    // 2) sayaç önce artar, tohumlu sonuçlar üretilir
    g.pulls.counter += 1;
    const rng = createRng(mixSeed(g.seed, 'pull', g.pulls.counter));
    const raw = [];
    for (let i = 0; i < count; i++) raw.push(makeResult(rng, type));
    if (count > 1) {
      const min = GRADE_RANK[SC.tenPull.minGrade || 'B'];
      if (!raw.some((r) => GRADE_RANK[r.grade] >= min)) {
        // garanti: son sonuç, çekirdeğin tablosunun B+ kısmından yeniden çekilir
        const last = raw[raw.length - 1];
        const tbl = Object.fromEntries(Object.entries(SC.types[type].grades).filter(([k]) => GRADE_RANK[k] >= min));
        last.grade = rollTable(rng, tbl);
        last.guaranteed = true;
      }
    }
    // 3) bekleyen listeye yaz
    const results = raw.map((r) => addPending(r, 'core', type));
    g.pulls.history.opened += count;
    g.pulls.history.byType[type] = (g.pulls.history.byType[type] || 0) + count;
    g.pulls.history.mythics += raw.filter((r) => r.mythic).length;
    emit('coresOpened', { type, count, results: results.map((p) => ({ ...p })), counts: g.coreCounts(), pity: g.pulls.pity });
    return { ok: true, results: results.map((p) => ({ ...p })) };
  });

  /** Kader Mührü kullan: A %80 / S %20 ejderha garantisi (eski kader puanı hakkı). */
  g.useKaderMuhru = (opId = null) => withOp(opId, () => {
    if (g.kaderMuhru <= 0) return { ok: false, reason: 'yok' };
    if (g.screen === 'battle' || g.battle) return { ok: false, reason: 'savas' };
    g.kaderMuhru -= 1;
    g.pulls.counter += 1;
    const rng = createRng(mixSeed(g.seed, 'muhur', g.pulls.counter));
    const r = { species: rng.pick(SC.dragonPool), grade: rollTable(rng, SC.kaderMuhru.grades), mythic: false };
    const p = addPending(r, 'muhur', null);
    emit('muhurUsed', { left: g.kaderMuhru, result: { ...p } });
    return { ok: true, results: [{ ...p }] };
  });

  /** Eski yumurta çatladı: derece korunarak bekleyen sonuç olur. */
  g.pendingFromEgg = (egg) => {
    const p = addPending({ species: egg.species, grade: egg.grade, mythic: false }, 'egg', null);
    p.eggUid = egg.uid;
    emit('eggResult', { result: { ...p } });
    return p;
  };

  /** Tut ya da yedir öncesi bilgi (arayüz onay ekranı için). */
  g.pullDecisionInfo = (pullId) => {
    const p = g.pulls.pending.find((x) => x.id === pullId);
    if (!p) return null;
    const feedOz = p.mythic ? SC.feedOz.mythic : SC.feedOz[p.grade];
    const full = g.roster.length >= SC.rosterMax;
    return {
      pull: { ...p }, feedOz, feedTo: g.inRun ? 'carried' : 'banked',
      rosterFull: full, startLevel: g.newCharStartLevel(),
      replaceable: full ? g.roster.filter((c) => c.uid !== g.activeUid).map((c) => ({ ...c })) : [],
      activeUid: g.activeUid,
    };
  };

  /**
   * Bekleyen sonucu çöz.
   *  action 'feed' → aktif karaktere öz (sahada taşınan öze, kapıda güvendekine).
   *  action 'keep' → kadroya ekle; kadro doluysa { replaceUid } zorunlu, aktif karakter değiştirilemez, bedel yok.
   */
  g.resolvePull = (pullId, action, opts = {}, opId = null) => withOp(opId, () => {
    const p = g.pulls.pending.find((x) => x.id === pullId);
    if (!p) return { ok: false, reason: 'yok' };
    if (p.state !== 'pending') return { ok: false, reason: 'cozuldu', state: p.state };
    if (g.screen === 'battle' || g.battle) return { ok: false, reason: 'savas' };
    if (action === 'feed') {
      const act = g.activeChar();
      if (!act) return { ok: false, reason: 'karakter' };
      const base = p.mythic ? SC.feedOz.mythic : SC.feedOz[p.grade];
      let to;
      if (g.inRun) { g.carriedOz += base; to = 'carried'; }
      else { act.oz += Math.round(base * g.catchUpMult(act)); to = 'banked'; }
      p.state = 'fed';
      g.stats.ozGained += base;
      emit('pullFed', { pullId, oz: base, to, species: p.species, grade: p.grade, mythic: p.mythic });
      if (to === 'banked') ctx.levelUpLoop();
      prune();
      return { ok: true, action: 'feed', oz: base, to };
    }
    if (action === 'keep') {
      const full = g.roster.length >= SC.rosterMax;
      let replaced = null;
      if (full) {
        const rid = opts.replaceUid;
        if (!rid) return { ok: false, reason: 'degistir' };
        if (rid === g.activeUid) return { ok: false, reason: 'aktif' };
        replaced = g.roster.find((c) => c.uid === rid);
        if (!replaced) return { ok: false, reason: 'degistirYok' };
      }
      const ns = SC.newCharStart || {};
      const maxLv = g.maxRosterLevel();
      const level = g.newCharStartLevel();
      const extra = ns.mode === 'level1' && maxLv > 1 ? { catchUpTo: maxLv } : {};
      const ch = newChar(p.species, p.grade, level, extra);
      if (replaced) g.roster = g.roster.filter((c) => c !== replaced);
      g.roster.push(ch);
      p.state = 'kept';
      p.keptUid = ch.uid;
      if (g.collection && p.mythic) g.collection[p.species] = (g.collection[p.species] || 0) + 1;
      emit('pullKept', { pullId, char: { ...ch }, replaced: replaced ? { ...replaced } : null });
      emit('roster', { roster: g.rosterView() });
      prune();
      return { ok: true, action: 'keep', char: { ...ch }, replaced: replaced ? replaced.uid : null };
    }
    return { ok: false, reason: 'eylem' };
  });
  /** "Hepsini yedir": bekleyen bütün sonuçlar (ya da verilen liste). */
  g.feedAllPending = (ids = null, opId = null) => withOp(opId, () => {
    const list = g.pulls.pending.filter((p) => p.state === 'pending' && (!ids || ids.includes(p.id)));
    let oz = 0;
    for (const p of list) { const r = g.resolvePull(p.id, 'feed'); if (r.ok) oz += r.oz; }
    return { ok: true, count: list.length, oz };
  });
  // Çözülmüş eski kayıtları sınırlı tut (son 30 çözülmüş kalır, bekleyenler hiç silinmez)
  function prune() {
    const done = g.pulls.pending.filter((p) => p.state !== 'pending');
    if (done.length > 30) { const drop = new Set(done.slice(0, done.length - 30)); g.pulls.pending = g.pulls.pending.filter((p) => !drop.has(p)); }
  }

  // ---------- ölüm ----------
  /** Çantadaki çekirdeklerin kaybı (olasılıklı yuvarlama, eşit rastgele seçim). Depo ve bekleyenler korunur. */
  g.applyCoreDeathLoss = (zoneId, protectedRun) => {
    const lost = emptyCoreCounts(ORDER);
    g.groundCores = [];
    const n = sum(g.cores.bag);
    const p = protectedRun ? 0 : ((SC.deathLoss || {})[zoneId] || 0);
    if (n === 0 || p <= 0) return { lost, k: 0, n, p };
    g.pulls.deaths = (g.pulls.deaths || 0) + 1;
    const rng = createRng(mixSeed(g.seed, 'death', g.pulls.deaths));
    const x = n * p, base = Math.floor(x);
    const k = Math.min(n, base + (rng.next() < x - base ? 1 : 0));
    const pool = [];
    for (const t of ORDER) for (let i = 0; i < g.cores.bag[t]; i++) pool.push(t);
    for (let i = 0; i < k; i++) {
      const j = rng.int(0, pool.length - 1);
      const t = pool.splice(j, 1)[0];
      g.cores.bag[t] -= 1; lost[t] += 1;
    }
    if (k) emit('coresLost', { lost, counts: g.coreCounts() });
    return { lost, k, n, p };
  };

  // ---------- kayıt ----------
  g.coresToSave = () => ({
    seed: g.seed,
    roster: g.roster.map((c) => ({ ...c, woundedLeft: Math.max(0, (c.woundedUntil || 0) - g.clock), woundedUntil: undefined })),
    activeUid: g.activeUid,
    charSeq: g.charSeq,
    cores: clone(g.cores),
    pulls: clone(g.pulls),
    kaderMuhru: g.kaderMuhru,
    opLog: clone(g.opLog),
  });
  g.coresLoad = (s) => {
    const d = defaultCoreState(SC);
    g.seed = s.seed ?? g.seed;
    g.cores = { ...d.cores, ...(s.cores || {}), bag: { ...d.cores.bag, ...((s.cores || {}).bag || {}) }, depot: { ...d.cores.depot, ...((s.cores || {}).depot || {}) } };
    g.pulls = { ...d.pulls, ...(s.pulls || {}), pending: ((s.pulls || {}).pending || []).map((p) => ({ ...p })), history: { ...d.pulls.history, ...((s.pulls || {}).history || {}) } };
    g.kaderMuhru = s.kaderMuhru || 0;
    g.opLog = clone(s.opLog || []);
    g.charSeq = s.charSeq || 1;
    g.roster = (s.roster || []).map((c) => { const { woundedLeft, ...rest } = c; return { ...rest, woundedUntil: woundedLeft || 0 }; });
    g.activeUid = s.activeUid || (g.roster[0] && g.roster[0].uid) || null;
    g.creature = g.activeChar();
  };
}
