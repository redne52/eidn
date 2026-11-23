// Edin v1 — arayüz akışı. Çekirdek: ./ui/core.js (şimdilik sahte; gerçek modüllere tek satırla geçilir).
import R from './data/rules.json';
import * as core from './ui/core.js';
import { initStage, setView, stage, setQuality, setReducedFx } from './ui/stage.js';
import { camState, attachCamInput, joyToWorld, resetCam } from './ui/camCtl.js';
import { createWorldView, createGateView } from './ui/worldView.js';
import { createBattleView } from './ui/battleView.js';
import * as S from './ui/screens.js';
import { tr } from './ui/labels.js';
import * as CS from './ui/coreScreens.js';
import { coreScene } from './ui/coreFx.js';
import { createSpiritFeed } from './ui/spiritFeed.js';
import { PULL_COLOR, pullKey } from './ui/crystal.js';

const app = document.getElementById('app');
const ui = S.el('div', ''); ui.id = 'ui';
const tagLayer = S.el('div', 'tags'); ui.appendChild(tagLayer);
app.appendChild(ui);
document.body.appendChild(S.el('div', '', '<div class="ph"></div><b>Telefonu yan çevir</b><span>Edin yatay ekranda oynanır.</span>')).id = 'rotate';
initStage(app);

// ---------- ayarlar ----------
const TEST = /[?&]test=1/.test(location.search);
const opts = (() => { try { return { sound: true, vibrate: true, lowq: false, gfx: 1, test5: false, camAuto: true, ...JSON.parse(localStorage.getItem('edin.opts') || '{}') }; } catch { return { sound: true, vibrate: true }; } })();
const saveOpts = () => { try { localStorage.setItem('edin.opts', JSON.stringify(opts)); } catch {} };
// ?gfx=0|1|2 adresi ayarı geçersiz kılar (test için)
{ const m = /[?&]gfx=(\d)/.exec(location.search); if (m) opts.gfx = +m[1]; else if (opts.lowq && opts.gfx === undefined) opts.gfx = 0; }
setQuality(Math.max(0, Math.min(2, opts.gfx ?? 1)));
// Otomatik grafik düşürme: telefon yavaşsa (5 sn ortalama < 24 FPS) bir kademe düşür. Oyuncu ayarı elle seçtiyse dokunma.
{ let acc = 0, frames = 0, last = performance.now(), drops = 0;
  stage.listeners.push(() => {
    const now = performance.now(); acc += now - last; last = now; frames++;
    if (acc >= 5000) { const fps = frames * 1000 / acc; acc = 0; frames = 0;
      if (fps < 24 && !opts.gfxManual && (opts.gfx ?? 1) > 0 && drops < 2 && !/[?&]gfx=/.test(location.search)) { opts.gfx = (opts.gfx ?? 1) - 1; drops++; saveOpts(); setQuality(opts.gfx); console.log('Grafik otomatik düşürüldü:', opts.gfx, Math.round(fps) + ' FPS'); } }
  }); }
setReducedFx(!!opts.reducedFx || /[?&]rfx=1/.test(location.search));
camState.auto = opts.camAuto !== false;
attachCamInput(stage.renderer.domElement, () => !!(stage.view && stage.view.isWorld && !stage.view.cine && !fighting));
let actx = null;
function sfx(kind) {
  if (!opts.sound) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain(); o.connect(g); g.connect(actx.destination);
    const f = { hit: [220, 120, 0.12, 'square'], crit: [520, 90, 0.25, 'sawtooth'], block: [160, 140, 0.08, 'triangle'], whoosh: [700, 300, 0.12, 'sine'], heal: [440, 880, 0.25, 'sine'], win: [392, 784, 0.5, 'triangle'], lose: [300, 80, 0.6, 'sawtooth'], click: [600, 600, 0.04, 'square'], level: [523, 1046, 0.7, 'triangle'] }[kind] || [440, 440, 0.05, 'sine'];
    const t = actx.currentTime; o.type = f[3]; o.frequency.setValueAtTime(f[0], t); o.frequency.exponentialRampToValueAtTime(f[1], t + f[2]);
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + f[2]); o.start(t); o.stop(t + f[2] + 0.02);
  } catch {}
}
const vibrate = (ms) => opts.vibrate && navigator.vibrate && navigator.vibrate(ms);
document.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) sfx('click'); }, true);

