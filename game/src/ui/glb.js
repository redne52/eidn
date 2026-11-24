// GLB/glTF model altyapısı. Gerçek modeller src/ui/assets.json'a yazılır; dosyalar game/assets/ altındadır ve
// tarayıcı paketinde (build.mjs → dataurl) gömülüdür. assets.json yalnız tanımdır; adresleri main.js
// (glbFiles.js üzerinden) registerGlb ile verir — böylece node testleri .glb dosyası içe aktarmaz.
// Model yüklenemezse ya da hiç yoksa getModel kodla üretilen modele düşer.
// LOD: registerGlb'ye tek adres ya da grafik ayarına göre { 0: düşük, 1: orta, 2: yüksek } verilebilir.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { TextureLoader } from 'three';

// Yayınlanan sayfanın güvenlik politikası (CSP) fetch ile data:/blob: adreslerine bağlanmayı engelleyebilir.
// Bu yüzden gömülü GLB'ler fetch'siz çözülür: base64 → ArrayBuffer → parse; dokular da <img> ile
// (TextureLoader) yüklenir, ImageBitmapLoader'ın fetch'i kullanılmaz.
function dataUrlToBuffer(url) {
  const i = url.indexOf(',');
  const bin = atob(url.slice(i + 1));
  const out = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
  return out.buffer;
}
function noFetchTextures(loader) {
  if (loader && typeof loader.register === 'function') {
    loader.register((parser) => { parser.textureLoader = new TextureLoader(parser.options.manager); return { name: 'EDIN_img_textures' }; });
  }
  return loader;
}

const reg = new Map(); // "id|stage" → { lods, files, height, scale, rotY, opts }
const files = new Map(); // url → { status, gltf, promise, error }
const key = (id, stage) => `${id}|${stage}`;
let makeLoader = () => new GLTFLoader();
let quality = 1;

/** Testler için: yükleyiciyi değiştir (ör. hep hata veren sahte yükleyici). */
export function _setLoaderFactory(f) { makeLoader = f; }
export function _clearGlbs() { reg.clear(); files.clear(); }

/** Grafik ayarı (0/1/2) — hangi LOD'un kullanılacağını belirler. */
export function setGlbQuality(q) { quality = Math.max(0, Math.min(2, q | 0)); }

export function registerGlb(id, stage, url, opts = {}) {
  const lods = typeof url === 'string' ? { 0: url, 1: url, 2: url } : { 0: url[0] ?? url[1] ?? url[2], 1: url[1] ?? url[2] ?? url[0], 2: url[2] ?? url[1] ?? url[0] };
  reg.set(key(id, stage ?? '*'), { lods, height: opts.height, scale: opts.scale ?? 1, rotY: opts.rotY ?? 0, opts });
}
const fileOf = (url) => { if (!files.has(url)) files.set(url, { status: 'idle', gltf: null }); return files.get(url); };
const curUrl = (e) => e.lods[quality];

/** Giriş + o anki LOD'un durumu (status: idle | loading | ok | fail). */
export function glbEntry(id, stage) {
  const e = reg.get(key(id, stage)) || reg.get(key(id, '*')); if (!e) return null;
  const f = fileOf(curUrl(e));
  return { ...e, url: curUrl(e), status: f.status, gltf: f.gltf, error: f.error };
}
export function glbList() { return [...reg.entries()].map(([k, e]) => { const f = fileOf(curUrl(e)); return { key: k, url: curUrl(e), status: f.status, error: f.error }; }); }

function loadUrl(url) {
  const f = fileOf(url);
  if (f.status === 'ok') return Promise.resolve(true); if (f.status === 'fail') return Promise.resolve(false);
  if (!f.promise) {
    f.status = 'loading';
    f.promise = Promise.resolve().then(() => {
      const loader = noFetchTextures(makeLoader());
      if (typeof url === 'string' && url.startsWith('data:') && typeof loader.parseAsync === 'function') return loader.parseAsync(dataUrlToBuffer(url), '');
      return loader.loadAsync(url);
    })
      .then((gltf) => { f.gltf = gltf; f.status = 'ok'; return true; })
      .catch((err) => { f.status = 'fail'; f.error = String(err && err.message || err); if (typeof console !== 'undefined') console.warn('[Edin] GLB yüklenemedi, kod modeli kullanılacak:', String(url).slice(0, 60), f.error); return false; });
  }
  return f.promise;
}

export function loadGlb(id, stage) {
  const e = reg.get(key(id, stage)) || reg.get(key(id, '*')); if (!e) return Promise.resolve(false);
  return loadUrl(curUrl(e));
}

/** Kayıtlı bütün GLB'leri (o anki LOD) önceden yükler; biri bozuksa diğerleri etkilenmez. */
export function preloadGlbs() {
  return Promise.all([...reg.keys()].map((k) => { const [id, st] = k.split('|'); return loadGlb(id, st === '*' ? undefined : (isNaN(+st) ? st : +st)); }));
}

/** Yüklenmiş GLB'nin kopyası ya da null (yoksa/yüklenmediyse/bozuksa). Seçili LOD hazır değilse hazır olan başka LOD kullanılır. */
export function instantiateGlb(id, stage) {
  const e = reg.get(key(id, stage)) || reg.get(key(id, '*')); if (!e) return null;
  const order = [quality, 1, 2, 0].map((q) => e.lods[q]);
  const f = order.map((u) => files.get(u)).find((x) => x && x.status === 'ok' && x.gltf);
  if (!f) return null;
  try {
    const scene = cloneSkinned(f.gltf.scene);
    return { scene, clips: f.gltf.animations || [], height: e.height, scale: e.scale, rotY: e.rotY, opts: e.opts };
  } catch (err) { f.status = 'fail'; f.error = String(err); return null; }
}
