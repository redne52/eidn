// Yalnız tarayıcı paketi için: game/assets/*.glb dosyaları build.mjs'de dataurl olarak gömülür
// (tek dosyalık dist/index.html dış dosya yükleyemez). Node testleri bu dosyayı içe aktarmaz.
import assets from './assets.json';
import ejderAtesHi from '../../assets/ejder_ates_hi.glb';
import ejderAtesLo from '../../assets/ejder_ates_lo.glb';
import { registerGlb, preloadGlbs, setGlbQuality } from './glb.js';
import atesRigMap from './models/atesRigMap.json';

const RIG_MAPS = { ates: atesRigMap };

const FILES = { 'ejder_ates_hi.glb': ejderAtesHi, 'ejder_ates_lo.glb': ejderAtesLo };

/** assets.json'daki modelleri kaydeder ve seçili grafik ayarının LOD'unu yükler. */
export function initGlbs(quality) {
  setGlbQuality(quality);
  for (const a of assets.models || []) {
    const lods = {}; for (const q of [0, 1, 2]) { const f = a.lods ? a.lods[q] : a.file; if (FILES[f]) lods[q] = FILES[f]; }
    if (!Object.keys(lods).length) continue;
    registerGlb(a.id, a.stage, lods, a.rigMap ? { ...a, rigMap: RIG_MAPS[a.rigMap] } : a);
  }
  return preloadGlbs();
}
/** Grafik ayarı değişince: yeni LOD'u yükler (sonraki getModel çağrısında kullanılır). */
export function glbQualityChanged(quality) { setGlbQuality(quality); return preloadGlbs(); }