// ---------- durum ----------
let game = null; const gateView = createGateView(); let worldView = null, hud = null, tickFn = null;
const save = () => game && core.writeSave(game);
try { addEventListener('pagehide', () => save()); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); }); } catch {}
const stageOf = (lv) => (lv >= 10 ? 3 : lv >= 5 ? 2 : 1);
const maxHpOf = () => game.maxHp();
let worldOffs = [];
function stopWorld() { if (tickFn) stage.listeners.splice(stage.listeners.indexOf(tickFn), 1); tickFn = null; hud?.destroy(); hud = null; worldOffs.forEach((f) => f()); worldOffs = []; document.querySelectorAll('#ui > .panel.wbag, #ui > .panel.cook').forEach((p) => p.remove()); if (worldView) worldView.resting = false; }
// v4: harita eylemleri (kaynak toplama, yemek, kamp ateşi)
function worldHandlers() {
  return {
    onGather: () => { if (game.startGather()) sfx('click'); },
    onBag: () => { S.worldBag(ui, game, { onEat: (id) => { if (!game.startEat(id)) hud?.toast('Şimdi yenmez.'); }, onCores: () => openFieldCorePanel(), onPending: () => fieldDecide(null) }); },
    onCores: () => openFieldCorePanel(),
    onCamp: () => {
      if (!game.atCamp()) return;
      worldView && (worldView.resting = true);
      const p = S.cookPanel(ui, game, {
        onCook: async (id) => { if (game.cook(id)) { sfx('heal'); vibrate(30); save(); await new Promise((r) => setTimeout(r, R.recipes.cookSeconds * 600)); } },
        onEat: (id) => { if (!game.startEat(id)) hud?.toast('Şimdi yenmez.'); },
      });
      p.onclose = () => { if (worldView) worldView.resting = false; };
    },
  };
}
function bindWorldEvents() {
  worldOffs.push(
    game.on('gathered', (e) => { hud?.toast(`+${e.amount} <b>${tr(e.type)}</b> (${e.total})`, 1600); sfx('heal'); vibrate(20); save(); }),
    game.on('actionCancelled', (e) => { if (e.reason === 'saldiri' || e.reason === 'savas') hud?.toast(e.type === 'eat' ? 'Saldırı! Yemek yarıda kaldı (harcanmadı).' : 'Saldırı! Toplama yarıda kaldı.', 1800); }),
    game.on('ate', (e) => { hud?.toast(`Afiyet olsun: +${e.healed} can`, 1600); sfx('heal'); save(); }),
    game.on('buff', (b) => { if (b.fights > 0 && b.fights === R.recipes.list.ruhlu_et.buff.fights) hud?.toast(`Ruhlu et: sonraki ${b.fights} savaşta saldırı +%${Math.round(b.atk * 100)}`, 2200); }),
    game.on('corePicked', (e) => { hud?.toast(`+1 <b>${R.soulCores.types[e.type].name}</b> yerden alındı`, 1600); sfx('heal'); save(); }),
    game.on('coreExpired', (e) => hud?.toast(`${R.soulCores.types[e.type].name} yerde kayboldu.`, 1600)),
    game.on('eggResult', () => hud?.toast('Eski yumurta çatladı! Kapıda <b>Tut ya da Yedir</b>.', 2600)),
    game.on('hint', (e) => { if (e && e.text && /torban|Canın|kamp|Malzemen|pişiremezsin/.test(e.text)) hud?.toast(e.text, 1800); }),
  );
}

function title() {
  S.clear(ui); setView(gateView); gateView.setShot('title');
  const saved = core.loadSave();
  S.titleScreen(ui, {
    hasSave: !!saved?.creature, sound: opts.sound, onSound: () => { opts.sound = !opts.sound; saveOpts(); },
    onContinue: () => { game = core.createGame(saved); applyTest(); if (game.screen === 'world' && game.zoneId) { S.clear(ui); worldView = createWorldView(game, tagLayer); resumeWorld(); } else hub(); notifyMigration(); },
    onStart: async () => { core.clearSave(); game = core.createGame(); applyTest(); S.clear(ui); await S.storyLine(ui, "Edin'e insan giremez.<br>Kanını bir ejderhaya bağla."); eggPick(); },
  });
}
// Eski kayıttan gelen oyuncuya bir kez: yaratığı ejderhaya dönüştü
function notifyMigration() {
  const f = game.flags || {}; const old = game.creature && game.creature.legacyId;
  if (!f.migratedFrom || f.migrationSeen || !old) return;
  game.flags.migrationSeen = true; save();
  S.storyLine(ui, `Yaratığın bir ejderhaya dönüştü:<br><b>${tr(old)} → ${tr(game.creature.id)}</b><br><small>Seviyen, derecen ve özün korundu.</small>`, 4200);
}
const applyTest = () => { game.setTestOz(!!(TEST && opts.test5)); };

