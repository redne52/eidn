# v4: ejderha akışı + ruh özü emme — GERÇEK dokunma (CDP Input.dispatchTouchEvent), telefon taklidi
import asyncio, json, math, sys, time
from playwright.async_api import async_playwright
W, Hh = 800, 360
BASE = 'file:///home/claude/edin/game/dist/index.html'
Q = '?test=1&dtcap=1&gfx=0'
SH = '/home/claude/edin/shots/'
res = {}

V1 = {"version": 1, "savedAt": 1763830000000, "clock": 812.4, "keeper": {"level": 1},
      "creature": {"id": "ugallu", "grade": "B", "level": 6, "oz": 410, "hp": 151, "woundedUntil": 0, "woundedLeft": 0},
      "carriedOz": 0, "location": "gate", "inRun": False, "runsCompleted": 7, "sekel": 312,
      "bag": {"bandaj": 4}, "eggs": [], "eggSeq": 1, "belt": [{"itemId": "can_iksiri", "count": 1}, {"itemId": "bandaj", "count": 3}, None, None],
      "unlockedZones": ["kiyi", "bozkir"], "guardians": {}, "tablets": [], "kaderPuani": 3,
      "stats": {"fights": 40, "wins": 36}, "settings": {}, "flags": {"firstFightDone": True, "tutorialDone": True}, "fight": None}

