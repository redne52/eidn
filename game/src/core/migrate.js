// Edin — Kayıt geçişi. DOM yok. Zincir: v1 (sürümsüz) → v2 (ejderha) → v3 (kadro + ruh çekirdekleri).
// Kurallar NOTES-gecis.md'de. Geçiş idempotenttir: güncel kayda tekrar uygulamak hiçbir şeyi değiştirmez.
import rules from '../data/rules.json' with { type: 'json' };
import { defaultCoreState, mixSeed } from './cores.js';

export const SAVE_VERSION = 3;
const MAP = (rules.legacyMap && rules.legacyMap.creatures) || {};
const SC = rules.soulCores;

/** Eski oynanabilir yaratık id'sini ejderha id'sine çevirir; bilinmeyen/yeni id aynen döner. */
export function mapCreatureId(id) {
  return (id && MAP[id]) || id;
}

/** Kayıt verisini en güncel sürüme getirir. Geçersiz veri → null. Girdiyi değiştirmez. */
export function migrateSave(data) {
  if (!data || typeof data !== 'object') return null;
  const v = typeof data.version === 'number' ? data.version : 1; // sürümsüz = v1
  if (v > SAVE_VERSION) return null; // gelecekteki sürüm: tanımıyoruz
  const s = JSON.parse(JSON.stringify(data));
  // ---------- v1 → v2: oynanabilir yaratık → ejderha ----------
  if (v < 2) {
    if (s.creature && s.creature.id) {
      const nid = mapCreatureId(s.creature.id);
      if (nid !== s.creature.id) s.creature.legacyId = s.creature.id;
      s.creature.id = nid;
    }
    s.eggs = (s.eggs || []).map((e) => {
      const ns = mapCreatureId(e.species);
      return ns !== e.species ? { ...e, species: ns, legacySpecies: e.species } : e;
    });
    s.migratedFrom = v;
  }
  // v2 alanları: güvenli varsayılanlar
  if (!s.food || typeof s.food !== 'object') s.food = {};
  if (!s.resources || typeof s.resources !== 'object') s.resources = {};
  if (!s.camps || typeof s.camps !== 'object') s.camps = {};
  if (!s.collection || typeof s.collection !== 'object') s.collection = {};
  if (!s.nodes || typeof s.nodes !== 'object') s.nodes = {};
  if (!s.buffs || typeof s.buffs !== 'object') s.buffs = { atk: 0, fights: 0 };
  if (s.creature && s.creature.id && !rules.creatures[s.creature.id]) return null; // bozuk kayıt

  // ---------- v2 → v3: kadro + çekirdekler ----------
  if (v < 3) {
    const d = defaultCoreState(SC);
    // Deterministik tohum (aynı eski kayıt iki kez geçirilirse aynı sonuç).
    s.seed = s.seed ?? (mixSeed('v3', s.savedAt || 0, s.creature ? s.creature.id + s.creature.level : '', s.sekel || 0) % 2147483646) + 1;
    // Mevcut yaratık kadronun ilk ve aktif üyesi olur (seviye, derece, öz, can, yara, legacyId korunur).
    if (s.creature && s.creature.id) {
      const c = { ...s.creature, uid: 'c1', mythic: SC.mythicPool.includes(s.creature.id) };
      s.roster = [c];
      s.activeUid = 'c1';
      s.charSeq = 2;
    } else { s.roster = []; s.activeUid = null; s.charSeq = 1; }
    s.cores = d.cores;
    s.pulls = d.pulls;
    s.opLog = [];
    // Eski yumurtalar ÇEVRİLMEZ: derece + kuluçka ilerlemesiyle kalır (legacy işaretli). Zaferlerle kuluçka sürer.
    // Zaten çatlamış (ama bağlanmamış) yumurta varsa: derece korunarak bekleyen açılış sonucu olur.
    const keepEggs = [];
    for (const e of s.eggs || []) {
      if (e.hatched) {
        s.pulls.pending.push({ id: 'p' + s.pulls.seq++, coreType: null, species: mapCreatureId(e.species), grade: e.grade, mythic: false, source: 'egg', state: 'pending', eggUid: e.uid });
      } else keepEggs.push({ ...e, legacy: true });
    }
    s.eggs = keepEggs;
    if (s.incubatingEggId && !keepEggs.some((e) => e.uid === s.incubatingEggId)) s.incubatingEggId = (keepEggs[0] || {}).uid || null;
    // Kader puanı: her tam 10 puan = 1 Kader Mührü (eski garanti hakkı: A %80 / S %20). Kalan × 2 merhamet sayacına.
    const kp = Math.max(0, Math.floor(s.kaderPuani || 0));
    const per = SC.kaderMuhru.pointsPer || 10;
    s.kaderMuhru = Math.floor(kp / per);
    s.pulls.pity = (kp % per) * (SC.kaderMuhru.pityPerLeftoverPoint || 2);
    s.legacyKaderPuani = kp;
    s.kaderPuani = 0;
    if (!s.migratedFrom) s.migratedFrom = v;
    s.migratedToV3From = v;
  }
  // v3 alanları: eksikse güvenli varsayılan (bozuk/yarım kayıt)
  if (!Array.isArray(s.roster)) s.roster = [];
  if (!s.cores || typeof s.cores !== 'object') s.cores = defaultCoreState(SC).cores;
  if (!s.pulls || typeof s.pulls !== 'object') s.pulls = defaultCoreState(SC).pulls;
  if (typeof s.kaderMuhru !== 'number') s.kaderMuhru = 0;
  if (!Array.isArray(s.opLog)) s.opLog = [];
  for (const c of s.roster) if (!rules.creatures[c.id]) return null;
  s.version = SAVE_VERSION;
  return s;
}