function eggPick() {
  S.clear(ui); gateView.setShot('eggs'); gateView.showEggs(R.start.creatureChoice);
  S.eggSelect(ui, {
    onPick: (i) => { gateView.highlightEgg(i); gateView.previewDragon(i, R.start.creatureChoice[i]); },
    onBond: async (i) => {
      const id = R.start.creatureChoice[i]; S.clear(ui);
      await gateView.hatch(i, id, 'C'); sfx('level'); vibrate(80);
      game.chooseStarter(id); save();
      await S.hatchBanner(ui, tr(id), 'C');
      gateView.clearEggs();
      enterZone('kiyi');
    },
  });
}

function hub() {
  stopWorld(); S.clear(ui); worldView?.dispose(); worldView = null;
  setView(gateView); gateView.clearEggs();
  gateView.setCreature(game.creature.id, stageOf(game.creature.level)); gateView.setShot('hub');
  save();
  S.gateScreen(ui, game, {
    onEnter: () => S.zonePicker(ui, game, enterZone),
    onCreature: () => S.creaturePanel(ui, game, core.makeCombatant),
    onCores: () => openCorePanel(),
    onRoster: () => (CS.rosterPanel(ui, game, {
      onActive: () => { gateView.setCreature(game.creature.id, stageOf(game.creature.level)); sfx('level'); vibrate(30); save(); },
      onDetail: (c) => S.creaturePanel(ui, game, core.makeCombatant, c),
    }).onclose = hub),
    onBag: () => (S.bagPanel(ui, game, save, () => decideFlow(null).then(hub)).onclose = hub),
    onShop: () => (S.shopPanel(ui, game, save).onclose = hub),
    onSettings: () => S.settingsPanel(ui, {
      test: TEST, get: (k) => opts[k], set: (k, v) => { opts[k] = v; if (k === 'gfx') opts.gfxManual = true; saveOpts(); if (k === 'gfx') setQuality(v); if (k === 'reducedFx') setReducedFx(v); if (k === 'camAuto') camState.auto = !!v; applyTest(); },
      reset: () => { core.clearSave(); location.reload(); },
    }),
  });
  // bekleyen sonuçlar (yenileme / sahada çatlayan yumurta / yarıda kalan açılış) karar ekranına döner
  const fresh = game.pendingPulls ? game.pendingPulls().filter((p) => !promptedPulls.has(p.id)) : [];
  if (fresh.length && !coreBusy) { fresh.forEach((p) => promptedPulls.add(p.id)); setTimeout(() => decideFlow(null).then(hub), 350); }
}

