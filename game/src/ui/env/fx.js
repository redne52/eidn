// Ortam efektleri: gökyüzü kubbesi, parçacıklar, su, rüzgârlı ot, kuşlar, yıldırım, alev, ışık sütunu.
// Hepsi tek çizim çağrısı olacak şekilde (Points / InstancedMesh / tek mesh) yazıldı.
import * as THREE from 'three';
import { glowTex, rng } from './textures.js';

export const clock = { t: 0 };           // bütün shader'ların ortak zamanı
const timeUniform = { value: 0 };
export function tickFx(dt) { clock.t += dt; timeUniform.value = clock.t; }

const GLSL_NOISE = `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p, int o){ float s=0., a=.5; for(int i=0;i<5;i++){ if(i>=o) break; s+=a*vn(p); p*=2.03; a*=.5; } return s; }
`;

// ---------- gökyüzü ----------
// env: { skyTop, skyMid, horizon, below, sunDir:[x,y,z], sunColor, sunSize, clouds(0..1), cloudColor, stars }
export function makeSky(env, q = 1) {
  const u = {
    uTop: { value: new THREE.Color(env.skyTop) }, uMid: { value: new THREE.Color(env.skyMid) }, uHor: { value: new THREE.Color(env.horizon) },
    uBelow: { value: new THREE.Color(env.below) }, uSun: { value: new THREE.Vector3(...env.sunDir).normalize() }, uSunCol: { value: new THREE.Color(env.sunColor) },
    uSunSize: { value: env.sunSize ?? 0.03 }, uClouds: { value: env.clouds ?? 0.3 }, uCloudCol: { value: new THREE.Color(env.cloudColor ?? 0xffffff) },
    uStars: { value: env.stars ? 1 : 0 }, uFlash: { value: 0 }, uTime: timeUniform, uOct: { value: q === 0 ? 2 : q === 1 ? 4 : 5 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z=gl_Position.w*0.9999; }`,
    fragmentShader: `${GLSL_NOISE}
      uniform vec3 uTop,uMid,uHor,uBelow,uSun,uSunCol,uCloudCol; uniform float uSunSize,uClouds,uStars,uFlash,uTime; uniform int uOct; varying vec3 vDir;
      void main(){ vec3 d=normalize(vDir); float y=d.y;
        vec3 c = y>0. ? mix(uHor, mix(uMid,uTop,smoothstep(.25,.9,y)), smoothstep(0.,.25,y)) : mix(uHor,uBelow,smoothstep(0.,-.2,y));
        float sd=max(dot(d,uSun),0.); c+=uSunCol*(pow(sd,600.*(0.03/uSunSize))*1.4 + pow(sd,12.)*0.35 + pow(sd,3.)*0.12)*step(-.05,y);
        if(uClouds>0. && y>-.02){ vec2 p=d.xz/(y+.18)*1.6; p.x+=uTime*.02;
          float n=fbm(p,uOct); float cl=smoothstep(1.-uClouds,1.-uClouds+.35,n)*smoothstep(-.02,.15,y);
          vec3 cc=uCloudCol*(.75+.5*fbm(p*2.+3.,2)); cc+=uSunCol*pow(sd,4.)*.6; c=mix(c,cc,cl*.9); }
        if(uStars>0.){ vec2 sp=d.xz/(abs(y)+.3)*60.; float s=step(.995,h21(floor(sp))); c+=s*smoothstep(.1,.6,y)*vec3(.9,.8,1.)*(.6+.4*sin(uTime*2.+h21(floor(sp))*20.)); }
        c+=uFlash*vec3(.55,.6,.75)*smoothstep(-.1,.5,y);
        gl_FragColor=vec4(c,1.); }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), m); mesh.frustumCulled = false; mesh.renderOrder = -10;
  mesh.userData.u = u; return mesh;
}