async def main(gfx_list):
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = await b.new_context(viewport={'width': W, 'height': Hh}, has_touch=True, is_mobile=True)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'GPU' not in m.text and 'ReadPixels' not in m.text and errs.append(m.text))
    cdp = await ctx.new_cdp_session(pg)
    ev = pg.evaluate
    async def touch(kind, pts):
      await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, x, y in pts]})
    async def tapxy(x, y):
      await touch('touchStart', [(9, x, y)]); await pg.wait_for_timeout(50); await touch('touchEnd', [])
    async def ttap(sel, nth=0):
      bb = await ev("([s,n])=>{const e=document.querySelectorAll(s)[n];if(!e)return null;const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}", [sel, nth])
      if not bb: return False
      await tapxy(bb[0], bb[1]); return True
    async def ttext(text):
      bb = await ev("(t)=>{const e=[...document.querySelectorAll('button,.btn,.card,.story,div')].reverse().find(x=>x.offsetParent!==null&&x.textContent.trim()===t)||[...document.querySelectorAll('button,.btn')].find(x=>x.offsetParent!==null&&x.textContent.includes(t));if(!e)return null;const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}", text)
      if not bb: return False
      await tapxy(bb[0], bb[1]); return True
    async def drag(pts0, pts1, steps=6, hold=0):
      await touch('touchStart', pts0)
      for k in range(1, steps + 1):
        t = k / steps; await touch('touchMove', [(a[0], a[1] + (b_[1] - a[1]) * t, a[2] + (b_[2] - a[2]) * t) for a, b_ in zip(pts0, pts1)]); await pg.wait_for_timeout(40)
      if hold: await pg.wait_for_timeout(hold)
      await touch('touchEnd', [])
    async def waitfor(js, ms=20000, step=150):
      t0 = time.time()
      while (time.time() - t0) * 1000 < ms:
        try:
          if await ev(js): return True
        except Exception: pass
        await pg.wait_for_timeout(step)
      return False
    G = "window.__edin.game"

    # ---------- 1) ejderha seçimi ----------
    await pg.goto(BASE + Q); await pg.wait_for_timeout(1500)
    await ev("localStorage.clear()"); await pg.goto(BASE + Q); await pg.wait_for_timeout(1500)
    await ttext('Başla'); await pg.wait_for_timeout(700); await ttap('.story'); await pg.wait_for_timeout(1300)
    await waitfor("document.querySelectorAll('.card').length===4")
    names = await ev("[...document.querySelectorAll('.card b')].map(e=>e.textContent)")
    await ttap('.card', 0); await pg.wait_for_timeout(1300)
    await pg.screenshot(path=SH + 'v4_select.png')
    await ttap('.bond'); await waitfor("[...document.querySelectorAll('.btn')].some(b=>b.textContent.trim()==='Devam')", 15000)
    await ttext('Devam'); await waitfor(f"{G}.screen==='world'", 15000); await pg.wait_for_timeout(1500)
    res['1_secim'] = {'kartlar': names, 'yaratik': await ev(f"{G}.creature.id")}
    res['2_harita'] = await ev(f"{G}.zoneId")

    # ---------- 3) hareket (joystick, gerçek dokunuş) ----------
    await ev(f"(()=>{{const g={G};const L=g.layout();g.pos.x=L.size.w/2;g.pos.z=L.size.h/2;g.monsters.forEach(m=>{{if(!m.isGuardian){{const a=Math.random()*6.28;m.pos.x=g.pos.x+Math.cos(a)*14;m.pos.z=g.pos.z+Math.sin(a)*14;}}}})}})()")
    p0 = await ev(f"({{x:{G}.pos.x,z:{G}.pos.z}})")
    jx, jy = 22 + 60, Hh - 20 - 60
    await drag([(2, jx, jy)], [(2, jx + 30, jy - 40)], steps=4, hold=900)
    p1 = await ev(f"({{x:{G}.pos.x,z:{G}.pos.z}})")
    res['3_hareket'] = round(math.hypot(p1['x'] - p0['x'], p1['z'] - p0['z']), 2)
    print('HAREKET', p0, p1, await ev(f"({{s:{G}.screen,z:{G}.zoneId,L:{G}.layout().size,gate:JSON.stringify({G}.layout().gate||null)}})"), flush=True)

    async def to_monster(guardian=False):
      for attempt in range(4):
        await ev(f"(()=>{{const g={G};const m=g.monsters.find(x=>x.alive&&!!x.isGuardian==={str(guardian).lower()});if(!m)return;g.pos.x=m.pos.x;g.pos.z=Math.min(m.pos.z+1.4,g.layout().size.h-1);}})()")
        await pg.wait_for_timeout(500)
        if await ev(f"{G}.screen==='battle'"): break
        if await waitfor("document.querySelector('.attack.show')", 3000): await ttap('.attack.show')
        if await waitfor(f"{G}.screen==='battle' && document.querySelector('.bpanel')", 4000): return True
      else:
        print('saldir dugmesi ile baslamadi, yedek', flush=True); await ev("window.__edin.fight()")
      return await waitfor(f"{G}.screen==='battle' && document.querySelector('.bpanel')", 15000)

    async def fight_to_win(shots_prefix=None, weaken=False, use_fin=True):
      seq = []; turn_shots = 0
      await waitfor(f"!!{G}.battle", 8000)
      if weaken: await ev(f"(()=>{{if(!{G}.battle)return;const e={G}.battle.enemy;e.hp=Math.max(1,Math.round(e.maxHp*0.12));}})()")
      for i in range(40):
        if not await ev(f"!!({G}.battle && !{G}.battle.over)"): break
        await waitfor("!document.querySelector('.bpanel').classList.contains('busy')", 8000, 100)
        if not await ev(f"!!({G}.battle && !{G}.battle.over)"): break
        pts = await ev(f"{G}.battle.player.points||0")
        tele = await ev(f"{G}.battle.enemy.telegraph")
        if use_fin and pts >= 3 and await ev("!!document.querySelector('.mv-fin:not(.off),.mv-finisher:not(.off),[data-a=finisher]:not(.off)')"):
          sel = await ev("(document.querySelector('.mv-fin:not(.off)')&&'.mv-fin:not(.off)')||(document.querySelector('.mv-finisher:not(.off)')&&'.mv-finisher:not(.off)')||'[data-a=finisher]:not(.off)'")
          kind = 'fin'
        elif tele == 'heavy':
          sel = '.mv-guard'; kind = 'guard'
        elif await ev("!!document.querySelector('.mv.glow')"):
          sel = '.mv.glow'; kind = 'combo'
        else:
          sel = '.mv-quick'; kind = 'quick'
        t0 = await ev(f"{G}.battle.turn")
        await ttap(sel)
        await waitfor(f"!{G}.battle || {G}.battle.over || {G}.battle.turn>{t0}", 6000, 80)
        seq.append(kind)
        if shots_prefix and turn_shots < 2 and kind in ('combo', 'fin'):
          await pg.wait_for_timeout(250 if kind == 'combo' else 500); await pg.screenshot(path=SH + f'{shots_prefix}_{kind}{turn_shots}.png'); turn_shots += 1
      return seq

    async def watch_absorb(prefix, tap_speed=False):
      ok = await waitfor("window.__edinAbsorb && document.querySelector('.absorbtap')", 20000, 60)
      if not ok: return {'gorulmedi': True}
      info = await ev("({kind:__edinAbsorb.kind,oz:__edinAbsorb.oz,dur:__edinAbsorb.dur,n:__edinAbsorb.n})")
      marks = [('B', 0.14), ('C', 0.5), ('D', 0.86)]; got = []
      sp0 = await ev("__edinAbsorb.sp()"); sp1 = None
      for name, tt in marks:
        if await waitfor(f"__edinAbsorb.t()>={tt}", 20000, 30):
          await pg.screenshot(path=SH + f'{prefix}_{name}.png'); got.append((name, round(await ev("__edinAbsorb.t()"), 2)))
        if tap_speed and name == 'C':
          await ttap('.absorbtap'); await pg.wait_for_timeout(80); sp1 = await ev("__edinAbsorb.sp()")
      await waitfor("!document.querySelector('.absorbtap')", 20000)
      return {**info, 'kareler': got, 'hiz_once': sp0, 'hiz_dokununca': sp1}

    # ---------- 4–7) savaş, kombo, bitirici, öldürme, emme, öz artışı ----------
    await ev("window.__edin.opts.absorbSpeed=0.12")
    c0 = await ev(f"{G}.carriedOz")
    res['4_savas_basladi'] = await to_monster()
    await pg.wait_for_timeout(800); await pg.screenshot(path=SH + 'v4_battle_start.png')
    seq = await fight_to_win('v4_battle')
    ab = await watch_absorb('v4_absorb_normal')
    await waitfor("[...document.querySelectorAll('.btn')].some(b=>b.textContent.trim()==='Devam')", 15000)
    c1 = await ev(f"{G}.carriedOz")
    res['5_6_savas'] = {'hamleler': seq, 'kombo_var': 'combo' in seq, 'bitirici_var': 'fin' in seq, 'emme': ab}
    res['7_oz'] = {'once': c0, 'sonra': c1, 'emme_oz': ab.get('oz'), 'dogru': c1 - c0 == ab.get('oz')}
    print('ARA', json.dumps(res, ensure_ascii=False), await ev(f"({{s:{G}.screen,z:{G}.zoneId,w:{G}.lastWinner}})"), flush=True)
    await ttext('Devam'); await waitfor(f"{G}.screen==='world'", 10000); await pg.wait_for_timeout(300)
    print('SONRA', await ev(f"({{s:{G}.screen,z:{G}.zoneId}})"), flush=True)
    hud_mid = await ev("document.querySelector('.oz b')?.textContent")
    await pg.wait_for_timeout(1600); hud_end = await ev("document.querySelector('.oz b')?.textContent")
    res['8_hud_sayac'] = {'ara': hud_mid, 'son': hud_end}

    # ---------- emme ortasında yeniden yükleme: öz bir kez ----------
    await ev("window.__edin.opts.absorbSpeed=0.5")
    c0 = await ev(f"{G}.carriedOz")
    await to_monster(); await fight_to_win(None, weaken=True, use_fin=False)
    await waitfor("window.__edinAbsorb && __edinAbsorb.t()>0.3 && document.querySelector('.absorbtap')", 20000, 40)
    oz_kazanc = await ev("__edinAbsorb.oz")
    await pg.reload(); await pg.wait_for_timeout(1500)
    await ttext('Devam et'); await waitfor(f"{G} && ({G}.screen==='world'||{G}.screen==='gate'||{G}.screen==='battle')", 10000); await pg.wait_for_timeout(800)
    c_after = await ev(f"{G}.carriedOz")
    res['9_yeniden_yukleme'] = {'once': c0, 'kazanc': oz_kazanc, 'yuklenen': c_after, 'bir_kez': c_after == c0 + oz_kazanc}

    # ---------- bekçi emmesi + dokunarak hızlandırma ----------
    await ev(f"(()=>{{const g={G};g.creature.level=Math.max(g.creature.level,5);}})()")
    if await ev(f"{G}.screen") != 'world':
      pass
    await ev("window.__edin.opts.absorbSpeed=0.2")
    await ev(f"(()=>{{const g={G};g.monsters.forEach(m=>{{if(!m.isGuardian){{m.alive=false;m.respawnAt=(g.clock||0)+99999;}}}})}})()")
    ok = await to_monster(guardian=True)
    if ok:
      await fight_to_win(None, weaken=True, use_fin=False)
      res['10_bekci_emme'] = await watch_absorb('v4_absorb_bekci', tap_speed=True)
      await waitfor("[...document.querySelectorAll('.btn')].some(b=>b.textContent.trim()==='Devam')", 15000); await ttext('Devam')
      await waitfor(f"{G}.screen==='world'||{G}.screen==='gate'", 10000)
    else:
      res['10_bekci_emme'] = 'bekçiye ulaşılamadı'

    # ---------- kapıya dönüş (Dönüş büyüsü, gerçek dokunuş) ----------
    if await ev(f"{G}.screen") == 'world':
      await ev(f"(()=>{{const g={G};g.monsters.forEach(m=>{{m.aggro=false;}});}})()")
      await ttap('.ret'); ok = await waitfor(f"{G}.screen!=='world' || !{G}.zoneId", 40000, 200)
      await pg.wait_for_timeout(800)
      if await ev("[...document.querySelectorAll('.btn')].some(b=>b.textContent.trim()==='Devam')"): await ttext('Devam')
      await pg.wait_for_timeout(800)
      res['11_kapi'] = {'ok': ok, 'screen': await ev(f"{G}.screen"), 'banked': await ev(f"{G}.bankedOz"), 'carried': await ev(f"{G}.carriedOz")}

    # ---------- kaydet / yükle ----------
    before = await ev(f"JSON.stringify({{id:{G}.creature.id,lv:{G}.creature.level,oz:{G}.creature.oz,b:{G}.bankedOz,s:{G}.sekel}})")
    await pg.reload(); await pg.wait_for_timeout(1500); await ttext('Devam et'); await pg.wait_for_timeout(1500)
    after = await ev(f"JSON.stringify({{id:{G}.creature.id,lv:{G}.creature.level,oz:{G}.creature.oz,b:{G}.bankedOz,s:{G}.sekel}})")
    res['12_kayit'] = {'ayni': before == after, 'veri': after}

    # ---------- eski v1 kaydı (Ugallu) ----------
    await ev("window.__edin.opts.absorbSpeed=1")
    await pg.goto(BASE + Q); await pg.wait_for_timeout(1200)   # başlık ekranı: oyun yok, çıkışta kayıt ezilmez
    await ev("(s)=>localStorage.setItem('edin.save.v1', s)", json.dumps(V1))
    await pg.reload(); await pg.wait_for_timeout(1500); await ttext('Devam et'); await pg.wait_for_timeout(900)
    note = await ev("document.querySelector('.story')?.innerText||''")
    await pg.screenshot(path=SH + 'v4_migrate_note.png')
    await pg.wait_for_timeout(4800)
    res['13_eski_kayit'] = {'yaratik': await ev(f"{G}.creature.id"), 'seviye': await ev(f"{G}.creature.level"), 'derece': await ev(f"{G}.creature.grade"), 'bildirim': note.replace('\n', ' '),
                            'ikinci_acilista_tekrar_yok': None}
    await pg.reload(); await pg.wait_for_timeout(1500); await ttext('Devam et'); await pg.wait_for_timeout(900)
    res['13_eski_kayit']['ikinci_acilista_tekrar_yok'] = not bool(await ev("document.querySelector('.story')?.innerText||''"))

    # ---------- grafik ayarları ----------
    gfx = {}
    for q in gfx_list:
      await pg.goto(BASE + f'?test=1&dtcap=1&gfx={q}'); await pg.wait_for_timeout(1300)
      await ttext('Devam et'); await pg.wait_for_timeout(800)
      await ev("window.__edin.enterZone && window.__edin.enterZone('kiyi')"); await pg.wait_for_timeout(2500)
      pi = await ev("window.__edin.perf()")
      gfx[q] = pi
      await pg.screenshot(path=SH + f'v4_gfx{q}.png')
    res['14_grafik'] = gfx
    res['hatalar'] = errs[:12]
    print(json.dumps(res, ensure_ascii=False, indent=1))
    await b.close()

asyncio.run(main([0, 1, 2]))
