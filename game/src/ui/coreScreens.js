// v4.1 Ruh Çekirdeği ekranları: Çekirdekler (kapı), karar kartı (Tut / Yedir), değiştirme (çift onay),
// 10'lu özet, Kan Bağları. Bütün işlemler çekirdekte (cores.js) işlem kimliğiyle (opId) idempotenttir;
// bu ekranlar yalnızca seçimi döndürür.
import R from '../data/rules.json';
import { el, panel } from './screens.js';
import { tr, ROLE_TEXT, GRADE_COLOR } from './labels.js';
import { coreName, CORE_COLOR, PULL_COLOR, pullKey, RANK } from './crystal.js';

const SC = R.soulCores;
const btn = (label, cls, fn) => { const b = el('button', 'btn ' + (cls || ''), label); b.onclick = fn; return b; };
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const pctS = (x) => (x >= 0.1 ? `%${Math.round(x * 100)}` : `%${(x * 100).toFixed(x * 100 < 1 ? 2 : 1).replace('.', ',')}`);
const gradeBadge = (p) => (p.mythic ? `<span class="grade myth">${p.grade}</span><span class="mytag">Mitolojik</span>` : `<span class="grade" style="background:${GRADE_COLOR[p.grade]}">${p.grade}</span>`);
const crystalIco = (type) => `<i class="cico" style="--c:${hex(CORE_COLOR[type])}"></i>`;
export const newOpId = (tag) => `ui-${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// ---------- KAPI: ÇEKİRDEKLER ----------
export function corePanel(ui, game, h) {
  const field = !!h.field; // sahada: yalnız çantadaki çekirdekler, depo yok
  const s = panel(ui, field ? 'Ruh Çekirdekleri · Sahada' : 'Ruh Çekirdekleri'); s.classList.add('cores'); if (field) s.classList.add('field');
  const draw = (msg) => {
    s.body.innerHTML = '';
    const cc = game.coreCounts(); const mi = game.mythicInfo('altin');
    const head = el('div', 'chead');
    head.innerHTML = `<span>Çanta <b>${cc.bagTotal}/${cc.bagCap}</b>${field ? '' : ` · Depo <b>${cc.depotTotal}/${cc.depotCap}</b>`}</span>
      <span class="pity" title="Mitolojiksiz ${mi.pitySoftStart} açılıştan sonra şans artar; ${mi.pityHard}. açılış garanti. Kil sayılmaz; aktif karakter Sv ${mi.minLevel}'in altındayken ilerlemez.">Merhamet <b>${mi.pity}/${mi.pityHard}</b></span>`;
    s.body.appendChild(head);
    if (msg) s.body.appendChild(el('div', 'note warn', msg));
    if (field) s.body.appendChild(el('div', 'note fieldnote', 'Sahada yalnız <b>çantadaki</b> çekirdekler açılır. Yedirilen ruhun özü <b>taşınan öze</b> gider (ölünce kayıp kuralı işler). Saldırı gelirse açılış kesilir, sonuç seni bekler.'));
    const pend = game.pendingPulls();
    if (pend.length) { const pb = el('div', 'pendbar', `<span>Karar bekleyen <b>${pend.length}</b> sonuç</span>`); pb.appendChild(btn('Karar ver', 'sm gold', () => h.onPending())); s.body.appendChild(pb); }
    const grid = el('div', 'cgrid');
    for (const t of SC.order) {
      const info = game.mythicInfo(t); const have = cc.bag[t] + (field ? 0 : cc.depot[t]);
      const myth = info.base <= 0 ? 'Mitolojik yok' : !info.eligible ? `Mitolojik ${pctS(info.base)} · <em>Sv ${info.minLevel}'de açılır</em>` : `Mitolojik <b>${pctS(info.chance)}</b>`;
      const card = el('div', 'ccard', `<div class="ct">${crystalIco(t)}<b>${coreName(t)}</b></div>
        <div class="cn"><span>Çanta ${cc.bag[t]}</span>${field ? '' : `<span>Depo ${cc.depot[t]}</span>`}</div><div class="cm">${myth}</div>`);
      const row = el('div', 'crow');
      const o1 = btn('Aç ×1', 'sm gold' + (have < 1 ? ' off' : ''), () => have >= 1 && h.onOpen(t, 1));
      const o10 = btn('Aç ×10', 'sm gold' + (have < SC.tenPull.count ? ' off' : ''), () => have >= SC.tenPull.count && h.onOpen(t, SC.tenPull.count));
      row.append(o1, o10);
      if (!field && cc.depot[t] > 0) row.appendChild(btn('Çantaya al', 'sm', () => { const r = game.withdrawCores(t, 1, newOpId('wd')); h.onChange(); draw(r.ok ? null : r.reason === 'canta' ? 'Çanta dolu.' : null); }));
      card.appendChild(row); grid.appendChild(card);
    }
    s.body.appendChild(grid);
    // kader mührü
    const mr = el('div', 'muhur', `<span>🜂 Kader Mührü: <b>${game.kaderMuhru || 0}</b> <small>(A %80 / S %20 ejderha)</small></span>`);
    if ((game.kaderMuhru || 0) > 0) mr.appendChild(btn('Mührü kullan', 'sm gold', () => h.onMuhur()));
    s.body.appendChild(mr);
    // depo (yalnız kapıda)
    if (!field) {
    const dep = el('div', 'deprow');
    dep.appendChild(btn('Çantadakileri depoya aktar', 'sm' + (cc.bagTotal ? '' : ' off'), () => { const r = game.depositCores(newOpId('dep')); h.onChange(); draw(r.total ? `${r.total} çekirdek depoya aktarıldı.` : null); }));
    const ad = btn(`Varışta otomatik aktar: ${game.cores.autoDeposit ? 'Açık' : 'Kapalı'}`, 'sm', () => { game.setAutoDeposit(!game.cores.autoDeposit); h.onChange(); draw(); });
    dep.appendChild(ad); s.body.appendChild(dep);
    }
    // olasılıklar (Google Play: olasılıklar satın alma/açılış öncesi görünür olmalı)
    const odds = el('details', 'odds'); odds.innerHTML = `<summary>Olasılıklar</summary>` + oddsTable(game);
    s.body.appendChild(odds);
    s.body.appendChild(el('div', 'note', 'Ölünce yalnız ÇANTADAKİ çekirdeklerin bir kısmı gider (Kıyı %0 · Bozkır %20 · Derin Edin %40). Depodakiler hep güvende.'));
  };
  s.redraw = draw; draw(); return s;
}
function oddsTable(game) {
  const rows = SC.order.map((t) => { const g = SC.types[t].grades; const mi = game.mythicInfo(t); return `<tr><td>${coreName(t)}</td>${['C', 'B', 'A', 'S'].map((k) => `<td>${g[k] ? pctS(g[k]) : '—'}</td>`).join('')}<td>${mi.base ? pctS(mi.base) : '—'}</td></tr>`; }).join('');
  const mg = SC.mythicGrades;
  return `<table><tr><th>Çekirdek</th><th>C</th><th>B</th><th>A</th><th>S</th><th>Mitolojik</th></tr>${rows}
    <tr><td>Mitolojik derece</td><td>—</td><td>${pctS(mg.B)}</td><td>${pctS(mg.A)}</td><td>${pctS(mg.S)}</td><td></td></tr></table>
    <small>Ejderha türleri ve mitolojik yaratıklar kendi havuzlarında eşit olasılıklı. 10'lu açılışta en az bir B+ garanti.</small>`;
}

