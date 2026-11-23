// Yaratık yüzey shader'ı (görsel v5). MeshStandardMaterial'a onBeforeCompile ile eklenir:
// - Dokular UV yerine NESNE (bağlama pozu) uzayında üç düzlemli (triplanar) hesaplanır → küre üzerindeki "bant" görünümü yok.
// - Desen yüksekliği hem rengi (kenarları koyu) hem pürüzlülüğü hem de normali (dFdx/dFdy ile kabartma) değiştirir.
// - Fresnel kenar ışığı (rim) siluet okunurluğunu artırır.
// Malzeme clone() edilince onBeforeCompile kopyalanmaz: upgradeSurface(klon, kaynak.userData.edinSurf) yeniden uygula.
const PAT = { scale: 1, dscale: 2, plate: 3, chitin: 4, fur: 5, hide: 6, feather: 7, mem: 8, horn: 9 };
export const SURF_DEFAULTS = {
  scale: { pat: 'scale', freq: 8, bump: 0.6, rough: 0.36, rim: 0.32, dark: 0.68 },
  dscale: { pat: 'dscale', freq: 7.5, bump: 0.7, rough: 0.6, rim: 0.3, dark: 0.66 },
  plate: { pat: 'plate', freq: 4.5, bump: 0.9, rough: 0.8, rim: 0.22, dark: 0.62 },
  chitin: { pat: 'chitin', freq: 5, bump: 0.7, rough: 0.34, rim: 0.42, dark: 0.66 },
  fur: { pat: 'fur', freq: 6, bump: 0.5, rough: 0.92, rim: 0.4, dark: 0.72 },
  hide: { pat: 'hide', freq: 5, bump: 0.45, rough: 0.8, rim: 0.26, dark: 0.78 },
  feather: { pat: 'feather', freq: 6, bump: 0.6, rough: 0.75, rim: 0.34, dark: 0.66 },
  mem: { pat: 'mem', freq: 5, bump: 0.5, rough: 0.7, rim: 0.45, dark: 0.55, back: 0.55 },
  horn: { pat: 'horn', freq: 7, bump: 0.25, rough: 0.3, rim: 0.3, dark: 0.86 },
};

const HEAD = `
varying vec3 vEdP; varying vec3 vEdN;
uniform float uEdPat; uniform float uEdFreq; uniform float uEdBump; uniform float uEdRim; uniform float uEdDark; uniform float uEdBack;
float edH(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float edN(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(edH(i), edH(i+vec2(1,0)), f.x), mix(edH(i+vec2(0,1)), edH(i+vec2(1,1)), f.x), f.y); }
float edVor(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++){ vec2 g = vec2(float(x), float(y)); vec2 o = vec2(edH(i+g), edH(i+g+17.3));
    float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return d2 - d1; }
float edPat(vec2 p){
  float t = uEdPat;
  if (t < 1.5) { float row = floor(p.y); vec2 f = vec2(fract(p.x + mod(row, 2.0) * 0.5) - 0.5, fract(p.y)); float d = length(vec2(f.x, f.y * 1.15)); return clamp(1.0 - d * 1.45, 0.0, 1.0) * 0.85 + edN(p * 3.0) * 0.15; }
  if (t < 2.5) { float row = floor(p.y); float fx = abs(fract(p.x + mod(row, 2.0) * 0.5) - 0.5); float fy = fract(p.y); float d = fx * 1.3 + (1.0 - fy) * 0.8; return smoothstep(1.0, 0.25, d) * 0.85 + edN(p * 4.0) * 0.15; }
  if (t < 3.5) { float e = edVor(p); return smoothstep(0.02, 0.14, e) * (0.8 + 0.2 * edN(p * 5.0)); }
  if (t < 4.5) { float b = pow(abs(sin(p.y * 3.14159)), 0.35); return b * 0.8 + edN(p * vec2(6.0, 1.5)) * 0.2; }
  if (t < 5.5) { return edN(p * vec2(5.0, 0.7)) * 0.6 + edN(p * vec2(16.0, 2.0)) * 0.4; }
  if (t < 6.5) { return edN(p * 1.7) * 0.6 + edN(p * 5.0) * 0.3 + (1.0 - abs(edN(p * 3.0) * 2.0 - 1.0)) * 0.25; }
  if (t < 7.5) { vec2 q = p * vec2(1.0, 0.6); float row = floor(q.y); vec2 f = vec2(fract(q.x + mod(row, 2.0) * 0.5) - 0.5, fract(q.y)); return clamp(1.0 - length(vec2(f.x * 1.6, f.y)) * 1.3, 0.0, 1.0) * 0.8 + edN(p * 9.0) * 0.2; }
  if (t < 8.5) { float r = 1.0 - abs(edN(p * 1.3) * 2.0 - 1.0); float v2 = 1.0 - abs(edN(p * 3.1 + 7.0) * 2.0 - 1.0); return 1.0 - smoothstep(0.86, 0.97, max(r, v2 * 0.96)) * 0.8; }
  return 0.75 + 0.25 * edN(p * vec2(1.0, 7.0));
}
float edTri(vec3 p, vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
  return edPat(p.zy) * w.x + edPat(p.xz) * w.y + edPat(p.xy) * w.z; }
vec3 edBumpN(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir){
  vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos); vec3 R1 = cross(sy, surf_norm), R2 = cross(surf_norm, sx);
  float det = dot(sx, R1) * faceDir; vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(det) * surf_norm - grad); }`;

export function upgradeSurface(m, cfg) {
  if (!m || !cfg) return m;
  m.userData.edinSurf = cfg;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev && prev !== m.onBeforeCompile) prev(sh, r);
    Object.assign(sh.uniforms, {
      uEdPat: { value: PAT[cfg.pat] || 6 }, uEdFreq: { value: cfg.freq }, uEdBump: { value: cfg.bump },
      uEdRim: { value: cfg.rim }, uEdDark: { value: cfg.dark }, uEdBack: { value: cfg.back || 0 },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEdP; varying vec3 vEdN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdP = position; vEdN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec3 edq = vEdP * uEdFreq; float edw = length(fwidth(edq)); float edFade = 1.0 - smoothstep(0.18, 0.55, edw);\nfloat edh = mix(0.72, edTri(edq, normalize(vEdN)), edFade);\ndiffuseColor.rgb *= mix(uEdDark, 1.12, edh);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * mix(1.18, 0.82, edh), 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = edBumpN(-vViewPosition, normal, vec2(dFdx(edh), dFdy(edh)) * uEdBump * 0.012 * edFade, faceDirection);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ vec3 vd = normalize(vViewPosition); float fr = pow(1.0 - clamp(abs(dot(normal, vd)), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += mix(vec3(1.0, 0.93, 0.82), diffuseColor.rgb * 2.2, 0.45) * fr * uEdRim;
  totalEmissiveRadiance += diffuseColor.rgb * uEdBack * (0.35 + 0.65 * fr); }`);
  };
  m.customProgramCacheKey = () => 'edsurf-' + cfg.pat;
  m.needsUpdate = true;
  return m;
}
