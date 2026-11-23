// HTML ekranları: açılış, yumurta seçimi, kapı (ana üs), paneller, harita HUD'u, zafer/yenilgi, ayarlar.
import R from '../data/rules.json';
import { tr, ROLE_TEXT, GRADE_COLOR } from './labels.js';

export const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const btn = (label, cls, fn) => { const b = el('button', 'btn ' + (cls || ''), label); b.onclick = fn; return b; };
const ozToNext = (l) => Math.round(100 * Math.pow(l, 1.6) / 10) * 10;
const fmt = (n) => Math.round(n).toLocaleString('tr-TR');
const NODE_DOT = { cig_et: '#e06a5a', sifali_ot: '#8fd06a', sifali_meyve: '#ff8a3a', ruh_mantari: '#4ff0e0' };
const pct = (x) => `%${Math.round(x * 100)}`;
const crystalSmall = (c = '#7fd6ff') => `<i class="cico sm" style="--c:${c}"></i>`;

export function clear(ui) { ui.querySelectorAll(':scope > .scr').forEach((e) => e.remove()); }
function screen(ui, cls) { const s = el('div', 'scr ' + cls); ui.appendChild(s); return s; }

// ---------- AÇILIŞ ----------
export function titleScreen(ui, { hasSave, onStart, onContinue, sound, onSound }) {
  const s = screen(ui, 'title');
  s.innerHTML = `<div class="logo">EDİN<small>Ruhlar ovasının kapısı</small></div>`;
  const row = el('div', 'row');
  if (hasSave) row.appendChild(btn('Devam et', 'gold big', onContinue));
  row.appendChild(btn(hasSave ? 'Yeni oyun' : 'Başla', hasSave ? '' : 'gold big', onStart));
  s.appendChild(row);
  const snd = btn(sound ? '🔊' : '🔈', 'icon sndb', () => { onSound(); snd.textContent = snd.textContent === '🔊' ? '🔈' : '🔊'; });
  s.appendChild(snd);
  return s;
}
export function storyLine(ui, text, ms = 2600) {
  const s = screen(ui, 'story'); s.innerHTML = `<p>${text}</p>`;
  return new Promise((r) => { const end = () => { s.classList.add('out'); setTimeout(() => { s.remove(); r(); }, 400); }; setTimeout(end, ms); s.onclick = end; });
}

// ---------- YUMURTA SEÇİMİ ----------
export function eggSelect(ui, { onPick, onBond }) {
  const s = screen(ui, 'eggs');
  s.innerHTML = `<div class="head">Kanını bir ejderhaya bağla</div>`;
  const cards = el('div', 'cards'); s.appendChild(cards);
  let picked = -1; const bond = btn('Kan bağı kur', 'gold big bond off', () => picked >= 0 && onBond(picked));
  R.start.creatureChoice.forEach((id, i) => {
    const c = R.creatures[id];
    const ch = c.chains && c.chains[0]; const seq = ch ? ch.seq.map((m) => (m === 'quick' ? 'H' : m === 'heavy' ? 'A' : 'S')).join('-') : '';
    const card = el('div', 'card', `<b>${tr(id)}</b><span class="role r-${c.role}">${tr(c.role)}</span><p>${ROLE_TEXT[id] || ''}</p><small>${ch ? `Zincir: ${ch.name} (${seq})` : ''}${c.finisher ? `<br>Bitirici: ${c.finisher.name}` : ''}<br>Pasif: ${c.passive.name || tr(c.passive.id)}</small>`);
    card.onclick = () => { picked = i; cards.querySelectorAll('.card').forEach((x, j) => x.classList.toggle('on', j === i)); bond.classList.remove('off'); onPick(i); };
    cards.appendChild(card);
  });
  const foot = el('div', 'foot'); foot.append(el('span', 'note', 'Başlangıç yumurtası her zaman C derecedir.'), bond); s.appendChild(foot);
  return s;
}
export function hatchBanner(ui, name, grade) {
  const s = screen(ui, 'banner'); s.innerHTML = `<div class="bn"><span class="grade big" style="background:${GRADE_COLOR[grade]}">${grade}</span><b>${name} doğdu!</b><small>Kan bağı kuruldu. Artık onun gözleriyle göreceksin.</small></div>`;
  return new Promise((r) => { const b = btn('Devam', 'gold', () => { s.remove(); r(); }); s.firstChild.appendChild(b); });
}