// ---------- parçacıklar ----------
// box: [x0,y0,z0,x1,y1,z1]; mode: 'float' (yukarı süzülür), 'dust' (yatay sürüklenir), 'rain' (aşağı), 'orbit'
export function makeParticles({ count, box, color = 0xffffff, size = 0.15, speed = 0.4, mode = 'float', opacity = 0.9, seed = 1, additive = true }) {
  const R = rng(seed); const pos = new Float32Array(count * 3), ph = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3] = box[0] + R() * (box[3] - box[0]); pos[i * 3 + 1] = box[1] + R() * (box[4] - box[1]); pos[i * 3 + 2] = box[2] + R() * (box[5] - box[2]); ph[i] = R() * 100; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: new THREE.Color(color) }, uSize: { value: size * 300 }, uOp: { value: opacity }, uMap: { value: glowTex() }, uMin: { value: new THREE.Vector3(box[0], box[1], box[2]) }, uMax: { value: new THREE.Vector3(box[3], box[4], box[5]) }, uSpeed: { value: speed }, uMode: { value: { float: 0, dust: 1, rain: 2, orbit: 3 }[mode] } }]),
    vertexShader: `attribute float aPh; uniform float uSize,uSpeed,uMode; uniform vec3 uMin,uMax; uniform float uTime; varying float vA;
      #include <fog_pars_vertex>
      void main(){ vec3 p=position; vec3 s=uMax-uMin; float t=uTime*uSpeed;
        if(uMode<.5){ p.y=uMin.y+mod(p.y-uMin.y+t*(.6+fract(aPh)*.8),s.y); p.x+=sin(t*.7+aPh)*.6; p.z+=cos(t*.6+aPh)*.6; vA=sin(3.14159*(p.y-uMin.y)/s.y); }
        else if(uMode<1.5){ p.x=uMin.x+mod(p.x-uMin.x+t*(1.+fract(aPh)),s.x); p.y+=sin(t+aPh)*.3; vA=.6+.4*sin(aPh+t); }
        else if(uMode<2.5){ p.y=uMax.y-mod(uMax.y-p.y+t*8.,s.y); p.x+=t*1.5-floor((p.x+t*1.5-uMin.x)/s.x)*s.x; vA=.8; }
        else { float a=aPh+t*.4; float r=length(p.xz-(uMin.xz+s.xz*.5)); p.x=uMin.x+s.x*.5+cos(a)*r; p.z=uMin.z+s.z*.5+sin(a)*r; p.y+=sin(t*1.3+aPh)*.5; vA=.7+.3*sin(aPh*3.+t*2.); }
        vec4 mvPosition=modelViewMatrix*vec4(p,1.); gl_PointSize=uSize*(uMode>1.5&&uMode<2.5?.5:1.)/(-mvPosition.z); gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`.replace('uniform float uTime;', 'uniform float uTime;'),
    fragmentShader: `uniform vec3 uCol; uniform float uOp,uMode; uniform sampler2D uMap; varying float vA;
      #include <fog_pars_fragment>
      void main(){ vec2 uv=gl_PointCoord; if(uMode>1.5&&uMode<2.5) uv.x=.5+(uv.x-.5)*4.; float a=texture2D(uMap,uv).a*uOp*vA; if(a<.01) discard; gl_FragColor=vec4(uCol,a);
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uTime = timeUniform;
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; return pts;
}

// ---------- su ----------
export function makeWater(w, h, { deep = 0x1d4f63, shallow = 0x4f9fae, sky = 0xf3c58a, glint = 0xffe2a8, opacity = 0.88, circle = false } = {}) {
  const geo = circle ? new THREE.CircleGeometry(w / 2, 28) : new THREE.PlaneGeometry(w, h, 1, 1);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uDeep: { value: new THREE.Color(deep) }, uShal: { value: new THREE.Color(shallow) }, uSky: { value: new THREE.Color(sky) }, uGl: { value: new THREE.Color(glint) }, uOp: { value: opacity } }]),
    vertexShader: `varying vec3 vW; varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vec4 mvPosition=viewMatrix*w; gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `${GLSL_NOISE} uniform vec3 uDeep,uShal,uSky,uGl; uniform float uOp,uTime; varying vec3 vW; varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){ vec3 v=normalize(cameraPosition-vW); vec2 p=vW.xz*.35;
        float n=fbm(p+vec2(uTime*.05,uTime*.03),3)+fbm(p*1.7-vec2(uTime*.04,0.),3)*.5;
        vec3 nrm=normalize(vec3((n-.75)*.6,1.,(fbm(p.yx+uTime*.04,2)-.5)*.6));
        float fr=pow(1.-max(dot(v,nrm),0.),3.);
        vec3 c=mix(uDeep,uShal,n*.6); c=mix(c,uSky,fr*.75);
        float g=smoothstep(.86,.95,fbm(p*4.+uTime*.25,3)); c+=uGl*g*.55;
        float edge=1.; ${'/*kenar yumuşatma*/'}
        gl_FragColor=vec4(c,uOp*edge);
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uTime = timeUniform;
  const mesh = new THREE.Mesh(geo, m); mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 1; return mesh;
}

// ---------- rüzgârlı ot / saz (instanced) ----------
const windMats = new Map();
function windMat(color, sway) {
  const key = color + ':' + sway; if (windMats.has(key)) return windMats.get(key);
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, vertexColors: false }); m.userData.wind = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeUniform;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 ip = vec3(instanceMatrix[3][0], 0., instanceMatrix[3][2]);
      float sw = sin(uTime*1.8 + ip.x*.35 + ip.z*.22) + .4*sin(uTime*3.1 + ip.x*.9);
      transformed.x += sw * ${sway.toFixed(3)} * position.y * position.y; transformed.z += sw*.4*${sway.toFixed(3)}*position.y*position.y;`);
  };
  windMats.set(key, m); return m;
}
// kümeler: [{x,z,r,n}] — her küme etrafına n sap
export function makeGrass(clumps, { color = 0x8a8a45, color2 = 0x5e6a2c, height = 0.9, width = 0.07, sway = 0.18, seed = 3, heightAt = () => 0, blades = 3 } = {}) {
  const R = rng(seed);
  // tek sap: incelen üçgen şerit (2 segment)
  const g = new THREE.BufferGeometry();
  const v = [-width, 0, 0, width, 0, 0, -width * 0.6, 0.5, 0, width * 0.6, 0.5, 0, 0, 1, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]); g.computeVertexNormals();
  let total = 0; clumps.forEach((c) => (total += c.n));
  const im = new THREE.InstancedMesh(g, windMat(color, sway), total); const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler(); const col = new THREE.Color();
  let i = 0;
  for (const c of clumps) for (let k = 0; k < c.n; k++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * c.r; const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    P.set(x, heightAt(x, z) - 0.02, z); E.set((R() - 0.5) * 0.4, R() * Math.PI, (R() - 0.5) * 0.4); Q.setFromEuler(E); const hh = height * (0.6 + R() * 0.8); S.set(1, hh, 1);
    M.compose(P, Q, S); im.setMatrixAt(i, M); col.setHex(R() < 0.5 ? color : color2).multiplyScalar(0.8 + R() * 0.4); im.setColorAt(i, col); i++;
  }
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; return im;
}

