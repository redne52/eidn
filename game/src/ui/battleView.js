// Dwar tarzı sıra tabanlı savaş ekranı: 3D iki dövüşçü + dokunmatik seçim paneli.
import * as THREE from 'three';
import R from '../data/rules.json';
import { getModel, makeProp, tween, ease, mat } from './models.js';
import { toScreen, shake, stage } from './stage.js';
import { buildBattleEnv, ZONE_ENV } from './env/zones.js';
import { ritualTex } from './env/textures.js';
import { blobShadow } from './env/fx.js';
import { burst } from './worldView.js';
import { tr, STATUS_ICON, GRADE_COLOR } from './labels.js';
import * as core from './core.js';
import { createBattleFx, finisherFxOf } from './battleFx.js';
import { createSoulAbsorb } from './soulFx.js';
import { makeCrystal, coreName } from './crystal.js';

const stageOf = (lv) => (lv >= 10 ? 3 : lv >= 5 ? 2 : 1);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createBattleView(battle, { zoneId = 'kiyi', ui, onSound = () => {}, vibrate = () => {} }) {
  const scene = new THREE.Scene(); const benv = buildBattleEnv(scene, zoneId, stage.quality);
  const arena = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 7.6), new THREE.MeshBasicMaterial({ map: ritualTex(), color: zoneId === 'derin' ? 0xd070ff : 0xffe0a0, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })); arena.rotation.x = -Math.PI / 2; arena.position.y = 0.04; scene.add(arena);
  const shadows = []; for (const x of [-2, 2.1]) { const sh = blobShadow(x < 0 ? 0.9 : 1.1); sh.position.set(x, 0.05, 0); scene.add(sh); shadows.push(sh); }
  const P = battle.player, E = battle.enemy;
  const pm = getModel(P.id, stageOf(P.level)); pm.group.position.set(-2, 0, 0); pm.group.rotation.y = Math.PI / 2; scene.add(pm.group);
  const em = getModel(E.id, E.kind === 'guardian' ? 3 : stageOf(E.level)); em.group.position.set(2.1, 0, 0); em.group.rotation.y = -Math.PI / 2; scene.add(em.group);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.3, 320);
  const camHome = new THREE.Vector3(0.2, 2.1, 7.2); const lookAt = new THREE.Vector3(0, 0.55, 0);
  const tallest = Math.max(pm.height, em.height); if (tallest > 2.6) { camHome.set(0.4, 2.8, 9.4); lookAt.y = 1.0; }
  camera.position.copy(camHome); camera.lookAt(lookAt);
  const fxg = new THREE.Group(); scene.add(fxg);
  const fx = createBattleFx(scene, { quality: stage.quality });
  const camState = { zoom: 0 };
  const reduced = () => stage.reducedFx;
  const flashEl = el('div', 'bflash');

  // ---------- HTML katmanı (v2: zincir kombo + Kan Ateşi + bitirici + telgraf) ----------
  const MAXP = 5;
  const MOVE = { quick: { t: 'Hızlı', ic: '⚡' }, heavy: { t: 'Ağır', ic: '🔨' }, guard: { t: 'Savunma', ic: '🛡' } };
  const root = el('div', 'battle v2'); ui.appendChild(root);
  const bar = (side, c) => {
    const b = el('div', 'bbar ' + side);
    b.innerHTML = `<div class="bname"><b>${tr(c.id)}</b> <span class="blv">Sv ${c.level}</span>${c.grade && c.kind === 'creature' ? `<span class="grade" style="background:${GRADE_COLOR[c.grade]}">${c.grade}</span>` : ''}${c.kind === 'guardian' ? '<span class="bossb">BEKÇİ</span>' : ''}</div>
      <div class="hp"><i></i><em></em><span></span></div><div class="brow"><div class="pips ${side === 'left' ? '' : 'sm'}"></div><div class="sts"></div></div>`;
    root.appendChild(b); return b;
  };
  const pBar = bar('left', P), eBar = bar('right', E);
  const timer = el('div', 'btimer', '<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="tbg"/><circle cx="18" cy="18" r="15" class="tfg"/></svg><span>15</span>'); root.appendChild(timer);
  const chainsBox = el('div', 'chains'); root.appendChild(chainsBox);
  const log = el('div', 'blog'); root.appendChild(log);
  const fl = el('div', 'floats'); root.appendChild(fl);
  const tele = el('div', 'tele', '<b>!</b><span>Ağır vuruş hazırlıyor!</span>'); root.appendChild(tele);
  const big = el('div', 'bigname'); root.appendChild(big);
  const panel = el('div', 'bpanel v2'); root.appendChild(panel);
  const moves = el('div', 'moves'); const side = el('div', 'bside');
  panel.append(moves, side);
  const hint = el('div', 'bhint'); root.appendChild(hint);
  root.appendChild(flashEl);
  const screenFlash = (color = '#fff', a = 0.55) => { if (reduced()) return; flashEl.style.background = color; flashEl.style.setProperty('--a', a); flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go'); };

  let soul = null;
  let auto = false, busy = false, tLeft = R.constants.turnSeconds, resolveEnd; let fatigueShown = false;
  const hpView = { player: P.hp, enemy: E.hp };
  const ptsView = { player: P.points || 0, enemy: E.points || 0 }; // olaylarla adım adım güncellenir (düğme sayacı = noktalar)
  let pendingFin = null; // { by, kind, points }
  const turnTimes = (window.__edinTurns ||= []);
  const tut = { step: 0 }; // öğretici: 0 parlayan hamle, 1 kırmızı uyarı, 2 bitirici

  const pts = (c) => Math.max(0, Math.min(MAXP, (c === P ? ptsView.player : c === E ? ptsView.enemy : c.points) || 0));
  function renderPips() {
    for (const [b, c] of [[pBar, P], [eBar, E]]) {
      const n = pts(c); const box = b.querySelector('.pips');
      box.innerHTML = Array.from({ length: MAXP }, (_, i) => `<i class="${i < n ? 'on' : ''}${n >= MAXP ? ' full' : ''}"></i>`).join('');
      box.classList.toggle('flame', c === P && n >= MAXP);
    }
    const fb = moves.querySelector('.mv-fin'); // bitirici düğmesi her zaman noktalarla aynı sayıyı gösterir
    if (fb) { const n = pts(P); fb.querySelector('small').textContent = `${n}/${MAXP}`; fb.classList.toggle('full', n >= MAXP); fb.classList.toggle('off', n < 1); }
  }
  function hints() { try { return core.comboHints(battle) || []; } catch { return []; } }
  function renderChains() {
    const hs = hints();
    chainsBox.innerHTML = hs.map((h) => `<div class="chain${h.step > 0 ? ' prog' : ''}"><span class="cn">${h.name}</span>${(h.seq || []).map((m, i) => `<span class="st${i < h.step ? ' done' : ''}${i === h.step ? ' nx' : ''}">${MOVE[m] ? MOVE[m].ic : '?'}</span>`).join('<em>›</em>')}</div>`).join('');
    return hs;
  }
  function nextMoves(hs) {
    // en çok ilerlemiş zincirlerin sıradaki hamleleri parlar
    const best = Math.max(0, ...hs.map((h) => h.step));
    return new Set(hs.filter((h) => h.step === best).map((h) => h.next));
  }
  function renderMoves() {
    const hs = renderChains(); const glow = nextMoves(hs); const telegraph = E.telegraph === 'heavy';
    moves.innerHTML = '';
    for (const k of ['quick', 'heavy', 'guard']) {
      const b = el('button', 'mv mv-' + k + (glow.has(k) ? ' glow' : '') + (telegraph && k === 'guard' ? ' warn' : ''), `<span class="mi">${MOVE[k].ic}</span><span>${MOVE[k].t}</span>`);
      b.onclick = () => act({ action: k }); moves.appendChild(b);
    }
    const n = pts(P); const fin = el('button', 'mv mv-fin' + (n >= MAXP ? ' full' : '') + (n < 1 ? ' off' : ''), `<span class="mi">🔥</span><span>Bitirici</span><small>${n}/${MAXP}</small>`);
    fin.onclick = () => { if (n >= 1) act({ action: 'finisher' }); }; moves.appendChild(fin);
  }
  function renderSide() {
    side.innerHTML = '';
    const belt = el('div', 'beltrow');
    const items = Object.entries(battle.belt || {}).filter(([, n]) => n > 0).slice(0, R.constants.beltPockets);
    for (let i = 0; i < R.constants.beltPockets; i++) {
      const it = items[i]; const b = el('button', 'pocket');
      if (it) { b.innerHTML = `<span class="ic ic-${it[0]}"></span><small>${it[1]}</small>`; b.title = tr(it[0]); b.onclick = () => act({ action: 'item', itemId: it[0] }); }
      else b.classList.add('empty');
      belt.appendChild(b);
    }
    const row2 = el('div', 'beltrow');
    const ab = el('button', 'autob' + (auto ? ' on' : ''), auto ? '■ Durdur' : '⟳ Otomatik kombo');
    ab.onclick = () => { auto = !auto; renderSide(); if (auto && !busy) act(core.autoChoice(battle), true); };
    const flee = el('button', 'fleeb', 'Kaç'); flee.onclick = () => act({ action: 'flee' });
    row2.append(ab, flee); side.append(belt, row2);
  }
  function renderBars() {
    for (const [b, c, who] of [[pBar, P, 'player'], [eBar, E, 'enemy']]) {
      const pct = Math.max(0, hpView[who] / c.maxHp) * 100;
      b.querySelector('.hp i').style.width = pct + '%';
      b.querySelector('.hp span').textContent = `${Math.max(0, Math.round(hpView[who]))} / ${c.maxHp}`;
      b.querySelector('.hp').classList.toggle('low', pct < 30);
      const sts = (c.statuses || []).map((s) => s.id || s.status || s.type).filter(Boolean);
      b.querySelector('.sts').innerHTML = sts.map((s) => `<span title="${tr(s)}">${STATUS_ICON[s] || '•'}</span>`).join('');
    }
    renderPips();
  }
  function tutorialText() {
    if (!battle.tutorial) return '';
    if (E.telegraph === 'heavy') return 'Kırmızı uyarı: düşman ağır vuracak — SAVUNMA bas, karşılık ver!';
    if (pts(P) >= MAXP) return '5 Kan Ateşi doldu — BİTİRİCİ bas!';
    if (tut.step === 0) return 'Altın parlayan hamleye bas — zinciri tamamla';
    if (pts(P) >= 3) return 'Puanlar birikiyor — 5\'te Bitirici en güçlüsü';
    return '';
  }
  function render() {
    renderMoves(); renderSide(); renderBars();
    tele.style.display = E.telegraph === 'heavy' && !battle.over ? 'flex' : 'none';
    hint.textContent = tutorialText();
    hint.style.display = hint.textContent && !busy ? 'block' : 'none';
  }
  function addLog(t) { const l = el('div', '', t); log.appendChild(l); while (log.children.length > 2) log.firstChild.remove(); }
  function floatText(model, text, cls) {
    const s = toScreen(model.group, camera, model.height * 0.9 + (camState.zoom ? -0.2 : 0));
    // büyük kombo/bitirici adı görünürken sayılar onun bandının altına iner (çakışmasın)
    if (big.classList.contains('show')) s.y = Math.max(s.y, innerHeight * 0.33 + 34);
    s.y = Math.max(s.y, 96);
    const f = el('div', 'fnum ' + cls, text); f.style.left = s.x + (Math.random() - 0.5) * 30 + 'px'; f.style.top = s.y + 'px';
    fl.appendChild(f); setTimeout(() => f.remove(), 1300);
  }
  function bigName(text, cls = '') { big.className = 'bigname show ' + cls; big.textContent = text; clearTimeout(bigName.t); bigName.t = setTimeout(() => (big.className = 'bigname'), 1200); }
  const who = (w) => (w === 'player' ? { m: pm, c: P, other: em } : { m: em, c: E, other: pm });

  async function zoomTo(target, dist = 3.6, hold = 180) {
    if (reduced()) return;
    camState.zoom = 1; const from = camera.position.clone(); const to = target.group.position.clone().add(new THREE.Vector3(0, 1.4, dist));
    await tween(0.12, (k) => camera.position.lerpVectors(from, to, ease.out(k)));
    await wait(hold);
    await tween(0.25, (k) => camera.position.lerpVectors(to, camHome, ease.inOut(k))); camState.zoom = 0;
  }
  const critZoom = (t) => zoomTo(t, 3.4, 120);
  // kısa kamera itmesi (ağır vuruş)
  function punch(dirX = 1, amt = 0.35) {
    if (reduced() || camState.zoom) return; const o = camera.position.clone();
    tween(0.08, (k) => camera.position.set(o.x + dirX * amt * k, o.y - amt * 0.4 * k, o.z - amt * k));
  }
  // bitirici sinematiği: saldıranın omzu üzerinden kısa yay, sonra eve dönüş
  async function finisherCam(A) {
    if (reduced()) return; camState.zoom = 1;
    const side = A.m === pm ? -1 : 1; const from = camera.position.clone();
    const pivot = A.m.group.position.clone(); const to = pivot.clone().add(new THREE.Vector3(side * 1.6, 1.7, 3.4));
    const look0 = lookAt.clone(), look1 = new THREE.Vector3(0, 0.9, 0);
    await tween(0.22, (k) => { camera.position.lerpVectors(from, to, ease.out(k)); camera.lookAt(look0.clone().lerp(look1, k)); });
    camState.finHold = true;
  }
  async function finisherCamEnd() {
    if (!camState.finHold) return; camState.finHold = false; const from = camera.position.clone();
    await tween(0.3, (k) => { camera.position.lerpVectors(from, camHome, ease.inOut(k)); camera.lookAt(lookAt); }); camState.zoom = 0;
  }
  const hitAnim = (m, heavy) => (m.anim.attackHeavy ? m.anim.hit(!!heavy) : m.anim.hit());
  const contactOf = (D, A) => D.m.group.position.clone().add(new THREE.Vector3(Math.sign(A.m.group.position.x - D.m.group.position.x) * 0.35, Math.max(0.6, D.m.height * 0.55), 0.2));
  // hamleye göre animasyon (Ekip A'nın yeni API'si varsa onu, yoksa eski attack + gövde hazırlığı)
  async function strikeAnim(A, move, onImpact) {
    const an = A.m.anim; const dirX = A.m === pm ? 1 : -1; const g = A.m.group; const x0 = g.position.x;
    if (move === 'finisher') {
      if (an.finisher) return an.finisher(onImpact);
      // görsel hazırlık: geri çekil, sonra ağır darbe
      await tween(0.22, (k) => (g.position.x = x0 - dirX * 0.35 * ease.out(k)));
      const at = an.attackHeavy || an.attack; await at.call(an, onImpact); g.position.x = x0; return;
    }
    if (move === 'heavy') {
      if (an.attackHeavy) return an.attackHeavy(onImpact);
      await tween(0.18, (k) => (g.position.x = x0 - dirX * 0.28 * ease.out(k)));
      await an.attack(onImpact); g.position.x = x0; return;
    }
    return (an.attackQuick || an.attack).call(an, onImpact);
  }
  const MOVE_LOG = { quick: 'hızlı vurdu', heavy: 'ağır vurdu', finisher: 'BİTİRİCİ', counter: 'karşı saldırı' };
  async function playEvent(ev) {
    switch (ev.type) {
      case 'order': addLog(ev.first === 'player' ? 'Önce sen davranıyorsun.' : `${tr(E.id)} önce davranıyor.`); await wait(70); break;
      case 'telegraph': break; // tur sonunda render() gösterir
      case 'counter': {
        const A = who(ev.by);
        bigName('KARŞI SALDIRI!', 'counter'); onSound('block'); vibrate(40);
        fx.counter(A.m.group.position.clone().setY(1.1).add(new THREE.Vector3(ev.by === 'player' ? 0.6 : -0.6, 0, 0)), A.m.group.position.clone());
        if (A.m.anim.guard) A.m.anim.guard(true); screenFlash('#bfe0ff', 0.35);
        await wait(160); break;
      }
      case 'combo': {
        const A = who(ev.by);
        if (ev.by === 'player') { bigName(ev.name + '!', 'combo'); tut.step = Math.max(tut.step, 1); }
        else floatText(A.m, ev.name, 'skill');
        burst(fxg, A.m.group.position.clone().setY(1.2), 0xffc84a, 26); onSound('crit'); vibrate(30);
        if (ev.by === 'player') zoomTo(A.m, 4.2, 140);
        addLog(`${tr(A.c.id)}: ${ev.name}!`); await wait(160); break;
      }
      case 'finisher': {
        const A = who(ev.by); const n = Math.max(1, ev.points || 1);
        bigName(`${ev.name || 'Bitirici'} ×${n}`, 'fin f' + n); vibrate(40 + n * 20);
        pendingFin = { by: ev.by, kind: finisherFxOf(A.m, A.c.id), points: n, countered: !!ev.countered };
        burst(fxg, A.m.group.position.clone().setY(0.6), 0xff9a3a, 6 + n * 3);
        addLog(`${tr(A.c.id)} ${n} Kan Ateşi harcadı!`);
        if (!ev.countered) await finisherCam(A); else await wait(120);
        break;
      }
      case 'points': ptsView[ev.on] = ev.value; renderPips(); break;
      case 'hit': {
        const A = who(ev.by), D = who(ev.by === 'player' ? 'enemy' : 'player'); const dKey = ev.by === 'player' ? 'enemy' : 'player';
        const skillName = ev.skill ? tr(ev.skill) : (ev.passive && ev.name) ? ev.name : null;
        if (skillName) floatText(A.m, skillName, 'skill');
        const heavyish = ev.move === 'heavy' || ev.move === 'finisher';
        const fin = ev.move === 'finisher' && pendingFin && pendingFin.by === ev.by ? pendingFin : null; if (fin) pendingFin = null;
        const dirX = ev.by === 'player' ? 1 : -1;
        await strikeAnim(A, ev.move === 'counter' ? 'quick' : ev.move, () => {
          const at = contactOf(D, A);
          if (fin) { fx.finisher(fin.kind, A.m.group.position.clone().setY(0.9), at, fin.points, A.m.meta && A.m.meta.mouthWorld ? A.m.meta.mouthWorld() : null); screenFlash(fin.kind === 'poison' ? '#9cff7a' : fin.kind === 'water' ? '#9feeff' : fin.kind === 'horn' ? '#ffe08a' : fin.kind === 'fire' ? '#ffb060' : '#cfe8ff', 0.18 + fin.points * 0.04); shake(0.2 + fin.points * 0.06); }
          else if (ev.move === 'heavy') { fx.heavy(at, dirX); punch(dirX); }
          else fx.quick(at, dirX);
          if (ev.result === 'dodge') { D.m.anim.dodge(); floatText(D.m, 'Kaçtı!', 'dodge'); onSound('whoosh'); return; }
          hpView[dKey] -= ev.dmg; renderBars();
          if (ev.result === 'block' || ev.result === 'guarded') { (D.m.anim.block ? D.m.anim.block() : hitAnim(D.m, false)); fx.block(at); floatText(D.m, `Blok −${ev.dmg}`, 'block'); onSound('block'); }
          else if (ev.result === 'crit') { hitAnim(D.m, true); fx.crit(at); floatText(D.m, `KRİTİK −${ev.dmg}`, 'crit'); shake(0.35); vibrate(60); onSound('crit'); if (!fin) { critZoom(D.m); screenFlash('#fff3c0', 0.35); } }
          else { hitAnim(D.m, heavyish); floatText(D.m, `−${ev.dmg}`, heavyish ? 'normal heavy' : 'normal'); onSound('hit'); if (heavyish) shake(fin ? 0 : 0.14); }
        });
        if (fin) finisherCamEnd();
        addLog(`${tr(A.c.id)} ${MOVE_LOG[ev.move] || 'vurdu'}: ${{ dodge: 'ıskaladı', guarded: 'bloklandı', block: 'bloklandı', normal: 'isabet', crit: 'KRİTİK' }[ev.result]}${ev.dmg ? ` (${ev.dmg})` : ''}`);
        await wait(70); break;
      }
      case 'status': floatText(who(ev.on).m, `${STATUS_ICON[ev.status] || ''} ${tr(ev.status)}`, 'status'); addLog(`${tr(who(ev.on).c.id)}: ${tr(ev.status)} (${ev.turns} tur)`); await wait(150); break;
      case 'dot': hpView[ev.on] -= ev.dmg; renderBars(); floatText(who(ev.on).m, `${STATUS_ICON[ev.status] || ''} −${ev.dmg}`, 'dot ' + ev.status); who(ev.on).m.anim.hit(ev.status === 'zehir' ? 0x55ff55 : 0xff7733); await wait(200); break;
      case 'heal': hpView[ev.on] = Math.min(who(ev.on).c.maxHp, hpView[ev.on] + ev.amount); renderBars(); floatText(who(ev.on).m, `+${ev.amount}`, 'heal'); burst(fxg, who(ev.on).m.group.position.clone().setY(1), 0x5fe0a0, 14); onSound('heal'); await wait(200); break;
      case 'stun': floatText(who(ev.on).m, 'Sersem!', 'status'); addLog(`${tr(who(ev.on).c.id)} sersemledi, sırasını kaybeder.`); await wait(220); break;
      case 'item': {
        addLog(`${tr(ev.itemId)} kullanıldı.`); floatText(pm, tr(ev.itemId), 'status'); onSound('heal');
        burst(fxg, pm.group.position.clone().setY(1.2), 0x7fffb0, 10);
        const y0 = pm.group.position.y; await tween(0.35, (k) => pm.group.position.setY(y0 + Math.sin(k * Math.PI) * 0.25)); pm.group.position.setY(y0);
        await wait(120); break;
      }
      case 'defend': { const A = who(ev.by); floatText(A.m, '🛡 Savunma', 'status'); if (A.m.anim.guard) A.m.anim.guard(true); fx.guard(A.m.group.position.clone()); break; }
      case 'flee': addLog(ev.ok ? 'Kaçtın!' : 'Kaçamadın!'); floatText(pm, ev.ok ? 'Kaçış!' : 'Kaçamadın', 'status'); await wait(300); break;
      case 'fatigue': if (!fatigueShown) { fatigueShown = true; addLog('Yorgunluk çöktü: iyileşmeler azalır, hasar artar.'); } break;
      case 'end': {
        const win = ev.winner === 'player';
        if (ev.winner === 'fled') { await tween(0.5, (k) => pm.group.position.setX(-2 - 4 * k)); break; }
        await (win ? em : pm).anim.die(); onSound(win ? 'win' : 'lose');
        // zafer: beden yerde kalır; ruh özü emme ve zafer pozu view.absorb() içinde (ödül çekirdekte hesaplandıktan sonra)
        break;
      }
    }
  }
  let queued = null;
  async function act(choice, fromAuto) {
    if (battle.over) return;
    if (busy) { if (!fromAuto) { queued = choice; } return; }
    if (!fromAuto && auto) { auto = false; }
    if (!core.canUse(battle, choice.action, choice.itemId)) { if (fromAuto) choice = { action: 'quick' }; else return; }
    if (choice.action === 'finisher' && battle.tutorial) tut.step = 3;
    busy = true; panel.classList.add('busy'); timer.classList.add('hide'); hint.style.display = 'none'; tele.style.display = 'none';
    hpView.player = P.hp; hpView.enemy = E.hp; ptsView.player = P.points || 0; ptsView.enemy = E.points || 0;
    const t0 = performance.now();
    const events = core.playTurn(battle, { ...choice });
    const evt = (window.__edinEv = []);
    // Güvenlik: bir animasyon takılsa ya da hata verse bile tur kilitli kalmasın.
    const guardWait = (pr, ms) => Promise.race([pr, new Promise((r) => setTimeout(r, ms))]);
    try {
      for (const ev of events) { const e0 = performance.now(); try { await guardWait(playEvent(ev), ev.type === 'finisher' ? 4500 : 3000); } catch (err) { console.error('olay oynatma hatası', ev.type, err); } evt.push(ev.type + (ev.move ? ':' + ev.move : '') + ' ' + Math.round(performance.now() - e0)); }
      await guardWait(finisherCamEnd(), 2000);
    } catch (err) { console.error('tur hatası', err); }
    for (const m of [pm, em]) { try { if (m.anim.guard) m.anim.guard(false); } catch (e) {} }
    turnTimes.push({ ms: Math.round(performance.now() - t0), fin: events.some((e) => e.type === 'finisher'), end: !!battle.over });
    hpView.player = P.hp; hpView.enemy = E.hp; ptsView.player = P.points || 0; ptsView.enemy = E.points || 0; renderBars();
    busy = false; panel.classList.remove('busy');
    if (battle.over) { auto = false; await wait(500); root.classList.add('out'); setTimeout(() => resolveEnd(battle), 350); return; }
    if (auto && P.hp / P.maxHp < 0.3) { auto = false; addLog('Canın azaldı — otomatik kombo durdu.'); }
    tLeft = R.constants.turnSeconds; timer.classList.remove('hide'); render();
    if (E.telegraph === 'heavy') { onSound('whoosh'); em.anim.hit && em.anim.hit(0xff3030); }
    if (queued) { const q = queued; queued = null; setTimeout(() => act(q), 30); return; }
    if (auto) setTimeout(() => act(core.autoChoice(battle), true), 260);
  }

  // v4.1: nadir/bekçi çekirdeği: göğüsten kademe renginde kristal fırlar, çantaya uçar (çanta doluysa yere düşer)
  async function coreFly(cores, at) {
    const red = reduced(); const list = cores.slice(0, 4);
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
    const bagPt = camera.position.clone().addScaledVector(fwd, 3).addScaledVector(right, 2.2).add(new THREE.Vector3(0, 1.1, 0));
    const labs = [];
    await Promise.all(list.map(async (c, i) => {
      await wait(i * (red ? 60 : 160));
      const cr = makeCrystal(c.type, { size: 0.2 }); cr.group.position.copy(at); cr.group.scale.setScalar(0.01); scene.add(cr.group); flyers.add(cr);
      const lab = el('div', 'coregain', `+1 ${coreName(c.type)}${c.toBag ? '' : ' · çanta dolu!'}`); ui.appendChild(lab); labs.push(lab);
      const up = at.clone().add(new THREE.Vector3((i - (list.length - 1) / 2) * 0.35, 0.8, 0.2));
      await tween(red ? 0.15 : 0.3, (k) => { cr.group.scale.setScalar(Math.max(0.01, ease.back(k))); cr.group.position.lerpVectors(at, up, ease.out(k)); });
      const p2 = toScreen(cr.group, camera, 0.3); lab.style.left = p2.x + 'px'; lab.style.top = p2.y + 'px'; lab.classList.add('show');
      onSound('heal');
      if (c.toBag) await tween(red ? 0.25 : 0.55, (k) => { cr.group.position.lerpVectors(up, bagPt, ease.in(k)); cr.group.scale.setScalar(Math.max(0.01, 1 - k * 0.7)); });
      else await tween(0.35, (k) => cr.group.position.lerpVectors(up, at.clone().setY(0.25).add(new THREE.Vector3(0.6, 0, 0.4)), ease.out(k)));
      if (c.toBag) { scene.remove(cr.group); flyers.delete(cr); cr.dispose(); }
    }));
    await wait(red ? 150 : 450); labs.forEach((l) => l.remove());
  }
  const flyers = new Set();
  const view = {
    scene, camera, exposure: ZONE_ENV[zoneId]?.exposure ?? 1.05,
    update(dt) {
      benv.update(dt); pm.anim.update(dt); em.anim.update(dt); fx.update(dt); if (soul) soul.update(dt); for (const f of flyers) f.update(dt);
      fxg.children.forEach((p) => { if (p.userData.v) { p.position.addScaledVector(p.userData.v, dt); p.userData.v.y -= 6 * dt; p.material.opacity = Math.max(0, p.material.opacity - dt * 0.9); } });
      if (!camState.zoom) { camera.position.lerp(camHome, Math.min(1, dt * 4)); camera.lookAt(lookAt); }
      else if (camState.finHold) camera.lookAt(0, 0.9, 0);
      if (tele.style.display !== 'none') { const s2 = toScreen(em.group, camera, em.height + 0.35); tele.style.left = s2.x + 'px'; tele.style.top = Math.max(118, s2.y) + 'px'; }
      if (!busy && !battle.over) {
        tLeft -= dt; const frac = Math.max(0, tLeft / R.constants.turnSeconds);
        timer.querySelector('.tfg').style.strokeDashoffset = 94.2 * (1 - frac); timer.querySelector('span').textContent = Math.ceil(Math.max(0, tLeft));
        timer.classList.toggle('warn', tLeft < 5);
        if (tLeft <= 0) act(core.autoChoice(battle), true);
      }
    },
    done: new Promise((r) => (resolveEnd = r)),
    /** Ruh özü emme (yalnızca görsel). info = finishFight().absorb. Ekrana dokunmak hızlandırır (×4). */
    async absorb(info, { speed = 1, cores = null } = {}) {
      if (!info) { await pm.anim.victory(); return; }
      const coreAt = em.group.position.clone().setY((em.height || 1.6) * 0.55);
      const red = reduced(); const AF = R.absorbFx || {};
      const dur = (info.dur || (AF.durations && AF.durations[info.kind]) || 1) * (red ? (AF.reducedFxMult ?? 0.5) : 1);
      const ov = el('div', 'absorbtap', `<span class="ahint">${info.kind === 'guardian' ? 'Bekçinin ruhu' : info.kind === 'rare' ? 'Nadir bir ruh' : 'Ruh özü'} · dokun: hızlandır</span>`); ui.appendChild(ov);
      const lab = el('div', 'ozgain', `+${info.oz || 0} öz`); ui.appendChild(lab);
      if (!red) { camHome.lerp(new THREE.Vector3(0, 1.7, 5.9), 0.55); lookAt.set(0, 0.9, 0); }
      soul = createSoulAbsorb(scene, { from: em, to: pm, camera, renderer: stage.renderer, dur, kind: info.kind || 'normal', reduced: red, quality: stage.quality, shadow: (shadows[1].material = shadows[1].material.clone(), shadows[1]),
        onLabel: () => { const p2 = toScreen(pm.group, camera, pm.height + 0.4); lab.style.left = p2.x + 'px'; lab.style.top = p2.y + 'px'; lab.classList.add('show'); onSound('heal'); vibrate(25); } });
      soul.speed = speed;
      window.__edinAbsorb = { kind: info.kind, oz: info.oz, dur, speed, n: soul.count, t: () => (soul ? soul.t : 1), sp: () => (soul ? soul.speed : 0) };
      ov.addEventListener('pointerdown', () => { if (soul) soul.speed = Math.max(soul.speed, speed * 4); ov.classList.add('fast'); });
      await Promise.race([soul.done, wait((dur / speed) * 1000 + 6000)]);
      if (soul) window.__edinAbsorb.fallback = soul.dissolveFallback;
      soul && soul.finish(); soul = null;
      ov.remove();
      if (cores && cores.length) { try { await coreFly(cores, coreAt); } catch (e) { console.error('çekirdek efekti', e); } }
      await Promise.race([pm.anim.victory(), wait(1200)]);
      lab.remove();
    },
    dispose() { for (const f of flyers) { scene.remove(f.group); f.dispose(); } flyers.clear(); if (soul) { soul.finish(); soul = null; } fx.dispose(); root.remove(); scene.traverse((o) => o.geometry && o.geometry.dispose()); },
  };
  render();
  addLog(E.kind === 'guardian' ? `${tr(E.id)} kapıyı bekliyor. Kaçış yok!` : `Vahşi ${tr(E.id)} saldırıya geçti!`);
  return view;
}
