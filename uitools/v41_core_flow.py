# v4.1 Ruh Çekirdeği — GERÇEK dokunma (CDP Input.dispatchTouchEvent), telefon taklidi.
# Kullanım: python3 -I uitools/v41_core_flow.py 800 360   (ikinci çalıştırma: 915 412 kısa)
import asyncio, json, sys, time
from playwright.async_api import async_playwright
W, Hh = int(sys.argv[1]) if len(sys.argv) > 1 else 800, int(sys.argv[2]) if len(sys.argv) > 2 else 360
SHORT = W != 800
BASE = 'file:///home/claude/eidn/game/dist/index.html'
Q = '?test=1&dtcap=1&gfx=0'
SH = '/home/claude/eidn/shots/sonra/'
TAG = '' if not SHORT else f'_{W}'
res = {}

OLD = {"version": 2, "savedAt": 1763830000000, "clock": 500.0, "keeper": {"level": 1},
       "creature": {"id": "ejder_su", "legacyId": "kulullu", "grade": "B", "level": 9, "oz": 120, "hp": 200, "woundedUntil": 0, "woundedLeft": 0},
       "carriedOz": 0, "location": "gate", "inRun": False, "runsCompleted": 9, "sekel": 900,
       "bag": {}, "eggs": [{"uid": "e1", "species": "ejder_ates", "legacySpecies": "ugallu", "grade": "A", "heat": 2, "hatched": False},
                           {"uid": "e2", "species": "ejder_tas", "legacySpecies": "kusarikku", "grade": "S", "heat": 9, "hatched": True}],
       "eggSeq": 3, "incubatingEggId": "e1", "belt": [None, None, None, None],
       "unlockedZones": ["kiyi", "bozkir"], "guardians": {}, "tablets": [], "kaderPuani": 23,
       "stats": {"fights": 60, "wins": 55}, "settings": {}, "flags": {"firstFightDone": True, "tutorialDone": True}, "fight": None,
       "food": {}, "resources": {}, "camps": {}, "collection": {}, "nodes": {}, "buffs": {"atk": 0, "fights": 0}}

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = await b.new_context(viewport={'width': W, 'height': Hh}, has_touch=True, is_mobile=True)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'GPU' not in m.text and 'ReadPixels' not in m.text and errs.append(m.text))
    cdp = await ctx.new_cdp_session(pg)
    ev = pg.evaluate
    G = "window.__edin.game"
    async def touch(kind, pts):
      await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, x, y in pts]})
    async def tapxy(x, y):
      await touch('touchStart', [(9, x, y)]); await pg.wait_for_timeout(50); await touch('touchEnd', [])
    async def ttap(sel, nth=0):
      bb = await ev("([s,n])=>{const e=[...document.querySelectorAll(s)].filter(x=>x.offsetParent!==null)[n];if(!e)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}", [sel, nth])
      if not bb: return False
      await tapxy(bb[0], bb[1]); return True
    async def ttext(text, within='#ui'):
      bb = await ev("([t,w])=>{const all=[...document.querySelectorAll(w+' button,'+w+' .btn')].filter(x=>x.offsetParent!==null);const e=all.reverse().find(x=>x.textContent.trim()===t)||all.find(x=>x.textContent.trim().startsWith(t));if(!e)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}", [text, within])
      if not bb: return False
      await tapxy(bb[0], bb[1]); return True
    async def waitfor(js, ms=20000, step=150):
      t0 = time.time()
      while (time.time() - t0) * 1000 < ms:
        try:
          if await ev(js): return True
        except Exception: pass
        await pg.wait_for_timeout(step)
      return False
    async def shot(name): await pg.screenshot(path=SH + 'v41_' + name + TAG + '.png')
    async def to_hub():
      for _ in range(6):
        if await ev("!!document.querySelector('.gate .gmenu')"): return True
        for t in ['Tamam', 'Devam', 'Kapıya dön']:
          if await ttext(t): await pg.wait_for_timeout(700); break
        else:
          if await ev("!!document.querySelector('.story')"): await ttap('.story'); await pg.wait_for_timeout(500)
          else: await pg.wait_for_timeout(600)
      return await ev("!!document.querySelector('.gate .gmenu')")
    async def battle_until_over(maxTurns=40):
      for i in range(maxTurns):
        if not await ev(f"!!({G}.battle && !{G}.battle.over)"): return True
        sel = '.mv.glow' if await ev("!!document.querySelector('.mv.glow')") else '.mv-quick'
        await ttap(sel); await pg.wait_for_timeout(1200)
      return False

    # ---------- 0) hazırlık: Ateş Ejderhası Sv 9, kapıda ----------
    await pg.goto(BASE + Q); await pg.wait_for_timeout(1200)
    await ev("localStorage.clear()")
    await ev("""(()=>{const c=window.__edin.core; const g=c.createGame(); g.chooseStarter('ejder_ates'); const ch=g.activeChar(); ch.level=9; g.creature=ch;
      g.unlockedZones=['kiyi','bozkir']; g.runsCompleted=6; g.sekel=2000; g.flags.firstFightDone=true; g.flags.tutorialDone=true; c.writeSave(g);})()""")
    await pg.goto(BASE + Q); await pg.wait_for_timeout(1500)
    await ttext('Devam et'); await waitfor("!!document.querySelector('.gate .gmenu')", 15000)
    res['0_hazirlik'] = await ev(f"({{lv:{G}.activeChar().level, roster:{G}.roster.length}})")

    # ---------- 1) nadir canavardan çekirdek düşmesi (gerçek savaş, test kancasıyla düşme olasılığı 1) ----------
    await ev("window.__edin.enterZone('kiyi')"); await waitfor(f"{G}.screen==='world'", 15000); await pg.wait_for_timeout(1200)
    await ev(f"""(()=>{{const g={G}; g.monsters.forEach(x=>x.rare=true); const m=g.monsters.find(x=>x.alive&&!x.isGuardian); g.__chance=g.rng.chance; g.rng.chance=()=>true;
      g.pos.x=m.pos.x; g.pos.z=Math.min(m.pos.z+1.4,g.layout().size.h-1);}})()""")
    await waitfor("!!document.querySelector('.attack.show')", 4000)
    await ttap('.attack.show')
    await waitfor(f"{G}.screen==='battle'", 8000); await pg.wait_for_timeout(1500)
    await ev(f"{G}.battle.enemy.hp=1")
    await battle_until_over(10)
    await waitfor("!!document.querySelector('.coregain.show')", 9000, 60); await shot('drop_fly')
    await waitfor("!!document.querySelector('.rbox .corer')", 10000)
    await ev(f"(()=>{{const g={G}; if(g.__chance) g.rng.chance=g.__chance;}})()")
    res['1_dusme'] = {'zafer_satiri': await ev("(document.querySelector('.rbox .corer')||{}).textContent||null"), 'canta': await ev(f"{G}.coreCounts().bag")}
    await shot('drop_victory')
    await ttext('Devam'); await waitfor(f"{G}.screen==='world'", 8000); await pg.wait_for_timeout(900)
    res['1_hud'] = await ev("(document.querySelector('.corec b')||{}).textContent||null")
    # kapıya dön (tablet): otomatik depo aktarımı
    await ev(f"(()=>{{const g={G}; g.bag.donus_tableti=1; g.useReturnTablet();}})()")
    await to_hub()
    res['1_depo'] = await ev(f"{G}.coreCounts()")

    # ---------- 2) kapı: Çekirdekler ekranı ----------
    await ev(f"(()=>{{const g={G}; g.cores.depot.kil+=12; g.cores.depot.altin+=11; window.__edin.core.writeSave(g); window.__edin.hub();}})()"); await pg.wait_for_timeout(700)
    await ttext('Çekirdekler'); await waitfor("!!document.querySelector('.panel.cores')", 5000); await pg.wait_for_timeout(500)
    await shot('gate_cores')
    res['2_ekran'] = await ev("({kartlar:document.querySelectorAll('.ccard').length, merhamet:(document.querySelector('.chead .pity')||{}).textContent, mito:[...document.querySelectorAll('.ccard .cm')].map(e=>e.textContent)})")

    # ---------- 3) 1'li açılış → kart → tut (kadro 2) ----------
    d0 = await ev(f"{G}.coreCounts().depot.kil")
    await ttap('.ccard .crow .btn', 0)  # Kil: Aç ×1
    await pg.wait_for_timeout(700); await shot('open_crack')
    await waitfor("!!document.querySelector('.dbox')", 15000); await pg.wait_for_timeout(500)
    await shot('card')
    res['3_acilis'] = {'kil_once': d0, 'kil_sonra': await ev(f"{G}.coreCounts().depot.kil"), 'kart': await ev("document.querySelector('.dname').textContent"), 'bilgi': await ev("document.querySelector('.dinfo').textContent")}
    await ttext('Karakteri tut'); await pg.wait_for_timeout(800)
    if await ev("!!document.querySelector('.story')"): await ttap('.story')
    await to_hub()
    res['3_kadro'] = await ev(f"{G}.roster.map(c=>c.id+' '+c.grade+' Sv'+c.level)")

    # ---------- 4) 10'lu açılış → Atla → özet → Hepsini yedir (girdap) ----------
    await ev("window.__edin.opts.absorbSpeed=0.3")
    await ttext('Çekirdekler'); await waitfor("!!document.querySelector('.panel.cores')", 5000)
    a0 = await ev(f"{G}.coreCounts().depot.altin")
    await ttap('.ccard:nth-child(3) .crow .btn', 1)  # Altın: Aç ×10
    await pg.wait_for_timeout(1300); await shot('ten_crystals')
    await ttap('.coretap .skipb')
    await waitfor("!!document.querySelector('.sbox')", 15000); await pg.wait_for_timeout(400)
    await shot('ten_summary')
    oz0 = await ev(f"{G}.activeChar().oz")
    await ev(f"(()=>{{const g={G}; window.__fed=0; window.__feedExp=g.pendingPulls().reduce((a,p)=>a+(p.mythic?250:({{C:15,B:30,A:60,S:120}})[p.grade]),0); g.on('pullFed',e=>window.__fed+=e.oz);}})()")
    res['4_mitolojik'] = await ev("[...document.querySelectorAll('.scard.myth b')].map(e=>e.textContent)")
    res['4_onlu'] = {'altin_once': a0, 'altin_sonra': await ev(f"{G}.coreCounts().depot.altin"), 'kartlar': await ev("document.querySelectorAll('.scard').length"), 'b_plus': await ev("[...document.querySelectorAll('.scard .grade')].map(e=>e.textContent)")}
    await ttext('Hepsini yedir')
    await waitfor("window.__edinFeed && window.__edinFeed.t()>0.12", 8000, 50); await shot('feed_ghost')
    await waitfor("window.__edinFeed.t()>0.5", 8000, 50); await shot('feed_vortex')
    await waitfor("window.__edinFeed.t()>0.84", 8000, 50); await shot('feed_pulse')
    res['4_yutma'] = {'parcacik': await ev("window.__edinFeed.n"), 'hayalet': await ev("window.__edinFeed.items"), 'yedek': await ev("window.__edinFeed.fallback()")}
    await to_hub()
    res['4_oz'] = {'once': oz0, 'beklenen': await ev("window.__feedExp"), 'verilen': await ev("window.__fed"), 'sonra_toplam': await ev(f"{G}.activeChar().oz + 0"), 'seviye': await ev(f"{G}.activeChar().level"), 'bekleyen': await ev(f"{G}.pendingPulls().length")}
    await ev("window.__edin.opts.absorbSpeed=1")

    # ---------- 5) 3. karakter: aktif seçilemez + çift onay ----------
    await ttext('Çekirdekler'); await waitfor("!!document.querySelector('.panel.cores')", 5000)
    await ttap('.ccard .crow .btn', 0)
    await waitfor("!!document.querySelector('.dbox')", 15000); await pg.wait_for_timeout(400)
    await ttext('Karakteri tut'); await pg.wait_for_timeout(400)
    await ttap('.rcard.active'); await pg.wait_for_timeout(300)
    warn = await ev("(document.querySelector('.dbox .note.warn')||{}).textContent||''")
    await shot('replace_pick')
    other = await ev(f"{G}.roster.find(c=>c.uid!=={G}.activeUid).uid")
    await ttap('.rcard:not(.active)'); await pg.wait_for_timeout(300)
    c1 = await ev("(document.querySelector('.conf')||{}).textContent||''")
    await ttext('Evet, devam'); await pg.wait_for_timeout(300)
    c2 = await ev("(document.querySelector('.conf')||{}).textContent||''"); await shot('replace_confirm')
    await ttap('.dbox .drow .btn.danger'); await pg.wait_for_timeout(900)
    if await ev("!!document.querySelector('.story')"): await ttap('.story')
    await to_hub()
    res['5_degistir'] = {'aktif_uyari': warn, 'onay1': c1, 'onay2': c2, 'eski_gitti': await ev(f"!{G}.roster.some(c=>c.uid==='{other}')"), 'kadro': await ev(f"{G}.roster.length")}

    # ---------- 6) Kan Bağları: aktif geçiş ----------
    a_old = await ev(f"{G}.activeUid")
    await ttext('Kan Bağları'); await waitfor("!!document.querySelector('.panel.roster')", 5000); await pg.wait_for_timeout(300)
    await shot('roster')
    await ttext('Aktif yap'); await pg.wait_for_timeout(600)
    res['6_aktif'] = {'once': a_old, 'sonra': await ev(f"{G}.activeUid"), 'creature': await ev(f"{G}.creature.id")}
    await ttap('.panel.roster .close'); await to_hub()

    # ---------- 7) Bozkır'da ölüm ve çekirdek kaybı ----------
    await ev(f"(()=>{{const g={G}; g.cores.bag.kil=7; g.runsCompleted=9;}})()")
    await ev("window.__edin.enterZone('bozkir')"); await waitfor(f"{G}.screen==='world'", 15000); await pg.wait_for_timeout(1200)
    await ev(f"(()=>{{const g={G}; g.creature.hp=1; const m=g.monsters.find(x=>x.alive&&!x.isGuardian); g.pos.x=m.pos.x; g.pos.z=Math.min(m.pos.z+1.4,g.layout().size.h-1);}})()")
    await waitfor("!!document.querySelector('.attack.show')", 4000); await ttap('.attack.show')
    await waitfor(f"{G}.screen==='battle'", 8000); await pg.wait_for_timeout(1200)
    await ev(f"{G}.battle.player.hp=1")
    await battle_until_over(12)
    await waitfor("!!document.querySelector('.result.lose')", 15000); await pg.wait_for_timeout(400)
    await shot('death')
    res['7_olum'] = {'satir': await ev("(document.querySelector('.rbox .corel')||document.querySelector('.rbox .rrow')||{}).textContent||null"), 'canta': await ev(f"{G}.coreCounts().bagTotal"), 'kayip': await ev(f"JSON.stringify({G}.lastDeathCores)")}
    await to_hub()

    # ---------- 8) açılış ortasında sayfa yenileme ----------
    await ttext('Çekirdekler'); await waitfor("!!document.querySelector('.panel.cores')", 5000)
    k0 = await ev(f"{G}.coreCounts().depot.kil"); p0 = await ev(f"{G}.pendingPulls().length")
    await ttap('.ccard .crow .btn', 0); await pg.wait_for_timeout(350)
    await pg.reload(); await pg.wait_for_timeout(1500)
    await ttext('Devam et'); await waitfor("!!document.querySelector('.dbox')", 15000)
    res['8_yenileme'] = {'kil_once': k0, 'kil_sonra': await ev(f"{G}.coreCounts().depot.kil"), 'bekleyen_once': p0, 'bekleyen_sonra': await ev(f"{G}.pendingPulls().length"), 'kart_geri': await ev("!!document.querySelector('.dbox')")}
    await ttext('Ruhunu yedir'); await pg.wait_for_timeout(500)
    await waitfor("!!document.querySelector('.gate .gmenu')", 15000)

    # ---------- 9) eski kayıt: yumurtalı, 23 kader puanı ----------
    # başlık ekranında (oyun nesnesi yok → sayfa kapanırken kayıt yazılmaz) eski kaydı yerleştir
    await pg.goto('about:blank'); await pg.goto(BASE + Q); await pg.wait_for_timeout(900)
    await ev(f"localStorage.setItem('edin.save.v1', JSON.stringify({json.dumps(OLD)}))")
    await pg.reload(); await pg.wait_for_timeout(1500); await ttext('Devam et')
    await waitfor("!!document.querySelector('.gate .gmenu') || !!document.querySelector('.dbox')", 15000); await pg.wait_for_timeout(600)
    pend = await ev(f"{G}.pendingPulls().map(p=>p.source+':'+p.species+':'+p.grade)")
    if await ev("!!document.querySelector('.dbox')"): await shot('old_egg_card'); await ttext('Sonra karar ver'); await pg.wait_for_timeout(500)
    await to_hub()
    res['9_eski'] = {'muhur': await ev(f"{G}.kaderMuhru"), 'merhamet': await ev(f"{G}.pulls.pity"), 'yumurtalar': await ev(f"{G}.publicEggs().map(e=>e.species+' %'+Math.round(e.progress*100))"), 'bekleyen': pend, 'kapi_satiri': await ev("(document.querySelector('.kader')||{}).textContent")}
    await ttext('Çanta'); await pg.wait_for_timeout(500); await shot('old_eggs_bag')
    res['9_canta'] = await ev("[...document.querySelectorAll('.eggs-list .irow')].map(e=>e.textContent.trim())")
    await ttap('.panel .close'); await pg.wait_for_timeout(300); await to_hub()

    # ---------- 12) Kader Mührü (eski kayıttan 2 mühür) — gerçek dokunma ----------
    m0 = await ev(f"{G}.kaderMuhru")
    await ttext('Çekirdekler'); await waitfor("!!document.querySelector('.panel.cores')", 5000); await pg.wait_for_timeout(300)
    await shot('muhur_panel')
    await ttext('Mührü kullan')
    await waitfor("!!document.querySelector('.dbox')", 15000); await pg.wait_for_timeout(400)
    await shot('muhur_card')
    mc = await ev("({src:(document.querySelector('.dsrc')||{}).textContent, ad:(document.querySelector('.dname')||{}).textContent})")
    mp = await ev(f"{G}.pendingPulls().filter(p=>p.source==='muhur').map(p=>p.species+':'+p.grade+':'+p.mythic)")
    await ttext('Karakteri tut'); await pg.wait_for_timeout(500)
    if await ev("!!document.querySelector('.rcard')"):
      await ttap('.rcard:not(.active)'); await pg.wait_for_timeout(300); await ttext('Evet, devam'); await pg.wait_for_timeout(300); await ttap('.dbox .drow .btn.danger'); await pg.wait_for_timeout(600)
    if await ev("!!document.querySelector('.story')"): await ttap('.story')
    await to_hub()
    res['12_muhur'] = {'once': m0, 'sonra': await ev(f"{G}.kaderMuhru"), 'kart': mc, 'sonuc': mp, 'kadro': await ev(f"{G}.roster.map(c=>c.id+' '+c.grade+' Sv'+c.level)")}

    # ---------- 13) SAHADA açılış: HUD çekirdek sayacı → yalnız çanta → yedir (taşınan öze) ----------
    await ev(f"(()=>{{const g={G}; const pp=g.pendingPulls().map(p=>p.id); if(pp.length) g.feedAllPending(pp,'test-clear'); g.cores.bag.kil=3; g.cores.depot.kil=Math.max(g.cores.depot.kil,5); g.creature.hp=g.maxHp(); window.__edin.core.writeSave(g);}})()")
    await ev("window.__edin.enterZone('kiyi')"); await waitfor(f"{G}.screen==='world'", 15000); await pg.wait_for_timeout(1200)
    await ev(f"(()=>{{const g={G}; const L=g.layout().size; g.monsters.forEach(m=>{{m.pos.x=L.w-2; m.pos.z=L.h-2; m.aggro=false;}});}})()")  # canavarları uzaklaştır
    await waitfor("document.querySelector('.corec') && document.querySelector('.corec').style.display!=='none'", 4000)
    await ttap('.corec'); await waitfor("!!document.querySelector('.panel.cores.field')", 5000); await pg.wait_for_timeout(300)
    await shot('field_open_panel')
    fp = await ev("({depo_sayilari_gizli: ![...document.querySelectorAll('.panel.cores.field .cn span')].some(e=>e.textContent.includes('Depo')) && !document.querySelector('.panel.cores.field .deprow'), not:(document.querySelector('.fieldnote')||{}).textContent||null, kil_ac10_pasif: document.querySelector('.ccard .crow .btn:nth-child(2)').classList.contains('off')})")
    kb0 = await ev(f"{G}.coreCounts().bag.kil"); kd0 = await ev(f"{G}.coreCounts().depot.kil"); c0 = await ev(f"{G}.carriedOz")
    await ttap('.ccard .crow .btn', 0)
    await waitfor("!!document.querySelector('.fieldrev')", 4000, 50); await pg.wait_for_timeout(250); await shot('field_open_crack')
    await waitfor("!!document.querySelector('.dbox')", 15000); await pg.wait_for_timeout(300)
    await shot('field_open_card')
    fi = await ev("(document.querySelector('.dinfo')||{}).textContent||''")
    feedOz = await ev(f"(()=>{{const p={G}.pendingPulls().slice(-1)[0]; return {G}.pullDecisionInfo(p.id).feedOz;}})()")
    await ev("window.__edin.opts.absorbSpeed=0.35")
    await ttext('Ruhunu yedir')
    await waitfor("window.__edinFieldFeed && window.__edinFieldFeed.running", 6000, 50); await pg.wait_for_timeout(700); await shot('field_open_feed')
    await waitfor("window.__edinFieldFeed && !window.__edinFieldFeed.running", 15000, 100)
    await ev("window.__edin.opts.absorbSpeed=1")
    res['13_saha'] = {'panel': fp, 'kart_bilgi': fi, 'kil_canta': [kb0, await ev(f"{G}.coreCounts().bag.kil")], 'kil_depo_degismedi': kd0 == await ev(f"{G}.coreCounts().depot.kil"),
                      'tasinan': [c0, await ev(f"{G}.carriedOz")], 'beklenen_yedirme': feedOz, 'ekran': await ev(f"{G}.screen"), 'hud_var': await ev("!!document.querySelector('.hud')")}

    # ---------- 14) SAHADA açılış ortasında saldırı → güvenle kesilir, sonuç bekler ----------
    kb1 = await ev(f"{G}.coreCounts().bag.kil"); pp1 = await ev(f"{G}.pendingPulls().length"); ab0 = await ev("window.__edinFieldAborted||0")
    await ttap('.bagb'); await waitfor("!!document.querySelector('.panel.wbag')", 4000); await pg.wait_for_timeout(200)
    await ttext('Çekirdekler'); await waitfor("!!document.querySelector('.panel.cores.field')", 5000)
    await ttap('.ccard .crow .btn', 0)
    await waitfor("!!document.querySelector('.dbox')", 15000); await pg.wait_for_timeout(300)
    # saldırgan canavar gelir
    await ev(f"(()=>{{const g={G}; const m=g.monsters.find(x=>x.alive&&!x.isGuardian); m.pos.x=g.pos.x+0.5; m.pos.z=g.pos.z; m.aggro=true; g.pendingFightUid=m.uid;}})()")
    await waitfor(f"{G}.screen==='battle'", 8000); await pg.wait_for_timeout(1200)
    await shot('field_open_interrupt')
    mid = {'kil_canta': [kb1, await ev(f"{G}.coreCounts().bag.kil")], 'bekleyen': [pp1, await ev(f"{G}.pendingPulls().length")], 'kesildi': (await ev("window.__edinFieldAborted||0")) - ab0, 'karar_ekrani_kalmadi': await ev("!document.querySelector('.dbox')")}
    await ev(f"{G}.battle.enemy.hp=1"); await battle_until_over(10)
    await waitfor("!!document.querySelector('.rbox')", 15000); await pg.wait_for_timeout(400)
    await ttext('Devam'); await waitfor(f"{G}.screen==='world'", 10000); await pg.wait_for_timeout(1400)
    toast = await ev("(document.querySelector('.hud .toast')||{}).textContent||''")
    c1 = await ev(f"{G}.carriedOz")
    await ttap('.bagb'); await waitfor("!!document.querySelector('.panel.wbag')", 4000); await pg.wait_for_timeout(200)
    await shot('field_open_bag_pending')
    await ttext('Karar ver'); await waitfor("!!document.querySelector('.dbox')", 8000); await pg.wait_for_timeout(300)
    fo2 = await ev(f"(()=>{{const p={G}.pendingPulls().slice(-1)[0]; return {G}.pullDecisionInfo(p.id).feedOz;}})()")
    await ttext('Ruhunu yedir'); await waitfor("window.__edinFieldFeed && !window.__edinFieldFeed.running", 15000, 100); await pg.wait_for_timeout(400)
    res['14_kesinti'] = {**mid, 'donus_bildirimi': toast, 'sonra_bekleyen': await ev(f"{G}.pendingPulls().length"), 'yedirme': [c1, await ev(f"{G}.carriedOz"), fo2], 'kil_canta_son': await ev(f"{G}.coreCounts().bag.kil")}
    await ev(f"(()=>{{const g={G}; g.bag.donus_tableti=1; g.useReturnTablet();}})()"); await to_hub()

    # ---------- 10) ?dissolve=fallback ----------
    await pg.goto(BASE + Q + '&dissolve=fallback'); await pg.wait_for_timeout(1500); await ttext('Devam et')
    await waitfor("!!document.querySelector('.gate .gmenu') || !!document.querySelector('.dbox')", 15000)
    await ev("window.__edin.opts.absorbSpeed=0.35")
    if not await ev("!!document.querySelector('.dbox')"):
      await ttext('Çekirdekler'); await waitfor("!!document.querySelector('.panel.cores')", 5000); await ttap('.ccard .crow .btn', 0)
      await waitfor("!!document.querySelector('.dbox')", 15000)
    await ttext('Ruhunu yedir')
    await waitfor("window.__edinFeed && window.__edinFeed.t()>0.55", 10000, 50); await shot('fallback_feed')
    res['10_yedek'] = {'yedek_aktif': await ev("window.__edinFeed.fallback()")}
    await to_hub()

    # ---------- 11) 3 grafik ayarı: açılış + yutma ----------
    gf = {}
    for gfx in [0, 1, 2]:
      await pg.goto(BASE + f'?test=1&dtcap=1&gfx={gfx}'); await pg.wait_for_timeout(1500); await ttext('Devam et')
      await waitfor("!!document.querySelector('.gate .gmenu') || !!document.querySelector('.dbox')", 15000)
      if not await ev("!!document.querySelector('.dbox')"):
        await ttext('Çekirdekler'); await waitfor("!!document.querySelector('.panel.cores')", 5000); await ttap('.ccard .crow .btn', 0)
        await pg.wait_for_timeout(600)
        perf = await ev("window.__edin.perf()")
        await waitfor("!!document.querySelector('.dbox')", 15000)
      else: perf = await ev("window.__edin.perf()")
      await ttext('Ruhunu yedir'); await pg.wait_for_timeout(900)
      perf2 = await ev("window.__edin.perf()")
      await waitfor("!!document.querySelector('.gate .gmenu')", 15000)
      gf[gfx] = {'acilis': perf, 'yutma': perf2}
      if gfx == 2: await shot('gfx2_hub')
    res['11_grafik'] = gf
    res['hatalar'] = errs
    print(json.dumps(res, ensure_ascii=False, indent=1))
    await b.close()

asyncio.run(main())
