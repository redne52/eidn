// Ruh Çekirdeği kristali: yontulmuş icosahedron, iç parıltı + kenar ışıması (fresnel), derece renginde çatlaklar.
// MeshPhysicalMaterial transmission KULLANILMAZ (mobilde pahalı); tek özel shader.
import * as THREE from 'three';
import R from '../data/rules.json';

export const CORE_COLOR = { kil: 0x9a8468, lacivert: 0x2b5bd6, altin: 0xe8b84a, kader: 0xb0306a };
// açılışta ışık sütunu / çatlak rengi (plan 7.3)
export const PULL_COLOR = { C: 0xb8bec4, B: 0x4fd17a, A: 0x3a8cff, S: 0xf2c14e, M: 0xd0306a };
export const pullKey = (p) => (p.mythic ? 'M' : p.grade);
export const RANK = { C: 0, B: 1, A: 2, S: 3, M: 4 };
export const coreName = (t) => (R.soulCores && R.soulCores.types[t] ? R.soulCores.types[t].name : t);

const VERT = `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vP = position; gl_Position = projectionMatrix * mv; }`;
const FRAG = `
uniform vec3 uCol; uniform vec3 uCrackCol; uniform float uCrack; uniform float uTime; uniform float uAlpha; uniform float uGlow;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  vec3 n = normalize(vN); vec3 v = normalize(vV);
  float ndv = abs(dot(n, v));
  float fr = pow(1.0 - ndv, 2.4);
  // v5: yontulmuş yüzeyler (düz normaller) + sahte gökyüzü yansıması + iç kırılma desenleri
  vec3 rf = reflect(-v, n); float sky = smoothstep(-0.3, 0.9, rf.y);
  vec3 rr = refract(-v, n, 0.66);
  float caust = pow(abs(sin(dot(rr, vec3(3.1, 5.7, 2.3)) * 3.0 + uTime * 1.3)), 10.0) + pow(abs(sin(dot(rr, vec3(-4.3, 2.2, 3.9)) * 2.4 - uTime * 0.9)), 14.0);
  float inner = 0.55 + 0.45 * sin(uTime * 2.0 + vP.y * 4.0);
  vec3 deep = uCol * 0.22;
  vec3 c = mix(deep, uCol * (0.6 + 0.5 * inner), smoothstep(0.15, 0.95, ndv));
  c += uCol * caust * 0.9;
  c += mix(vec3(0.04, 0.05, 0.08), vec3(1.0, 0.96, 0.9), sky) * fr * 0.9;
  c += uCol * fr * 1.4 + vec3(1.0) * pow(fr, 6.0) * 0.8;
  float spark = step(0.985, h(floor(vP * 26.0 + floor(uTime * 3.0)))) * pow(ndv, 4.0);
  c += vec3(1.0) * spark * 2.0;
  // çatlaklar: yüzey koordinatında ince parlak çizgiler, uCrack arttıkça çoğalır
  float l1 = abs(fract(vP.x * 3.1 + vP.y * 1.7 + h(floor(vP * 3.0)) ) - 0.5);
  float l2 = abs(fract(vP.z * 2.6 - vP.y * 2.2) - 0.5);
  float w = 0.02 + 0.06 * uCrack;
  float cr = (1.0 - smoothstep(0.0, w, l1)) * step(0.3, uCrack + h(floor(vP * 2.0)) * 0.7) + (1.0 - smoothstep(0.0, w, l2)) * step(0.65, uCrack);
  c += uCrackCol * cr * uCrack * 4.0;
  c *= (1.15 + uGlow);
  gl_FragColor = vec4(c, uAlpha * (0.82 + 0.18 * fr));
}`;

