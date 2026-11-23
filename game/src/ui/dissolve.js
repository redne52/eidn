// Güvenli çözülme efekti (yalnız görsel).
//  • Gelişmiş yol: MeshStandard/Physical/Lambert/Phong malzemelerine onBeforeCompile ile gürültü tabanlı
//    "discard" + kenar ışıması eklenir. Kod modelleri ve Meshy GLB'leri aynı standart malzemeleri kullanır.
//  • Yedek yol: malzeme uyumsuzsa, shader derlemesi hata verirse ya da ?dissolve=fallback ile zorlanırsa
//    opaklık + küçülme (+ çağıranın parçacığı). Yedek her malzemede çalışır.
// Kullanım: const d = applyDissolve(object3D, { color: 0x5ff6ff }); d.set(0..1); ... d.dispose();
import * as THREE from 'three';

const FORCE_FALLBACK = typeof location !== 'undefined' && /[?&]dissolve=fallback/.test(location.search);
export const dissolveState = { failed: false, forced: FORCE_FALLBACK, active: new Set() };

// Shader derleme hatasını yakala: hata olursa bütün etkin çözülmeler yedek yola geçer.
let hooked = false;
function hookShaderErrors() {
  const rr = globalThis.__edinRenderer; if (hooked || !rr) return; hooked = true;
  const dbg = rr.debug; const prev = dbg.onShaderError;
  dbg.onShaderError = (gl, program, vs, fs) => {
    if (prev) { try { prev(gl, program, vs, fs); } catch {} }
    const vsrc = gl.getShaderSource(vs) || '', fsrc = gl.getShaderSource(fs) || '';
    if (/uDisK/.test(vsrc + fsrc)) {
      console.warn('Çözülme shader\'ı derlenemedi; yedek efekte geçiliyor.');
      dissolveState.failed = true;
      for (const d of dissolveState.active) d._toFallback();
    } else console.error('Shader hatası', gl.getProgramInfoLog(program));
  };
}

const NOISE = `
float dzHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dzNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dzHash(i + vec3(0,0,0)), dzHash(i + vec3(1,0,0)), f.x), mix(dzHash(i + vec3(0,1,0)), dzHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dzHash(i + vec3(0,0,1)), dzHash(i + vec3(1,0,1)), f.x), mix(dzHash(i + vec3(0,1,1)), dzHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`;

const supported = (m) => !!m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial) && !m.isShaderMaterial;

/**
 * @param root  Object3D (model.group)
 * @param o.color   kenar ışıması rengi
 * @param o.scale   gürültü sıklığı (dünya birimi başına)
 * @param o.edgeFirst  true: uçlardan (merkezden uzak noktalardan) başlar — hayalet için
 * @param o.center  edgeFirst için merkez (dünya), o.radius yarıçap
 */
export function applyDissolve(root, { color = 0x5ff6ff, scale = 3.2, edgeFirst = false, center = null, radius = 1.2, shrink = 0.35 } = {}) {
  hookShaderErrors();
  const uniforms = { uDisK: { value: 0 }, uDisCol: { value: new THREE.Color(color) }, uDisScale: { value: scale }, uDisEdge: { value: edgeFirst ? 1 : 0 }, uDisCenter: { value: center ? center.clone() : new THREE.Vector3() }, uDisRadius: { value: radius } };
  const entries = []; // { mesh, orig, mat }
  let fallback = FORCE_FALLBACK || dissolveState.failed;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = [].concat(o.material);
    const out = mats.map((m) => {
      const c = m.clone(); c.transparent = true; if (!m.userData.ghost) c.depthWrite = true;
      // clone() onBeforeCompile'ı taşımaz: önceki yamayı (ör. hayalet fresnel'i) koru
      if (m.onBeforeCompile && m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) c.onBeforeCompile = m.onBeforeCompile;
      if (m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) c.customProgramCacheKey = m.customProgramCacheKey;
      c.userData = { ...m.userData, op0: m.opacity ?? 1 };
      if (!fallback && supported(c)) patch(c); else c.userData.disFallback = true;
      return c;
    });
    entries.push({ mesh: o, orig: o.material });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  function patch(m) {
    const prev = m.onBeforeCompile; const prevKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : null;
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(m, sh, r);
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDisW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvDisW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vDisW; uniform float uDisK; uniform vec3 uDisCol; uniform float uDisScale; uniform float uDisEdge; uniform vec3 uDisCenter; uniform float uDisRadius;${NOISE}`)
        .replace(/}\s*$/, `
  float dzN = dzNoise(vDisW * uDisScale) * 0.75 + dzNoise(vDisW * uDisScale * 2.7) * 0.25;
  if (uDisEdge > 0.5) dzN = mix(dzN, 1.0 - clamp(length(vDisW - uDisCenter) / uDisRadius, 0.0, 1.0), 0.55);
  float dzT = uDisK * 1.08 - 0.04;
  if (dzN < dzT) discard;
  float dzE = 1.0 - smoothstep(0.0, 0.09, dzN - dzT);
  gl_FragColor.rgb += uDisCol * dzE * 2.2 * step(0.001, uDisK);
}`);
    };
    m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|dissolve' + (edgeFirst ? 'E' : '');
    m.needsUpdate = true;
  }
  const s0 = root.scale.clone();
  const api = {
    get fallback() { return fallback; },
    /** k: 0 (tam) → 1 (tamamen çözülmüş). alpha: ek opaklık çarpanı (hayaletin belirmesi için). */
    set(k, alpha = 1) {
      k = Math.max(0, Math.min(1, k)); api._alpha = alpha;
      uniforms.uDisK.value = k;
      root.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        for (const m of [].concat(o.material)) {
          const op0 = m.userData.op0 ?? 1;
          m.opacity = op0 * alpha * (fallback || m.userData.disFallback ? 1 - k : 1);
        }
      });
      if (fallback) root.scale.copy(s0).multiplyScalar(1 - shrink * k);
    },
    setCenter(v) { uniforms.uDisCenter.value.copy(v); },
    _toFallback() {
      if (fallback) return; fallback = true;
      root.traverse((o) => { if (!o.isMesh || !o.material) return; o.material = [].concat(o.material).map((m) => { const c = new THREE.MeshBasicMaterial({ color: m.color ? m.color.clone() : 0xffffff, map: m.map || null, transparent: true, depthWrite: !m.userData.ghost }); c.userData = { op0: m.userData.op0 ?? 1, disFallback: true }; m.dispose(); return c; }); if (o.material.length === 1) o.material = o.material[0]; });
      api.set(uniforms.uDisK.value, api._alpha ?? 1);
    },
    dispose(restore = false) {
      dissolveState.active.delete(api);
      for (const e of entries) { const cur = [].concat(e.mesh.material); if (restore) e.mesh.material = e.orig; cur.forEach((m) => m !== e.orig && m.dispose && m.dispose()); }
      if (restore) root.scale.copy(s0);
    },
  };
  dissolveState.active.add(api);
  return api;
}