// ---------- KARAR KARTI ----------
/** Döner: Promise<{ action:'keep'|'feed'|'later', replaceUid? }> */
export function decisionCard(ui, game, pullId, { count = '' } = {}) {
  const info = game.pullDecisionInfo(pullId);
  return new Promise((resolve) => {
    const s = el('div', 'scr decide'); ui.appendChild(s);
    const done = (v) => { s.remove(); resolve(v); };
    if (!info) return done({ action: 'later' });
    const p = info.pull; const d = R.creatures[p.species] || {};
    const col = hex(PULL_COLOR[pullKey(p)]);
    const chains = (d.chains || []).map((ch, i) => `<li>${ch.name}${i ? ` <small>(Sv ${[1, 5, 10][i]}${ch.minGrade && ch.minGrade !== 'C' ? `, ${ch.minGrade}+` : ''})</small>` : ''}</li>`).join('');
    const box = el('div', 'dbox' + (p.mythic ? ' myth' : ''), `
      <div class="dsrc">${p.source === 'egg' ? 'Eski yumurta çatladı' : p.source === 'muhur' ? 'Kader Mührü' : coreName(p.coreType)}${count}</div>
      <div class="dname" style="--c:${col}"><b>${tr(p.species)}</b>${gradeBadge(p)}</div>
      <div class="drole">${tr(d.role)} · ${ROLE_TEXT[p.species] || ''}</div>
      <ul class="dch">${chains}${d.finisher ? `<li>🔥 ${d.finisher.name}</li>` : ''}</ul>
      <div class="dinfo"><span>Tutarsan: <b>Seviye ${info.startLevel}</b> ile başlar</span><span>Yedirirsen: <b>+${info.feedOz} öz</b> (${info.feedTo === 'carried' ? 'taşınan öze' : 'güvendeki öze'})</span></div>`);
    const row = el('div', 'drow');
    const keep = btn('Karakteri tut', 'gold', () => (info.rosterFull ? replaceStep() : done({ action: 'keep' })));
    const feed = btn('Ruhunu yedir', 'feedb', () => done({ action: 'feed' }));
    row.append(keep, feed); box.appendChild(row);
    box.appendChild(btn('Sonra karar ver', 'sm ghost', () => done({ action: 'later' })));
    if (info.rosterFull) box.appendChild(el('div', 'note', `Kadro dolu (${SC.rosterMax}/${SC.rosterMax}). Tutmak için biriyle değiştirmen gerekir.`));
    s.appendChild(box);
    // değiştirme: 2 kart, aktif seçilemez, çift onay
    function replaceStep() {
      box.innerHTML = `<div class="dsrc">Kadro dolu — kimin yerine?</div><div class="dname" style="--c:${col}"><b>${tr(p.species)}</b>${gradeBadge(p)}</div>`;
      const cards = el('div', 'rcards');
      for (const c of game.rosterView()) {
        const card = el('div', 'rcard' + (c.active ? ' active' : ''), `<b>${tr(c.id)}</b><span class="grade" style="background:${GRADE_COLOR[c.grade]}">${c.grade}</span><span>Sv ${c.level}</span>${c.active ? '<em>Aktif — önce Kan Bağları\'ndan diğerine geç</em>' : '<small>Seç</small>'}`);
        card.onclick = () => {
          if (c.active) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); warn.textContent = 'Aktif karakter doğrudan değiştirilemez. Kapıda Kan Bağları\'ndan diğerine geç; bu sonuç seni bekler.'; return; }
          confirm1(c);
        };
        cards.appendChild(card);
      }
      const warn = el('div', 'note warn', '');
      box.append(cards, warn, btn('Vazgeç (sonuç bekler)', 'sm ghost', () => done({ action: 'later' })));
    }
    function confirm1(c) {
      box.innerHTML = `<div class="dsrc">Emin misin?</div><div class="conf">${tr(c.id)} (Sv ${c.level}, ${c.grade}) <b>kalıcı olarak gidecek</b>. Yerine ${tr(p.species)} (${p.grade}) seviye ${info.startLevel} ile gelir.</div>`;
      const r2 = el('div', 'drow'); r2.append(btn('Evet, devam', 'danger', () => confirm2(c)), btn('Vazgeç', '', () => done({ action: 'later' }))); box.appendChild(r2);
    }
    function confirm2(c) {
      box.innerHTML = `<div class="dsrc">Son onay</div><div class="conf">${tr(c.id)} (Sv ${c.level}, ${c.grade}) bırakılacak ve geri gelmeyecek.</div>`;
      const r3 = el('div', 'drow'); r3.append(btn(`${tr(c.id)}'yi bırak ve tut`, 'danger', () => done({ action: 'keep', replaceUid: c.uid })), btn('Vazgeç', '', () => done({ action: 'later' }))); box.appendChild(r3);
    }
  });
}