export function makeCrystal(type, { size = 0.32 } = {}) {
  const geo = new THREE.IcosahedronGeometry(size, 0);
  // hafif yontma: köşeleri rastgele oynat, dikeyde uzat
  const pa = geo.attributes.position; const seen = new Map();
  for (let i = 0; i < pa.count; i++) {
    const k = `${pa.getX(i).toFixed(3)},${pa.getY(i).toFixed(3)},${pa.getZ(i).toFixed(3)}`;
    let j = seen.get(k); if (!j) { j = 0.85 + Math.random() * 0.3; seen.set(k, j); }
    pa.setXYZ(i, pa.getX(i) * j, pa.getY(i) * j * 1.55, pa.getZ(i) * j);
  }
  const fgeo = geo.toNonIndexed(); geo.dispose(); fgeo.computeVertexNormals(); // düz yüzeyler: yontulmuş taş
  const col = new THREE.Color(CORE_COLOR[type] ?? 0x9a8468);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    uniforms: { uCol: { value: col }, uCrackCol: { value: new THREE.Color(0xffffff) }, uCrack: { value: 0 }, uTime: { value: 0 }, uAlpha: { value: 1 }, uGlow: { value: 0 } } });
  const mesh = new THREE.Mesh(fgeo, mat);
  const group = new THREE.Group(); group.add(mesh);
  // iç çekirdek: kristalin içinde nabız gibi atan parlak öz (eklemeli, son işlemde parlar)
  const coreGeo = new THREE.IcosahedronGeometry(size * 0.42, 1);
  const coreMat = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.2), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const core = new THREE.Mesh(coreGeo, coreMat); core.scale.y = 1.4; core.renderOrder = 2; mesh.renderOrder = 1; group.add(core);
  // yumuşak hale (additive sprite)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  halo.scale.setScalar(size * 4.2); group.add(halo);
  return {
    group, mesh, halo, type,
    update(dt) { mat.uniforms.uTime.value += dt; mesh.rotation.y += dt * 0.9; const tt = mat.uniforms.uTime.value; core.rotation.y -= dt * 1.7; core.scale.setScalar(0.9 + 0.12 * Math.sin(tt * 3.1)); core.scale.y *= 1.4; },
    setCrack(k, color) { mat.uniforms.uCrack.value = k; if (color != null) mat.uniforms.uCrackCol.value.set(color); },
    setGlow(k) { mat.uniforms.uGlow.value = k; halo.material.opacity = 0.55 + k * 0.6; coreMat.opacity = Math.min(1, 0.85 + k * 0.3); },
    setAlpha(a) { mat.uniforms.uAlpha.value = a; halo.material.opacity = 0.55 * a; coreMat.opacity = 0.85 * a; },
    dispose() { fgeo.dispose(); mat.dispose(); halo.material.dispose(); coreGeo.dispose(); coreMat.dispose(); },
  };
}

let _halo = null;
export function haloTex() {
  if (_halo) return _halo;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); _halo = new THREE.CanvasTexture(c); return _halo;
}

/** Kristal kırılması: parçalar (tek InstancedMesh) + ışık sütunu + flaş. Döner: { update(dt), done:Promise, dispose() } */
export function shatterFx(scene, at, color, { mythic = false, reduced = false, quality = 1 } = {}) {
  const n = reduced ? 8 : quality === 0 ? 14 : 24;
  const sg = new THREE.TetrahedronGeometry(0.07, 0);
  const sm = new THREE.MeshBasicMaterial({ color, transparent: true });
  const shards = new THREE.InstancedMesh(sg, sm, n); shards.frustumCulled = false;
  const vel = [], rot = [], p = [];
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.6 + 0.6, (Math.random() - 0.5) * 3); vel.push(v); rot.push(new THREE.Euler(Math.random() * 6, Math.random() * 6, 0)); p.push(at.clone()); }
  scene.add(shards);
  // ışık sütunu
  const pillarH = mythic ? 9 : 6;
  const pg = new THREE.CylinderGeometry(0.28, 0.5, pillarH, 16, 1, true); pg.translate(0, pillarH / 2, 0);
  const pmat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const pillar = new THREE.Mesh(pg, pmat); pillar.position.copy(at).setY(at.y - 0.4); scene.add(pillar);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 }));
  flash.position.copy(at); flash.scale.setScalar(0.2); scene.add(flash);
  const light = !reduced && quality > 0 ? new THREE.PointLight(color, 10, 9) : null; if (light) { light.position.copy(at).setY(at.y + 0.6); scene.add(light); }
  let t = 0, resolve; const done = new Promise((r) => (resolve = r)); let fin = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  const api = {
    done,
    update(dt) {
      if (fin) return; t += dt;
      for (let i = 0; i < n; i++) { vel[i].y -= 5 * dt; p[i].addScaledVector(vel[i], dt); rot[i].x += dt * 6; rot[i].y += dt * 5; q.setFromEuler(rot[i]); m4.compose(p[i], q, one.clone().multiplyScalar(Math.max(0.01, 1 - t / 1.4))); shards.setMatrixAt(i, m4); }
      shards.instanceMatrix.needsUpdate = true; sm.opacity = Math.max(0, 1 - t / 1.4);
      const kp = Math.min(1, t / 0.25); pmat.opacity = (t < 0.25 ? kp : Math.max(0, 1 - (t - 0.25) / 1.2)) * (mythic ? 0.75 : 0.55);
      pillar.scale.set(1 + t * 0.6, Math.min(1, t * 5), 1 + t * 0.6);
      flash.scale.setScalar(0.2 + Math.min(1, t * 6) * (mythic ? 4.5 : 3)); flash.material.opacity = Math.max(0, 1 - t / 0.7);
      if (light) light.intensity = Math.max(0, 10 * (1 - t / 0.9));
      if (t > 1.45) api.dispose();
    },
    dispose() { if (fin) return; fin = true; [shards, pillar, flash].forEach((o) => scene.remove(o)); if (light) scene.remove(light); sg.dispose(); sm.dispose(); pg.dispose(); pmat.dispose(); flash.material.dispose(); resolve(); },
  };
  return api;
}
