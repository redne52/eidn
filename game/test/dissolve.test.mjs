// Çözülme efekti: her standart malzemeyi yamalıyor mu, uyumsuz malzemede ve hata durumunda yedeğe düşüyor mu,
// opaklık/ölçek doğru mu, dispose geri yüklüyor mu. Ayrıca hayalet (fresnel) yamasının clone'da korunması.
import * as THREE from 'three';
import { getModel } from '../src/ui/models.js';
import { applyDissolve } from '../src/ui/dissolve.js';
let fail = 0; const bad = (...a) => { console.log('HATA:', ...a); fail++; };
const mats = (g) => { const out = []; g.traverse((o) => { if (o.isMesh && o.material) out.push(...[].concat(o.material)); }); return out; };

// 1) kod modeli (SkinnedMesh + standart malzemeler)
for (const id of ['ejder_ates', 'ugallu', 'lahmu']) {
  const m = getModel(id, 2); const before = mats(m.group);
  const d = applyDissolve(m.group, { color: 0x5ff6ff });
  const after = mats(m.group);
  if (after.some((x) => before.includes(x))) bad('paylaşılan malzeme değişti', id);
  const std = after.filter((x) => x.isMeshStandardMaterial);
  if (!std.length) bad('standart malzeme yok', id);
  for (const x of std) {
    if (x.userData.disFallback) bad('standart malzeme yedeğe düştü', id);
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    x.onBeforeCompile(sh, null);
    if (!/vDisW = \(modelMatrix/.test(sh.vertexShader)) bad('vertex yaması yok', id);
    if (!/if \(dzN < dzT\) discard/.test(sh.fragmentShader)) bad('fragment yaması yok', id);
    if (!sh.uniforms.uDisK) bad('uniform yok', id);
  }
  // gölge diski (MeshBasic) yedekle çalışır
  if (!after.some((x) => x.isMeshBasicMaterial && x.userData.disFallback)) bad('Basic malzeme yedek işaretli değil', id);
  d.set(0.5); if (std.some((x) => Math.abs(x.opacity - 1) > 1e-6)) bad('gelişmiş yolda opaklık değişmemeli', id);
  d.set(0.5, 0.4); if (std.some((x) => Math.abs(x.opacity - 0.4) > 1e-6)) bad('alfa çarpanı', id);
  // shader hatası simülasyonu → yedek
  const s0 = m.group.scale.x; d._toFallback(); d.set(1);
  if (!d.fallback) bad('yedeğe geçmedi', id);
  if (mats(m.group).some((x) => x.opacity > 1e-6)) bad('yedekte k=1 iken opaklık 0 olmalı', id);
  if (!(m.group.scale.x < s0)) bad('yedekte küçülme yok', id);
  d.dispose(true);
  if (mats(m.group).some((x, i) => x !== before[i])) bad('dispose geri yüklemedi', id);
  if (Math.abs(m.group.scale.x - s0) > 1e-6) bad('ölçek geri gelmedi', id);
}
// 2) uyumsuz malzeme (ShaderMaterial) → yedek
{
  const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial({ vertexShader: 'void main(){gl_Position=vec4(0.);}', fragmentShader: 'void main(){gl_FragColor=vec4(1.);}' })));
  const d = applyDissolve(g); d.set(0.75);
  const m = mats(g)[0]; if (!m.userData.disFallback || Math.abs(m.opacity - 0.25) > 1e-6) bad('ShaderMaterial yedeği');
}
// 3) GLB benzeri: düz Mesh + MeshStandardMaterial (dokulu)
{
  const g = new THREE.Group(); const tex = new THREE.Texture(); g.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: tex })));
  const d = applyDissolve(g); const m = mats(g)[0]; if (m.userData.disFallback || m.map !== tex) bad('GLB malzemesi');
  d.dispose();
}
// 4) önceki onBeforeCompile (hayalet fresnel) korunuyor mu
{
  const base = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.55, depthWrite: false }); base.userData.ghost = true;
  let called = 0; base.onBeforeCompile = () => { called++; }; base.customProgramCacheKey = () => 'ghostFresnel';
  const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(), base));
  applyDissolve(g, { edgeFirst: true });
  const m = mats(g)[0]; const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  m.onBeforeCompile(sh, null);
  if (called !== 1) bad('önceki yama çağrılmadı');
  if (!/ghostFresnel\|dissolveE/.test(m.customProgramCacheKey())) bad('program anahtarı', m.customProgramCacheKey());
  if (m.depthWrite) bad('hayalet depthWrite kapalı kalmalı');
  if (Math.abs(m.userData.op0 - 0.55) > 1e-6) bad('hayalet temel opaklığı');
}
if (fail) { console.log(fail, 'hata'); process.exit(1); }
console.log('çözülme testleri geçti');