// ---------- 10'LU ÖZET ----------
/** Döner: Promise<{ action:'feedAll' } | { action:'keep', id } | { action:'later' }> */
export function pullSummary(ui, game, ids) {
  return new Promise((resolve) => {
    const s = el('div', 'scr summary'); ui.appendChild(s);
    const done = (v) => { s.remove(); resolve(v); };
    const all = game.pulls.pending.filter((p) => ids.includes(p.id));
    const open = all.filter((p) => p.state === 'pending');
    const tot = open.reduce((a, p) => a + (p.mythic ? SC.feedOz.mythic : SC.feedOz[p.grade]), 0);
    const box = el('div', 'sbox', `<div class="st">Açılış sonuçları <small>${open.length} karar bekliyor</small></div>`);
    const grid = el('div', 'sgrid');
    const sorted = [...all].sort((a, b) => RANK[pullKey(b)] - RANK[pullKey(a)]);
    for (const p of sorted) {
      const col = hex(PULL_COLOR[pullKey(p)]);
      const c = el('div', 'scard' + (p.mythic ? ' myth' : '') + (p.state !== 'pending' ? ' done' : ''), `<i class="sglow" style="--c:${col}"></i><b>${tr(p.species)}</b>${gradeBadge(p)}`);
      if (p.state === 'pending') c.appendChild(btn('Tut', 'sm', () => done({ action: 'keep', id: p.id })));
      else c.appendChild(el('small', '', p.state === 'kept' ? 'Tutuldu' : 'Yedirildi'));
      grid.appendChild(c);
    }
    box.appendChild(grid);
    const row = el('div', 'drow');
    if (open.length) row.appendChild(btn(`Hepsini yedir (+${tot} öz)`, 'feedb big', () => done({ action: 'feedAll' })));
    row.appendChild(btn(open.length ? 'Sonra karar ver' : 'Kapat', 'sm ghost', () => done({ action: 'later' })));
    box.appendChild(row); s.appendChild(box);
  });
}

