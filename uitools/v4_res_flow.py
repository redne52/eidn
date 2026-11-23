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


    # ---------- 1–3) seçim, harita, hareket ----------
    await pg.goto(BASE + Q); await pg.wait_for_timeout(1500)
    await ev("localStorage.clear()"); await pg.goto(BASE + Q); await pg.wait_for_timeout(1500)
    await ttext('Başla'); await pg.wait_for_timeout(700); await ttap('.story'); await pg.wait_for_timeout(1300)
    await waitfor("document.querySelectorAll('.card').length===4")
    await ttap('.card', 2); await pg.wait_for_timeout(900)
    await ttap('.bond'); await waitfor("[...document.querySelectorAll('.btn')].some(b=>b.textContent.trim()==='Devam')", 15000)
    await ttext('Devam'); await waitfor(f"{G}.screen==='world'", 15000); await pg.wait_for_timeout(1500)
    res['01_secim'] = await ev(f"{G}.creature.id")
    res['02_harita'] = await ev(f"{G}.zoneId")
    calm = f"(()=>{{const g={G};g.monsters.forEach(m=>{{if(!m.isGuardian){{const a=Math.random()*6.28;m.home={{x:g.pos.x+Math.cos(a)*16,z:g.pos.z+Math.sin(a)*16}};m.pos={{...m.home}};m.aggro=false;m.behavior='sakin';}}}})}})()"
    await ev(f"(()=>{{const g={G};const L=g.layout();g.pos.x=L.size.w/2;g.pos.z=L.size.h/2;}})()"); await ev(calm)
    p0 = await ev(f"({{x:{G}.pos.x,z:{G}.pos.z}})")
    jx, jy = 22 + 60, Hh - 20 - 60
    await drag([(2, jx, jy)], [(2, jx + 30, jy - 40)], steps=4, hold=900)
    p1 = await ev(f"({{x:{G}.pos.x,z:{G}.pos.z}})")
    res['03_hareket'] = round(math.hypot(p1['x'] - p0['x'], p1['z'] - p0['z']), 2)

    # ---------- 4–7) savaş, öldürme, emme, öz ----------
    await ev("window.__edin.opts.absorbSpeed=1")
    c0 = await ev(f"{G}.carriedOz")
    res['04_savas'] = await to_monster()
    seq = await fight_to_win(None)
    ab = await watch_absorb('v4_res_absorb')
    await waitfor("[...document.querySelectorAll('.btn')].some(b=>b.textContent.trim()==='Devam')", 15000)
    c1 = await ev(f"{G}.carriedOz")
    res['05_oldurme'] = {'hamleler': seq, 'kazanan': 'player' if c1 > c0 else '?'}
    res['06_emme'] = {k: ab.get(k) for k in ('kind', 'oz', 'dur')}
    res['07_oz'] = {'once': c0, 'sonra': c1, 'dogru': c1 - c0 == ab.get('oz')}
    await ttext('Devam'); await waitfor(f"{G}.screen==='world'", 10000); await pg.wait_for_timeout(500); await ev(calm)

    # ---------- 8) kaynak toplama (gerçek dokunuşla TOPLA) ----------
    await pg.screenshot(path=SH + 'v4_res_world.png')
    async def gather(kind):
      nd = await ev(f"(t=>{{const g={G};const n=g.zoneNodes().filter(x=>x.ready&&x.type===t).sort((a,b)=>Math.hypot(a.x-g.pos.x,a.z-g.pos.z)-Math.hypot(b.x-g.pos.x,b.z-g.pos.z))[0];if(!n)return null;g.pos.x=n.x+1.0;g.pos.z=n.z;return n.id}})", kind)
      if not nd: return {'yok': kind}
      await ev(calm)
      shown = await waitfor("document.querySelector('.gather.show')", 4000, 80)
      before = await ev(f"{G}.resources[{json.dumps(kind)}]||0")
      await ttap('.gather.show')
      started = await waitfor(f"{G}.action && {G}.action.type==='gather'", 2000, 40)
      if started and kind == 'cig_et': await pg.wait_for_timeout(500); await pg.screenshot(path=SH + 'v4_res_gather.png')
      done = await waitfor(f"!{G}.action && ({G}.resources[{json.dumps(kind)}]||0)>{before}", 8000, 60)
      return {'dugme': shown, 'basladi': started, 'eklendi': done, 'dugum_kayboldu': not await ev(f"{G}.nodeReady({json.dumps(nd)})")}
    g1 = await gather('cig_et'); g2 = await gather('cig_et'); g3 = await gather('cig_et'); g4 = await gather('sifali_meyve'); g5 = await gather('sifali_ot')
    res['08_toplama'] = {'et1': g1, 'et2': g2, 'et3': g3, 'meyve': g4, 'ot': g5}
    # toplama sırasında saldırı → güvenli iptal
    nd = await ev(f"(()=>{{const g={G};const n=g.zoneNodes().find(x=>x.ready);g.pos.x=n.x+1;g.pos.z=n.z;return n.id}})()")
    await waitfor("document.querySelector('.gather.show')", 4000, 80); await ttap('.gather.show')
    await waitfor(f"{G}.action", 2000, 40)
    r0 = await ev(f"JSON.stringify({G}.resources)")
    await ev(f"(()=>{{const g={G};const m=g.monsters.find(x=>x.alive&&!x.isGuardian);m.behavior='saldirgan';m.aggro=true;m.pos={{x:g.pos.x+0.6,z:g.pos.z}};}})()")
    fought = await waitfor(f"{G}.screen==='battle'", 6000, 60)
    res['08b_toplama_iptal'] = {'savas_basladi': fought, 'kaynak_degismedi': r0 == await ev(f"JSON.stringify({G}.resources)"), 'dugum_duruyor': await ev(f"{G}.nodeReady({json.dumps(nd)})")}
    if fought:
      await fight_to_win(None, weaken=True, use_fin=False)
      await waitfor("!document.querySelector('.absorbtap')", 20000)
      await waitfor("[...document.querySelectorAll('.btn')].some(b=>b.textContent.trim()==='Devam')", 15000); await ttext('Devam')
      await waitfor(f"{G}.screen==='world'", 10000); await pg.wait_for_timeout(400); await ev(calm)

    # ---------- 9) envanter (Çanta düğmesi) ----------
    await ttap('.bagb'); ok = await waitfor("document.querySelector('.panel.wbag')", 3000)
    await pg.wait_for_timeout(300); await pg.screenshot(path=SH + 'v4_res_bag.png')
    res['09_envanter'] = {'panel': ok, 'kaynaklar': await ev(f"JSON.stringify({G}.resources)"), 'listede_meyve': await ev("[...document.querySelectorAll('.wbag .irow.food b')].map(b=>b.textContent)")}
    await ttap('.panel.wbag .close'); await pg.wait_for_timeout(300)

    # ---------- 10–12) kampa yaklaş, pişir, malzeme düşer ----------
    await ev(f"(()=>{{const g={G};const c=g.layout().camp;g.pos.x=c.x-2.6;g.pos.z=c.z;}})()"); await ev(calm)
    await pg.wait_for_timeout(300)
    await drag([(2, jx, jy)], [(2, jx + 40, jy)], steps=3, hold=0)  # joystick ile ateşe doğru (kamera yönüne göre)
    await ev(f"(()=>{{const g={G};const c=g.layout().camp;if(Math.hypot(g.pos.x-c.x,g.pos.z-c.z)>2.5){{g.pos.x=c.x-1.6;g.pos.z=c.z;}}}})()")
    shown = await waitfor("document.querySelector('.campb.show')", 5000, 80)
    await pg.wait_for_timeout(1500); await pg.screenshot(path=SH + 'v4_camp_world.png')
    res['10_kamp'] = {'dugme': shown, 'guvenli_halka': await ev(f"{G}.inCampRing()")}
    await ttap('.campb.show'); okp = await waitfor("document.querySelector('.panel.cook')", 3000)
    await pg.wait_for_timeout(300); await pg.screenshot(path=SH + 'v4_cook_panel.png')
    r_before = await ev(f"JSON.stringify({G}.resources)")
    btn_idx = await ev("[...document.querySelectorAll('.panel.cook .recipe')].findIndex(r=>r.querySelector('b').textContent==='Pişmiş et')")
    bb = await ev("(i)=>{const r=document.querySelectorAll('.panel.cook .recipe')[i].querySelector('.btn');const q=r.getBoundingClientRect();return [q.left+q.width/2,q.top+q.height/2]}", btn_idx)
    await tapxy(bb[0], bb[1]); await waitfor(f"({G}.food.pismis_et||0)>0", 4000)
    await pg.wait_for_timeout(700); await pg.screenshot(path=SH + 'v4_cook_done.png')
    r_after = await ev(f"JSON.stringify({G}.resources)")
    res['11_pisir'] = {'panel': okp, 'yemek': await ev(f"JSON.stringify({G}.food)")}
    res['12_malzeme_dustu'] = {'once': r_before, 'sonra': r_after}

    # ---------- 13–14) ye, can dolar (kademeli) ----------
    await ev(f"(()=>{{const g={G};g.creature.hp=Math.round(g.maxHp()*0.35);}})()")
    await pg.wait_for_timeout(300)
    hp0 = await ev(f"{G}.creature.hp")
    bb = await ev("(()=>{const r=[...document.querySelectorAll('.panel.cook .irow.food')].find(x=>x.querySelector('b').textContent==='Pişmiş et');if(!r)return null;const b=r.querySelector('.btn');b.scrollIntoView({block:'center'});const q=b.getBoundingClientRect();return [q.left+q.width/2,q.top+q.height/2]})()")
    print('YE dugmesi', bb, await ev("innerHeight"), flush=True)
    if bb: await tapxy(bb[0], bb[1])
    eating = await waitfor(f"{G}.action && {G}.action.type==='eat'", 3000, 40)
    await pg.wait_for_timeout(700); await pg.screenshot(path=SH + 'v4_eat.png')
    done = await waitfor(f"!{G}.action", 5000, 50)
    await pg.wait_for_timeout(120)
    hud_mid = await ev("document.querySelector('.hp span')?.textContent")
    await pg.wait_for_timeout(1500); await pg.screenshot(path=SH + 'v4_eat_done.png')
    hp1 = await ev(f"{G}.creature.hp"); hud_end = await ev("document.querySelector('.hp span')?.textContent")
    res['13_ye'] = {'basladi': eating, 'bitti': done, 'yemek_dustu': await ev(f"{G}.food.pismis_et||0") == 0}
    res['14_can'] = {'once': hp0, 'sonra': hp1, 'max': await ev(f"{G}.maxHp()"), 'hud_ara': hud_mid, 'hud_son': hud_end}

    # ---------- 15) tekrar savaş ----------
    await ev(calm)
    res['15_tekrar_savas'] = await to_monster()
    await fight_to_win(None, weaken=True, use_fin=False)
    await waitfor("!document.querySelector('.absorbtap')", 20000)
    await waitfor("[...document.querySelectorAll('.btn')].some(b=>b.textContent.trim()==='Devam')", 15000); await ttext('Devam')
    await waitfor(f"{G}.screen==='world'", 10000); await pg.wait_for_timeout(400)

    # ---------- 16) Ruh Kapısı'na dönüş ----------
    await ev(f"(()=>{{const g={G};g.monsters.forEach(m=>{{m.aggro=false;m.behavior='sakin'}});}})()")
    carried = await ev(f"{G}.carriedOz")
    await ttap('.ret'); ok = await waitfor(f"{G}.screen!=='world' || !{G}.zoneId", 40000, 200)
    await pg.wait_for_timeout(800)
    if await ev("[...document.querySelectorAll('.btn')].some(b=>b.textContent.trim()==='Devam')"): await ttext('Devam')
    await pg.wait_for_timeout(600)
    res['16_kapi'] = {'ok': ok, 'tasinan_once': carried, 'tasinan_sonra': await ev(f"{G}.carriedOz"), 'kaynak_korundu': await ev(f"JSON.stringify({G}.resources)")}

    print('ARA', json.dumps(res, ensure_ascii=False), flush=True)
    # ---------- 17) kaydet / yükle ----------
    before = await ev(f"JSON.stringify({{id:{G}.creature.id,lv:{G}.creature.level,oz:{G}.creature.oz,r:{G}.resources,f:{G}.food,n:Object.keys({G}.nodes).length}})")
    await pg.reload(); await pg.wait_for_timeout(1500); await ttext('Devam et'); await pg.wait_for_timeout(1500)
    after = await ev(f"JSON.stringify({{id:{G}.creature.id,lv:{G}.creature.level,oz:{G}.creature.oz,r:{G}.resources,f:{G}.food,n:Object.keys({G}.nodes).length}})")
    res['17_kayit'] = {'ayni': before == after, 'veri': after}

    # ---------- 18) eski kayıt ----------
    await pg.goto(BASE + Q); await pg.wait_for_timeout(1200)
    await ev("(s)=>localStorage.setItem('edin.save.v1', s)", json.dumps(V1))
    await pg.reload(); await pg.wait_for_timeout(1500); await ttext('Devam et'); await pg.wait_for_timeout(5500)
    res['18_eski_kayit'] = {'yaratik': await ev(f"{G}.creature.id"), 'seviye': await ev(f"{G}.creature.level"), 'yemek': await ev(f"JSON.stringify({G}.food)"), 'kaynak': await ev(f"JSON.stringify({G}.resources)")}
    ok = await ev(f"{G}.enterZone('kiyi')")
    res['18_eski_kayit']['bolgeye_girdi'] = ok and await ev(f"{G}.zoneNodes().length") > 0

    # ---------- 19) yatay ekran: HUD taşma ----------
    await ev("window.__edin.enterZone('kiyi')"); await waitfor(f"{G}.screen==='world'", 8000); await pg.wait_for_timeout(1000)
    over = await ev("[...document.querySelectorAll('.hud .br .round, .hud .tl, .hud .mini, .hud .compass, .hud .joy')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&(r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1)}).map(e=>e.className)")
    res['19_yatay'] = {'w': W, 'h': Hh, 'tasan': over}

    # ---------- 20) grafik ayarları ----------
    gfx = {}
    for q in (0, 1, 2):
      await pg.goto(BASE + f'?test=1&dtcap=1&gfx={q}'); await pg.wait_for_timeout(1500)
      await ttext('Devam et'); await pg.wait_for_timeout(1200)
      await ev("window.__edin.enterZone('kiyi')"); await waitfor(f"{G}.screen==='world'", 8000); await pg.wait_for_timeout(1500)
      await ev(f"(()=>{{const g={G};const c=g.layout().camp;g.pos.x=c.x-4;g.pos.z=c.z+3;}})()"); await pg.wait_for_timeout(1500)
      pi = await ev("window.__edin.perf()")
      await pg.screenshot(path=SH + f'v4_res_gfx{q}.png')
      gfx[q] = pi
    res['20_grafik'] = gfx
    res['hatalar'] = errs[:8]
    print(json.dumps(res, ensure_ascii=False, indent=1), flush=True)
    await b.close()

if __name__ == '__main__':
  if len(sys.argv) > 2: W, Hh = int(sys.argv[1]), int(sys.argv[2])
  asyncio.run(main([0]))