// ---------- v4.1 RUH ÇEKİRDEĞİ AKIŞI ----------
const promptedPulls = new Set();
let coreBusy = false, cscene = null;
const ensureCoreScene = () => (cscene ||= coreScene(gateView));
function openCorePanel() {
  CS.corePanel(ui, game, { onOpen: (t, n) => openFlow(t, n), onMuhur: () => muhurFlow(), onPending: () => { S.clear(ui); decideFlow(null).then(hub); }, onChange: save }).onclose = () => { if (!coreBusy) hub(); };
}
function tapOverlay(text, onSkip) {
  const ov = S.el('div', 'scr coretap', `<span class="ahint">${text}</span>`); ui.appendChild(ov);
  if (onSkip) { const b = S.el('button', 'btn sm skipb', 'Atla'); b.onclick = (e) => { e.stopPropagation(); onSkip(); }; ov.appendChild(b); }
  return ov;
}
async function revealResults(results, coreType) {
  const cs = ensureCoreScene(); let skipped = false;
  const ov = tapOverlay(results.length > 1 ? '10\'lu açılış · Atla ile özete geç' : 'Kristal kırılıyor…', results.length > 1 ? () => { skipped = true; } : null);
  window.__edinReveal = { running: true, n: results.length };
  try { await cs.reveal(results, { coreType, skip: () => skipped, onReveal: (i, p) => { sfx(p.mythic || p.grade === 'S' ? 'level' : 'crit'); vibrate(p.mythic ? [80, 40, 120] : 25); } }); }
  catch (e) { console.error('açılış efekti', e); }
  ov.remove(); window.__edinReveal = { running: false, n: results.length, skipped };
}
async function openFlow(type, count) {
  if (coreBusy) return; coreBusy = true;
  try {
    const r = game.openCores(type, count, CS.newOpId('open'));
    if (!r.ok) { coreBusy = false; S.clear(ui); hub(); return; }
    save(); // sonuçlar ve düşülen çekirdekler animasyondan ÖNCE kayıtta
    r.results.forEach((p) => promptedPulls.add(p.id));
    S.clear(ui);
    await revealResults(r.results, type);
    await decideFlow(r.results.map((p) => p.id));
  } finally { coreBusy = false; }
  hub();
}
async function muhurFlow() {
  if (coreBusy) return; coreBusy = true;
  try {
    const r = game.useKaderMuhru(CS.newOpId('muhur'));
    if (!r.ok) return; save(); r.results.forEach((p) => promptedPulls.add(p.id));
    S.clear(ui); await revealResults(r.results, 'kader'); await decideFlow(r.results.map((p) => p.id));
  } finally { coreBusy = false; }
  hub();
}
async function feedAnim(items, oz) {
  const cs = ensureCoreScene(); S.clear(ui);
  const ov = tapOverlay('Ruh yutuluyor · dokun: hızlandır');
  const lab = S.el('div', 'ozgain feedgain', `+${oz} öz`); ui.appendChild(lab);
  try { await cs.feed(items, { speed: opts.absorbSpeed || 1, tapEl: ov, onLabel: () => { lab.style.left = '50%'; lab.style.top = '30%'; lab.classList.add('show'); sfx('heal'); vibrate(30); } }); }
  catch (e) { console.error('yutma efekti', e); }
  ov.remove(); setTimeout(() => lab.remove(), 600);
}
/** Bekleyen sonuçlar için karar döngüsü. ids verilirse yalnız onlar (açılış), yoksa bütün bekleyenler. */
async function decideFlow(ids) {
  const cs = ensureCoreScene(); const wasBusy = coreBusy; coreBusy = true;
  try {
    for (let guard = 0; guard < 40; guard++) {
      let pend = game.pendingPulls(); if (ids) pend = pend.filter((p) => ids.includes(p.id));
      if (!pend.length) break;
      S.clear(ui);
      const group = ids || pend.map((p) => p.id);
      if (pend.length > 1 || (ids && ids.length > 1)) {
        cs.clearPreview(); gateView.setShot('hub');
        const r = await CS.pullSummary(ui, game, group);
        if (r.action === 'later') break;
        if (r.action === 'feedAll') {
          const items = pend.map((p) => ({ ...p }));
          const res = game.feedAllPending(pend.map((p) => p.id), CS.newOpId('feedall')); save();
          if (res.ok && res.count) await feedAnim(items, res.oz);
          continue;
        }
        if (r.action === 'keep') { if ((await single(r.id)) === 'later') continue; continue; }
      } else if ((await single(pend[0].id)) === 'later') break;
    }
  } finally { cs.clearPreview(); coreBusy = wasBusy; }
}
async function single(id) {
  const cs = ensureCoreScene();
  const p = game.pendingPulls().find((x) => x.id === id); if (!p) return 'done';
  const info = game.pullDecisionInfo(id);
  cs.showChar(p, info.startLevel);
  const ch = await CS.decisionCard(ui, game, id);
  if (ch.action === 'later') return 'later';
  if (ch.action === 'feed') {
    const r = game.resolvePull(id, 'feed', {}, CS.newOpId('feed')); save();
    if (r.ok) await feedAnim([{ ...p }], r.oz);
    return 'done';
  }
  const r = game.resolvePull(id, 'keep', { replaceUid: ch.replaceUid }, CS.newOpId('keep')); save();
  if (r.ok) {
    sfx('level'); vibrate([60, 40, 60]);
    await S.storyLine(ui, `<b>${tr(r.char.id)}</b> (${r.char.grade}, Sv ${r.char.level}) kan bağına katıldı.${r.replaced ? '<br><small>Değiştirilen karakter bırakıldı.</small>' : '<br><small>Kan Bağları\'ndan aktif yapabilirsin.</small>'}`, 2600);
  } else await S.storyLine(ui, r.reason === 'aktif' ? 'Aktif karakter değiştirilemez. Önce Kan Bağları\'ndan diğerine geç.' : 'Olmadı: ' + r.reason, 2200);
  return 'done';
}