// ---------- KAN BAĞLARI ----------
export function rosterPanel(ui, game, h) {
  const s = panel(ui, 'Kan Bağları'); s.classList.add('roster');
  const draw = (msg) => {
    s.body.innerHTML = '';
    if (msg) s.body.appendChild(el('div', 'note warn', msg));
    const cards = el('div', 'rcards big');
    const R0 = game.rosterView();
    for (const c of R0) {
      const need = Math.round(100 * Math.pow(c.level, 1.6) / 10) * 10; const pct = c.level >= R.meta.maxLevel ? 100 : Math.min(100, (c.oz / need) * 100);
      const card = el('div', 'rcard' + (c.active ? ' active' : ''), `<b>${tr(c.id)}</b><span class="grade${c.mythic ? ' myth' : ''}" style="${c.mythic ? '' : `background:${GRADE_COLOR[c.grade]}`}">${c.grade}</span>${c.mythic ? '<span class="mytag">Mitolojik</span>' : ''}
        <span>Seviye <b>${c.level}</b></span><div class="xp"><i style="width:${pct}%"></i></div><small>${tr((R.creatures[c.id] || {}).role)}</small>${c.active ? '<em>AKTİF</em>' : ''}`);
      const row = el('div', 'crow');
      if (!c.active) row.appendChild(btn('Aktif yap', 'sm gold', () => { const r = game.setActive(c.uid, newOpId('act')); if (r.ok) { h.onActive(c); draw(); } else draw(r.reason === 'kapi' ? 'Karakter yalnız Ruh Kapısı\'nda değiştirilir.' : 'Olmadı.'); }));
      row.appendChild(btn('Ayrıntı', 'sm', () => h.onDetail(c)));
      card.appendChild(row); cards.appendChild(card);
    }
    for (let i = R0.length; i < SC.rosterMax; i++) cards.appendChild(el('div', 'rcard empty', '<small>Boş kan bağı<br>Çekirdekten çıkan bir karakteri tutabilirsin.</small>'));
    s.body.appendChild(cards);
    s.body.appendChild(el('div', 'note', `En fazla ${SC.rosterMax} karakter. Aktif karakter sahada oynar; değişim yalnız Ruh Kapısı'nda.`));
  };
  draw(); return s;
}
