// GLB/glTF model altyapısı. Gerçek modeller src/ui/assets.json'a yazılır (şu an liste boş).
// Model yüklenemezse ya da hiç yoksa getModel kodla üretilen modele düşer.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import assets from './assets.json' with { type: 'json' };

const reg = new Map(); // "id|stage" → { url, status, gltf, height, scale, rotY, error }
const key = (id, stage) => `${id}|${stage}`;
let makeLoader = () => new GLTFLoader();

/** Testler için: yükleyiciyi değiştir (ör. hep hata veren sahte yükleyici). */
export function _setLoaderFactory(f) { makeLoader = f; }
export function _clearGlbs() { reg.clear(); }

export function registerGlb(id, stage, url, opts = {}) {
  reg.set(key(id, stage ?? '*'), { url, status: 'idle', gltf: null, height: opts.height, scale: opts.scale ?? 1, rotY: opts.rotY ?? 0 });
}
for (const a of assets.models || []) registerGlb(a.id, a.stage, a.url, a);

export function glbEntry(id, stage) { return reg.get(key(id, stage)) || reg.get(key(id, '*')) || null; }
export function glbList() { return [...reg.entries()].map(([k, e]) => ({ key: k, url: e.url, status: e.status, error: e.error })); }

export async function loadGlb(id, stage) {
  const e = glbEntry(id, stage); if (!e) return false;
  if (e.status === 'ok') return true; if (e.status === 'fail') return false;
  if (!e.promise) {
    e.status = 'loading';
    e.promise = Promise.resolve().then(() => makeLoader().loadAsync(e.url))
      .then((gltf) => { e.gltf = gltf; e.status = 'ok'; return true; })
      .catch((err) => { e.status = 'fail'; e.error = String(err && err.message || err); if (typeof console !== 'undefined') console.warn('[Edin] GLB yüklenemedi, kod modeli kullanılacak:', e.url, e.error); return false; });
  }
  return e.promise;
}

/** Kayıtlı bütün GLB'leri önceden yükler; biri bozuksa diğerleri etkilenmez. */
export function preloadGlbs() {
  return Promise.all([...reg.keys()].map((k) => { const [id, st] = k.split('|'); return loadGlb(id, st === '*' ? undefined : (isNaN(+st) ? st : +st)); }));
}

/** Yüklenmiş GLB'nin kopyası ya da null (yoksa/yüklenmediyse/bozuksa). */
export function instantiateGlb(id, stage) {
  const e = glbEntry(id, stage);
  if (!e || e.status !== 'ok' || !e.gltf) return null;
  try {
    const scene = cloneSkinned(e.gltf.scene);
    return { scene, clips: e.gltf.animations || [], height: e.height, scale: e.scale, rotY: e.rotY };
  } catch (err) { e.status = 'fail'; e.error = String(err); return null; }
}