// ---------- KAPI (ana üs) ----------
export function gateScreen(ui, game, h) {
  const s = screen(ui, 'gate');
  const c = game.creature; const need = ozToNext(c.level); const pct = c.level >= R.meta.maxLevel ? 100 : Math.min(100, (game.bankedOz / need) * 100);
  const info = el('div', 'gpanel', `
    <div class="gname"><b>${tr(c.id)}</b><span class="grade" style="background:${GRADE_COLOR[c.grade]}">${c.grade}</span></div>
    <div class="glv">Seviye <b>${c.level}</b><span>/ ${R.meta.maxLevel}</span></div>
    <div class="xp"><i style="width:${pct}%"></i><span>${fmt(game.bankedOz)} / ${c.level >= R.meta.maxLevel ? '—' : fmt(need)} öz</span></div>
    <div class="money"><span class="ic ic-sekel"></span>${fmt(game.sekel)} şekel</div>
    <div class="kader" title="Kader Mührü: A %80 / S %20 ejderha garantisi. Merhamet: mitolojiksiz açılışlar (Kil sayılmaz, Sv ${R.soulCores.mythicMinLevel} altında ilerlemez).">Kader Mührü: <b>${game.kaderMuhru || 0}</b> · Merhamet: <b>${game.pulls ? game.pulls.pity : 0}</b>/${game.mythicInfo ? game.mythicInfo('altin').pityHard : 80}</div>
    <div class="cbadge">${crystalSmall()} Çekirdek: çanta <b>${game.coreCounts ? game.coreCounts().bagTotal : 0}</b> · depo <b>${game.coreCounts ? game.coreCounts().depotTotal : 0}</b></div>
    ${incText(game)}`);
  s.appendChild(info);
  const goal = !game.unlockedZones.includes('bozkir') ? "Hedef: Laḫmu'yu yen, Bozkır'ın kapısı açılsın." : !game.unlockedZones.includes('derin') ? "Hedef: Anzû'yu yen, Derin Edin açılsın." : 'Hedef: Ušumgallu\'yu yen.';
  s.appendChild(el('div', 'goal', goal));
  const menu = el('div', 'gmenu');
  menu.append(
    btn('Edin\'e gir', 'gold big', h.onEnter),
    btn(`Çekirdekler${game.pendingPulls && game.pendingPulls().length ? `<em class="pbadge">${game.pendingPulls().length}</em>` : ''}`, 'coreb', h.onCores),
    btn('Kan Bağları', '', h.onRoster), btn('Çanta', '', h.onBag), btn('Dükkân', '', h.onShop), btn('⚙', 'icon', h.onSettings),
  );
  s.appendChild(menu);
  return s;
}
export function zonePicker(ui, game, onPick) {
  const s = panel(ui, 'Edin\'e gir — bölge seç');
  const warn = el('div', 'note warn'); s.body.appendChild(warn);
  const list = el('div', 'zlist'); s.body.appendChild(list);
  const protectedLeft = game.lossProtectionLeft();
  let lastKey = '';
  const render = () => {
    const wounded = game.isWounded();
    warn.style.display = wounded ? '' : 'none';
    if (wounded) warn.textContent = `Yaratığın yaralı: ${game.woundedSecondsLeft()} sn dinlenmeli. Kıyı'ya girebilirsin; Bozkır ve Derin Edin kapalı.`;
    const states = R.zones.map((z) => (game.canEnterZone ? game.canEnterZone(z.id) : game.unlockedZones.includes(z.id) && !wounded));
    const key = states.join(',');
    if (key === lastKey) return;
    lastKey = key; list.innerHTML = '';
    R.zones.forEach((z, i) => {
      const open = states[i], unlocked = game.unlockedZones.includes(z.id);
      const why = !unlocked ? `🔒 ${{ 'lahmu ilk kez yenilince': "Laḫmu'yu yen", 'anzu ilk kez yenilince': "Anzû'yu yen" }[z.unlock] || z.unlock}` : '🩹 Yara iyileşince açılır';
      const card = el('div', 'zcard z-' + z.id + (open ? '' : ' locked'), `<b>${tr(z.id)}</b><span>Seviye ${z.levels[0]}–${z.levels[1]}</span>
      <span>Ölünce kayıp: <em>%${Math.round(z.lossOnDeath * 100)}</em></span><span>Öz çarpanı ×${z.ozMult}</span>
      ${open ? '' : `<small>${why}</small>`}`);
      if (open) card.onclick = () => { s.close(); onPick(z.id); };
      list.appendChild(card);
    });
  };
  render();
  const iv = setInterval(() => { if (!s.isConnected) return clearInterval(iv); render(); }, 500);
  const prevClose = s.onclose; s.onclose = () => { clearInterval(iv); prevClose && prevClose(); };
  if (protectedLeft > 0) s.body.appendChild(el('div', 'note', `Koruma: ${protectedLeft} sefer boyunca ölünce öz kaybetmezsin.`));
  return s;
}
export function panel(ui, title) {
  const s = screen(ui, 'panel'); const box = el('div', 'pbox');
  const hd = el('div', 'phead', `<b>${title}</b>`); const x = btn('✕', 'icon close', () => s.close()); hd.appendChild(x);
  const body = el('div', 'pbody'); box.append(hd, body); s.appendChild(box);
  s.body = body; s.close = () => { s.remove(); s.onclose && s.onclose(); };
  s.onclick = (e) => { if (e.target === s) s.close(); };
  return s;
}
export function creaturePanel(ui, game, makeCombatant, ch = null) {
  const c = ch || game.creature; const d = R.creatures[c.id];
  const cb = makeCombatant({ kind: 'creature', id: c.id, level: c.level, grade: c.grade });
  const s = panel(ui, `${tr(c.id)} · ${tr(d.role)}`);
  const st = Object.fromEntries(Object.entries(cb.stats).map(([k, v]) => [k, Math.round(v)])); const names = { hp: 'Can', atk: 'Saldırı', def: 'Savunma', cev: 'Çeviklik', krit: 'Kritik', blok: 'Blok' };
  const g = el('div', 'stats'); for (const k of Object.keys(names)) g.appendChild(el('div', '', `<span>${names[k]}</span><b>${st[k]}</b>`));
  const sk = el('div', 'skills');
  const IC = { quick: '⚡', heavy: '🔨', guard: '🛡' }; const GR = { C: 0, B: 1, A: 2, S: 3 };
  const lvls = (R.combat2 && R.combat2.chainUnlockLevels) || (R.constants && R.constants.chainUnlockLevels) || [1, 5, 10];
  const add = (name, sub, open) => sk.appendChild(el('div', 'sk' + (open ? '' : ' lock'), `<b>${name}</b><small>${sub}</small>`));
  if (d.passive) add(tr(d.passive.id), 'Pasif · hep açık', true);
  (d.chains || []).forEach((ch, i) => {
    const lv = lvls[i] ?? 99; const gOk = GR[c.grade] >= GR[ch.minGrade || 'C']; const open = c.level >= lv && gOk;
    add(ch.name, `Zincir ${ch.seq.map((m) => IC[m] || m).join(' › ')}${c.level < lv ? ` · Sv ${lv}'de açılır` : ''}${!gOk ? ` · sadece ${ch.minGrade}+` : ''}`, open);
  });
  if (d.finisher) add(d.finisher.name, '🔥 Bitirici · Kan Ateşi puanlarını harcar', true);
  const stg = c.level >= 10 ? 'Yetişkin' : c.level >= 5 ? 'Genç' : 'Yavru';
  s.body.append(el('div', 'note', `Gelişim: ${stg}${c.level < 10 ? ` · sonraki evre Sv ${c.level < 5 ? 5 : 10}` : ''}`), g, sk);
  return s;
}
function incText(game) {
  const e = game.publicEggs().find((x) => x.incubating && !x.hatched);
  return e ? `<div class="egginc">Kuluçkada ${tr(e.species)} yumurtası: %${Math.round(e.progress * 100)}</div>` : '';
}
export function bagPanel(ui, game, onChange, onDecide = null) {
  const s = panel(ui, 'Çanta, kemer ve yumurtalar');
  const draw = (msg) => {
    s.body.innerHTML = '';
    if (msg) s.body.appendChild(el('div', 'note warn', msg));
    // kemer: 4 cep
    const bt = el('div', 'beltedit'); bt.appendChild(el('div', 'lbl', `Kemer (${R.constants.beltPockets} cep, savaşta kullanılır)`));
    const pockets = el('div', 'bpockets');
    const beltIds = Object.keys(R.items).filter((id) => R.items[id].beltAllowed !== false);
    game.belt.forEach((p, i) => {
      const c = el('div', 'bpocket' + (p ? '' : ' empty'), p ? `<span class="ic ic-${p.itemId}"></span><b>${tr(p.itemId)}</b><small>×${p.count}</small>` : '<small>Boş cep</small>');
      const opts = beltIds.filter((id) => (game.bag[id] || 0) > 0);
      const sel = el('select', 'sm');
      sel.innerHTML = `<option value="">${p ? 'Boşalt' : 'Seç…'}</option>` + opts.map((id) => `<option value="${id}">${tr(id)} (${game.bag[id]})</option>`).join('');
      sel.onchange = () => { game.setPocket(i, sel.value || null); onChange(); draw(); };
      c.appendChild(sel); pockets.appendChild(c);
    });
    bt.appendChild(pockets);
    bt.appendChild(btn('Cepleri doldur', 'sm', () => { game.refillBelt(); onChange(); draw(); }));
    // çanta eşyaları
    const inv = el('div', 'invgrid');
    const items = Object.entries(game.bag).filter(([, n]) => n > 0);
    if (!items.length) inv.appendChild(el('div', 'note', 'Çanta boş. Dükkândan alabilirsin.'));
    for (const [id, n] of items) {
      const r = el('div', 'irow', `<span class="ic ic-${id}"></span><b>${tr(id)}</b><span>×${n}</span>`);
      r.appendChild(btn('Sat', 'sm', () => { game.sell(id, 1); onChange(); draw(); }));
      inv.appendChild(r);
    }
    // yumurtalar
    const eggs = game.publicEggs();
    const eg = el('div', 'eggs-list');
    if (eggs.length) eg.appendChild(el('div', 'lbl', 'Eski yumurtalar <small>(çatlayınca derecesi korunur; Tut ya da Yedir)</small>'));
    for (const e of eggs) {
      const txt = e.hatched ? `<b>${tr(e.species)}</b> <span class="grade" style="background:${GRADE_COLOR[e.grade]}">${e.grade}</span> çatladı` : `<b>${tr(e.species)}</b> yumurtası · %${Math.round(e.progress * 100)} ısındı${e.incubating ? ' · <em>kuluçkada</em>' : ''}`;
      const r = el('div', 'irow egg', `<span class="etxt">🥚 ${txt}</span>`);
      if (!e.hatched && !e.incubating) r.appendChild(btn('Kuluçkaya koy', 'sm', () => { game.setIncubating(e.uid); onChange(); draw(); }));
      if (e.hatched) r.appendChild(btn('Karar ver', 'sm gold', () => { if (game.bondEgg(e.uid)) { onChange(); s.close(); onDecide && onDecide(); } else draw('Olmadı.'); }));
      r.appendChild(btn('Sat', 'sm', () => { game.sellEgg(e.uid); onChange(); draw(); }));
      eg.appendChild(r);
    }
    s.body.append(bt, inv, eg);
    if (game.edibles && (game.edibles().length || Object.values(game.resources || {}).some((v) => v > 0))) s.body.append(foodRows(game, null), resRows(game));
  };
  draw(); return s;
}
export function shopPanel(ui, game, onChange) {
  const s = panel(ui, 'Dükkân');
  const draw = () => {
    s.body.innerHTML = `<div class="money"><span class="ic ic-sekel"></span>${fmt(game.sekel)} şekel</div>`;
    for (const [id, it] of Object.entries(R.items)) {
      const row = el('div', 'irow', `<span class="ic ic-${id}"></span><b>${tr(id)}</b><span>${it.price} şekel</span><span>Var: ${game.bag[id] || 0}</span>`);
      row.append(btn('Al', 'sm' + (game.sekel < it.price ? ' off' : ''), () => { if (game.buy(id, 1)) { onChange(); draw(); } }), btn('×5', 'sm' + (game.sekel < it.price * 5 ? ' off' : ''), () => { if (game.buy(id, 5)) { onChange(); draw(); } }));
      s.body.appendChild(row);
    }
    // v4.1: çekirdek çantası yükseltmesi
    if (game.nextBagUpgrade) {
      const up = game.nextBagUpgrade(); const cc = game.coreCounts();
      const row = el('div', 'irow', `${crystalSmall()}<b>Çekirdek çantası</b><span>${cc.bagCap} yer</span><span>${up ? `→ ${up.cap} · ${up.price} şekel` : 'En büyük'}</span>`);
      if (up) row.append(btn('Büyüt', 'sm' + (game.sekel < up.price ? ' off' : ''), () => { const r = game.upgradeCoreBag(`ui-up-${cc.bagCap}`); if (r && r.ok) { onChange(); draw(); } }));
      s.body.appendChild(row);
    }
  };
  draw(); return s;
}
export function settingsPanel(ui, opts) {
  const s = panel(ui, 'Ayarlar'); s.body.classList.add('grid2');
  const tg = (label, key) => { const b = btn(`${label}: ${opts.get(key) ? 'Açık' : 'Kapalı'}`, '', () => { opts.set(key, !opts.get(key)); b.textContent = `${label}: ${opts.get(key) ? 'Açık' : 'Kapalı'}`; }); return b; };
  const GN = ['Düşük', 'Orta', 'Yüksek'];
  const gq = btn(`Grafik: ${GN[opts.get('gfx') ?? 1]}`, '', () => { const v = ((opts.get('gfx') ?? 1) + 1) % 3; opts.set('gfx', v); gq.textContent = `Grafik: ${GN[v]}`; });
  const AS = [1, 2, 4], ASN = ['Normal', 'Hızlı', 'Çok hızlı'];
  const asp = btn(`Öz emme hızı: ${ASN[Math.max(0, AS.indexOf(opts.get('absorbSpeed') || 1))]}`, '', () => { const i = (Math.max(0, AS.indexOf(opts.get('absorbSpeed') || 1)) + 1) % 3; opts.set('absorbSpeed', AS[i]); asp.textContent = `Öz emme hızı: ${ASN[i]}`; });
  s.body.append(tg('Ses', 'sound'), tg('Titreşim', 'vibrate'), gq, tg('Azaltılmış efekt', 'reducedFx'), tg('Kamera otomatik takip', 'camAuto'), asp);
  if (opts.test) s.body.append(tg('Test: öz ×5', 'test5'));
  let armed = 0; const rs = btn('Kaydı sıfırla', 'danger', () => { armed++; if (armed === 1) rs.textContent = 'Emin misin? Tekrar dokun'; else opts.reset(); });
  s.body.appendChild(rs);
  return s;
}


// ---------- v4: HARİTADA ÇANTA (yemek ye, kaynakları gör) ----------
function foodRows(game, onEat, opts = {}) {
  const wrap = el('div', 'foodlist');
  const ed = game.edibles ? game.edibles() : [];
  const max = game.maxHp(), hp = game.creature.hp;
  wrap.appendChild(el('div', 'lbl', `Yemekler <small>(${Object.values(game.food).filter((v) => v > 0).length}/${R.inventory.foodSlots} yer · yığın ${R.inventory.foodStack})</small>`));
  if (!ed.length) wrap.appendChild(el('div', 'note', 'Yiyecek yok. Kaynak topla, kamp ateşinde pişir. Şifalı meyve çiğ yenir.'));
  for (const e of ed) {
    const gain = Math.min(max - hp, Math.round(max * e.heal));
    const r = el('div', 'irow food', `<span class="ic ic-${e.id}"></span><b>${tr(e.id)}</b><span>×${e.count}</span><span class="heal">+${pct(e.heal)} can${e.buff ? ` · saldırı +${pct(e.buff.atk)} (${e.buff.fights} savaş)` : ''}</span>`);
    if (onEat) { const b = btn('Ye', 'sm gold' + ((gain <= 0 && !e.buff) || opts.noEat ? ' dim' : ''), () => { if (opts.noEat) return; onEat(e.id); }); r.appendChild(b); } // can dolu mu, tıklama anında çekirdek karar verir
    wrap.appendChild(r);
  }
  return wrap;
}
function resRows(game) {
  const wrap = el('div', 'reslist');
  const types = R.resources.types; const kinds = Object.entries(game.resources || {}).filter(([, n]) => n > 0);
  wrap.appendChild(el('div', 'lbl', `Kaynaklar <small>(${kinds.length}/${R.inventory.resourceSlots} yer · yığın ${R.inventory.resourceStack})</small>`));
  const g = el('div', 'resgrid');
  for (const id of Object.keys(types)) { const n = game.resources[id] || 0; g.appendChild(el('div', 'res' + (n ? '' : ' none'), `<span class="ic ic-${id}"></span><b>${tr(id)}</b><span>${n}/${R.inventory.resourceStack}</span>`)); }
  wrap.appendChild(g);
  return wrap;
}
export function worldBag(ui, game, { onEat, onCores, onPending }) {
  const s = panel(ui, 'Çanta'); s.classList.add('wbag');
  const draw = () => {
    s.body.innerHTML = '';
    s.body.appendChild(el('div', 'note', `Can: <b>${Math.round(game.creature.hp)} / ${game.maxHp()}</b> · Yemek savaşta yenmez; yerken saldırı gelirse yemek harcanmaz.`));
    // v4.1: çekirdekler (sahada yalnız çantadakiler açılır)
    if (game.coreCounts && onCores) {
      const cc = game.coreCounts(); const pend = game.pendingPulls ? game.pendingPulls().length : 0;
      const cr = el('div', 'bagcores', `<span>Ruh çekirdekleri <b>${cc.bagTotal}/${cc.bagCap}</b>${pend ? ` · karar bekleyen <b>${pend}</b>` : ''}</span>`);
      cr.appendChild(btn('Çekirdekler', 'sm gold' + (cc.bagTotal || (game.kaderMuhru || 0) > 0 ? '' : ' off'), () => { if (!cc.bagTotal && !(game.kaderMuhru > 0)) return; s.close(); onCores(); }));
      if (pend && onPending) cr.appendChild(btn('Karar ver', 'sm', () => { s.close(); onPending(); }));
      s.body.appendChild(cr);
    }
    s.body.append(foodRows(game, (id) => { s.close(); onEat(id); }), resRows(game));
  };
  draw(); s.redraw = draw; return s;
}
// ---------- v4: KAMP ATEŞİ (pişirme) ----------
export function cookPanel(ui, game, { onCook, onEat }) {
  const s = panel(ui, 'Kamp ateşi'); s.classList.add('cook');
  const draw = (msg) => {
    s.body.innerHTML = '';
    s.body.appendChild(el('div', 'note', `Kamp ateşi canavarlardan korur ama <b>özü güvenceye almaz</b>; bunun için Ruh Kapısı'na dön. Bu seferde bu kampta <b>${game.cooksLeft()}</b> pişirme hakkın kaldı.`));
    if (msg) s.body.appendChild(el('div', 'note ok', msg));
    const list = el('div', 'recipes');
    for (const [id, r] of Object.entries(R.recipes.list)) {
      const can = game.canCook(id);
      const needs = Object.entries(r.needs).map(([k, n]) => { const have = game.resources[k] || 0; return `<span class="need${have >= n ? '' : ' miss'}"><span class="ic ic-${k}"></span>${n} ${tr(k)} <small>(${have})</small></span>`; }).join(' + ');
      const row = el('div', 'recipe', `<span class="ic big ic-${id}"></span><div class="rinfo"><b>${tr(id)}</b><div class="needs">${needs}</div><small>+${pct(r.heal)} can${r.buff ? ` · sonraki ${r.buff.fights} savaşta saldırı +${pct(r.buff.atk)}` : ''} · elinde ${game.food[id] || 0}</small></div>`);
      const why = { malzeme: 'Malzeme yok', hak: 'Hak bitti', dolu: 'Torba dolu', kamp: 'Ateşe yaklaş' }[can.why] || '';
      const b = btn(can.ok ? 'Pişir' : why, 'sm' + (can.ok ? ' gold' : ' off'), async () => { if (!can.ok) return; b.classList.add('off'); await onCook(id); draw(`${tr(id)} pişti!`); });
      row.appendChild(b); list.appendChild(row);
    }
    const fr = el('div', 'note', 'Şifalı meyve pişirme gerektirmez; çiğ yenir.');
    const L = el('div', 'ccol'), Rr = el('div', 'ccol');
    L.append(list, fr); Rr.append(foodRows(game, (id) => { s.close(); onEat(id); }), resRows(game));
    const grid = el('div', 'cookgrid'); grid.append(L, Rr); s.body.appendChild(grid);
  };
  draw(); s.redraw = draw; return s;
}

// ---------- HARİTA HUD'u ----------
export function worldHud(ui, game, h) {
  const s = screen(ui, 'hud');
  s.innerHTML = `
    <div class="tl"><div class="hpw"><span class="nm">${tr(game.creature.id)} · Sv ${game.creature.level}</span><div class="hp"><i></i><span></span></div></div>
      <div class="oz"><span class="ozl">Taşınan öz</span><b>0</b></div>
      <div class="corec">${crystalSmall()}<b></b></div>
      <div class="zinfo"></div><div class="buffb"></div></div>
    <div class="actbar"><span></span><i></i></div>
    <canvas class="mini" width="96" height="96"></canvas>
    <button class="compass" aria-label="Kamerayı sıfırla"><i class="needle"></i><b>K</b></button>
    <div class="joy"><div class="knob"></div></div>
    <div class="br"></div>
    <div class="toast"></div>`;
  const br = s.querySelector('.br');
  const ret = btn('<span>Dönüş<br>büyüsü</span><i></i>', 'round ret', h.onReturn); const atk = btn('SALDIR', 'round attack', h.onAttack);
  // v4: Çanta (yemek/kaynak), Topla ve Kamp. Topla/Kamp, Saldır'ın yerini paylaşır (öncelik: Saldır > Topla > Kamp).
  const bag = btn('<span>Çanta</span><em class="bagn"></em>', 'round bagb', () => h.onBag && h.onBag());
  const gat = btn('TOPLA', 'round gather', () => h.onGather && h.onGather());
  const cmp = btn('KAMP', 'round campb', () => h.onCamp && h.onCamp());
  const slot = el('div', 'actslot'); slot.append(atk, gat, cmp);
  br.append(bag, ret, slot);
  // v4.1: çekirdek sayacına dokununca sahada Çekirdekler ekranı
  const corecEl = s.querySelector('.corec'); corecEl.addEventListener('click', () => h.onCores && h.onCores());
  const compass = s.querySelector('.compass'); const needle = compass.querySelector('.needle');
  compass.addEventListener('click', () => h.onCompass && h.onCompass());
  const z = game.zone();
  const prot = game.lossProtectionLeft();
  s.querySelector('.zinfo').innerHTML = `${tr(z.id)} · kayıp %${Math.round(z.lossOnDeath * 100)}${prot > 0 && z.lossOnDeath > 0 ? ' · <em>koruma açık</em>' : ''}`;
  // joystick
  const joy = s.querySelector('.joy'), knob = s.querySelector('.knob'); const vec = { x: 0, z: 0 }; let id = null, cx = 0, cy = 0;
  const R0 = 46;
  const move = (x, y) => { let dx = x - cx, dy = y - cy; const d = Math.hypot(dx, dy); if (d > R0) { dx *= R0 / d; dy *= R0 / d; } knob.style.transform = `translate(${dx}px,${dy}px)`; vec.x = dx / R0; vec.z = dy / R0; };
  joy.addEventListener('pointerdown', (e) => { id = e.pointerId; joy.setPointerCapture(id); const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e.clientX, e.clientY); });
  joy.addEventListener('pointermove', (e) => e.pointerId === id && move(e.clientX, e.clientY));
  const up = (e) => { if (e.pointerId !== id) return; id = null; vec.x = vec.z = 0; knob.style.transform = ''; };
  joy.addEventListener('pointerup', up); joy.addEventListener('pointercancel', up);
  // klavye (masaüstü testi)
  const keys = new Set(); const kd = (e) => keys.add(e.key.toLowerCase()), ku = (e) => keys.delete(e.key.toLowerCase());
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  const mini = s.querySelector('.mini').getContext('2d');
  let lastOz = -1, ozAnim = null;
  s.countFrom = (v) => { if (v < game.carriedOz) ozAnim = { from: v, t0: performance.now() + 250 }; };
  s.joy = () => {
    if (id === null && keys.size) { const kx = (keys.has('d') || keys.has('arrowright')) - (keys.has('a') || keys.has('arrowleft')); const kz = (keys.has('s') || keys.has('arrowdown')) - (keys.has('w') || keys.has('arrowup')); const n = Math.hypot(kx, kz) || 1; return { x: kx / n, z: kz / n }; }
    return vec;
  };
  let hpShown = null; let lastT = performance.now();
  s.update = () => {
    const now = performance.now(); const dtu = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const hpReal = game.creature.hp ?? s.maxHp;
    // can kademeli dolar (yemek), düşüşte hemen
    if (hpShown == null || hpReal < hpShown) hpShown = hpReal; else hpShown = Math.min(hpReal, hpShown + s.maxHp * 0.55 * dtu);
    const hp = hpShown; const pct = Math.max(0, Math.min(100, (hp / s.maxHp) * 100));
    s.querySelector('.hp').classList.toggle('fill', hpShown < hpReal - 0.5);
    s.querySelector('.hp i').style.width = pct + '%'; s.querySelector('.hp span').textContent = `${Math.round(hp)} / ${s.maxHp}`;
    s.querySelector('.hp').classList.toggle('low', pct < 30);
    if (ozAnim) { const k = Math.max(0, Math.min(1, (performance.now() - ozAnim.t0) / 900)); const o = s.querySelector('.oz'); o.querySelector('b').textContent = fmt(Math.round(ozAnim.from + (game.carriedOz - ozAnim.from) * k)); if (k >= 1) { ozAnim = null; lastOz = game.carriedOz; o.classList.remove('pop'); void o.offsetWidth; o.classList.add('pop'); } }
    else if (game.carriedOz !== lastOz) { const o = s.querySelector('.oz'); o.querySelector('b').textContent = fmt(game.carriedOz); if (lastOz >= 0 && game.carriedOz > lastOz) { o.classList.remove('pop'); void o.offsetWidth; o.classList.add('pop'); } lastOz = game.carriedOz; }
    const near = game.nearbyMonster; atk.classList.toggle('show', !!near); atk.classList.toggle('boss', !!near?.isGuardian);
    const busy = !!game.action;
    gat.classList.toggle('show', !near && !busy && !!game.nearbyNode);
    if (game.nearbyNode) gat.innerHTML = `TOPLA<small>${tr(game.nearbyNode.type)}</small>`;
    cmp.classList.toggle('show', !near && !busy && !game.nearbyNode && !!(game.atCamp && game.atCamp()));
    // eylem çubuğu
    const ab = s.querySelector('.actbar');
    if (busy) { const a = game.action; const k = 1 - Math.max(0, a.remaining) / a.total; ab.classList.add('show'); ab.querySelector('span').textContent = a.type === 'gather' ? `Toplanıyor: ${tr(a.nodeType)}` : `Yeniyor: ${tr(a.id)}`; ab.querySelector('i').style.width = Math.round(k * 100) + '%'; }
    else ab.classList.remove('show');
    const fc = Object.values(game.food || {}).reduce((x, y) => x + (y > 0 ? y : 0), 0) + ((game.resources || {}).sifali_meyve || 0);
    const bn = bag.querySelector('.bagn'); bn.textContent = fc > 0 ? fc : ''; bn.style.display = fc > 0 ? '' : 'none';
    if (game.coreCounts) { const cc = game.coreCounts(); const t = `${cc.bagTotal}/${cc.bagCap}`; const ce = s.querySelector('.corec'); if (ce._t !== t) { if (ce._t != null && cc.bagTotal > (ce._n || 0)) { ce.classList.remove('pop'); void ce.offsetWidth; ce.classList.add('pop'); } ce._t = t; ce._n = cc.bagTotal; ce.querySelector('b').textContent = t; ce.classList.toggle('full', cc.bagTotal >= cc.bagCap); ce.style.display = cc.bagTotal || game.groundCores?.length ? '' : 'none'; } }
    const bf = s.querySelector('.buffb'); const b = game.buffs || {};
    const bt = b.fights > 0 ? `🔥 Ruhlu et: saldırı +%${Math.round(b.atk * 100)} · ${b.fights} savaş` : ''; if (bf.textContent !== bt) bf.textContent = bt;
    const rp = game.returning > 0 ? 1 - game.returning / R.constants.returnSpellSeconds : 0;
    ret.classList.toggle('casting', game.returning > 0); ret.querySelector('i').style.height = rp * 100 + '%';
    // mini harita
    const [W, H] = z.size; mini.clearRect(0, 0, 96, 96); mini.fillStyle = 'rgba(20,16,10,.55)'; mini.fillRect(0, 0, 96, 96);
    const sc = 92 / Math.max(W, H), ox = (96 - W * sc) / 2, oz = (96 - H * sc) / 2;
    const mx = (x) => ox + x * sc, mz = (zz) => oz + zz * sc;
    const lay = game.layout();
    if (lay) {
      if (lay.gate) { mini.fillStyle = '#6fd7ff'; mini.fillRect(mx(lay.gate.x) - 2, mz(lay.gate.z) - 5, 4, 10); }
      for (const p of lay.passages) { mini.fillStyle = game.unlockedZones.includes(p.to) ? '#9fe0ff' : '#7a6a55'; mini.fillRect(mx(p.x) - 2, mz(p.z) - 4, 4, 8); }
    }
    if (lay && lay.camp) { const cx = mx(lay.camp.x), cz = mz(lay.camp.z); mini.fillStyle = 'rgba(255,170,80,.25)'; mini.beginPath(); mini.arc(cx, cz, lay.camp.safeRadius * sc, 0, 7); mini.fill(); mini.fillStyle = '#ffa040'; mini.beginPath(); mini.moveTo(cx, cz - 5); mini.lineTo(cx + 4, cz + 3); mini.lineTo(cx - 4, cz + 3); mini.closePath(); mini.fill(); mini.fillStyle = '#ffe080'; mini.fillRect(cx - 1, cz - 1, 2, 3); }
    if (lay && game.zoneNodes) for (const n of game.zoneNodes()) { if (!n.ready) continue; mini.fillStyle = NODE_DOT[n.type] || '#fff'; mini.beginPath(); mini.arc(mx(n.x), mz(n.z), 1.6, 0, 7); mini.fill(); }
    for (const m of game.monsters) { if (!m.alive) continue; const c = game.levelColor(m.level); const gd = m.isGuardian; mini.fillStyle = gd ? '#ff4d4d' : ({ kirmizi: '#ff5a4e', turuncu: '#ff9b3d', sari: '#ffd84a', yesil: '#5fd16b', gri: '#999' }[c?.color] || '#fff'); mini.fillRect(mx(m.pos.x) - (gd ? 3 : 1.5), mz(m.pos.z) - (gd ? 3 : 1.5), gd ? 6 : 3, gd ? 6 : 3); }
    // bakış konisi (kamera yönü); mini harita kuzey sabit
    const yaw = h.getYaw ? h.getYaw() : 0; const fa = Math.atan2(-Math.cos(yaw), -Math.sin(yaw)); const px = mx(game.pos.x), pz = mz(game.pos.z);
    const cg = mini.createRadialGradient(px, pz, 2, px, pz, 26); cg.addColorStop(0, 'rgba(255,240,200,.55)'); cg.addColorStop(1, 'rgba(255,240,200,0)');
    mini.fillStyle = cg; mini.beginPath(); mini.moveTo(px, pz); mini.arc(px, pz, 26, fa - 0.55, fa + 0.55); mini.closePath(); mini.fill();
    mini.fillStyle = '#fff'; mini.beginPath(); mini.arc(px, pz, 3, 0, 7); mini.fill();
    needle.style.transform = `rotate(${yaw}rad)`;
  };
  s.toast = (t, ms = 2200) => { const e = s.querySelector('.toast'); e.innerHTML = t; e.classList.add('show'); clearTimeout(s._tt); s._tt = setTimeout(() => e.classList.remove('show'), ms); };
  s.destroy = () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); s.remove(); };
  return s;
}

