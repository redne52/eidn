// Harita kamerası denetimi: parmakla çevirme (yaw/eğim), iki parmakla yakınlaştırma,
// yürürken yumuşak otomatik arkaya hizalanma, pusula sıfırlama. Savaş kamerasına dokunmaz.
// Durum modül düzeyinde tutulur: savaşa girip çıkınca ya da bölge değişince kaybolmaz.

export const CAM = {
  DEF_YAW: 0,                 // 0 = kamera güneyde, kuzeye bakıyor (eski sabit görünüm)
  DEF_PITCH: 0.543,           // ≈31° (eski 6,4 / 10,6 ofsetinin açısı)
  PITCH_MIN: 0.35, PITCH_MAX: 1.05, // ≈20°–60°
  DEF_DIST: 12.38,            // eski ofset uzunluğu
  ZOOM_MIN: 0.7, ZOOM_MAX: 1.4,
};

export const camState = {
  yaw: CAM.DEF_YAW, pitch: CAM.DEF_PITCH, zoom: 1,
  auto: true,          // ayarlardan "Kamera otomatik takip"
  lastManual: -1e9,    // son elle çevirme zamanı (ms)
  resetting: false,    // pusula: varsayılana yumuşak dönüş
};

const TAU = Math.PI * 2;
export const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Ekran joystick vektörünü (x sağ, z aşağı/kameraya doğru) dünya vektörüne çevirir.
export function joyToWorld(v, yaw = camState.yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: v.x * c + v.z * s, z: -v.x * s + v.z * c };
}

// Kameranın hedefe göre ofseti (dünya)
export function camOffset(out) {
  const d = CAM.DEF_DIST * camState.zoom, p = camState.pitch;
  const h = Math.cos(p) * d;
  out.set(Math.sin(camState.yaw) * h, Math.sin(p) * d, Math.cos(camState.yaw) * h);
  return out;
}

export function resetCam() { camState.resetting = true; camState.lastManual = performance.now(); }

// Her karede çağrılır. moving: oyuncunun hareket yönü (dünya) ya da null.
export function stepCam(dt, moveDir) {
  const now = performance.now();
  if (camState.resetting) {
    const dy = wrap(CAM.DEF_YAW - camState.yaw), dp = CAM.DEF_PITCH - camState.pitch, dz = 1 - camState.zoom;
    const k = Math.min(1, dt * 4);
    camState.yaw = wrap(camState.yaw + dy * k); camState.pitch += dp * k; camState.zoom += dz * k;
    if (Math.abs(dy) < 0.004 && Math.abs(dp) < 0.004 && Math.abs(dz) < 0.004) { camState.yaw = CAM.DEF_YAW; camState.pitch = CAM.DEF_PITCH; camState.zoom = 1; camState.resetting = false; }
    return;
  }
  if (!camState.auto || !moveDir || now - camState.lastManual < 1500) return;
  // hedef: kamera yaratığın arkasında → yaw = hareket açısı + π
  const f = Math.atan2(moveDir.x, moveDir.z);
  const diff = wrap(f + Math.PI - camState.yaw);
  if (Math.abs(diff) > 2.3) return; // geri geri yürürken kamerayı çevirme
  // yumuşak: en çok ~0,9 rad/sn
  const stepA = clamp(diff * Math.min(1, dt * 0.9), -0.9 * dt, 0.9 * dt);
  camState.yaw = wrap(camState.yaw + stepA);
}

// Kanvas üzerinde dokunma/fare denetimi. active(): şu an harita görünümü mü?
export function attachCamInput(el, active) {
  const pts = new Map(); // pointerId → {x,y}
  let pinch0 = null, zoom0 = 1;
  const ROT = 0.0085, TILT = 0.006;
  const manual = () => { camState.lastManual = performance.now(); camState.resetting = false; };
  const down = (e) => {
    if (!active()) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { el.setPointerCapture(e.pointerId); } catch {}
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; zoom0 = camState.zoom; }
    e.preventDefault();
  };
  const move = (e) => {
    const p = pts.get(e.pointerId); if (!p || !active()) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pts.size >= 2) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      camState.zoom = clamp(zoom0 * pinch0 / d, CAM.ZOOM_MIN, CAM.ZOOM_MAX); manual();
    } else {
      camState.yaw = wrap(camState.yaw + dx * ROT);
      camState.pitch = clamp(camState.pitch + dy * TILT, CAM.PITCH_MIN, CAM.PITCH_MAX);
      if (dx || dy) manual();
    }
    e.preventDefault();
  };
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; if (pts.size === 1) { /* kalan parmak yeniden başlangıç */ } };
  const wheel = (e) => { if (!active()) return; camState.zoom = clamp(camState.zoom * Math.exp(e.deltaY * 0.0012), CAM.ZOOM_MIN, CAM.ZOOM_MAX); manual(); e.preventDefault(); };
  const ctx = (e) => { if (active()) e.preventDefault(); };
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('contextmenu', ctx);
  el.style.touchAction = 'none';
  return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up); el.removeEventListener('wheel', wheel); el.removeEventListener('contextmenu', ctx); };
}
