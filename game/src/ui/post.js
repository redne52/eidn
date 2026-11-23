// Son işlem (post-processing): Orta/Yüksek grafikte bloom + renk düzenleme + vinyet + kenar yumuşatma.
// Düşük grafikte hiç kullanılmaz (doğrudan render). Bloom yarım çözünürlükte çalışır (mobil maliyeti).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

// renk düzenleme + vinyet (sRGB uzayında, OutputPass'ten sonra)
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTint: { value: new THREE.Color(1, 1, 1) }, uContrast: { value: 1.06 }, uSat: { value: 1.08 },
    uVig: { value: 0.32 }, uLift: { value: 0.0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 uTint; uniform float uContrast,uSat,uVig,uLift; varying vec2 vUv;
    void main(){ vec4 c=texture2D(tDiffuse,vUv); vec3 col=c.rgb;
      float l=dot(col,vec3(.2126,.7152,.0722)); col=mix(vec3(l),col,uSat);
      col=(col-.5)*uContrast+.5; col*=uTint; col+=uLift;
      vec2 d=vUv-.5; d.x*=1.25; float v=1.-uVig*smoothstep(.25,.85,length(d)); col*=v;
      gl_FragColor=vec4(clamp(col,0.,1.),c.a); }`,
};

// bölge renk tonları (sinematik ama okunur)
export const GRADE = {
  gate: { tint: [1.03, 0.99, 0.93], contrast: 1.12, sat: 1.1, vig: 0.32, bloom: [0.32, 0.45, 1.35] },
  kiyi: { tint: [1.02, 1.0, 0.95], contrast: 1.12, sat: 1.1, vig: 0.3, bloom: [0.28, 0.45, 1.4] },
  bozkir: { tint: [1.06, 1.0, 0.95], contrast: 1.1, sat: 1.04, vig: 0.34, bloom: [0.28, 0.45, 1.3] },
  derin: { tint: [1.04, 0.98, 1.04], contrast: 1.06, sat: 0.98, vig: 0.36, bloom: [0.6, 0.55, 0.85] },
};

export function createPost(renderer) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.55, 0.86);
  const _bs = bloom.setSize.bind(bloom); let bloomScale = 0.5;
  bloom.setSize = (w, h) => _bs(Math.max(1, Math.floor(w * bloomScale)), Math.max(1, Math.floor(h * bloomScale)));
  const out = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(out); composer.addPass(grade); composer.addPass(fxaa);
  let look = null;
  const post = {
    composer, bloom, grade, fxaa,
    setLook(id) {
      const g = GRADE[id] || GRADE.kiyi; if (look === g) return; look = g;
      grade.uniforms.uTint.value.setRGB(...g.tint); grade.uniforms.uContrast.value = g.contrast; grade.uniforms.uSat.value = g.sat; grade.uniforms.uVig.value = g.vig;
      bloom.strength = g.bloom[0]; bloom.radius = g.bloom[1]; bloom.threshold = g.bloom[2];
    },
    setQuality(q) { bloomScale = q >= 2 ? 0.6 : 0.5; fxaa.enabled = true; post.resize(); },
    resize() {
      const s = renderer.getSize(new THREE.Vector2()); const pr = renderer.getPixelRatio();
      composer.setPixelRatio(pr); composer.setSize(s.x, s.y);
      fxaa.uniforms.resolution.value.set(1 / (s.x * pr), 1 / (s.y * pr));
    },
    render(scene, camera, dt) { renderPass.scene = scene; renderPass.camera = camera; composer.render(dt); },
    dispose() { composer.dispose(); rt.dispose(); },
  };
  post.setLook('kiyi'); post.resize();
  return post;
}