// ---------- v4.1: SAHADA ÇEKİRDEK (yalnız çantadakiler; saldırı gelirse güvenle kesilir) ----------
let fieldAbort = null;
function fieldGuard() {
  let aborted = false, fire;
  const p = new Promise((r) => (fire = r));
  const g = { get aborted() { return aborted; }, abort() { if (aborted) return; aborted = true; fire('__abort'); window.__edinFieldAborted = (window.__edinFieldAborted || 0) + 1; }, race: (x) => Promise.race([x, p]) };
  fieldAbort = () => g.abort();
  return g;
}
function cleanupFieldUi() { document.querySelectorAll('#ui > .fieldrev, #ui > .scr.decide, #ui > .scr.summary, #ui > .fieldtap, #ui > .panel.cores').forEach((e) => e.remove()); }
function openFieldCorePanel() {
  if (!game.inRun || fighting || coreBusy || !hud) return;
  document.querySelectorAll('#ui > .panel.wbag, #ui > .panel.cores').forEach((e) => e.remove());
  CS.corePanel(ui, game, { field: true, onOpen: (t, n) => fieldOpen(t, n), onMuhur: () => fieldMuhur(), onPending: () => { cleanupFieldUi(); fieldDecide(null); }, onChange: save });
}
async function fieldOpen(type, count) {
  if (coreBusy || fighting) return;
  const r = game.openCores(type, count, CS.newOpId('fopen'));
  document.querySelectorAll('#ui > .panel.cores').forEach((e) => e.remove());
  if (!r.ok) { hud?.toast('Açılamadı: ' + ({ yetersiz: 'çantada yeterli çekirdek yok', savas: 'savaştasın' }[r.reason] || r.reason)); return; }
  save(); // sonuçlar ve düşülen çekirdekler animasyondan ÖNCE kayıtta
  r.results.forEach((p) => promptedPulls.add(p.id));
  await fieldRun(r.results);
}
async function fieldMuhur() {
  if (coreBusy || fighting) return;
  const r = game.useKaderMuhru(CS.newOpId('fmuhur'));
  document.querySelectorAll('#ui > .panel.cores').forEach((e) => e.remove());
  if (!r.ok) return;
  save(); r.results.forEach((p) => promptedPulls.add(p.id));
  await fieldRun(r.results);
}
async function fieldRun(results) {
  coreBusy = true; const g = fieldGuard();
  try { await fieldReveal(results, g); if (!g.aborted) await fieldDecide(results.map((p) => p.id), g); }
  finally { if (fieldAbort) fieldAbort = null; coreBusy = false; cleanupFieldUi(); }
}
/** Sahada hafif açılış: dünya çizilmeye ve işlemeye devam eder (canavar gelirse kesilir). */
async function fieldReveal(results, g) {
  const ov = S.el('div', 'scr fieldrev', `<span class="ahint">${results.length > 1 ? 'Çekirdekler kırılıyor · dokun: hızlandır' : 'Kristal kırılıyor…'}</span><div class="frow"></div>`); ui.appendChild(ov);
  const row = ov.querySelector('.frow'); let fast = false; ov.onclick = () => { fast = true; };
  const order = results.map((p, i) => ({ p, i })).sort((a, b) => (a.p.mythic ? 4 : 'CBAS'.indexOf(a.p.grade)) - (b.p.mythic ? 4 : 'CBAS'.indexOf(b.p.grade)));
  const els = results.map(() => { const e = S.el('div', 'fx', ''); row.appendChild(e); return e; });
  window.__edinReveal = { running: true, n: results.length, field: true };
  const wait = (ms) => g.race(new Promise((r) => setTimeout(r, fast ? Math.min(ms, 60) : ms)));
  await wait(results.length > 1 ? 450 : 700);
  for (const { p, i } of order) {
    if (g.aborted) break;
    const col = '#' + PULL_COLOR[pullKey(p)].toString(16).padStart(6, '0');
    els[i].style.setProperty('--c', col); els[i].classList.add('open'); if (p.mythic) els[i].classList.add('myth');
    els[i].textContent = p.mythic ? '✦' : p.grade;
    sfx(p.mythic || p.grade === 'S' ? 'level' : 'crit'); vibrate(p.mythic ? [80, 40, 120] : 20);
    await wait(results.length > 1 ? 240 : 650);
  }
  if (!g.aborted) await wait(results.length > 1 ? 500 : 350);
  ov.remove(); window.__edinReveal = { running: false, n: results.length, field: true, aborted: g.aborted };
}
async function fieldDecide(ids, g0) {
  if (!g0 && (coreBusy || fighting || !game.inRun)) return;
  const own = !g0; const g = g0 || fieldGuard(); if (own) coreBusy = true;
  try {
    for (let k = 0; k < 40; k++) {
      if (g.aborted || fighting) return;
      let pend = game.pendingPulls(); if (ids) pend = pend.filter((p) => ids.includes(p.id));
      if (!pend.length) break;
      if (pend.length > 1) {
        const r = await g.race(CS.pullSummary(ui, game, pend.map((p) => p.id)));
        if (g.aborted || !r || r.action === 'later') return;
        if (r.action === 'feedAll') {
          const items = pend.map((p) => ({ ...p }));
          const res = game.feedAllPending(pend.map((p) => p.id), CS.newOpId('ffeedall')); save();
          if (res.ok && res.count) await fieldFeed(items, res.oz, g);
          continue;
        }
        if (r.action === 'keep') { if ((await fieldSingle(r.id, g)) === 'later') return; continue; }
      } else if ((await fieldSingle(pend[0].id, g)) === 'later') return;
    }
  } finally { if (own) { if (fieldAbort) fieldAbort = null; coreBusy = false; cleanupFieldUi(); } }
}
async function fieldSingle(id, g) {
  const p = game.pendingPulls().find((x) => x.id === id); if (!p) return 'done';
  const ch = await g.race(CS.decisionCard(ui, game, id));
  document.querySelectorAll('#ui > .scr.decide').forEach((e) => e.remove());
  if (g.aborted || !ch || ch === '__abort' || ch.action === 'later') return 'later';
  if (ch.action === 'feed') {
    const r = game.resolvePull(id, 'feed', {}, CS.newOpId('ffeed')); save();
    if (r.ok) await fieldFeed([{ ...p }], r.oz, g);
    return 'done';
  }
  const r = game.resolvePull(id, 'keep', { replaceUid: ch.replaceUid }, CS.newOpId('fkeep')); save();
  if (r.ok) { sfx('level'); vibrate([60, 40, 60]); hud?.toast(`<b>${tr(r.char.id)}</b> (${r.char.grade}, Sv ${r.char.level}) kan bağına katıldı. Aktif yapmak için kapıda <b>Kan Bağları</b>.`, 3600); }
  else hud?.toast(r.reason === 'aktif' ? 'Aktif karakter sahada değiştirilemez. Kapıda Kan Bağları\'ndan diğerine geç; sonuç seni bekler.' : 'Olmadı: ' + r.reason, 3600);
  return 'done';
}
/** Sahada karakter ruhu yutma: dünya sahnesinde, oyuncunun ejderhasıyla (yedirme özü taşınan öze çoktan eklendi). */
async function fieldFeed(items, oz, g) {
  if (!worldView || !worldView.player || g.aborted) return;
  const pl = worldView.player; const yaw = pl.group.rotation.y;
  const at = pl.group.position.clone(); at.x += Math.sin(yaw) * 1.9; at.z += Math.cos(yaw) * 1.9;
  const ov = S.el('div', 'scr coretap fieldtap', '<span class="ahint">Ruh yutuluyor · dokun: hızlandır</span>'); ui.appendChild(ov);
  const lab = S.el('div', 'ozgain feedgain', `+${oz} öz`); ui.appendChild(lab);
  let sf = null; const tick = (dt) => sf && sf.update(dt);
  try {
    sf = createSpiritFeed(worldView.scene, { dragon: pl, items, ghostAt: at, camera: worldView.camera, renderer: stage.renderer, reduced: !!stage.reducedFx, quality: stage.quality, stage: 2, vivid: true, ghostScale: 1.25, onLabel: () => { lab.style.left = '50%'; lab.style.top = '30%'; lab.classList.add('show'); sfx('heal'); vibrate(30); } });
    sf.speed = opts.absorbSpeed || 1; ov.onclick = () => { sf.speed = 4 * (opts.absorbSpeed || 1); };
    stage.listeners.push(tick); window.__edinFieldFeed = { running: true, sf, at };
    await g.race(sf.done);
  } catch (e) { console.error('saha yutma efekti', e); }
  finally {
    const i = stage.listeners.indexOf(tick); if (i >= 0) stage.listeners.splice(i, 1);
    try { sf && sf.finish(); } catch (e) { console.error(e); }
    ov.remove(); setTimeout(() => lab.remove(), 600); window.__edinFieldFeed = { running: false, aborted: g.aborted };
  }
}

