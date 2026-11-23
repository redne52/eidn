// Kamera denetimi: joystick kameraya göre, sınırlar, otomatik hizalama, pusula
import assert from 'node:assert/strict';
import { camState, CAM, joyToWorld, camOffset, stepCam, resetCam, wrap } from '../src/ui/camCtl.js';
const V = class { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
for (const deg of [0, 90, 180, 270, 37]) {
  const yaw = deg * Math.PI / 180;
  const f = joyToWorld({ x: 0, z: -1 }, yaw); // joystick ileri
  assert.ok(near(f.x, -Math.sin(yaw), 1e-9) && near(f.z, -Math.cos(yaw), 1e-9), 'ileri = kamera önü ' + deg);
  camState.yaw = yaw; camState.pitch = CAM.DEF_PITCH; camState.zoom = 1;
  const o = camOffset(new V());
  // kamera ofseti ileri yönün tersinde olmalı
  assert.ok(near(o.x / Math.hypot(o.x, o.z), Math.sin(yaw), 1e-9) && near(o.z / Math.hypot(o.x, o.z), Math.cos(yaw), 1e-9));
  const r = joyToWorld({ x: 1, z: 0 }, yaw); // sağ: ileriye dik, sağ el kuralı (y yukarı)
  assert.ok(near(f.x * r.x + f.z * r.z, 0), 'sağ ileriye dik');
  assert.ok(near(r.x, -f.z) && near(r.z, f.x), 'sağ gerçekten sağda ' + deg);
}
// varsayılan açı eski sabit ofsete eşit (0, 6.4, 10.6)
camState.yaw = 0; camState.pitch = CAM.DEF_PITCH; camState.zoom = 1;
{ const o = camOffset(new V()); assert.ok(Math.abs(o.y - 6.4) < 0.05 && Math.abs(o.z - 10.6) < 0.05 && Math.abs(o.x) < 1e-9, 'varsayılan görünüm korunur'); }
// otomatik hizalama: hareket yönünün arkasına yavaşça döner; elle çevirmeden sonra 1,5 sn bekler
camState.auto = true; camState.lastManual = -1e9; camState.yaw = 0;
const east = { x: 1, z: 0 }; // doğuya yürüyor → hedef yaw = π/2 + π = -π/2
for (let i = 0; i < 600; i++) stepCam(1 / 60, east);
assert.ok(Math.abs(wrap(camState.yaw - (-Math.PI / 2))) < 0.05, 'arkaya hizalandı');
camState.yaw = 0; camState.lastManual = performance.now();
stepCam(0.1, east); assert.equal(camState.yaw, 0, 'elle çevirmeden hemen sonra dokunmaz');
camState.auto = false; camState.lastManual = -1e9; stepCam(0.5, east); assert.equal(camState.yaw, 0, 'ayar kapalıyken dönmez');
// geri geri yürürken (kameraya doğru) dönmez
camState.auto = true; camState.yaw = 0; stepCam(0.5, { x: 0, z: 1 }); assert.equal(camState.yaw, 0, 'geri yürürken dönmez');
// pusula
camState.yaw = 2.5; camState.pitch = CAM.PITCH_MAX; camState.zoom = 1.4; resetCam();
for (let i = 0; i < 300; i++) stepCam(1 / 60, null);
assert.ok(camState.yaw === CAM.DEF_YAW && camState.pitch === CAM.DEF_PITCH && camState.zoom === 1 && !camState.resetting, 'pusula sıfırlar');
console.log('kamera testleri geçti');