// ---------- alev (billboard sprite'lar) ----------
export function makeFlames(points, { color = 0xffa040, size = 0.9 } = {}) {
  const grp = new THREE.Group();
  const mat = new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const inner = new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff0c0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  points.forEach((p, i) => {
    const s = new THREE.Sprite(mat); s.position.set(p.x, p.y, p.z); s.userData = { ph: i * 1.7, b: size }; grp.add(s);
    const s2 = new THREE.Sprite(inner); s2.position.set(p.x, p.y - size * 0.1, p.z); s2.userData = { ph: i * 1.7 + 0.5, b: size * 0.45 }; grp.add(s2);
  });
  grp.userData.update = () => grp.children.forEach((s) => { const u = s.userData; const k = 0.85 + Math.sin(clock.t * 11 + u.ph) * 0.08 + Math.sin(clock.t * 23 + u.ph * 2) * 0.05; s.scale.set(u.b * k, u.b * k * 1.35, 1); });
  grp.userData.update();
  return grp;
}

// ---------- ışık sütunu (uzaktan görünür yön işareti) ----------
export function makeLightPillar(height = 60, radius = 1.2, color = 0x7ff0e0) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uCol: { value: new THREE.Color(color) }, uTime: timeUniform },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uCol; uniform float uTime; varying vec2 vUv;
      void main(){ float side=pow(sin(vUv.x*3.14159*2.)*.5+.5,2.); float fade=pow(1.-vUv.y,1.4); float band=.75+.25*sin(vUv.y*40.-uTime*3.);
        gl_FragColor=vec4(uCol*(1.2), fade*(.25+.35*side)*band); }`,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius, height, 16, 1, true), m); mesh.position.y = height / 2; mesh.frustumCulled = false; return mesh;
}

// ---------- kuşlar ----------
export function makeBirds(n, center, radius, height, color = 0x2a2420, seed = 9) {
  const R = rng(seed); const grp = new THREE.Group();
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.15, -0.5, 0.05, -0.1, 0, 0, -0.15, 0, 0, 0.15, 0.5, 0.05, -0.1, 0, 0, -0.15], 3));
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true });
  for (let i = 0; i < n; i++) { const b = new THREE.Mesh(geo, mat); b.userData = { a: R() * 6.28, r: radius * (0.6 + R() * 0.5), h: height + R() * 6, s: 0.12 + R() * 0.1, ph: R() * 6 }; b.scale.setScalar(1.4); grp.add(b); }
  grp.userData.update = () => grp.children.forEach((b) => {
    const u = b.userData; const a = u.a + clock.t * u.s; b.position.set(center.x + Math.cos(a) * u.r, u.h + Math.sin(clock.t * 0.5 + u.ph), center.z + Math.sin(a) * u.r);
    b.rotation.y = -a; b.scale.y = 1.4 * (0.4 + Math.abs(Math.sin(clock.t * 6 + u.ph)));
  });
  return grp;
}

// ---------- yıldırım ----------
export function makeLightning(scene, sky, lights, area, { color = 0xcfe0ff, every = [4, 9] } = {}) {
  const R = rng(77); const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const bolt = new THREE.Mesh(new THREE.BufferGeometry(), mat); bolt.frustumCulled = false; scene.add(bolt);
  let next = 2 + R() * 3, flash = 0; const base = lights.map((l) => l.intensity);
  function rebuild() {
    const x0 = area.x0 + R() * (area.x1 - area.x0), z0 = area.z; const top = 70, pts = [];
    let x = x0, y = top; while (y > 0) { pts.push([x, y]); y -= 3 + R() * 5; x += (R() - 0.5) * 6; } pts.push([x, 0]);
    const v = []; const w = 0.35;
    for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; v.push(ax - w, ay, z0, ax + w, ay, z0, bx - w, by, z0, ax + w, ay, z0, bx + w, by, z0, bx - w, by, z0); }
    bolt.geometry.dispose(); bolt.geometry = new THREE.BufferGeometry(); bolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  }
  return {
    update(dt) {
      next -= dt; if (next <= 0) { next = every[0] + R() * (every[1] - every[0]); flash = 1; rebuild(); }
      if (flash > 0) {
        flash = Math.max(0, flash - dt * 3.2); const f = flash > 0.7 ? 1 : flash * (0.6 + 0.4 * Math.sin(clock.t * 60));
        mat.opacity = f; sky.userData.u.uFlash.value = f * 0.8; lights.forEach((l, i) => (l.intensity = base[i] * (1 + f * 1.6)));
      } else { mat.opacity = 0; sky.userData.u.uFlash.value = 0; }
    },
  };
}

// ---------- karakter altı yumuşak gölge ----------
let blobGeo, blobMat;
export function blobShadow(r = 0.7) {
  if (!blobGeo) {
    blobGeo = new THREE.CircleGeometry(1, 20);
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  }
  const m = new THREE.Mesh(blobGeo, blobMat); m.rotation.x = -Math.PI / 2; m.scale.setScalar(r); m.renderOrder = 2; return m;
}

// ---------- ışık huzmeleri (god-ray benzeri, ucuz: eğik toplamalı düzlemler) ----------
let shaftTex;
export function makeLightShafts(items, { color = 0xffd9a0, opacity = 0.22 } = {}) {
  if (!shaftTex) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    const gx = g.createLinearGradient(0, 0, 64, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, 64, 256);
    shaftTex = new THREE.CanvasTexture(c);
  }
  const grp = new THREE.Group(); const mats = [];
  items.forEach((it, i) => {
    const m = new THREE.MeshBasicMaterial({ map: shaftTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(it.w ?? 3, it.h ?? 18), m);
    p.position.set(it.x, it.y ?? 8, it.z); p.rotation.set(0, it.ry ?? 0, it.tilt ?? 0.45); grp.add(p); mats.push([m, i * 1.7]);
  });
  grp.userData.update = () => mats.forEach(([m, ph]) => (m.opacity = opacity * (0.65 + 0.35 * Math.sin(clock.t * 0.6 + ph))));
  return grp;
}