function enterZone(id) {
  if (!game.enterZone(id)) { hub(); return; }
  S.clear(ui); save();
  worldView = createWorldView(game, tagLayer); resumeWorld();
  const firstTime = !game.flags.firstFightDone && id === 'kiyi';
  hud.toast(firstTime ? "Bir canavara yürü, yanına gelince <b>SALDIR</b>'a dokun. İlk savaş öğreticidir." : `${tr(id)} — ölünce taşınan özün %${Math.round(game.zone().lossOnDeath * 100)}'i gider.`, 4200);
  if (!opts.resHintShown && game.flags.firstFightDone) { opts.resHintShown = true; saveOpts(); const h1 = hud; setTimeout(() => { if (hud && hud === h1) hud.toast('Halkalı kaynakları <b>TOPLA</b>; kamp ateşinde pişir, <b>Çanta</b>dan ye. Kamp özü güvenceye almaz.', 4600); }, 1200); }
  if (!opts.camHintShown) { opts.camHintShown = true; saveOpts(); const h0 = hud; setTimeout(() => { if (hud && hud === h0) hud.toast('Ekranı kaydırarak etrafa bak, iki parmakla yakınlaş. Pusula kamerayı düzeltir.', 4200); }, firstTime ? 4600 : 2600); }
}
function resumeWorld() {
  if (tickFn) stopWorld(); // aynı anda iki dünya döngüsü kalmasın
  setView(worldView);
  hud = S.worldHud(ui, game, { onReturn: () => { if (game.returning > 0) return; game.returnToGate(); hud.toast('Dönüş büyüsü… hareket edersen bozulur.'); }, onAttack: fight, onCompass: () => { resetCam(); sfx('click'); }, getYaw: () => camState.yaw, ...worldHandlers() });
  bindWorldEvents();
  hud.maxHp = maxHpOf();
  { const np = game.pendingPulls ? game.pendingPulls().length : 0; if (np && !coreBusy) { const h0 = hud; setTimeout(() => { if (hud && hud === h0) hud.toast(`Karar bekleyen <b>${np}</b> çekirdek sonucu var — <b>Çanta › Karar ver</b>.`, 3800); }, 900); } }
  tickFn = (dt) => {
    if (!hud) return;
    if (!game.zoneId) return arrived();
    game.tick(dt, joyToWorld(hud.joy(), worldView ? worldView.yaw : 0)); hud.update();
    if (game.pendingFightUid && !fighting) fight();
  };
  stage.listeners.push(tickFn);
}
async function arrived(arr = game.lastArrival) {
  stopWorld(); S.clear(ui);
  setView(gateView); gateView.setCreature(game.creature.id, stageOf(game.creature.level)); gateView.setShot('hub');
  if (arr && arr.to > arr.from) { gateView.levelUpFx(); sfx('level'); vibrate([60, 40, 60]); }
  save();
  await S.arrivalScreen(ui, arr || { deposited: 0, from: game.creature.level, to: game.creature.level });
  hub();
}
let ozHintShown = false, fighting = false;
async function fight() {
  if (fighting) return;
  if (fieldAbort) fieldAbort(); // sahadaki açılış/karar/yutma güvenle kesilir; sonuçlar bekler
  const battle = game.startFight(); if (!battle) return;
  fighting = true;
  stopWorld(); S.clear(ui);
  const bv = createBattleView(battle, { zoneId: game.zoneId, ui, onSound: sfx, vibrate });
  setView(bv);
  const b = await bv.done;
  const zoneObj = game.zone ? game.zone() : null;
  const prevCarried = game.carriedOz;
  // ödül çekirdekte BİR KEZ hesaplanır ve hemen kaydedilir; emme efekti yalnızca görseldir
  const res = game.finishFight(b) || {}; save();
  if (b.winner === 'player') { try { await bv.absorb(res.absorb, { speed: opts.absorbSpeed || 1, cores: res.cores }); } catch (e) { console.error('emme efekti', e); } }
  bv.dispose(); fighting = false;
  const inc = game.publicEggs().find((e) => e.incubating && !e.hatched);
  if (b.winner === 'player' && inc) res.eggHeat = inc.progress;
  if (b.winner === 'player') {
    await S.victoryScreen(ui, res, game);
    if (!game.zoneId) return arrived();
    resumeWorld(); hud.countFrom && hud.countFrom(prevCarried);
    if (!ozHintShown) { ozHintShown = true; hud.toast('Taşınan öz parlıyor: <b>kapıya götürene kadar senin değil.</b>', 4000); }
    else if (game.carriedOz + game.bankedOz >= game.ozToNext?.()) hud.toast('Seviye atlamaya yetecek öz var — <b>Dönüş büyüsü</b> ile kapıya dön.', 4000);
  } else if (b.winner === 'fled') {
    if (!game.zoneId) return arrived();
    resumeWorld(); hud.toast('Kaçtın.');
  } else {
    const d = game.lastDeath || {};
    await S.defeatScreen(ui, { ozLost: d.lost || 0, protectedRun: d.protectedRun, coresLost: d.coresLost || game.lastDeathCores, coresInBag: true }, zoneObj || R.zones[0]);
    game.dismissDeath();
    arrived(game.lastArrival);
  }
}