// ---------- ZAFER / YENİLGİ / VARIŞ ----------
const CORE_HEX = { kil: '#9a8468', lacivert: '#2b5bd6', altin: '#e8b84a', kader: '#b0306a' };
const coreNm = (t) => (R.soulCores && R.soulCores.types[t] ? R.soulCores.types[t].name : t);
function coresLine(cores) {
  if (!cores || !cores.length) return '';
  const by = {}; for (const c of cores) { const k = c.type + (c.toBag ? '' : '!'); by[k] = (by[k] || 0) + 1; }
  return Object.entries(by).map(([k, n]) => { const t = k.replace('!', ''); const ground = k.endsWith('!');
    return `<div class="rrow corer">${crystalSmall(CORE_HEX[t])} +${n} ${coreNm(t)} ${ground ? '<em>— çanta dolu, yere düştü (30 sn)</em>' : '→ çantaya'}</div>`; }).join('');
}
export function lostCoresText(lost) {
  if (!lost) return ''; const parts = Object.entries(lost).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${coreNm(t).replace(' Çekirdek', '').replace(' Çekirdeği', '')}`);
  return parts.length ? `Kaybedilen çekirdekler: ${parts.join(', ')}` : '';
}
export function victoryScreen(ui, res, game) {
  const s = screen(ui, 'result win');
  const box = el('div', 'rbox', `<div class="rt">Zafer!</div>
    <div class="rgain"><span>Ruh özü</span><b class="count">+0</b></div>
    <div class="rrow"><span class="ic ic-sekel"></span>+${res.sekel || 0} şekel</div>
    ${(res.drops || []).length ? `<div class="rrow">Düşen: ${res.drops.map(tr).join(', ')}</div>` : ''}
    ${coresLine(res.cores)}
    ${res.eggHeat != null ? `<div class="rrow">Yumurta ısınması: %${Math.round(res.eggHeat * 100)}</div>` : ''}
    <div class="rnote">Taşınan öz: <b>${fmt(game.carriedOz)}</b> — kapıya götürene kadar senin değil.</div>`);
  s.appendChild(box);
  const c = box.querySelector('.count'); const tgt = res.oz || 0; const t0 = performance.now();
  const step = () => { const k = Math.min(1, (performance.now() - t0) / 700); c.textContent = '+' + Math.round(tgt * k); if (k < 1) requestAnimationFrame(step); };
  step();
  return new Promise((r) => box.appendChild(btn('Devam', 'gold', () => { s.remove(); r(); })));
}
export function defeatScreen(ui, res, zone) {
  const s = screen(ui, 'result lose');
  const lostTxt = res.protectedRun || !res.ozLost ? (zone.lossOnDeath > 0 ? 'Koruma: kayıp yok' : 'Kıyı güvenli: kayıp yok') : `−${fmt(res.ozLost)} öz kayboldu`;
  const box = el('div', 'rbox', `<div class="rt">Yenildin</div><div class="rgain lost"><b>${lostTxt}</b></div>
    ${res.coresLost && lostCoresText(res.coresLost) ? `<div class="rrow corel">${lostCoresText(res.coresLost)}</div>` : res.coresInBag ? '<div class="rrow">Çekirdek kaybı yok.</div>' : ''}
    <div class="rnote">Yaratığın kapıya çekildi. Kalan öz güvenceye alındı. ${R.constants.woundedSeconds} sn dinlenmesi gerek.</div>`);
  s.appendChild(box);
  return new Promise((r) => box.appendChild(btn('Kapıya dön', 'gold', () => { s.remove(); r(); })));
}
export function arrivalScreen(ui, arr) {
  const s = screen(ui, 'result arrive');
  const up = arr.to > arr.from;
  const box = el('div', 'rbox', `<div class="rt">${up ? `SEVİYE ${arr.to}!` : 'Kapıya vardın'}</div>
    ${arr.deposited ? `<div class="rgain"><span>Güvenceye alınan öz</span><b>+${fmt(arr.deposited)}</b></div>` : ''}
    <div class="rnote">${up ? 'Yaratığın güçlendi. Can tamamen doldu.' : 'Can doldu.'}</div>`);
  if (up) s.classList.add('levelup');
  s.appendChild(box);
  return new Promise((r) => box.appendChild(btn('Tamam', 'gold', () => { s.remove(); r(); })));
}
