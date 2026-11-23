# Kamera: GERÇEK dokunma testi (CDP Input.dispatchTouchEvent), telefon taklidi
import asyncio, json, math, sys
from playwright.async_api import async_playwright
W, Hh = 800, 360
URL = 'file:///home/claude/edin/game/dist/index.html?test=1&dtcap=1&gfx=0'
res = {}
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = await b.new_context(viewport={'width': W, 'height': Hh}, has_touch=True, is_mobile=True)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'GPU' not in m.text and errs.append(m.text))
    cdp = await ctx.new_cdp_session(pg)
    ev = pg.evaluate
    async def touch(kind, pts):
      await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, x, y in pts]})
    async def ttap(sel):
      bb = await pg.eval_on_selector(sel, "e=>{const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}")
      await touch('touchStart', [(9, bb[0], bb[1])]); await pg.wait_for_timeout(60); await touch('touchEnd', [])
    async def drag(pts0, pts1, steps=8, hold=0):
      await touch('touchStart', pts0)
      for k in range(1, steps + 1):
        t = k / steps; await touch('touchMove', [(a[0], a[1] + (b_[1] - a[1]) * t, a[2] + (b_[2] - a[2]) * t) for a, b_ in zip(pts0, pts1)]); await pg.wait_for_timeout(40)
      if hold: await pg.wait_for_timeout(hold)
      await touch('touchEnd', [])
    await pg.goto(URL); await pg.wait_for_timeout(1500)
    await pg.tap('text=Başla'); await pg.wait_for_timeout(600); await pg.tap('.story'); await pg.wait_for_timeout(1200)
    await pg.wait_for_selector('.card'); await pg.tap('.card >> nth=0'); await pg.wait_for_timeout(400)
    await pg.tap('text=Kan bağı kur'); await pg.wait_for_timeout(2600); await pg.wait_for_selector('text=Devam'); await pg.tap('text=Devam'); await pg.wait_for_timeout(1800)
    await ev("window.__edin.cam.auto=false")
    cam = lambda: ev("({yaw:window.__edin.cam.yaw,pitch:window.__edin.cam.pitch,zoom:window.__edin.cam.zoom})")
    pos = lambda: ev("({x:window.__edin.game.pos.x,z:window.__edin.game.pos.z})")
    # güvenli bir başlangıç noktası: oyun alanının ortası, canavarlardan uzak
    await ev("(()=>{const g=window.__edin.game;const L=g.layout();g.pos.x=L.size.w/2;g.pos.z=L.size.h/2;g.monsters.forEach(m=>{if(!m.isGuardian){m.alive=false;m.respawnAt=g.clock+99999}})})()"); await pg.wait_for_timeout(500)
    # 1) tek parmak sürükleme → yaw
    c0 = await cam(); await drag([(1, 520, 200)], [(1, 640, 230)]); c1 = await cam()
    res['drag'] = {'yaw0': round(c0['yaw'], 3), 'yaw1': round(c1['yaw'], 3), 'pitch0': round(c0['pitch'], 3), 'pitch1': round(c1['pitch'], 3)}
    # 2) joystick ileri: kamera 0°, 90°, 180°'de yaratık ekranın ilerisine gider
    jx, jy = 22 + 60, Hh - 20 - 60
    fwd = {}
    for deg in (0, 90, 180):
      await ev(f"(()=>{{const c=window.__edin.cam;c.yaw={math.radians(deg)};c.resetting=false;const g=window.__edin.game;const L=g.layout();g.pos.x=L.size.w/2;g.pos.z=L.size.h/2;}})()"); await pg.wait_for_timeout(300)
      p0 = await pos(); await drag([(2, jx, jy)], [(2, jx, jy - 45)], steps=4, hold=900); p1 = await pos()
      dx, dz = p1['x'] - p0['x'], p1['z'] - p0['z']; n = math.hypot(dx, dz) or 1
      ex, ez = -math.sin(math.radians(deg)), -math.cos(math.radians(deg))
      fwd[deg] = {'moved': round(n, 2), 'dot': round((dx * ex + dz * ez) / n, 3)}
    res['joystick_forward'] = fwd
    # 3) aynı anda: sol el joystick + sağ el çevirme
    await ev("window.__edin.cam.yaw=0"); p0 = await pos(); c0 = await cam()
    await drag([(3, jx, jy), (4, 560, 190)], [(3, jx, jy - 45), (4, 660, 190)], steps=10, hold=300); p1 = await pos(); c1 = await cam()
    res['simul'] = {'moved': round(math.hypot(p1['x'] - p0['x'], p1['z'] - p0['z']), 2), 'yaw_change': round(c1['yaw'] - c0['yaw'], 3)}
    # 4) sıkıştırma: parmaklar açılınca yaklaşır, sınır 0.7; kapanınca uzaklaşır, sınır 1.4
    await drag([(5, 380, 180), (6, 440, 180)], [(5, 250, 180), (6, 570, 180)]); z1 = (await cam())['zoom']
    await drag([(5, 380, 180), (6, 440, 180)], [(5, 300, 180), (6, 520, 180)]); z2 = (await cam())['zoom']
    await drag([(5, 200, 180), (6, 600, 180)], [(5, 395, 180), (6, 405, 180)]); z3 = (await cam())['zoom']
    res['pinch'] = {'after_open': round(z1, 3), 'after_open2_clamped': round(z2, 3), 'after_close_clamped': round(z3, 3)}
    # 5) pusula (gerçek dokunuş) sıfırlar
    await ev("window.__edin.cam.yaw=2.2"); await ttap('.compass'); await pg.wait_for_timeout(2500); c = await cam()
    res['compass'] = {k: round(v, 3) for k, v in c.items()}
    # 6) düğmeler gerçek dokunuşla: Dönüş büyüsü, Saldır → savaş → hamleler → çıkış; kamera durumu korunur
    await ev("window.__edin.cam.yaw=1.0")
    await ev("(()=>{const g=window.__edin.game;g.monsters.forEach(m=>{if(!m.isGuardian)m.respawnAt=0})})()"); await pg.wait_for_timeout(500)
    for k in range(6):
      ok = await ev(f"(()=>{{const g=window.__edin.game;const ms=g.monsters.filter(x=>!x.isGuardian&&x.alive);const m=ms[{k}%ms.length];m.aggro=false;m.aggroChecked=true;m.target=null;m.wait=9999;g.pos.x=m.pos.x;g.pos.z=Math.min(m.pos.z+1.4,g.layout().size.h-1);return true}})()")
      await pg.wait_for_timeout(700)
      if await ev("!!window.__edin.game.nearbyMonster") or await ev("!!window.__edin.game.battle"): break
    yb = (await cam())['yaw']
    in_b = await ev("!!window.__edin.game.battle"); res['battle_already']=in_b
    res['pre_attack'] = await ev("(()=>{const g=window.__edin.game;const a=document.querySelector('.attack');const r=a.getBoundingClientRect();return {near:!!g.nearbyMonster,cls:a.className,r:[r.left,r.top,r.width],scr:g.screen,ret:g.returning}})()")
    res['atk_top'] = await ev("(()=>{const a=document.querySelector('.attack');const r=a.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return t&&(t.className||t.tagName)})()")
    await ev("window.__clk=0;document.querySelector('.attack').addEventListener('click',()=>window.__clk++)")
    if not in_b: await ttap('.attack')
    await pg.wait_for_timeout(200); res['atk_clicks'] = await ev("window.__clk"); res['near_after'] = await ev("!!window.__edin.game.nearbyMonster")
    await pg.wait_for_timeout(1500)
    res['in_battle'] = await ev("!!window.__edin.game.battle && !window.__edin.game.battle.over")
    # savaşta sürükleme kamerayı döndürmemeli
    await drag([(7, 400, 150)], [(7, 520, 150)]); res['battle_drag_yaw_unchanged'] = abs((await cam())['yaw'] - yb) < 1e-6
    turns = 0
    for i in range(25):
      if not await ev("!!(window.__edin.game.battle && !window.__edin.game.battle.over)"): break
      sel = '.mv.glow' if await pg.query_selector('.mv.glow') else '.mv-quick'
      await ttap(sel); await pg.wait_for_timeout(1700); turns += 1
    res['battle_turns'] = turns
    await pg.wait_for_timeout(2500)
    for _ in range(4):
      if await pg.locator('.rbox .btn').count(): await ttap('.rbox .btn')
      await pg.wait_for_timeout(1300)
    res['after_battle_screen'] = await ev("window.__edin.game.screen")
    res['btns'] = await ev("[...document.querySelectorAll('#ui button')].filter(b=>b.offsetParent).map(b=>b.className+':'+b.textContent.trim().slice(0,20))")
    res['bover'] = await ev("window.__edin.game.battle ? {over:window.__edin.game.battle.over, w:window.__edin.game.battle.winner, php:window.__edin.game.battle.player.hp, ehp:window.__edin.game.battle.enemy.hp} : null")
    await pg.screenshot(path='/home/claude/edin/dbg/cam_end.png')
    res['yaw_preserved'] = abs((await cam())['yaw'] - yb) < 0.05
    await drag([(8, 520, 200)], [(8, 600, 200)]); res['drag_after_battle'] = round((await cam())['yaw'] - yb, 3)
    await ev("(()=>{const g=window.__edin.game;g.monsters.forEach(m=>{if(!m.isGuardian){m.alive=false;m.respawnAt=g.clock+99999}})})()"); await pg.wait_for_timeout(300)
    if await pg.query_selector('.ret'):
      await ttap('.ret'); await pg.wait_for_timeout(400); res['return_tap'] = await ev("window.__edin.game.returning>0")
    else: res['return_tap'] = 'ret yok: ' + await ev("window.__edin.game.screen")
    res['errs'] = errs
    print(json.dumps(res, ensure_ascii=False, indent=1))
asyncio.run(main())