// kapıda / ölüm ekranında da oyun saati işlesin (yara süresi, bekçi yeniden doğma)
stage.listeners.push((dt) => { if (game && game.screen !== 'world' && game.screen !== 'battle') game.tick(dt); });
title();
window.__edin = { get game() { return game; }, opts, openFlow, decideFlow, muhurFlow, openCorePanel, get coreBusy() { return coreBusy; }, get view() { return stage.view; }, core, enterZone, hub, fight, shot: presentShot, cam: camState, perf: () => import('./ui/stage.js').then((m) => m.perfInfo()) };

// ---------- ?shot=gate|kiyi|bozkir|derin [&cam=play] : sunum kamerası (oyunda kullanılmaz) ----------
const CINE = {
  kiyi: { pos: [30, 6.5, 46], look: [2, 4, 22] },
  bozkir: { pos: [40, 7, 66], look: [40, 6, -10] },
  derin: { pos: [14, 6, 6], look: [44, -4, -70] },
  kiyi_gate: { pos: [-2.5, 3.6, 30], look: [40, 2.2, 26] },
};
function presentShot(id, cam = 'cine') {
  stopWorld(); S.clear(ui);
  if (id === 'gate') { setView(gateView); gateView.setShot(cam === 'play' ? 'title' : 'cine'); return; }
  game = core.createGame(); game.chooseStarter(R.start.creatureChoice[0]);
  game.unlockedZones = R.zones.map((z) => z.id); game.enterZone(id);
  worldView = createWorldView(game, tagLayer);
  if (cam === 'play') { resumeWorld(); return; }
  setView(worldView); tagLayer.style.display = 'none'; const c = CINE[id + '_' + cam] || CINE[id]; worldView.cine = { pos: { x: c.pos[0], y: c.pos[1], z: c.pos[2] }, look: { x: c.look[0], y: c.look[1], z: c.look[2] } };
}
{ const m = /[?&]shot=(\w+)/.exec(location.search); if (m) { const c = /[?&]cam=(\w+)/.exec(location.search); presentShot(m[1], c ? c[1] : 'cine'); } }

// ---------- ?gallery=1 : bütün modelleri yan yana gösterir (modelci ve test için) ----------
if (/[?&]gallery=1/.test(location.search)) {
  import('./ui/galleryView.js').then((m) => { S.clear(ui); setView(m.createGallery(ui)); });
}
